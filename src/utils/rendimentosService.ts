import {
  enqueueCollectionWrite,
  formatSupabaseErrorMessage,
  getLocalRawSafe,
  getSupabaseClient,
  setLocalCollectionSafe,
  withAbortableTimeout,
} from './supabaseClient';
import {
  isEmergencyOfflineMode,
  markRecordPendingSync,
  removePendingSyncRecord,
} from './indexedDbOfflineStore';

export interface RendimentoItem {
  id: string;
  produto: string;
  rendimento: string;
  unidade: string;
  observacao?: string;
  createdAt: string;
  updatedAt: string;
}

export const RENDIMENTOS_STORAGE_KEY = 'fenix_calculadora_rendimentos';

export const UNIDADES_PADRAO_RENDIMENTO = [
  'm²/caixa',
  'm²/balde',
  'm²/rolo',
  'm²/unidade',
  'm²/bisnaga',
  'm/barra',
  'm/rolo',
  'kg/m²',
  'unidade',
];

// Cache em memória inicializado a partir do armazenamento local / IndexedDB para disponibilidade imediata mesmo offline
let memoryCache: RendimentoItem[] = (() => {
  try {
    const raw = getLocalRawSafe(RENDIMENTOS_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return deduplicateList(p);
    }
  } catch {}
  return [];
})();

/**
 * Helper interno para remover duplicidades preservando a integridade pelo ID
 */
function deduplicateList(list: RendimentoItem[]): RendimentoItem[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const result: RendimentoItem[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || !item.id) continue;
    const cleanId = String(item.id).trim();
    if (!seen.has(cleanId)) {
      seen.add(cleanId);
      result.push({
        id: cleanId,
        produto: String(item.produto || '').trim(),
        rendimento: String(item.rendimento || '').trim(),
        unidade: String(item.unidade || '').trim(),
        observacao: item.observacao ? String(item.observacao).trim() : '',
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      });
    }
  }
  return result;
}

/**
 * Retorna os rendimentos do cache em memória atual.
 */
export function getStoredRendimentos(): RendimentoItem[] {
  if (memoryCache.length === 0) {
    try {
      const raw = getLocalRawSafe(RENDIMENTOS_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) memoryCache = deduplicateList(p);
      }
    } catch {}
  }
  return [...memoryCache];
}

/**
 * Carrega a lista oficial de rendimentos diretamente do Supabase (ou do IndexedDB no modo emergencial).
 */
export async function loadRendimentosFromSupabase(): Promise<RendimentoItem[]> {
  if (isEmergencyOfflineMode()) {
    return getStoredRendimentos();
  }

  const client = getSupabaseClient();
  if (!client) {
    return getStoredRendimentos();
  }

  try {
    const { data: row, error } = await withAbortableTimeout<any>(
      (signal) =>
        client
          .from('fenix_kv_store')
          .select('data')
          .eq('key', RENDIMENTOS_STORAGE_KEY)
          .abortSignal(signal)
          .maybeSingle(),
      12000,
      'Tempo limite ao consultar rendimentos no Supabase.'
    );

    if (error) {
      console.warn('Erro ao consultar rendimentos no Supabase:', error);
      return [...memoryCache];
    }

    let remoteList: any = null;
    if (row && row.data !== undefined) {
      let rData = row.data;
      if (typeof rData === 'string') {
        try {
          rData = JSON.parse(rData);
        } catch {
          rData = [];
        }
      }
      if (Array.isArray(rData)) {
        remoteList = rData;
      }
    }

    let localList: RendimentoItem[] = [];
    try {
      const raw = getLocalRawSafe(RENDIMENTOS_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) localList = deduplicateList(p);
      }
    } catch {}

    if (Array.isArray(remoteList) && remoteList.length > 0) {
      // Mescla inteligente preservando eventuais registros locais novos
      const map = new Map<string, RendimentoItem>();
      for (const loc of localList) {
        if (loc && loc.id) map.set(loc.id, loc);
      }
      for (const rem of remoteList) {
        if (rem && rem.id) map.set(rem.id, rem);
      }
      memoryCache = Array.from(map.values());
      setLocalCollectionSafe(RENDIMENTOS_STORAGE_KEY, memoryCache);
      return [...memoryCache];
    } else if (localList.length > 0) {
      // Supabase ainda não tem dados, mas local possui: preserva e sincroniza para a nuvem
      memoryCache = localList;
      try {
        await withAbortableTimeout<any>(
          (signal) =>
            client
              .from('fenix_kv_store')
              .upsert(
                {
                  key: RENDIMENTOS_STORAGE_KEY,
                  data: localList,
                  updated_at: new Date().toISOString(),
                  updated_by: 'Sistema Fênix',
                },
                { onConflict: 'key' }
              )
              .select('updated_at')
              .abortSignal(signal)
              .maybeSingle(),
          12000,
          'Tempo limite ao sincronizar rendimentos no Supabase.'
        );
      } catch {}
      return [...memoryCache];
    }

    memoryCache = [];
    return [];
  } catch (err) {
    console.warn('Falha na requisição de rendimentos ao Supabase:', err);
    return [...memoryCache];
  }
}

/**
 * Salva ou atualiza um cadastro de rendimento diretamente no Supabase.
 * - Produto, Rendimento, Unidade e Observação são persistidos na nuvem e no cache persistente.
 * - Não cria duplicados.
 * - Ao editar, atualiza o registro existente mantendo o ID.
 */
export async function saveRendimento(
  itemData: {
    produto: string;
    rendimento: string;
    unidade: string;
    observacao?: string;
  },
  existingId?: string
): Promise<RendimentoItem> {
  const offlineMode = isEmergencyOfflineMode();
  const client = getSupabaseClient();
  if (!offlineMode && !client) {
    throw new Error('Falha ao conectar ao servidor do Supabase. Verifique a conexão.');
  }

  const now = new Date().toISOString();
  const user =
    (typeof localStorage !== 'undefined' && (localStorage.getItem('fenix_active_user_name') || localStorage.getItem('fenix_saved_username'))) ||
    'Usuário Fênix';

  return enqueueCollectionWrite(RENDIMENTOS_STORAGE_KEY, async () => {
    if (offlineMode) {
      const mergedList = [...getStoredRendimentos()];
      const targetId = existingId ? String(existingId).trim() : undefined;
      const existingIndex = mergedList.findIndex(
        (i) =>
          (targetId && String(i.id).trim() === targetId) ||
          (!targetId && i.produto.toLowerCase().trim() === itemData.produto.toLowerCase().trim())
      );

      let savedItem: RendimentoItem;
      if (existingIndex >= 0) {
        savedItem = {
          id: mergedList[existingIndex].id,
          produto: itemData.produto.trim(),
          rendimento: itemData.rendimento.trim(),
          unidade: itemData.unidade.trim(),
          observacao: itemData.observacao?.trim() || '',
          createdAt: mergedList[existingIndex].createdAt || now,
          updatedAt: now,
        };
        mergedList[existingIndex] = savedItem;
      } else {
        savedItem = {
          id: targetId || `rend_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          produto: itemData.produto.trim(),
          rendimento: itemData.rendimento.trim(),
          unidade: itemData.unidade.trim(),
          observacao: itemData.observacao?.trim() || '',
          createdAt: now,
          updatedAt: now,
        };
        mergedList.unshift(savedItem);
      }

      const finalizedList = deduplicateList(mergedList);
      memoryCache = finalizedList;
      setLocalCollectionSafe(RENDIMENTOS_STORAGE_KEY, finalizedList);
      markRecordPendingSync({
        collectionKey: RENDIMENTOS_STORAGE_KEY,
        itemId: savedItem.id,
        op: 'upsert',
        item: savedItem,
        idField: 'id',
        user,
        summaryLabel: savedItem.produto,
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('fenix_rendimentos_updated', { detail: { items: finalizedList } })
        );
      }
      return savedItem;
    }
    // 1. Busca a lista mais recente do Supabase para evitar conflitos de concorrência
    let currentList: RendimentoItem[] = [];
    try {
      const { data: row } = await withAbortableTimeout<any>(
        (signal) =>
          client
            .from('fenix_kv_store')
            .select('data')
            .eq('key', RENDIMENTOS_STORAGE_KEY)
            .abortSignal(signal)
            .maybeSingle(),
        12000,
        'Tempo limite ao consultar rendimentos no Supabase.'
      );

      if (row && row.data !== undefined) {
        let rData = row.data;
        if (typeof rData === 'string') {
          try {
            rData = JSON.parse(rData);
          } catch {}
        }
        if (Array.isArray(rData)) {
          currentList = deduplicateList(rData);
        }
      }
    } catch {
      // fallback
    }

    // Mescla com cache local para não perder nenhum registro
    const baseMap = new Map<string, RendimentoItem>();
    for (const it of memoryCache) {
      if (it && it.id) baseMap.set(it.id, it);
    }
    for (const it of currentList) {
      if (it && it.id) baseMap.set(it.id, it);
    }
    const mergedList = Array.from(baseMap.values());

    // 2. Prepara o item salvo: localiza por ID ou pelo nome do produto
    let savedItem: RendimentoItem;
    const targetId = existingId ? String(existingId).trim() : undefined;
    const existingIndex = mergedList.findIndex(
      (i) => (targetId && String(i.id).trim() === targetId) || (!targetId && i.produto.toLowerCase().trim() === itemData.produto.toLowerCase().trim())
    );

    if (existingIndex >= 0) {
      const matchedId = mergedList[existingIndex].id;
      savedItem = {
        id: matchedId,
        produto: itemData.produto.trim(),
        rendimento: itemData.rendimento.trim(),
        unidade: itemData.unidade.trim(),
        observacao: itemData.observacao?.trim() || '',
        createdAt: mergedList[existingIndex].createdAt || now,
        updatedAt: now,
      };
      mergedList[existingIndex] = savedItem;
    } else {
      savedItem = {
        id: targetId || `rend_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        produto: itemData.produto.trim(),
        rendimento: itemData.rendimento.trim(),
        unidade: itemData.unidade.trim(),
        observacao: itemData.observacao?.trim() || '',
        createdAt: now,
        updatedAt: now,
      };
      mergedList.unshift(savedItem);
    }

    // 3. Remove duplicidades
    const finalizedList = deduplicateList(mergedList);

    // 4. Persiste diretamente no Supabase fenix_kv_store (com fallback local seguro se houver falha de rede)
    try {
      const { error: upsertErr } = await withAbortableTimeout<any>(
        (signal) =>
          client!
            .from('fenix_kv_store')
            .upsert(
              {
                key: RENDIMENTOS_STORAGE_KEY,
                data: finalizedList,
                updated_at: now,
                updated_by: user,
              },
              { onConflict: 'key' }
            )
            .select('updated_at')
            .abortSignal(signal)
            .maybeSingle(),
        15000,
        'Tempo limite ao salvar rendimento no Supabase.'
      );

      if (upsertErr) {
        throw upsertErr;
      }
    } catch (err: any) {
      memoryCache = finalizedList;
      setLocalCollectionSafe(RENDIMENTOS_STORAGE_KEY, finalizedList);
      markRecordPendingSync({
        collectionKey: RENDIMENTOS_STORAGE_KEY,
        itemId: savedItem.id,
        op: 'upsert',
        item: savedItem,
        idField: 'id',
        user,
        summaryLabel: savedItem.produto,
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('fenix_rendimentos_updated', { detail: { items: finalizedList } })
        );
      }
      console.error('Erro no Supabase ao salvar rendimento (preservado localmente):', err);
      throw new Error(formatSupabaseErrorMessage(err, 'Erro ao persistir rendimento no Supabase (preservado localmente).'));
    }

    // 5. Atualiza o cache em memória e IndexedDB/localStorage imediatamente
    memoryCache = finalizedList;
    setLocalCollectionSafe(RENDIMENTOS_STORAGE_KEY, finalizedList);
    removePendingSyncRecord(RENDIMENTOS_STORAGE_KEY, savedItem.id);

    // 6. Notifica o sistema para atualização visual em tempo real
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fenix_rendimentos_updated', { detail: { items: finalizedList } })
      );
    }

    return savedItem;
  });
}

/**
 * Remove definitivamente um item de rendimento (ou localmente no IndexedDB em modo emergencial).
 */
export async function deleteRendimento(id: string): Promise<boolean> {
  if (!id) return false;

  const offlineMode = isEmergencyOfflineMode();
  const client = getSupabaseClient();
  if (!offlineMode && !client) {
    throw new Error('Falha ao conectar ao servidor do Supabase.');
  }

  const now = new Date().toISOString();
  const user =
    (typeof localStorage !== 'undefined' && (localStorage.getItem('fenix_active_user_name') || localStorage.getItem('fenix_saved_username'))) ||
    'Usuário Fênix';

  return enqueueCollectionWrite(RENDIMENTOS_STORAGE_KEY, async () => {
    const cleanTargetId = String(id).trim();
    if (offlineMode) {
      const current = getStoredRendimentos();
      const filtered = current.filter((item) => String(item.id).trim() !== cleanTargetId);
      memoryCache = filtered;
      setLocalCollectionSafe(RENDIMENTOS_STORAGE_KEY, filtered);
      markRecordPendingSync({
        collectionKey: RENDIMENTOS_STORAGE_KEY,
        itemId: cleanTargetId,
        op: 'delete',
        idField: 'id',
        user,
        summaryLabel: 'Rendimento excluído',
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('fenix_rendimentos_updated', { detail: { items: filtered } })
        );
      }
      return true;
    }
    // 1. Busca lista remota atual
    let currentList: RendimentoItem[] = [];
    try {
      const { data: row } = await withAbortableTimeout<any>(
        (signal) =>
          client
            .from('fenix_kv_store')
            .select('data')
            .eq('key', RENDIMENTOS_STORAGE_KEY)
            .abortSignal(signal)
            .maybeSingle(),
        12000,
        'Tempo limite ao consultar rendimentos no Supabase.'
      );

      if (row && row.data !== undefined) {
        let rData = row.data;
        if (typeof rData === 'string') {
          try {
            rData = JSON.parse(rData);
          } catch {}
        }
        if (Array.isArray(rData)) {
          currentList = deduplicateList(rData);
        }
      }
    } catch {
      // fallback
    }

    const baseMap = new Map<string, RendimentoItem>();
    for (const it of memoryCache) {
      if (it && it.id) baseMap.set(it.id, it);
    }
    for (const it of currentList) {
      if (it && it.id) baseMap.set(it.id, it);
    }
    const filtered = Array.from(baseMap.values()).filter((item) => String(item.id).trim() !== cleanTargetId);

    // 2. Atualiza diretamente o Supabase (com fallback local seguro se houver falha de rede)
    try {
      const { error } = await withAbortableTimeout<any>(
        (signal) =>
          client!
            .from('fenix_kv_store')
            .upsert(
              {
                key: RENDIMENTOS_STORAGE_KEY,
                data: filtered,
                updated_at: now,
                updated_by: user,
              },
              { onConflict: 'key' }
            )
            .select('updated_at')
            .abortSignal(signal)
            .maybeSingle(),
        15000,
        'Tempo limite ao excluir rendimento no Supabase.'
      );

      if (error) {
        throw error;
      }
    } catch (err: any) {
      memoryCache = filtered;
      setLocalCollectionSafe(RENDIMENTOS_STORAGE_KEY, filtered);
      markRecordPendingSync({
        collectionKey: RENDIMENTOS_STORAGE_KEY,
        itemId: cleanTargetId,
        op: 'delete',
        idField: 'id',
        user,
        summaryLabel: 'Rendimento excluído',
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('fenix_rendimentos_updated', { detail: { items: filtered } })
        );
      }
      console.error('Erro ao excluir rendimento no Supabase (preservado localmente):', err);
      throw new Error(formatSupabaseErrorMessage(err, 'Erro ao excluir rendimento no Supabase.'));
    }

    // 3. Atualiza cache em memória, IndexedDB/localStorage e dispara evento
    memoryCache = filtered;
    setLocalCollectionSafe(RENDIMENTOS_STORAGE_KEY, filtered);
    removePendingSyncRecord(RENDIMENTOS_STORAGE_KEY, cleanTargetId);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fenix_rendimentos_updated', { detail: { items: filtered } })
      );
    }

    return true;
  });
}

/**
 * Limpa todos os rendimentos.
 */
export async function clearAllRendimentos(): Promise<boolean> {
  const offlineMode = isEmergencyOfflineMode();
  const client = getSupabaseClient();
  if (!offlineMode && !client) return false;

  const now = new Date().toISOString();
  const user =
    (typeof localStorage !== 'undefined' && (localStorage.getItem('fenix_active_user_name') || localStorage.getItem('fenix_saved_username'))) ||
    'Usuário Fênix';

  return enqueueCollectionWrite(RENDIMENTOS_STORAGE_KEY, async () => {
    if (offlineMode) {
      memoryCache = [];
      setLocalCollectionSafe(RENDIMENTOS_STORAGE_KEY, []);
      markRecordPendingSync({
        collectionKey: RENDIMENTOS_STORAGE_KEY,
        itemId: '__collection__',
        op: 'collection',
        item: [],
        idField: 'id',
        user,
        summaryLabel: 'Rendimentos da Calculadora',
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('fenix_rendimentos_updated', { detail: { items: [] } })
        );
      }
      return true;
    }

    const { error } = await withAbortableTimeout<any>(
      (signal) =>
        client!
          .from('fenix_kv_store')
          .upsert(
            {
              key: RENDIMENTOS_STORAGE_KEY,
              data: [],
              updated_at: now,
              updated_by: user,
            },
            { onConflict: 'key' }
          )
          .select('updated_at')
          .abortSignal(signal)
          .maybeSingle(),
      15000,
      'Tempo limite ao limpar rendimentos no Supabase.'
    );

    if (error) return false;

    memoryCache = [];
    setLocalCollectionSafe(RENDIMENTOS_STORAGE_KEY, []);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fenix_rendimentos_updated', { detail: { items: [] } })
      );
    }

    return true;
  });
}
