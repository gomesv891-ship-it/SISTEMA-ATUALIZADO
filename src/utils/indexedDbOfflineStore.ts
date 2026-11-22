import { OFFICIAL_CLIENTS } from '../data/databaseSeed';
import {
  INITIAL_PRODUCT_CATEGORIES,
  INITIAL_PRODUCT_GROUPS,
  INITIAL_PRODUCT_ITEMS,
} from '../data/initialProductsSeed';

const DB_NAME = 'fenix_crm_offline_db';
const DB_VERSION = 1;

const STORE_KV = 'kv_collections';
const STORE_PENDING = 'pending_sync';
const STORE_META = 'meta';

export const EMERGENCY_OFFLINE_MODE_KEY = 'fenix_emergency_offline_mode_v1';
export const MANUAL_OFFLINE_LOCK_KEY = 'fenix_emergency_offline_manual_v2';
export const PENDING_SYNC_UPDATED_EVENT = 'fenix_pending_sync_updated';
export const EMERGENCY_MODE_CHANGED_EVENT = 'fenix_emergency_offline_mode_changed';

export type PendingSyncOp = 'upsert' | 'delete' | 'collection';

export interface PendingOfflineRecord {
  queueKey: string; // `${collectionKey}::${itemId}`
  collectionKey: string;
  itemId: string;
  op: PendingSyncOp;
  item?: any;
  idField: string;
  user: string;
  timestamp: number;
  summaryLabel?: string;
}

interface KvRecord {
  key: string;
  data: string;
  updatedAt: string;
}

interface MetaRecord {
  key: string;
  value: any;
}

// Synchronous RAM mirrors populated before React renders (and updated on every write)
const ramKvCache = new Map<string, string>();
const ramPendingMap = new Map<string, PendingOfflineRecord>();
const ramMetaCache = new Map<string, any>();

let dbPromise: Promise<IDBDatabase | null> | null = null;
let idbAvailable = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
let hydratedDone = false;

const pendingSubscribers = new Set<() => void>();
const emergencySubscribers = new Set<(enabled: boolean) => void>();

// Bridge callback so supabaseClient.ts keeps its memoryCollectionCache synchronized
let onHydratedCollectionHook: ((key: string, serialized: string) => void) | null = null;

export function registerCollectionHydrationHook(
  hook: (key: string, serialized: string) => void
): void {
  onHydratedCollectionHook = hook;
  if (hydratedDone) {
    ramKvCache.forEach((val, key) => {
      try {
        hook(key, val);
      } catch {
        // ignore
      }
    });
  }
}

function shouldPersistKeyInIdb(key: string): boolean {
  if (!key || !key.startsWith('fenix_')) return false;
  if (
    key.startsWith('fenix_test_') ||
    key.startsWith('fenix_sound_played_') ||
    key === 'fenix_supabase_url' ||
    key === 'fenix_supabase_anon_key' ||
    key === 'fenix_remote_updated_at_map_v1' ||
    key === 'fenix_pending_sync_queue_v1' ||
    key === EMERGENCY_OFFLINE_MODE_KEY ||
    key === MANUAL_OFFLINE_LOCK_KEY ||
    key === 'fenix_active_user_name' ||
    key === 'fenix_active_user' ||
    key === 'fenix_auth_active' ||
    key === 'fenix_saved_username'
  ) {
    return false;
  }
  return true;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!idbAvailable) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_PENDING)) {
          db.createObjectStore(STORE_PENDING, { keyPath: 'queueKey' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          try {
            db.close();
          } catch {}
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        console.warn('[IndexedDB] Erro ao abrir banco offline:', request.error);
        idbAvailable = false;
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('[IndexedDB] Abertura bloqueada por outra aba.');
      };
    } catch (err) {
      console.warn('[IndexedDB] Indisponível:', err);
      idbAvailable = false;
      resolve(null);
    }
  });

  return dbPromise;
}

function idbPut(storeName: string, value: any): void {
  openDatabase()
    .then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value);
      } catch (err) {
        console.warn(`[IndexedDB] Erro ao gravar em ${storeName}:`, err);
      }
    })
    .catch(() => {});
}

function idbDelete(storeName: string, key: string): void {
  openDatabase()
    .then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
      } catch (err) {
        console.warn(`[IndexedDB] Erro ao remover de ${storeName}:`, err);
      }
    })
    .catch(() => {});
}

function idbGetAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function notifyPendingSyncSubscribers() {
  pendingSubscribers.forEach((cb) => {
    try {
      cb();
    } catch {}
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(PENDING_SYNC_UPDATED_EVENT, {
        detail: { count: ramPendingMap.size },
      })
    );
  }
}

/**
 * Modo Offline Manual (Fallback / Bloqueio explícito):
 * - Padrão online-first híbrido (`false`): salva no Supabase com persistência simultânea no IndexedDB.
 * - Só bloqueia chamadas ao Supabase se o usuário ativar explicitamente o bloqueio manual.
 */
export function isManualEmergencyOfflineMode(): boolean {
  if (ramMetaCache.has(MANUAL_OFFLINE_LOCK_KEY)) {
    return ramMetaCache.get(MANUAL_OFFLINE_LOCK_KEY) === true;
  }
  if (typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(MANUAL_OFFLINE_LOCK_KEY) === 'true';
    } catch {}
  }
  return false;
}

export function isEmergencyOfflineMode(): boolean {
  return isManualEmergencyOfflineMode();
}

export function setEmergencyOfflineMode(enabled: boolean): void {
  ramMetaCache.set(MANUAL_OFFLINE_LOCK_KEY, enabled);
  ramMetaCache.set(EMERGENCY_OFFLINE_MODE_KEY, enabled);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(MANUAL_OFFLINE_LOCK_KEY, enabled ? 'true' : 'false');
      localStorage.setItem(EMERGENCY_OFFLINE_MODE_KEY, enabled ? 'true' : 'false');
    } catch {}
  }
  idbPut(STORE_META, { key: MANUAL_OFFLINE_LOCK_KEY, value: enabled });
  idbPut(STORE_META, { key: EMERGENCY_OFFLINE_MODE_KEY, value: enabled });

  emergencySubscribers.forEach((cb) => {
    try {
      cb(enabled);
    } catch {}
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(EMERGENCY_MODE_CHANGED_EVENT, { detail: { enabled } })
    );
  }
}

export function subscribeEmergencyOfflineMode(cb: (enabled: boolean) => void): () => void {
  emergencySubscribers.add(cb);
  return () => {
    emergencySubscribers.delete(cb);
  };
}

export function idbGetCollectionRaw(key: string): string | null {
  if (ramKvCache.has(key)) {
    return ramKvCache.get(key) ?? null;
  }
  if (typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {}
  }
  return null;
}

export function idbSetCollectionRaw(key: string, data: any): void {
  if (!key) return;
  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  ramKvCache.set(key, serialized);

  if (shouldPersistKeyInIdb(key)) {
    idbPut(STORE_KV, {
      key,
      data: serialized,
      updatedAt: new Date().toISOString(),
    } satisfies KvRecord);
  }

  if (onHydratedCollectionHook) {
    try {
      onHydratedCollectionHook(key, serialized);
    } catch {}
  }
}

function mirrorToLocalStorageBestEffort(key: string, serialized: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, serialized);
  } catch {
    // QuotaExceededError é esperado em dispositivos com muito volume; IndexedDB garante persistência real.
  }
}

function safeMergeById(primary: any[], secondary: any[], idField = 'id'): any[] {
  const map = new Map<string, any>();
  const getId = (item: any): string | null => {
    if (!item || typeof item !== 'object') return null;
    const v = item[idField] ?? item.id ?? item._id ?? item.idOrcamento ?? item.pedido ?? item.codigo;
    return v !== undefined && v !== null && String(v).trim() !== '' ? String(v).trim() : null;
  };
  for (const item of primary) {
    const id = getId(item);
    if (id) map.set(id, item);
  }
  for (const item of secondary) {
    const id = getId(item);
    if (id) {
      const existing = map.get(id);
      map.set(id, existing ? { ...existing, ...item } : item);
    }
  }
  return Array.from(map.values());
}

const OFFICIAL_CLIENT_ID_SET = new Set(
  OFFICIAL_CLIENTS.map((c) => String(c.id || '').trim()).filter(Boolean)
);

export function isOfficialSeedClientId(id?: string | number | null): boolean {
  if (id === undefined || id === null) return false;
  return OFFICIAL_CLIENT_ID_SET.has(String(id).trim());
}

/**
 * Mescla listas de clientes sem perder nem duplicar registros, garantindo que
 * clientes novos / não pertencentes ao seed oficial permaneçam no topo (visíveis primeiro).
 */
export function mergeClientsPreservingNewFirst(
  newerOrPreferredList: any[],
  olderOrFallbackList: any[],
  deletedIds?: Set<string>
): any[] {
  const map = new Map<string, any>();
  const nonSeedOrder: string[] = [];
  const seedOrder: string[] = [];

  const getClientId = (item: any): string | null => {
    if (!item || typeof item !== 'object') return null;
    const v = item.id ?? item._id ?? item.codigo;
    return v !== undefined && v !== null && String(v).trim() !== '' ? String(v).trim() : null;
  };

  const trackIdOrder = (id: string) => {
    if (OFFICIAL_CLIENT_ID_SET.has(id)) {
      if (!seedOrder.includes(id)) seedOrder.push(id);
    } else {
      if (!nonSeedOrder.includes(id)) nonSeedOrder.push(id);
    }
  };

  // 1. Insere primeiro os registros da base secundária/antiga (serão complementados pelos preferidos)
  for (const item of olderOrFallbackList) {
    const id = getClientId(item);
    if (!id || deletedIds?.has(id)) continue;
    map.set(id, item);
    trackIdOrder(id);
  }

  // 2. Mescla registros preferidos/mais novos mantendo ordem de não-seed no topo
  const preferredNonSeedIds: string[] = [];
  for (const item of newerOrPreferredList) {
    const id = getClientId(item);
    if (!id || deletedIds?.has(id)) continue;
    const existing = map.get(id);
    map.set(id, existing ? { ...existing, ...item } : item);
    if (!OFFICIAL_CLIENT_ID_SET.has(id)) {
      if (!preferredNonSeedIds.includes(id)) preferredNonSeedIds.push(id);
    } else if (!seedOrder.includes(id)) {
      seedOrder.push(id);
    }
  }

  const remainingNonSeed = nonSeedOrder.filter((id) => !preferredNonSeedIds.includes(id));
  const finalIds = [...preferredNonSeedIds, ...remainingNonSeed, ...seedOrder];
  return finalIds.map((id) => map.get(id)).filter(Boolean);
}

/**
 * Marca um registro específico como pendente de sincronização com o Supabase.
 */
export function markRecordPendingSync(params: {
  collectionKey: string;
  itemId: string | number;
  op: PendingSyncOp;
  item?: any;
  idField?: string;
  user?: string;
  summaryLabel?: string;
}): void {
  const cleanId = String(params.itemId ?? '').trim();
  if (!params.collectionKey || !cleanId) return;

  const queueKey = `${params.collectionKey}::${cleanId}`;
  const existing = ramPendingMap.get(queueKey);

  // Se o registro foi criado apenas localmente (nunca existiu no Supabase?) ou já tinha upsert pendente:
  // Mantemos tombstone 'delete' para garantir que se existir no Supabase ele seja removido no sync seguro.
  const entry: PendingOfflineRecord = {
    queueKey,
    collectionKey: params.collectionKey,
    itemId: cleanId,
    op: params.op,
    item: params.op === 'delete' ? undefined : params.item ?? existing?.item,
    idField: params.idField || existing?.idField || 'id',
    user: params.user || existing?.user || 'Usuário Fênix',
    timestamp: Date.now(),
    summaryLabel: params.summaryLabel || existing?.summaryLabel || extractSummaryLabel(params.item, cleanId),
  };

  ramPendingMap.set(queueKey, entry);
  idbPut(STORE_PENDING, entry);
  notifyPendingSyncSubscribers();
}

export function markRecordsBatchPendingSync(
  entries: Array<{
    collectionKey: string;
    itemId: string | number;
    op: PendingSyncOp;
    item?: any;
    idField?: string;
    user?: string;
    summaryLabel?: string;
  }>
): void {
  if (!Array.isArray(entries) || entries.length === 0) return;
  for (const params of entries) {
    const cleanId = String(params.itemId ?? '').trim();
    if (!params.collectionKey || !cleanId) continue;
    const queueKey = `${params.collectionKey}::${cleanId}`;
    const existing = ramPendingMap.get(queueKey);
    const entry: PendingOfflineRecord = {
      queueKey,
      collectionKey: params.collectionKey,
      itemId: cleanId,
      op: params.op,
      item: params.op === 'delete' ? undefined : params.item ?? existing?.item,
      idField: params.idField || existing?.idField || 'id',
      user: params.user || existing?.user || 'Usuário Fênix',
      timestamp: Date.now(),
      summaryLabel: params.summaryLabel || existing?.summaryLabel || extractSummaryLabel(params.item, cleanId),
    };
    ramPendingMap.set(queueKey, entry);
    idbPut(STORE_PENDING, entry);
  }
  notifyPendingSyncSubscribers();
}

export function removePendingSyncRecord(collectionKey: string, itemId: string | number): void {
  const cleanId = String(itemId ?? '').trim();
  if (!collectionKey || !cleanId) return;
  const queueKey = `${collectionKey}::${cleanId}`;
  if (ramPendingMap.has(queueKey)) {
    ramPendingMap.delete(queueKey);
    idbDelete(STORE_PENDING, queueKey);
    notifyPendingSyncSubscribers();
  }
}

export function removePendingSyncByQueueKey(queueKey: string): void {
  if (ramPendingMap.has(queueKey)) {
    ramPendingMap.delete(queueKey);
    idbDelete(STORE_PENDING, queueKey);
    notifyPendingSyncSubscribers();
  }
}

export function clearAllPendingSyncForCollection(collectionKey: string): void {
  let changed = false;
  for (const [qKey, rec] of ramPendingMap.entries()) {
    if (rec.collectionKey === collectionKey) {
      ramPendingMap.delete(qKey);
      idbDelete(STORE_PENDING, qKey);
      changed = true;
    }
  }
  if (changed) notifyPendingSyncSubscribers();
}

export function getPendingSyncRecords(): PendingOfflineRecord[] {
  return Array.from(ramPendingMap.values()).sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Flag visual para ocultar indicadores técnicos de armazenamento/sincronização
 * (rodapé lateral e etiquetas "Pendente sync") por padrão na interface,
 * preservando 100% do rastreamento interno do IndexedDB e fila pendente.
 */
export const SHOW_OFFLINE_SYNC_INDICATORS = false;

export function getPendingSyncCount(): number {
  return ramPendingMap.size;
}

export function isRecordPendingSync(
  collectionKey: string,
  itemId?: string | number | null
): boolean {
  if (!collectionKey || itemId === undefined || itemId === null) return false;
  const cleanId = String(itemId).trim();
  if (!cleanId) return false;

  if (ramPendingMap.has(`${collectionKey}::${cleanId}`)) return true;

  // Para orçamentos, verifica em ambas as coleções equivalentes
  if (collectionKey === 'fenix_orcamentos_history' || collectionKey === 'fenix_saved_orcamentos') {
    return (
      ramPendingMap.has(`fenix_orcamentos_history::${cleanId}`) ||
      ramPendingMap.has(`fenix_saved_orcamentos::${cleanId}`)
    );
  }

  return false;
}

export function subscribePendingSync(cb: () => void): () => void {
  pendingSubscribers.add(cb);
  return () => {
    pendingSubscribers.delete(cb);
  };
}

function extractSummaryLabel(item: any, fallbackId: string): string {
  if (!item || typeof item !== 'object') return fallbackId;
  return (
    item.name ||
    item.nome ||
    item.clientName ||
    item.cliente ||
    item.nomeOrcamento ||
    item.title ||
    item.titulo ||
    item.produto ||
    fallbackId
  );
}

/**
 * Restaura clientes oficiais de seed mesclando com os existentes sem apagar nem sobrescrever clientes atuais.
 */
export function restoreOfficialSeedClientsSafe(): number {
  const existingRaw = idbGetCollectionRaw('fenix_clients_db');
  let existingList: any[] = [];
  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw);
      if (Array.isArray(parsed)) existingList = parsed;
    } catch {}
  }

  const deletedIds = new Set(
    Array.from(ramPendingMap.values())
      .filter((r) => r.collectionKey === 'fenix_clients_db' && r.op === 'delete')
      .map((r) => r.itemId)
  );
  const merged = mergeClientsPreservingNewFirst(existingList, OFFICIAL_CLIENTS, deletedIds);
  const serialized = JSON.stringify(merged);
  idbSetCollectionRaw('fenix_clients_db', serialized);
  mirrorToLocalStorageBestEffort('fenix_clients_db', serialized);

  ramMetaCache.set('clients_seed_merged_v1', true);
  idbPut(STORE_META, { key: 'clients_seed_merged_v1', value: true });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('fenix_clients_updated'));
    window.dispatchEvent(new Event('storage'));
  }

  return merged.length;
}

/**
 * Hidrata RAM + localStorage a partir do IndexedDB ANTES da renderização inicial do React.
 * Preserva todos os dados já existentes e restaura a base de clientes oficial quando ausente.
 */
export async function hydrateOfflineStore(): Promise<void> {
  if (hydratedDone) return;

  const hydrateWork = async () => {
    // 1. Captura snapshot do localStorage ANTES de ler/espelhar o IndexedDB
    // para que o IndexedDB nunca sobrescreva clientes novos existentes no localStorage.
    const lsSnapshot = new Map<string, string>();
    let legacyQueueRaw: string | null = null;
    let savedEmergencyFlag: string | null = null;
    let activeClientRaw: string | null = null;

    if (typeof localStorage !== 'undefined') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !shouldPersistKeyInIdb(key)) continue;
          const val = localStorage.getItem(key);
          if (val !== null) lsSnapshot.set(key, val);
        }
        legacyQueueRaw = localStorage.getItem('fenix_pending_sync_queue_v1');
        savedEmergencyFlag = localStorage.getItem(EMERGENCY_OFFLINE_MODE_KEY);
        activeClientRaw = localStorage.getItem('fenix_active_client');
      } catch {}
    }

    const db = await openDatabase();

    if (db) {
      const [kvRows, pendingRows, metaRows] = await Promise.all([
        idbGetAll<KvRecord>(db, STORE_KV),
        idbGetAll<PendingOfflineRecord>(db, STORE_PENDING),
        idbGetAll<MetaRecord>(db, STORE_META),
      ]);

      for (const m of metaRows) {
        if (m && m.key) ramMetaCache.set(m.key, m.value);
      }

      for (const row of kvRows) {
        if (row && row.key && typeof row.data === 'string') {
          ramKvCache.set(row.key, row.data);
        }
      }

      for (const p of pendingRows) {
        if (p && p.queueKey) {
          ramPendingMap.set(p.queueKey, p);
        }
      }
    }

    const deletedClientIds = new Set(
      Array.from(ramPendingMap.values())
        .filter((r) => r.collectionKey === 'fenix_clients_db' && r.op === 'delete')
        .map((r) => r.itemId)
    );

    // 2. Mesclar dados do localStorage com o IndexedDB (nunca descartar clientes ou registros locais)
    lsSnapshot.forEach((lsVal, key) => {
      if (!lsVal || lsVal === '[]' || lsVal === '{}') return;
      const idbVal = ramKvCache.get(key);
      if (!idbVal || idbVal === '[]' || idbVal === '{}') {
        ramKvCache.set(key, lsVal);
        idbPut(STORE_KV, {
          key,
          data: lsVal,
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      // Para coleções em array, faz mescla não-destrutiva entre IndexedDB e localStorage
      if (idbVal !== lsVal) {
        try {
          const idbParsed = JSON.parse(idbVal);
          const lsParsed = JSON.parse(lsVal);
          if (Array.isArray(idbParsed) && Array.isArray(lsParsed)) {
            const mergedArr =
              key === 'fenix_clients_db'
                ? mergeClientsPreservingNewFirst(lsParsed, idbParsed, deletedClientIds)
                : safeMergeById(idbParsed, lsParsed, 'id');
            const serialized = JSON.stringify(mergedArr);
            ramKvCache.set(key, serialized);
            idbPut(STORE_KV, {
              key,
              data: serialized,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch {}
      }
    });

    // 3. Migrar eventual fila legada fenix_pending_sync_queue_v1 para o IndexedDB
    if (legacyQueueRaw) {
      try {
        const legacyQueue = JSON.parse(legacyQueueRaw);
        if (Array.isArray(legacyQueue) && legacyQueue.length > 0) {
          for (const q of legacyQueue) {
            if (!q || !q.collectionKey || !q.item) continue;
            const idField = q.idField || 'id';
            const itemId = String(
              q.item[idField] ?? q.item.id ?? q.item._id ?? Date.now()
            ).trim();
            const queueKey = `${q.collectionKey}::${itemId}`;
            if (!ramPendingMap.has(queueKey)) {
              const rec: PendingOfflineRecord = {
                queueKey,
                collectionKey: q.collectionKey,
                itemId,
                op: 'upsert',
                item: q.item,
                idField,
                user: q.user || 'Usuário Fênix',
                timestamp: q.timestamp || Date.now(),
                summaryLabel: extractSummaryLabel(q.item, itemId),
              };
              ramPendingMap.set(queueKey, rec);
              idbPut(STORE_PENDING, rec);
            }

            // Garante que o item pendente também esteja refletido na coleção local
            const colRaw = ramKvCache.get(q.collectionKey);
            let colList: any[] = [];
            if (colRaw) {
              try {
                const p = JSON.parse(colRaw);
                if (Array.isArray(p)) colList = p;
              } catch {}
            }
            const mergedCol =
              q.collectionKey === 'fenix_clients_db'
                ? mergeClientsPreservingNewFirst([q.item], colList, deletedClientIds)
                : safeMergeById(colList, [q.item], idField);
            const serializedCol = JSON.stringify(mergedCol);
            ramKvCache.set(q.collectionKey, serializedCol);
            idbPut(STORE_KV, {
              key: q.collectionKey,
              data: serializedCol,
              updatedAt: new Date().toISOString(),
            });
          }
        }
      } catch {}
    }

    // Migrar trava automática legada de modo offline para modo online-first híbrido,
    // preservando 100% dos registros salvos no IndexedDB e na fila pendente para envio ao Supabase.
    try {
      const hasManualLockInRam = ramMetaCache.get(MANUAL_OFFLINE_LOCK_KEY) === true;
      const hasManualLockInLs =
        typeof localStorage !== 'undefined' &&
        localStorage.getItem(MANUAL_OFFLINE_LOCK_KEY) === 'true';
      const effectiveManualLock = hasManualLockInRam || hasManualLockInLs;

      ramMetaCache.set(MANUAL_OFFLINE_LOCK_KEY, effectiveManualLock);
      ramMetaCache.set(EMERGENCY_OFFLINE_MODE_KEY, effectiveManualLock);
      idbPut(STORE_META, { key: MANUAL_OFFLINE_LOCK_KEY, value: effectiveManualLock });
      idbPut(STORE_META, { key: EMERGENCY_OFFLINE_MODE_KEY, value: effectiveManualLock });

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MANUAL_OFFLINE_LOCK_KEY, effectiveManualLock ? 'true' : 'false');
        localStorage.setItem(EMERGENCY_OFFLINE_MODE_KEY, effectiveManualLock ? 'true' : 'false');
      }
      void savedEmergencyFlag;
    } catch {}

    // 4. Restaurar clientes existentes + pendentes + base oficial sem nunca perder ou rebaixar clientes novos
    try {
      const currentClientsRaw = ramKvCache.get('fenix_clients_db');
      let currentClients: any[] = [];
      if (currentClientsRaw) {
        try {
          const parsed = JSON.parse(currentClientsRaw);
          if (Array.isArray(parsed)) currentClients = parsed;
        } catch {}
      }

      // Inclui também clientes pendentes de sync caso ainda não estejam na coleção e ativo recente se válido
      const pendingClients = Array.from(ramPendingMap.values())
        .filter((r) => r.collectionKey === 'fenix_clients_db' && r.op === 'upsert' && r.item)
        .map((r) => r.item);

      const extraClients: any[] = [...pendingClients];
      if (activeClientRaw) {
        try {
          const activeCli = JSON.parse(activeClientRaw);
          if (activeCli && activeCli.id && activeCli.name) {
            extraClients.push(activeCli);
          }
        } catch {}
      }

      const alreadyMergedSeed = ramMetaCache.get('clients_seed_merged_v1') === true;
      const baseWithExtras =
        extraClients.length > 0
          ? mergeClientsPreservingNewFirst(extraClients, currentClients, deletedClientIds)
          : mergeClientsPreservingNewFirst(currentClients, [], deletedClientIds);

      const finalClients =
        baseWithExtras.length === 0 || !alreadyMergedSeed
          ? mergeClientsPreservingNewFirst(baseWithExtras, OFFICIAL_CLIENTS, deletedClientIds)
          : baseWithExtras;

      const serializedClients = JSON.stringify(finalClients);
      if (serializedClients !== currentClientsRaw || !alreadyMergedSeed) {
        ramKvCache.set('fenix_clients_db', serializedClients);
        idbPut(STORE_KV, {
          key: 'fenix_clients_db',
          data: serializedClients,
          updatedAt: new Date().toISOString(),
        });
        ramMetaCache.set('clients_seed_merged_v1', true);
        idbPut(STORE_META, { key: 'clients_seed_merged_v1', value: true });
      }
    } catch {}

    // Espelhar todas as coleções consolidadas para o localStorage somente após mesclagem completa
    ramKvCache.forEach((val, key) => {
      mirrorToLocalStorageBestEffort(key, val);
    });

    // Garantir catálogo de produtos disponível no IndexedDB caso vazio (preserva alterações locais)
    try {
      const ensureSeedIfEmpty = (key: string, seedData: any[]) => {
        const cur = ramKvCache.get(key);
        let hasItems = false;
        if (cur) {
          try {
            const p = JSON.parse(cur);
            if (Array.isArray(p) && p.length > 0) hasItems = true;
          } catch {}
        }
        if (!hasItems && seedData.length > 0) {
          const serialized = JSON.stringify(seedData);
          ramKvCache.set(key, serialized);
          mirrorToLocalStorageBestEffort(key, serialized);
          idbPut(STORE_KV, {
            key,
            data: serialized,
            updatedAt: new Date().toISOString(),
          });
        }
      };

      ensureSeedIfEmpty('fenix_product_items_data', INITIAL_PRODUCT_ITEMS);
      ensureSeedIfEmpty('fenix_product_categories_data', INITIAL_PRODUCT_CATEGORIES);
      ensureSeedIfEmpty('fenix_product_groups_data', INITIAL_PRODUCT_GROUPS);
    } catch {}

    // Sincronizar ponte com supabaseClient
    if (onHydratedCollectionHook) {
      ramKvCache.forEach((val, key) => {
        try {
          onHydratedCollectionHook!(key, val);
        } catch {}
      });
    }
  };

  try {
    await Promise.race([
      hydrateWork(),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch (err) {
    console.warn('[IndexedDB] Erro na hidratação inicial (continuando com memória/localStorage):', err);
  } finally {
    hydratedDone = true;
  }
}

export function getOfflineStoreStats(): {
  idbAvailable: boolean;
  emergencyMode: boolean;
  pendingCount: number;
  counts: {
    clientes: number;
    orcamentos: number;
    followup: number;
    prospeccao: number;
    tarefas: number;
    produtos: number;
    anotacoes: number;
    promocoes: number;
  };
} {
  const countArray = (key: string): number => {
    const raw = idbGetCollectionRaw(key);
    if (!raw) return 0;
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.length : 0;
    } catch {
      return 0;
    }
  };

  const orcIds = new Set<string>();
  for (const k of ['fenix_orcamentos_history', 'fenix_saved_orcamentos']) {
    const raw = idbGetCollectionRaw(k);
    if (raw) {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) {
          p.forEach((o: any) => {
            if (o?.id) orcIds.add(String(o.id));
          });
        }
      } catch {}
    }
  }

  let anotacoesCount = 0;
  const rawNotes = idbGetCollectionRaw('fenix_anotacoes_db');
  if (rawNotes) {
    try {
      const p = JSON.parse(rawNotes);
      if (p && Array.isArray(p.notes)) anotacoesCount = p.notes.length;
    } catch {}
  }

  return {
    idbAvailable,
    emergencyMode: isEmergencyOfflineMode(),
    pendingCount: ramPendingMap.size,
    counts: {
      clientes: countArray('fenix_clients_db'),
      orcamentos: orcIds.size,
      followup: countArray('fenix_followup_cards_v2'),
      prospeccao: countArray('fenix_prospeccao_clients_db'),
      tarefas: countArray('fenix_tarefas_db'),
      produtos: countArray('fenix_product_items_data'),
      anotacoes: anotacoesCount,
      promocoes: countArray('fenix_promocoes_ativas_db'),
    },
  };
}

export function exportOfflineBackupPayload(): string {
  const collections: Record<string, any> = {};
  ramKvCache.forEach((raw, key) => {
    try {
      collections[key] = JSON.parse(raw);
    } catch {
      collections[key] = raw;
    }
  });
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      source: 'CRM_FENIX_WORLD_INDEXEDDB',
      emergencyOfflineMode: isEmergencyOfflineMode(),
      collections,
      pendingSync: getPendingSyncRecords(),
    },
    null,
    2
  );
}
