import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  clearAllPendingSyncForCollection,
  getPendingSyncRecords,
  idbGetCollectionRaw,
  idbSetCollectionRaw,
  isEmergencyOfflineMode,
  isOfficialSeedClientId,
  markRecordPendingSync,
  markRecordsBatchPendingSync,
  mergeClientsPreservingNewFirst,
  PendingOfflineRecord,
  registerCollectionHydrationHook,
  removePendingSyncByQueueKey,
  removePendingSyncRecord,
} from './indexedDbOfflineStore';

// Default project configuration provided by the user
export const DEFAULT_SUPABASE_URL = 'https://rewcifdxtwvwabnxbafx.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_6oTfXVQa1z45xtlAfSyK2g_Ad2gs-el';

// Storage keys for user credentials (persisted in localStorage, with defaults fallback)
export const STORAGE_SUPABASE_URL_KEY = 'fenix_supabase_url';
export const STORAGE_SUPABASE_KEY_KEY = 'fenix_supabase_anon_key';
export const STORAGE_SUPABASE_AUTO_SYNC_KEY = 'fenix_supabase_auto_sync';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  autoSync: boolean;
}

export interface SupabaseSyncStatus {
  connected: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  error: string | null;
  tablesStatus?: Record<string, { count: number; error?: string }>;
}

let supabaseClientInstance: SupabaseClient | null = null;
let currentClientUrl = '';
let currentClientKey = '';

// Cache em memória resiliente contra QuotaExceededError do localStorage (~5 MB)
const memoryCollectionCache = new Map<string, string>();
const parsedCollectionCache = new Map<string, { raw: string; parsed: any[] }>();
const localStorageWriteFailedKeys = new Set<string>();

// Sincroniza cache em memória com os dados hidratados do IndexedDB
registerCollectionHydrationHook((key, serialized) => {
  memoryCollectionCache.set(key, serialized);
  parsedCollectionCache.delete(key);
});

function evictExpendableLocalStorageCaches(preserveKey?: string) {
  if (typeof localStorage === 'undefined') return;
  try {
    const keysToCheck: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keysToCheck.push(k);
    }

    const expendablePrefixes = ['fenix_test_', 'fenix_orcamento_in_progress_draft'];
    for (const k of keysToCheck) {
      if (k === preserveKey) continue;
      if (expendablePrefixes.some((p) => k.startsWith(p))) {
        try {
          localStorage.removeItem(k);
        } catch {}
      }
    }

    // Se houver cópia legada de follow-up e a v2 existir, libera a legada
    if (preserveKey !== 'fenix_followup_db' && localStorage.getItem('fenix_followup_cards_v2')) {
      try {
        localStorage.removeItem('fenix_followup_db');
      } catch {}
    }

    // Notificações e histórico de atividades podem crescer muito e têm fonte no Supabase
    for (const secondaryKey of ['fenix_activities_db', 'fenix_header_notifications_v2']) {
      if (secondaryKey !== preserveKey) {
        try {
          const val = localStorage.getItem(secondaryKey);
          if (val && val.length > 50000) {
            if (!memoryCollectionCache.has(secondaryKey)) {
              memoryCollectionCache.set(secondaryKey, val);
            }
            localStorage.removeItem(secondaryKey);
          }
        } catch {}
      }
    }
  } catch {
    // ignore
  }
}

export function setLocalCollectionSafe(key: string, data: any): boolean {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  memoryCollectionCache.set(key, serialized);
  if (Array.isArray(data)) {
    parsedCollectionCache.set(key, { raw: serialized, parsed: [...data] });
  } else {
    parsedCollectionCache.delete(key);
  }

  // Persistência primária durável no IndexedDB
  idbSetCollectionRaw(key, serialized);

  if (typeof localStorage === 'undefined') return true;
  try {
    localStorage.setItem(key, serialized);
    localStorageWriteFailedKeys.delete(key);
    return true;
  } catch {
    // Tenta liberar caches secundários/temporários e repetir uma vez
    evictExpendableLocalStorageCaches(key);
    try {
      localStorage.setItem(key, serialized);
      localStorageWriteFailedKeys.delete(key);
      return true;
    } catch {
      localStorageWriteFailedKeys.add(key);
      return false;
    }
  }
}

export function getLocalRawSafe(key: string): string | null {
  const memVal = memoryCollectionCache.get(key) ?? idbGetCollectionRaw(key) ?? null;

  if (typeof localStorage === 'undefined') {
    return memVal;
  }

  if (localStorageWriteFailedKeys.has(key) && memVal !== null) {
    return memVal;
  }

  try {
    const lsVal = localStorage.getItem(key);
    if (lsVal === null || lsVal === '' || lsVal === '[]') {
      if (memVal !== null && memVal !== '' && memVal !== '[]') {
        return memVal;
      }
    }
    return lsVal ?? memVal;
  } catch {
    return memVal;
  }
}

export function getLocalCollectionSafe<T = any>(key: string, fallback: T[] = []): T[] {
  try {
    const raw = getLocalRawSafe(key);
    if (!raw) return fallback;
    const cached = parsedCollectionCache.get(key);
    if (cached && cached.raw === raw) {
      return [...cached.parsed] as T[];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      parsedCollectionCache.set(key, { raw, parsed: [...parsed] });
      return parsed;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

// Limpeza de segurança defensiva: remover credenciais legadas do localStorage
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem(STORAGE_SUPABASE_URL_KEY);
    localStorage.removeItem(STORAGE_SUPABASE_KEY_KEY);
  } catch {
    // ignore
  }
}

/**
 * Retrieves the current configured URL directly from project configuration/environment
 */
export function getSupabaseUrl(): string {
  // Garantir que não existam credenciais legadas no localStorage
  try {
    localStorage.removeItem(STORAGE_SUPABASE_URL_KEY);
  } catch {
    // ignore
  }
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return normalizeSupabaseUrl(envUrl.trim());
  }
  return DEFAULT_SUPABASE_URL;
}

/**
 * Cleans and normalizes URL by removing trailing slashes and /rest/v1 if included
 */
export function normalizeSupabaseUrl(rawUrl: string): string {
  let u = rawUrl.trim();
  // Remove /rest/v1 or /rest/v1/ suffix if pasted
  u = u.replace(/\/rest\/v1\/?$/, '');
  // Remove trailing slashes
  u = u.replace(/\/+$/, '');
  return u;
}

/**
 * Retrieves the current configured Anon Key directly from project configuration/environment
 */
export function getSupabaseAnonKey(): string {
  // Garantir que não existam credenciais legadas no localStorage
  try {
    localStorage.removeItem(STORAGE_SUPABASE_KEY_KEY);
  } catch {
    // ignore
  }
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
  if (envKey && typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }
  return DEFAULT_SUPABASE_ANON_KEY;
}

/**
 * Check if auto-sync is enabled (defaults to true)
 */
export function isSupabaseAutoSyncEnabled(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_SUPABASE_AUTO_SYNC_KEY);
    if (saved !== null) {
      return saved === 'true';
    }
  } catch {
    // ignore
  }
  return true;
}

export function setSupabaseAutoSyncEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_SUPABASE_AUTO_SYNC_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('fenix_supabase_config_changed'));
  } catch {
    // ignore
  }
}

/**
 * Saves sync settings without storing credentials in localStorage
 */
export function saveSupabaseConfig(_url?: string, _anonKey?: string, autoSync = true) {
  try {
    localStorage.removeItem(STORAGE_SUPABASE_URL_KEY);
    localStorage.removeItem(STORAGE_SUPABASE_KEY_KEY);
    localStorage.setItem(STORAGE_SUPABASE_AUTO_SYNC_KEY, autoSync ? 'true' : 'false');
    // Invalidate client instance so it rebuilds on next call
    supabaseClientInstance = null;
    currentClientUrl = '';
    currentClientKey = '';
    window.dispatchEvent(new CustomEvent('fenix_supabase_config_changed'));
  } catch (err) {
    console.error('Erro ao salvar configurações de sincronização do Supabase:', err);
  }
}

/**
 * Gets or initializes the Supabase client safely
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  if (!url || !key) return null;

  if (supabaseClientInstance && currentClientUrl === url && currentClientKey === key) {
    return supabaseClientInstance;
  }

  try {
    supabaseClientInstance = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    currentClientUrl = url;
    currentClientKey = key;
    return supabaseClientInstance;
  } catch (err) {
    console.error('Falha ao inicializar cliente Supabase:', err);
    return null;
  }
}

// Global sync state and listeners
let currentSyncStatus: SupabaseSyncStatus = {
  connected: false,
  isSyncing: false,
  lastSyncTime: null,
  error: null,
};

const listeners = new Set<(status: SupabaseSyncStatus) => void>();

export function getSupabaseSyncStatus(): SupabaseSyncStatus {
  return { ...currentSyncStatus };
}

export function subscribeSupabaseSyncStatus(listener: (status: SupabaseSyncStatus) => void): () => void {
  listeners.add(listener);
  listener({ ...currentSyncStatus });
  return () => {
    listeners.delete(listener);
  };
}

function notifyStatus() {
  const status = { ...currentSyncStatus };
  listeners.forEach((fn) => {
    try {
      fn(status);
    } catch {
      // ignore
    }
  });
  window.dispatchEvent(new CustomEvent('fenix_supabase_status_changed', { detail: status }));
}

/**
 * Tests connection with Supabase by issuing a lightweight health check
 */
export async function testSupabaseConnection(): Promise<{ success: boolean; error?: string; message?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Credenciais do Supabase não configuradas.' };
  }

  try {
    currentSyncStatus.isSyncing = true;
    notifyStatus();

    // Probe the rest endpoint with the anon key and strict AbortController timeout
    const url = getSupabaseUrl();
    const key = getSupabaseAnonKey();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let res: Response;
    try {
      res = await fetch(`${url}/rest/v1/fenix_kv_store?select=key&limit=1`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 200) {
      currentSyncStatus.connected = true;
      currentSyncStatus.error = null;
      currentSyncStatus.isSyncing = false;
      notifyStatus();
      return { success: true, message: 'Conectado com sucesso ao Supabase! Tabela sincronizada.' };
    }

    // If 404, table doesn't exist yet, but credentials and network are 100% valid!
    if (res.status === 404) {
      currentSyncStatus.connected = true;
      currentSyncStatus.error = null;
      currentSyncStatus.isSyncing = false;
      notifyStatus();
      return {
        success: true,
        message: 'Conectado ao Supabase com sucesso! (Tabela de sincronização pronta para ser criada via script SQL).',
      };
    }

    if (res.status === 401 || res.status === 403) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Chave anon/publishable inválida ou sem permissão (${res.status}): ${errText}`);
    }

    if (res.status === 429) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Banco de dados Supabase atingiu o limite de conexões (HTTP 429): ${errText || 'too_many_connections'}`);
    }

    if (res.status >= 400) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Servidor/Banco Supabase indisponível (HTTP ${res.status}): ${errText || res.statusText || 'Erro de conexão'}`);
    }

    currentSyncStatus.connected = true;
    currentSyncStatus.error = null;
    currentSyncStatus.isSyncing = false;
    notifyStatus();
    return { success: true, message: `Conectado ao projeto Supabase (status HTTP ${res.status}).` };
  } catch (err: any) {
    const errorMsg = formatSupabaseErrorMessage(err, 'Falha ao conectar com o Supabase.');
    currentSyncStatus.connected = false;
    currentSyncStatus.error = errorMsg;
    currentSyncStatus.isSyncing = false;
    notifyStatus();
    return { success: false, error: errorMsg };
  }
}

/**
 * List of primary localStorage collections to sync with Supabase
 */
export const SYNC_COLLECTIONS: { key: string; label: string; description: string }[] = [
  { key: 'fenix_clients_db', label: 'Clientes', description: 'Cadastro e perfil dos clientes' },
  { key: 'fenix_orcamentos_history', label: 'Histórico de Orçamentos', description: 'Todos os orçamentos emitidos' },
  { key: 'fenix_saved_orcamentos', label: 'Orçamentos Salvos', description: 'Modelos e propostas gravadas' },
  { key: 'fenix_product_items_data', label: 'Produtos', description: 'Catálogo de itens e preços' },
  { key: 'fenix_product_categories_data', label: 'Categorias de Produtos', description: 'Categorias oficiais' },
  { key: 'fenix_product_groups_data', label: 'Grupos de Produtos', description: 'Grupos de acabamentos' },
  { key: 'fenix_followup_cards_v2', label: 'Follow-up (Cards)', description: 'Pipeline de acompanhamento comercial' },
  { key: 'fenix_prospeccao_clients_db', label: 'Prospecção', description: 'Clientes e contatos em prospecção' },
  { key: 'fenix_tarefas_db', label: 'Tarefas', description: 'Lista e status de tarefas da equipe' },
  { key: 'fenix_pos_vendas_db', label: 'Pós-Vendas', description: 'Atendimentos de pós-venda' },
  { key: 'fenix_boletos_db', label: 'Boletos', description: 'Controle de boletos e vencimentos' },
  { key: 'fenix_pendencias_v1', label: 'Pendências', description: 'Avisos e pendências operacionais' },
  { key: 'fenix_header_notifications_v2', label: 'Notificações', description: 'Notificações do sistema e alertas entre usuários' },
  { key: 'fenix_activities_db', label: 'Atividades e Histórico', description: 'Registro de atividades e eventos' },
  { key: 'fenix_notes_db', label: 'Anotações', description: 'Blocos de notas e registros internos' },
  { key: 'fenix_anotacoes_db', label: 'Anotações (Oficial)', description: 'Notas, categorias e configurações de anotações' },
  { key: 'fenix_usuarios_v2', label: 'Usuários do Sistema', description: 'Contas, cargos e módulos autorizados' },
  { key: 'fenix_auth_users_v2', label: 'Contas de Acesso (Auth)', description: 'Senhas, logins e status dos usuários' },
  { key: 'fenix_metas_sales_db', label: 'Vendas das Metas', description: 'Lançamentos de vendas do mês' },
  { key: 'fenix_visitas_db', label: 'Visitas Técnicas', description: 'Vistorias e medições' },
  { key: 'fenix_agendamento_visitas', label: 'Visitas Técnicas (Oficial)', description: 'Vistorias e medições oficiais' },
  { key: 'fenix_instalacoes_db', label: 'Instalações', description: 'Obras e cronogramas de montagem' },
  { key: 'fenix_agendamento_instalacoes', label: 'Instalações (Oficial)', description: 'Obras e cronogramas de montagem oficiais' },
  { key: 'fenix_retornos_db', label: 'Retornos Operacionais', description: 'Retornos e assistências técnicas' },
  { key: 'fenix_agendamento_retornos', label: 'Retornos Operacionais (Oficial)', description: 'Retornos e assistências técnicas oficiais' },
  { key: 'fenix_instaladores_db', label: 'Instaladores', description: 'Equipes e montadores cadastrados' },
  { key: 'fenix_agendamento_instaladores', label: 'Instaladores (Oficial)', description: 'Equipes e montadores cadastrados oficiais' },
  { key: 'fenix_estoque_items', label: 'Estoque (Itens)', description: 'Produtos, saldos e status do estoque' },
  { key: 'fenix_estoque_categories', label: 'Estoque (Categorias)', description: 'Categorias manuais e independentes de estoque' },
  { key: 'fenix_estoque_groups', label: 'Estoque (Grupos)', description: 'Grupos manuais e independentes de estoque' },
  { key: 'fenix_estoque_movimentacoes', label: 'Movimentações de Estoque', description: 'Entradas, Saídas - Venda e Saídas - Outro' },
  { key: 'fenix_estoque_insumos_v1', label: 'Insumos de Loja', description: 'Materiais de consumo e ferramentas' },
  { key: 'fenix_vendas_gerencial', label: 'Gestão de Vendas (Diretoria)', description: 'Vendas, custos, lucros e margens' },
  { key: 'fenix_marketplace_sales_db', label: 'Vendas Marketplace (Jeferson)', description: 'Lançamentos de vendas marketplace' },
  { key: 'fenix_marketplace_metas_config', label: 'Metas Marketplace (Config)', description: 'Metas mensais Shopee e Mercado Livre' },
  { key: 'fenix_estoque_insumos_movs_v1', label: 'Insumos de Loja (Movimentações)', description: 'Entradas e saídas de insumos' },
  { key: 'fenix_product_costs_db', label: 'Custos dos Produtos (Diretoria)', description: 'Tabela oficial de custos' },
  { key: 'fenix_custos_estrutura_v1', label: 'Custos de Estrutura', description: 'Custos fixos e operacionais' },
  { key: 'fenix_custos_comissoes_v1', label: 'Custos de Comissões', description: 'Comissões comerciais' },
  { key: 'fenix_custos_nota_fiscal_v1', label: 'Custos de Nota Fiscal', description: 'Alíquotas fiscais' },
  { key: 'fenix_custos_rateio_v1', label: 'Custos de Rateio', description: 'Rateios de custos' },
  { key: 'fenix_custos_pagamentos_v1', label: 'Custos de Pagamento', description: 'Taxas e condições de pagamento' },
  { key: 'fenix_custos_marketplace_v1', label: 'Custos de Marketplace', description: 'Comissões e regras de marketplace' },
  { key: 'fenix_custos_pedido_regras_v1', label: 'Regras de Custos por Pedido', description: 'Parâmetros de cálculo por pedido' },
  { key: 'fenix_custos_tarkett_itens_v1', label: 'Itens Tarkett', description: 'Tabela de itens e acabamentos Tarkett' },
  { key: 'fenix_tarkett_produtos_catalogo', label: 'Catálogo Tarkett', description: 'Produtos do catálogo Tarkett' },
  { key: 'fenix_tarkett_simulacoes_v1', label: 'Simulações Tarkett', description: 'Simulações de custos e margens Tarkett' },
  { key: 'fenix_calculadora_rendimentos', label: 'Rendimentos da Calculadora', description: 'Base independente de rendimentos técnicos' },
  { key: 'fenix_calculadora_plantas_v1', label: 'Calculadora de Plantas', description: 'Plantas importadas, ambientes e cálculos salvos' },
  { key: 'fenix_custos_variaveis_v1', label: 'Custos Variáveis', description: 'Configuração de custos variáveis' },
  { key: 'fenix_whatsapp_templates_by_category', label: 'Modelos WhatsApp', description: 'Modelos de mensagens do WhatsApp por categoria' },
  { key: 'fenix_metas_config_data', label: 'Configurações de Metas', description: 'Parâmetros e metas mensais' },
  { key: 'fenix_individual_metas_map', label: 'Metas Individuais', description: 'Metas individuais por consultora' },
  { key: 'fenix_promocoes_ativas_db', label: 'Promoções Ativas', description: 'Campanhas promocionais, lotes compartilhados e tabelas por modalidade' },
  { key: 'fenix_user_themes_v1', label: 'Temas por Usuário', description: 'Preferências individuais de tema por login' },
  { key: 'fenix_notificacoes_config_v2', label: 'Preferências de Notificação', description: 'Preferências individuais de alertas e toques por usuário' },
  { key: 'fenix_deleted_records_v1', label: 'Registro de Exclusões', description: 'Controle de exclusões sincronizadas entre dispositivos' },
];

// Registro de timestamps locais para supressão de eco no Realtime (evita re-renderizações e loops)
const lastSelfSavedTimestamps: Record<string, string> = {};
const REMOTE_UPDATED_AT_MAP_KEY = 'fenix_remote_updated_at_map_v1';
const remoteUpdatedAtCache = new Map<string, string>();

if (typeof localStorage !== 'undefined') {
  try {
    const rawMap = localStorage.getItem(REMOTE_UPDATED_AT_MAP_KEY);
    if (rawMap) {
      const parsedMap = JSON.parse(rawMap);
      if (parsedMap && typeof parsedMap === 'object') {
        for (const [k, v] of Object.entries(parsedMap)) {
          if (typeof v === 'string' && v) {
            remoteUpdatedAtCache.set(k, v);
          }
        }
      }
    }
  } catch {
    // ignore
  }
}

function clearKnownRemoteUpdatedAt(key: string) {
  if (!key) return;
  remoteUpdatedAtCache.delete(key);
  if (typeof localStorage === 'undefined') return;
  try {
    const obj: Record<string, string> = {};
    remoteUpdatedAtCache.forEach((v, k) => {
      obj[k] = v;
    });
    localStorage.setItem(REMOTE_UPDATED_AT_MAP_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

function setKnownRemoteUpdatedAt(key: string, updatedAt: string) {
  if (!key || !updatedAt) return;
  remoteUpdatedAtCache.set(key, updatedAt);
  if (typeof localStorage === 'undefined') return;
  try {
    const obj: Record<string, string> = {};
    remoteUpdatedAtCache.forEach((v, k) => {
      obj[k] = v;
    });
    localStorage.setItem(REMOTE_UPDATED_AT_MAP_KEY, JSON.stringify(obj));
  } catch {
    // ignore quota errors for hint map
  }
}

function areTimestampsEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return !isNaN(ta) && !isNaN(tb) && ta === tb;
}

export function recordSelfSave(key: string, timestampIso: string) {
  lastSelfSavedTimestamps[key] = timestampIso;
  invalidateSupabaseKeyCache(key);
}

export function isRecentSelfSave(key: string, timestampIso?: string): boolean {
  if (!timestampIso) return false;
  return areTimestampsEqual(lastSelfSavedTimestamps[key], timestampIso);
}

// ============================================================================
// REGISTRO SINCRONIZADO DE EXCLUSÕES (TOMBSTONES) ENTRE DISPOSITIVOS
// Impede que um registro excluído no PC ressurja pelo cache do celular (e vice-versa).
// ============================================================================
export const DELETED_RECORDS_STORAGE_KEY = 'fenix_deleted_records_v1';
const TOMBSTONE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000; // 60 dias

export interface DeletionTombstoneEntry {
  deletedAt: number;
  collectionKey: string;
  itemId: string;
}

export function extractCollectionItemId(item: any, idField = 'id'): string | null {
  if (!item || typeof item !== 'object') return null;
  const v =
    item[idField] ??
    item.id ??
    item._id ??
    item.idOrcamento ??
    item.orcamentoId ??
    item.pedido ??
    item.codigo ??
    item.uuid;
  if (v !== undefined && v !== null && String(v).trim() !== '') {
    return String(v).trim();
  }
  return null;
}

function extractItemUpdatedAtMs(item: any): number {
  if (!item || typeof item !== 'object') return 0;
  const raw = item.updatedAt ?? item.dataAtualizacao ?? item.createdAt ?? item.dataCriacao;
  if (typeof raw === 'number' && !isNaN(raw)) return raw;
  if (typeof raw === 'string' && raw) {
    const parsed = Date.parse(raw);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

export function getDeletionTombstonesMap(): Record<string, DeletionTombstoneEntry> {
  const now = Date.now();
  const result: Record<string, DeletionTombstoneEntry> = {};
  try {
    const raw = getLocalRawSafe(DELETED_RECORDS_STORAGE_KEY);
    if (!raw) return result;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return result;
    for (const [k, v] of Object.entries(parsed)) {
      if (!v || typeof v !== 'object') continue;
      const entry = v as any;
      const deletedAt = Number(entry.deletedAt) || 0;
      if (deletedAt > 0 && now - deletedAt <= TOMBSTONE_RETENTION_MS && entry.collectionKey && entry.itemId) {
        result[k] = {
          deletedAt,
          collectionKey: String(entry.collectionKey),
          itemId: String(entry.itemId),
        };
      }
    }
  } catch {
    // ignore
  }
  return result;
}

export function mergeDeletionTombstoneMaps(
  primaryRaw: any,
  secondaryRaw: any
): Record<string, DeletionTombstoneEntry> {
  const now = Date.now();
  const merged: Record<string, DeletionTombstoneEntry> = {};
  const ingest = (src: any) => {
    if (!src || typeof src !== 'object' || Array.isArray(src)) return;
    for (const [k, v] of Object.entries(src)) {
      if (!v || typeof v !== 'object') continue;
      const entry = v as any;
      const deletedAt = Number(entry.deletedAt) || 0;
      if (deletedAt <= 0 || now - deletedAt > TOMBSTONE_RETENTION_MS) continue;
      const col = String(entry.collectionKey || '').trim();
      const id = String(entry.itemId || '').trim();
      if (!col || !id) continue;
      const key = `${col}::${id}`;
      const existing = merged[key];
      if (!existing || deletedAt > existing.deletedAt) {
        merged[key] = { deletedAt, collectionKey: col, itemId: id };
      }
    }
  };
  ingest(primaryRaw);
  ingest(secondaryRaw);
  return merged;
}

export function getDeletedIdsForCollection(collectionKey: string): Map<string, number> {
  const map = new Map<string, number>();
  const all = getDeletionTombstonesMap();
  for (const entry of Object.values(all)) {
    if (entry.collectionKey === collectionKey) {
      const prev = map.get(entry.itemId) || 0;
      if (entry.deletedAt > prev) {
        map.set(entry.itemId, entry.deletedAt);
      }
    }
  }
  for (const pending of getPendingSyncRecords()) {
    if (pending.collectionKey === collectionKey && pending.op === 'delete') {
      const prev = map.get(pending.itemId) || 0;
      if (pending.timestamp > prev) {
        map.set(pending.itemId, pending.timestamp);
      }
    }
  }
  return map;
}

export function isItemTombstoned(
  collectionKey: string,
  item: any,
  idField = 'id',
  deletedMap?: Map<string, number>
): boolean {
  const id = extractCollectionItemId(item, idField);
  if (!id) return false;
  const dMap = deletedMap || getDeletedIdsForCollection(collectionKey);
  const deletedAt = dMap.get(id);
  if (!deletedAt) return false;
  const itemTs = extractItemUpdatedAtMs(item);
  // Se o registro foi recriado/salvo DEPOIS da exclusão, ele não deve ser suprimido
  if (itemTs > deletedAt + 1000) return false;
  return true;
}

export function recordDeletionTombstones(
  collectionKey: string,
  itemIds: Array<string | number>,
  currentUser = 'Usuário Fênix'
): Promise<void> {
  const cleanIds = itemIds.map((id) => String(id ?? '').trim()).filter(Boolean);
  if (!collectionKey || cleanIds.length === 0) return Promise.resolve();

  const now = Date.now();
  const currentMap = getDeletionTombstonesMap();
  for (const itemId of cleanIds) {
    currentMap[`${collectionKey}::${itemId}`] = {
      deletedAt: now,
      collectionKey,
      itemId,
    };
  }
  setLocalCollectionSafe(DELETED_RECORDS_STORAGE_KEY, currentMap);

  if (isEmergencyOfflineMode()) {
    markRecordPendingSync({
      collectionKey: DELETED_RECORDS_STORAGE_KEY,
      itemId: '__meta__',
      op: 'collection',
      item: currentMap,
      user: currentUser,
    });
    return Promise.resolve();
  }

  const client = getSupabaseClient();
  if (!client) {
    markRecordPendingSync({
      collectionKey: DELETED_RECORDS_STORAGE_KEY,
      itemId: '__meta__',
      op: 'collection',
      item: currentMap,
      user: currentUser,
    });
    return Promise.resolve();
  }

  return enqueueCollectionWrite(DELETED_RECORDS_STORAGE_KEY, async () => {
    try {
      const remoteRes = await fetchRemoteRowDirect(client, DELETED_RECORDS_STORAGE_KEY, 10000).catch(
        () => ({ exists: false, data: {} })
      );
      const latestLocal = getDeletionTombstonesMap();
      const finalMap = mergeDeletionTombstoneMaps(remoteRes.data, latestLocal);
      const nowIso = new Date().toISOString();
      lastSelfSavedTimestamps[DELETED_RECORDS_STORAGE_KEY] = nowIso;
      const { data: upsertRow, error } = await withAbortableTimeout<any>(
        (signal) =>
          client
            .from('fenix_kv_store')
            .upsert(
              {
                key: DELETED_RECORDS_STORAGE_KEY,
                data: finalMap,
                updated_at: nowIso,
                updated_by: currentUser,
              },
              { onConflict: 'key' }
            )
            .select('updated_at')
            .abortSignal(signal)
            .maybeSingle(),
        10000,
        'Tempo limite ao sincronizar registro de exclusões.'
      );
      if (error) throw error;
      const confirmedAt = upsertRow?.updated_at ? String(upsertRow.updated_at) : nowIso;
      lastSelfSavedTimestamps[DELETED_RECORDS_STORAGE_KEY] = confirmedAt;
      primeSupabaseKeyCache(DELETED_RECORDS_STORAGE_KEY, finalMap, confirmedAt);
      setLocalCollectionSafe(DELETED_RECORDS_STORAGE_KEY, finalMap);
      removePendingSyncRecord(DELETED_RECORDS_STORAGE_KEY, '__meta__');
    } catch {
      markRecordPendingSync({
        collectionKey: DELETED_RECORDS_STORAGE_KEY,
        itemId: '__meta__',
        op: 'collection',
        item: getDeletionTombstonesMap(),
        user: currentUser,
      });
    }
  }).catch(() => {});
}

export function clearDeletionTombstones(
  collectionKey: string,
  itemIds: Array<string | number>
): void {
  const cleanIds = itemIds.map((id) => String(id ?? '').trim()).filter(Boolean);
  if (!collectionKey || cleanIds.length === 0) return;

  const currentMap = getDeletionTombstonesMap();
  let changed = false;
  for (const itemId of cleanIds) {
    const key = `${collectionKey}::${itemId}`;
    if (key in currentMap) {
      delete currentMap[key];
      changed = true;
    }
  }
  if (changed) {
    setLocalCollectionSafe(DELETED_RECORDS_STORAGE_KEY, currentMap);
  }
}

// Fila offline para proteção total contra perda de dados em falhas de rede
const OFFLINE_SYNC_QUEUE_KEY = 'fenix_pending_sync_queue_v1';

export interface PendingSyncItem {
  id: string;
  collectionKey: string;
  item: any;
  idField: string;
  user: string;
  timestamp: number;
}

export function queuePendingItem(collectionKey: string, item: any, idField: string, user: string) {
  try {
    const raw = localStorage.getItem(OFFLINE_SYNC_QUEUE_KEY);
    const queue: PendingSyncItem[] = raw ? JSON.parse(raw) : [];
    const itemId = String(item[idField] ?? item.id ?? Date.now());
    const filtered = queue.filter(
      (q) => !(q.collectionKey === collectionKey && String(q.item[idField] ?? q.item.id) === itemId)
    );
    filtered.push({
      id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      collectionKey,
      item,
      idField,
      user,
      timestamp: Date.now(),
    });
    localStorage.setItem(OFFLINE_SYNC_QUEUE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Erro ao registrar item na fila offline:', err);
  }
}

/**
 * Utilitário de timeout seguro: se a promessa exceder timeoutMs, retorna fallbackValue sem travar
 */
export function withTimeout<T = any>(
  promiseOrThenable: any,
  timeoutMs: number,
  fallbackValue: T
): Promise<T> {
  const promise = Promise.resolve(promiseOrThenable);
  let timer: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallbackValue);
    }, timeoutMs);
  });
  return Promise.race([
    promise
      .then((res) => {
        clearTimeout(timer);
        return res;
      })
      .catch((err) => {
        clearTimeout(timer);
        console.warn('Promise capturada com fallback no withTimeout:', err);
        return fallbackValue;
      }),
    timeoutPromise,
  ]);
}

export function formatSupabaseErrorMessage(
  err: any,
  fallback = 'Não foi possível comunicar com o banco de dados Supabase.'
): string {
  if (!err) return fallback;
  const rawMsg =
    err?.message ||
    err?.error_description ||
    err?.details ||
    (typeof err === 'string' ? err : '');
  const msgLower = String(rawMsg).toLowerCase();
  const statusNum = Number(err?.status || err?.statusCode || 0);
  const codeStr = String(err?.code || '');

  if (
    statusNum === 429 ||
    msgLower.includes('too_many_connections') ||
    msgLower.includes('too many connections') ||
    codeStr === 'SlowDown'
  ) {
    return 'O banco de dados Supabase está com excesso de conexões simultâneas (429). Aguarde alguns segundos e tente novamente.';
  }

  if (
    err?.isClientTimeout ||
    err?.name === 'AbortError' ||
    err?.name === 'TimeoutError' ||
    statusNum === 544 ||
    codeStr === 'DatabaseTimeout' ||
    msgLower.includes('databasetimeout') ||
    msgLower.includes('tempo limite') ||
    msgLower.includes('timed out') ||
    msgLower.includes('aborted')
  ) {
    if (msgLower.includes('tempo limite')) {
      return rawMsg;
    }
    return 'Tempo limite excedido na conexão com o banco de dados Supabase (DatabaseTimeout). Seus dados preenchidos foram preservados; aguarde alguns instantes e tente novamente.';
  }

  if (
    msgLower.includes('failed to fetch') ||
    msgLower.includes('networkerror') ||
    msgLower.includes('network request failed')
  ) {
    return 'Falha de conexão com o servidor Supabase. Verifique sua internet e tente novamente.';
  }

  return rawMsg || fallback;
}

/**
 * Utilitário de resiliência com retentativa exponencial e detecção aprofundada de erros transitórios.
 * NÃO repete após timeouts do cliente (isClientTimeout/AbortError) para não dobrar o tempo de espera na UI
 * nem saturar o pool do Supabase em casos de DatabaseTimeout / 429.
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 800,
  options?: {
    deadlineAt?: number;
    retryOnPoolSaturation?: boolean;
  }
): Promise<T> {
  let lastError: any;
  const effectiveMax = Math.max(1, maxRetries);
  for (let attempt = 1; attempt <= effectiveMax; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      if (err?.isClientTimeout || err?.name === 'AbortError' || err?.name === 'TimeoutError') {
        throw err;
      }

      if (options?.deadlineAt && Date.now() >= options.deadlineAt) {
        throw err;
      }

      const msgLower = String(err?.message || '').toLowerCase();
      const statusNum = Number(err?.status || err?.statusCode || 0);
      const isPoolSaturation =
        statusNum === 429 ||
        statusNum === 544 ||
        err?.code === 'DatabaseTimeout' ||
        err?.code === 'SlowDown' ||
        msgLower.includes('too_many_connections') ||
        msgLower.includes('too many connections') ||
        msgLower.includes('databasetimeout');

      if (isPoolSaturation && !options?.retryOnPoolSaturation) {
        throw err;
      }

      const isTransient =
        err?.code === 'PGRST002' ||
        err?.code === '57014' ||
        err?.code === '55P03' ||
        err?.code === 'PGRST000' ||
        statusNum === 408 ||
        statusNum === 500 ||
        statusNum === 502 ||
        statusNum === 503 ||
        statusNum === 504 ||
        (isPoolSaturation && Boolean(options?.retryOnPoolSaturation)) ||
        msgLower.includes('schema cache') ||
        msgLower.includes('statement timeout') ||
        msgLower.includes('lock timeout') ||
        msgLower.includes('econnreset') ||
        msgLower.includes('failed to fetch') ||
        msgLower.includes('networkerror');

      if (attempt < effectiveMax && isTransient) {
        const jitter = Math.floor(Math.random() * 250);
        const delay = Math.round(baseDelayMs * Math.pow(1.5, attempt - 1)) + jitter;
        if (options?.deadlineAt && Date.now() + delay >= options.deadlineAt) {
          throw err;
        }
        console.warn(`[SUPABASE-RETRY] Tentativa ${attempt}/${effectiveMax} falhou (${err?.code || err?.message}). Aguardando ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

/**
 * SQL script to easily create and harden the synchronization table in Supabase SQL Editor
 * Includes strict RLS policies (preventing arbitrary deletes, validating allowed keys and payload sizes)
 */
export const SUPABASE_SETUP_SQL = `-- ==============================================================================
-- ATUALIZAÇÃO E BLINDAGEM DE SEGURANÇA (RLS) - CRM FÊNIX WORLD
-- Execute este script no "SQL Editor" do Supabase:
-- https://supabase.com/dashboard/project/rewcifdxtwvwabnxbafx/sql
-- ==============================================================================

-- 1. Garante que a tabela existe com tipos e restrições seguras
CREATE TABLE IF NOT EXISTS public.fenix_kv_store (
    key text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz DEFAULT now(),
    updated_by text DEFAULT 'CRM Fênix'
);

-- 2. Habilita obrigatoriamente Row Level Security (RLS)
ALTER TABLE public.fenix_kv_store ENABLE ROW LEVEL SECURITY;

-- 3. Remove políticas antigas/permissivas demais para aplicar as regras blindadas
DROP POLICY IF EXISTS "Permitir leitura anonima no CRM" ON public.fenix_kv_store;
DROP POLICY IF EXISTS "Permitir insercao e atualizacao anonima no CRM" ON public.fenix_kv_store;
DROP POLICY IF EXISTS "CRM Fenix: Leitura de dados autenticados e anonimos" ON public.fenix_kv_store;
DROP POLICY IF EXISTS "CRM Fenix: Insercao de colecoes validas" ON public.fenix_kv_store;
DROP POLICY IF EXISTS "CRM Fenix: Atualizacao de colecoes validas" ON public.fenix_kv_store;
DROP POLICY IF EXISTS "CRM Fenix: Bloqueio de exclusao acidental" ON public.fenix_kv_store;

-- 4. POLÍTICA DE LEITURA (SELECT):
-- Permite leitura apenas de chaves legítimas do sistema Fênix
CREATE POLICY "CRM Fenix: Leitura de colecoes validas"
ON public.fenix_kv_store
FOR SELECT
TO anon, authenticated
USING (
    key LIKE 'fenix_%'
);

-- 5. POLÍTICA DE INSERÇÃO (INSERT):
-- Previne injeção de tabelas desconhecidas ou spam (limite de 15MB por payload)
CREATE POLICY "CRM Fenix: Insercao de colecoes validas"
ON public.fenix_kv_store
FOR INSERT
TO anon, authenticated
WITH CHECK (
    key LIKE 'fenix_%'
    AND length(key) <= 120
    AND pg_column_size(data) <= 15728640
);

-- 6. POLÍTICA DE ATUALIZAÇÃO (UPDATE):
-- Permite atualizar registros existentes mantendo a integridade
CREATE POLICY "CRM Fenix: Atualizacao de colecoes validas"
ON public.fenix_kv_store
FOR UPDATE
TO anon, authenticated
USING (key LIKE 'fenix_%')
WITH CHECK (
    key LIKE 'fenix_%'
    AND length(key) <= 120
    AND pg_column_size(data) <= 15728640
);

-- 7. POLÍTICA DE EXCLUSÃO (DELETE):
-- Nenhuma requisição anônima pública pode apagar registros inteiros acidentalmente
CREATE POLICY "CRM Fenix: Bloqueio de exclusao publica"
ON public.fenix_kv_store
FOR DELETE
TO authenticated
USING (key LIKE 'fenix_%');

-- ==============================================================================
-- 8. CRIAÇÃO E CONFIGURAÇÃO DOS BUCKETS NO SUPABASE STORAGE
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('catalogos', 'catalogos', true, 104857600, NULL),
  ('documentos', 'documentos', true, 104857600, NULL),
  ('modelos', 'modelos', true, 104857600, NULL)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de RLS para acesso e upload aos arquivos no Supabase Storage:
DROP POLICY IF EXISTS "CRM Fenix Storage: Leitura publica de arquivos" ON storage.objects;
DROP POLICY IF EXISTS "CRM Fenix Storage: Upload de arquivos" ON storage.objects;
DROP POLICY IF EXISTS "CRM Fenix Storage: Atualizacao de arquivos" ON storage.objects;
DROP POLICY IF EXISTS "CRM Fenix Storage: Exclusao de arquivos" ON storage.objects;

CREATE POLICY "CRM Fenix Storage: Leitura publica de arquivos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id IN ('catalogos', 'documentos', 'modelos'));

CREATE POLICY "CRM Fenix Storage: Upload de arquivos"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id IN ('catalogos', 'documentos', 'modelos'));

CREATE POLICY "CRM Fenix Storage: Atualizacao de arquivos"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id IN ('catalogos', 'documentos', 'modelos'));

CREATE POLICY "CRM Fenix Storage: Exclusao de arquivos"
ON storage.objects FOR DELETE
TO public
USING (bucket_id IN ('catalogos', 'documentos', 'modelos'));

-- Confirmação
SELECT 'Políticas RLS e Buckets de Storage do CRM Fênix aplicados e blindados com sucesso!' AS status;
`;

/**
 * Sends all local data from localStorage to Supabase (Backup / Push)
 */
export async function pushAllLocalDataToSupabase(currentUser = 'Vanessa Gomes'): Promise<{
  success: boolean;
  syncedCount: number;
  error?: string;
  details?: Record<string, boolean>;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, syncedCount: 0, error: 'Supabase não inicializado.' };
  }

  currentSyncStatus.isSyncing = true;
  notifyStatus();

  let syncedCount = 0;
  const details: Record<string, boolean> = {};

  try {
    for (const col of SYNC_COLLECTIONS) {
      try {
        const raw = localStorage.getItem(col.key);
        if (raw === null) continue;

        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }

        const payload = {
          key: col.key,
          data: parsed,
          updated_at: new Date().toISOString(),
          updated_by: currentUser,
        };

        const { error } = await withAbortableTimeout<any>(
          (signal) =>
            client
              .from('fenix_kv_store')
              .upsert(payload, { onConflict: 'key' })
              .abortSignal(signal),
          18000,
          `Tempo limite excedido ao enviar ${col.key} para o Supabase.`
        );

        if (error) {
          console.warn(`Erro ao sincronizar chave ${col.key} no Supabase:`, error);
          details[col.key] = false;
        } else {
          syncedCount++;
          details[col.key] = true;
        }
      } catch (colErr) {
        console.warn(`Exceção na chave ${col.key}:`, colErr);
        details[col.key] = false;
      }
    }

    currentSyncStatus.connected = true;
    currentSyncStatus.lastSyncTime = new Date().toLocaleTimeString('pt-BR');
    currentSyncStatus.error = null;
    currentSyncStatus.isSyncing = false;
    notifyStatus();

    return {
      success: syncedCount > 0,
      syncedCount,
      details,
    };
  } catch (err: any) {
    const errorMsg = err?.message || 'Erro durante sincronização com Supabase.';
    currentSyncStatus.isSyncing = false;
    currentSyncStatus.error = errorMsg;
    notifyStatus();
    return { success: false, syncedCount, error: errorMsg };
  }
}

/**
 * Dispatches targeted and general events to notify all active UI components
 */
export function dispatchCollectionEvents(collectionKey: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('storage'));
  if (collectionKey === 'fenix_clients_db') window.dispatchEvent(new Event('fenix_clients_updated'));
  if (collectionKey === 'fenix_activities_db') window.dispatchEvent(new Event('fenix_activities_updated'));
  if (collectionKey === 'fenix_calculadora_plantas_v1') window.dispatchEvent(new Event('fenix_floorplan_projects_updated'));
  if (collectionKey === 'fenix_notificacoes_config_v2') window.dispatchEvent(new Event('fenix_notif_prefs_updated'));
  if (collectionKey.includes('orcamento')) window.dispatchEvent(new Event('fenix_orcamentos_updated'));
  if (collectionKey.includes('followup')) window.dispatchEvent(new Event('fenix_followup_updated'));
  if (collectionKey.includes('tarefas')) window.dispatchEvent(new Event('fenix_tarefas_updated'));
  if (collectionKey.includes('metas') || collectionKey.includes('deleted_vendas')) {
    window.dispatchEvent(new Event('fenix_metas_updated'));
    window.dispatchEvent(new Event('fenix_metas_config_updated'));
  }
  if (collectionKey.includes('usuarios') || collectionKey.includes('auth')) {
    window.dispatchEvent(new Event('fenix_auth_updated'));
    window.dispatchEvent(new Event('fenix_users_updated'));
  }
  if (collectionKey.includes('notes')) window.dispatchEvent(new Event('fenix_notes_updated'));
  if (collectionKey.includes('pendencias')) window.dispatchEvent(new Event('fenix_pendencias_updated'));
  if (collectionKey.includes('notification')) window.dispatchEvent(new Event('fenix_notifications_updated'));
  if (collectionKey.includes('product')) window.dispatchEvent(new Event('fenix_products_updated'));
  if (
    collectionKey.includes('pos_vendas') ||
    collectionKey.includes('agendamento') ||
    collectionKey.includes('visitas') ||
    collectionKey.includes('instalac') ||
    collectionKey.includes('retorno') ||
    collectionKey.includes('instalador')
  ) {
    window.dispatchEvent(new Event('fenix_pos_vendas_updated'));
    window.dispatchEvent(new Event('fenix_agendamento_updated'));
  }
  if (collectionKey.includes('boletos')) window.dispatchEvent(new Event('fenix_boletos_updated'));
  if (collectionKey.includes('estoque')) {
    window.dispatchEvent(new Event('fenix_estoque_updated'));
    window.dispatchEvent(new Event('fenix_estoque_items'));
    window.dispatchEvent(new Event('fenix_estoque_movimentacoes'));
  }
  if (collectionKey.includes('vendas')) {
    window.dispatchEvent(new Event('fenix_vendas_updated'));
    window.dispatchEvent(new Event('fenix_vendas_gerencial_updated'));
  }
  if (collectionKey.includes('marketplace')) window.dispatchEvent(new Event('fenix_marketplace_sales_updated'));
  if (collectionKey.includes('rendimentos')) window.dispatchEvent(new Event('fenix_rendimentos_updated'));
  if (collectionKey.includes('custos')) {
    window.dispatchEvent(new Event('fenix_custos_config_updated'));
    window.dispatchEvent(new Event('fenix_custos_variaveis_updated'));
    window.dispatchEvent(new Event('fenix_custos_tarkett_updated'));
  }
  if (collectionKey.includes('tarkett')) {
    window.dispatchEvent(new Event('fenix_tarkett_produtos_updated'));
    window.dispatchEvent(new Event('fenix_custos_tarkett_updated'));
  }
  if (collectionKey.includes('whatsapp') || collectionKey.includes('msg')) window.dispatchEvent(new Event('fenix_orcamento_msg_updated'));
  if (collectionKey.includes('promoc')) window.dispatchEvent(new Event('fenix_promocoes_updated'));
}

/**
 * Helper to ensure a list has strictly unique items by an idField.
 */
export function deduplicateListById<T = any>(list: T[], idField = 'id'): T[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of list) {
    if (!item) continue;
    const val = (item as any)[idField] ?? (item as any).id ?? (item as any)._id ?? (item as any).idOrcamento ?? (item as any).pedido ?? (item as any).codigo;
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      const key = String(val).trim();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * Merge seguro e atômico de duas listas (remota e local):
 * - Preserva todos os registros existentes.
 * - Atualiza os campos dos registros coincidentes pelo ID.
 * - NUNCA descarta itens remotos ou locais.
 */
export function safeMergeLists<T = any>(
  primaryList: T[],
  secondaryList: T[],
  idField = 'id',
  deletedIds?: Map<string, number>
): T[] {
  if (!Array.isArray(primaryList)) primaryList = [];
  if (!Array.isArray(secondaryList)) secondaryList = [];

  const map = new Map<string, T>();

  const extractId = (item: any): string | null => {
    if (!item || typeof item !== 'object') return null;
    const v =
      item[idField] ??
      item.id ??
      item._id ??
      item.idOrcamento ??
      item.orcamentoId ??
      item.pedido ??
      item.codigo ??
      item.uuid;
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
    return null;
  };

  const isDeleted = (item: any, key: string | null): boolean => {
    if (!deletedIds || !key) return false;
    const deletedAt = deletedIds.get(key);
    if (!deletedAt) return false;
    const itemTs = extractItemUpdatedAtMs(item);
    return itemTs <= deletedAt + 1000;
  };

  // 1. Processa lista primária (ex: dados locais/remotos já persistidos)
  for (const item of primaryList) {
    if (!item) continue;
    const key = extractId(item);
    if (isDeleted(item, key)) continue;
    if (key) {
      map.set(key, item);
    } else {
      map.set(`gen_key_${Math.random().toString(36).slice(2)}`, item);
    }
  }

  // 2. Mescla lista secundária (ex: alterações mais recentes ou remotas)
  for (const item of secondaryList) {
    if (!item) continue;
    const key = extractId(item);
    if (isDeleted(item, key)) continue;
    if (key) {
      const existing = map.get(key);
      if (existing) {
        // Merge seguro mantendo campos pré-existentes e protegendo status 'Vendido' / 'Fechado'
        const existingStatus = String((existing as any).status || '').trim();
        const incomingStatus = String((item as any).status || '').trim();
        const isExistingSold = existingStatus === 'Vendido' || existingStatus === 'Fechado' || existingStatus === 'Fechados';
        const isIncomingSold = incomingStatus === 'Vendido' || incomingStatus === 'Fechado' || incomingStatus === 'Fechados';

        const merged: any = { ...existing, ...item };
        // Se o registro já estava como Vendido e o item secundário tem status diferente sem atualização mais nova, preserva Vendido
        if (isExistingSold && !isIncomingSold) {
          const existingUpdated = (existing as any).dataAtualizacao || (existing as any).updatedAt;
          const incomingUpdated = (item as any).dataAtualizacao || (item as any).updatedAt;
          if (!incomingUpdated || (existingUpdated && new Date(existingUpdated).getTime() >= new Date(incomingUpdated).getTime())) {
            merged.status = (existing as any).status;
            if ((existing as any).pedido) merged.pedido = (existing as any).pedido;
            if ((existing as any).formaPagamento) merged.formaPagamento = (existing as any).formaPagamento;
            if ((existing as any).formasPagamento) merged.formasPagamento = (existing as any).formasPagamento;
          }
        } else if (isIncomingSold) {
          merged.status = 'Vendido';
        }
        map.set(key, merged);
      } else {
        map.set(key, item);
      }
    } else {
      map.set(`gen_key_${Math.random().toString(36).slice(2)}`, item);
    }
  }

  return Array.from(map.values());
}

/**
 * Esvazia e processa a fila de operações pendentes geradas em momentos de instabilidade/offline
 */
export async function drainPendingSyncQueue(): Promise<number> {
  // CRITICAL: nunca sincronizar automaticamente durante o modo emergencial local
  if (isEmergencyOfflineMode()) {
    return 0;
  }

  const client = getSupabaseClient();
  if (!client) return 0;
  try {
    const raw = localStorage.getItem(OFFLINE_SYNC_QUEUE_KEY);
    if (!raw) return 0;
    const queue: PendingSyncItem[] = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) return 0;

    let synced = 0;
    const remaining: PendingSyncItem[] = [];

    for (const q of queue) {
      try {
        const res = await saveItemToSupabase(q.collectionKey, q.item, q.idField, q.user);
        if (res.success) {
          synced++;
        } else {
          remaining.push(q);
        }
      } catch {
        remaining.push(q);
      }
    }

    if (remaining.length === 0) {
      localStorage.removeItem(OFFLINE_SYNC_QUEUE_KEY);
    } else {
      localStorage.setItem(OFFLINE_SYNC_QUEUE_KEY, JSON.stringify(remaining));
    }
    return synced;
  } catch {
    return 0;
  }
}

let activeRealtimeChannel: any = null;

/**
 * Initializes a Supabase Realtime channel subscription to receive instant updates
 * whenever any row in fenix_kv_store changes across any connected client.
 * Com supressão de eco local para evitar re-renderizações e loops infinitos.
 */
export function initSupabaseRealtimeSubscription(): (() => void) | null {
  if (isEmergencyOfflineMode()) {
    return null;
  }

  const client = getSupabaseClient();
  if (!client) return null;

  try {
    if (activeRealtimeChannel) {
      try {
        client.removeChannel(activeRealtimeChannel);
      } catch {
        // ignore
      }
      activeRealtimeChannel = null;
    }

    const channel = client
      .channel('fenix_realtime_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fenix_kv_store' },
        (payload: any) => {
          if (payload?.new && payload.new.key && payload.new.data !== undefined) {
            const key = payload.new.key;
            // Arquivos binários/PDFs/imagens/áudios em base64 não devem ser gravados via stream simples
            if (
              key.startsWith('fenix_file_') ||
              key.startsWith('fenix_test_') ||
              key.startsWith('fenix_planta_img_') ||
              key.startsWith('fenix_notif_audio_')
            ) {
              return;
            }

            // Supressão de eco: se a alteração foi originada por esta própria sessão, não re-renderizar
            const updatedAt = payload.new.updated_at;
            if (updatedAt) {
              setKnownRemoteUpdatedAt(key, String(updatedAt));
            }
            sessionVerifiedKeys.add(key);
            if (isRecentSelfSave(key, updatedAt)) {
              return;
            }
            invalidateSupabaseKeyCache(key);

            // A coleção fenix_anotacoes_db é mesclada com pendências e notificada
            if (key === 'fenix_anotacoes_db') {
              try {
                let parsedNotes = payload.new.data;
                if (typeof parsedNotes === 'string') parsedNotes = JSON.parse(parsedNotes);
                const pendingNoteRecs = getPendingSyncRecords().filter(
                  (r) => r.collectionKey === 'fenix_anotacoes_db'
                );
                const locRaw = getLocalRawSafe('fenix_anotacoes_db');
                const locParsed = locRaw ? JSON.parse(locRaw) : null;
                const mergedNotes = mergeAnotacoesForSync(parsedNotes, locParsed, pendingNoteRecs);
                setLocalCollectionSafe('fenix_anotacoes_db', mergedNotes);
              } catch {}
              window.dispatchEvent(new CustomEvent('fenix_anotacoes_realtime_updated', { detail: payload.new }));
              return;
            }

            // A coleção fenix_promocoes_ativas_db é sincronizada via promocoesService
            if (key === 'fenix_promocoes_ativas_db') {
              window.dispatchEvent(new CustomEvent('fenix_promocoes_realtime_updated', { detail: payload.new }));
              return;
            }

            try {
              let parsedData = payload.new.data;
              if (typeof parsedData === 'string') {
                try {
                  parsedData = JSON.parse(parsedData);
                } catch {}
              }

              const currentLocalRaw = getLocalRawSafe(key);
              let localParsed: any = null;
              if (currentLocalRaw) {
                try {
                  localParsed = JSON.parse(currentLocalRaw);
                } catch {}
              }

              if (key === DELETED_RECORDS_STORAGE_KEY) {
                const mergedMap = mergeDeletionTombstoneMaps(parsedData, localParsed);
                const strVal = JSON.stringify(mergedMap);
                if (currentLocalRaw !== strVal) {
                  setLocalCollectionSafe(key, strVal);
                  dispatchCollectionEvents(key);
                }
                return;
              }

              if (key === 'fenix_user_themes_v1') {
                const mergedThemes = mergeUserThemesForSync(parsedData, localParsed);
                const strVal = JSON.stringify(mergedThemes);
                if (currentLocalRaw !== strVal) {
                  setLocalCollectionSafe(key, strVal);
                  applyMirroredLocalKeys(key, mergedThemes);
                }
                return;
              }

              if (key === 'fenix_notificacoes_config_v2') {
                const mergedNotifs = mergeUserNotifPrefsForSync(parsedData, localParsed);
                const strVal = JSON.stringify(mergedNotifs);
                if (currentLocalRaw !== strVal) {
                  setLocalCollectionSafe(key, strVal);
                  applyMirroredLocalKeys(key, mergedNotifs);
                  dispatchCollectionEvents(key);
                }
                return;
              }

              // Proteção anti-sobrescrita e filtragem de exclusões sincronizadas (tombstones)
              const localList: any[] = Array.isArray(localParsed) ? localParsed : [];
              const pendingRecs = getPendingSyncRecords().filter((r) => r.collectionKey === key);
              const deletedMap = getDeletedIdsForCollection(key);

              if (Array.isArray(parsedData)) {
                if (parsedData.length === 0 && localList.length > 0 && pendingRecs.some((r) => r.op !== 'delete')) {
                  console.warn(`[REALTIME-PROTECTION] Ignorada tentativa de wipe em ${key} via Realtime.`);
                  return;
                }
                const cleanRemote = parsedData.filter((it) => !isItemTombstoned(key, it, 'id', deletedMap));
                const cleanLocal = localList.filter((it) => !isItemTombstoned(key, it, 'id', deletedMap));
                const pendingUpserts = pendingRecs.filter((r) => r.op === 'upsert' && r.item);
                const pendingDeletes = new Set(pendingRecs.filter((r) => r.op === 'delete').map((r) => r.itemId));

                let merged: any[];
                if (PRODUCT_CATALOG_AUTHORITATIVE_KEYS.has(key)) {
                  merged = mergeAuthoritativeCatalogCollection(
                    key,
                    cleanRemote,
                    cleanLocal,
                    pendingRecs,
                    pendingUpserts.map((u) => u.item),
                    pendingDeletes,
                    deletedMap
                  );
                } else {
                  merged =
                    key === 'fenix_clients_db'
                      ? mergeClientsPreservingNewFirst(cleanRemote, cleanLocal, new Set(deletedMap.keys()))
                      : key === 'fenix_followup_cards_v2'
                      ? mergeFollowUpArraysSafe(cleanRemote, cleanLocal)
                      : safeMergeLists(cleanRemote, cleanLocal, 'id');

                  if (pendingUpserts.length > 0) {
                    merged = mergeItemsIntoCollection(
                      key,
                      merged,
                      [],
                      pendingUpserts.map((u) => u.item),
                      pendingUpserts[0].idField || 'id'
                    ).updatedList;
                  }
                }
                const stringVal = JSON.stringify(merged);
                if (currentLocalRaw !== stringVal) {
                  setLocalCollectionSafe(key, stringVal);
                  applyMirroredLocalKeys(key, merged);
                  dispatchCollectionEvents(key);
                }
              } else {
                const stringVal = typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData);
                if (currentLocalRaw !== stringVal) {
                  setLocalCollectionSafe(key, stringVal);
                  applyMirroredLocalKeys(key, parsedData);
                  dispatchCollectionEvents(key);
                }
              }
            } catch (e) {
              console.warn('Erro ao atualizar cache local via Realtime:', e);
            }
          }
        }
      )
      .subscribe();

    activeRealtimeChannel = channel;

    return () => {
      try {
        if (activeRealtimeChannel === channel) {
          activeRealtimeChannel = null;
        }
        client.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  } catch (err) {
    console.warn('Realtime Supabase não pôde ser iniciado:', err);
    return null;
  }
}

/**
 * Mapeamento de coleções por módulo/aba para carregamento on-demand (lazy load).
 * O sistema carrega os dados de cada módulo somente quando a aba for acessada.
 */
export const TAB_COLLECTIONS_MAP: Record<string, string[]> = {
  'Clientes': ['fenix_deleted_records_v1', 'fenix_clients_db', 'fenix_activities_db', 'fenix_user_themes_v1'],
  'Cadastro': ['fenix_deleted_records_v1', 'fenix_clients_db'],
  'Calculadora': ['fenix_deleted_records_v1', 'fenix_clients_db', 'fenix_product_items_data', 'fenix_product_categories_data', 'fenix_product_groups_data', 'fenix_calculadora_rendimentos', 'fenix_calculadora_plantas_v1'],
  'Orçamentos': ['fenix_deleted_records_v1', 'fenix_clients_db', 'fenix_saved_orcamentos', 'fenix_orcamentos_history', 'fenix_product_items_data', 'fenix_product_categories_data', 'fenix_user_themes_v1'],
  'Agenda': ['fenix_deleted_records_v1', 'fenix_tarefas_db', 'fenix_clients_db'],
  'Tarefas': ['fenix_deleted_records_v1', 'fenix_tarefas_db', 'fenix_clients_db'],
  'Anotações': ['fenix_deleted_records_v1', 'fenix_anotacoes_db'],
  'Anotacoes': ['fenix_deleted_records_v1', 'fenix_anotacoes_db'],
  'Follow-up': ['fenix_deleted_records_v1', 'fenix_followup_cards_v2', 'fenix_followup_db', 'fenix_clients_db', 'fenix_saved_orcamentos', 'fenix_orcamentos_history', 'fenix_metas_sales_db'],
  'FollowUp': ['fenix_deleted_records_v1', 'fenix_followup_cards_v2', 'fenix_followup_db', 'fenix_clients_db', 'fenix_saved_orcamentos', 'fenix_orcamentos_history', 'fenix_metas_sales_db'],
  'Obras': ['fenix_deleted_records_v1', 'fenix_pos_vendas_db', 'fenix_agendamento_visitas', 'fenix_agendamento_instalacoes', 'fenix_agendamento_retornos', 'fenix_agendamento_instaladores', 'fenix_clients_db'],
  'Pós-Vendas': ['fenix_deleted_records_v1', 'fenix_pos_vendas_db', 'fenix_agendamento_visitas', 'fenix_agendamento_instalacoes', 'fenix_agendamento_retornos', 'fenix_agendamento_instaladores', 'fenix_clients_db'],
  'PosVendas': ['fenix_deleted_records_v1', 'fenix_pos_vendas_db', 'fenix_agendamento_visitas', 'fenix_agendamento_instalacoes', 'fenix_agendamento_retornos', 'fenix_agendamento_instaladores', 'fenix_clients_db'],
  'Pós Vendas': ['fenix_deleted_records_v1', 'fenix_pos_vendas_db', 'fenix_agendamento_visitas', 'fenix_agendamento_instalacoes', 'fenix_agendamento_retornos', 'fenix_agendamento_instaladores', 'fenix_clients_db'],
  'Boletos': ['fenix_deleted_records_v1', 'fenix_boletos_db', 'fenix_clients_db'],
  'Pendências': ['fenix_deleted_records_v1', 'fenix_pendencias_v1'],
  'Pendencias': ['fenix_deleted_records_v1', 'fenix_pendencias_v1'],
  'Notas': ['fenix_deleted_records_v1', 'fenix_notes_db', 'fenix_notes_v1', 'fenix_anotacoes_db'],
  'Metas': ['fenix_deleted_records_v1', 'fenix_metas_sales_db', 'fenix_marketplace_sales_db', 'fenix_marketplace_metas_config', 'fenix_followup_cards_v2', 'fenix_orcamentos_history', 'fenix_saved_orcamentos', 'fenix_clients_db', 'fenix_pos_vendas_db', 'fenix_deleted_vendas_ids', 'fenix_vendas_gerencial', 'fenix_metas_config_data', 'fenix_individual_metas_map'],
  'Meta': ['fenix_deleted_records_v1', 'fenix_metas_sales_db', 'fenix_marketplace_sales_db', 'fenix_marketplace_metas_config', 'fenix_followup_cards_v2', 'fenix_orcamentos_history', 'fenix_saved_orcamentos', 'fenix_clients_db', 'fenix_pos_vendas_db', 'fenix_deleted_vendas_ids', 'fenix_vendas_gerencial', 'fenix_metas_config_data', 'fenix_individual_metas_map'],
  'Produtos': ['fenix_deleted_records_v1', 'fenix_product_items_data', 'fenix_product_categories_data', 'fenix_product_groups_data', 'fenix_product_costs_db', 'fenix_custos_tarkett_itens_v1', 'fenix_tarkett_produtos_catalogo'],
  'Promoções Ativas': ['fenix_deleted_records_v1', 'fenix_promocoes_ativas_db', 'fenix_product_items_data', 'fenix_product_categories_data'],
  'Promocoes Ativas': ['fenix_deleted_records_v1', 'fenix_promocoes_ativas_db', 'fenix_product_items_data', 'fenix_product_categories_data'],
  'Configurações': ['fenix_deleted_records_v1', 'fenix_usuarios_v2', 'fenix_auth_users_v2', 'fenix_notificacoes_config_v2', 'fenix_custos_estrutura_v1', 'fenix_custos_rateio_v1', 'fenix_custos_comissoes_v1', 'fenix_custos_nota_fiscal_v1', 'fenix_custos_pagamentos_v1', 'fenix_custos_marketplace_v1', 'fenix_custos_pedido_regras_v1', 'fenix_custos_tarkett_itens_v1', 'fenix_tarkett_produtos_catalogo', 'fenix_tarkett_simulacoes_v1', 'fenix_custos_variaveis_v1', 'fenix_whatsapp_templates_by_category', 'fenix_metas_config_data', 'fenix_individual_metas_map', 'fenix_user_themes_v1'],
  'Configuracoes': ['fenix_deleted_records_v1', 'fenix_usuarios_v2', 'fenix_auth_users_v2', 'fenix_notificacoes_config_v2', 'fenix_custos_estrutura_v1', 'fenix_custos_rateio_v1', 'fenix_custos_comissoes_v1', 'fenix_custos_nota_fiscal_v1', 'fenix_custos_pagamentos_v1', 'fenix_custos_marketplace_v1', 'fenix_custos_pedido_regras_v1', 'fenix_custos_tarkett_itens_v1', 'fenix_tarkett_produtos_catalogo', 'fenix_tarkett_simulacoes_v1', 'fenix_custos_variaveis_v1', 'fenix_whatsapp_templates_by_category', 'fenix_metas_config_data', 'fenix_individual_metas_map', 'fenix_user_themes_v1'],
  'Settings': ['fenix_deleted_records_v1', 'fenix_usuarios_v2', 'fenix_auth_users_v2', 'fenix_notificacoes_config_v2', 'fenix_custos_estrutura_v1', 'fenix_custos_rateio_v1', 'fenix_custos_comissoes_v1', 'fenix_custos_nota_fiscal_v1', 'fenix_custos_pagamentos_v1', 'fenix_custos_marketplace_v1', 'fenix_custos_pedido_regras_v1', 'fenix_custos_tarkett_itens_v1', 'fenix_tarkett_produtos_catalogo', 'fenix_tarkett_simulacoes_v1', 'fenix_custos_variaveis_v1', 'fenix_whatsapp_templates_by_category', 'fenix_metas_config_data', 'fenix_individual_metas_map', 'fenix_user_themes_v1'],
  'Estoque': ['fenix_deleted_records_v1', 'fenix_estoque_items', 'fenix_estoque_categories', 'fenix_estoque_groups', 'fenix_estoque_movimentacoes'],
  'Controle de Estoque': ['fenix_deleted_records_v1', 'fenix_estoque_items', 'fenix_estoque_categories', 'fenix_estoque_groups', 'fenix_estoque_movimentacoes'],
  'Materiais': ['fenix_deleted_records_v1', 'fenix_estoque_items', 'fenix_estoque_categories', 'fenix_estoque_groups', 'fenix_estoque_movimentacoes'],
  'Vendas': ['fenix_deleted_records_v1', 'fenix_vendas_gerencial', 'fenix_metas_sales_db', 'fenix_marketplace_sales_db', 'fenix_clients_db', 'fenix_deleted_vendas_ids'],
  'Notificações': ['fenix_header_notifications_v2'],
  'Notificacoes': ['fenix_header_notifications_v2'],
};

const moduleLastSyncTime: Record<string, number> = {};

const HEAVY_COLLECTION_KEYS = new Set<string>([
  'fenix_orcamentos_history',
  'fenix_saved_orcamentos',
  'fenix_followup_cards_v2',
  'fenix_followup_db',
  'fenix_header_notifications_v2',
  'fenix_clients_db',
  'fenix_anotacoes_db',
  'fenix_promocoes_ativas_db',
  'fenix_product_items_data',
  'fenix_activities_db',
  'fenix_metas_sales_db',
  'fenix_pos_vendas_db',
  'fenix_vendas_gerencial',
]);

const PROTECTED_MERGE_COLLECTIONS = new Set<string>([
  'fenix_clients_db',
  'fenix_orcamentos_history',
  'fenix_saved_orcamentos',
  'fenix_followup_cards_v2',
  'fenix_metas_sales_db',
  'fenix_pos_vendas_db',
  'fenix_vendas_gerencial',
  'fenix_tarefas_db',
  'fenix_product_items_data',
  'fenix_product_categories_data',
  'fenix_product_groups_data',
  'fenix_promocoes_ativas_db',
  'fenix_estoque_items',
  'fenix_estoque_categories',
  'fenix_estoque_groups',
  'fenix_estoque_movimentacoes',
]);

const APPEND_NEW_ITEM_COLLECTIONS = new Set<string>([
  'fenix_product_items_data',
  'fenix_product_categories_data',
  'fenix_product_groups_data',
  'fenix_estoque_categories',
  'fenix_estoque_groups',
]);

const PRODUCT_CATALOG_AUTHORITATIVE_KEYS = new Set<string>([
  'fenix_product_items_data',
  'fenix_product_categories_data',
  'fenix_product_groups_data',
]);

function mergeAuthoritativeCatalogCollection(
  key: string,
  cleanRemote: any[],
  cleanLocal: any[],
  pendingRecs: PendingOfflineRecord[],
  pendingUpsertItems: any[],
  pendingDeletes: Set<string>,
  deletedMap: Map<string, number>
): any[] {
  const hasCollectionPending = pendingRecs.some((r) => r.op === 'collection');
  let result: any[];

  if (cleanRemote.length === 0 && cleanLocal.length > 0 && pendingDeletes.size === 0 && deletedMap.size === 0) {
    result = cleanLocal;
  } else if (hasCollectionPending && cleanLocal.length > 0) {
    result = safeMergeLists(cleanRemote, cleanLocal, 'id', deletedMap);
  } else {
    result = cleanRemote;
  }

  if (pendingUpsertItems.length > 0) {
    const idF = pendingRecs.find((r) => r.op === 'upsert')?.idField || 'id';
    result = mergeItemsIntoCollection(key, result, [], pendingUpsertItems, idF).updatedList;
  }

  if (pendingDeletes.size > 0) {
    result = result.filter((it: any) => {
      const xId = extractCollectionItemId(it);
      return !xId || !pendingDeletes.has(xId);
    });
  }

  return deduplicateListById(result, 'id');
}

function mergeFollowUpArraysSafe(primaryList: any[], secondaryList: any[]): any[] {
  const fupByRef = new Map<string, any>();
  for (const p of [...primaryList, ...secondaryList]) {
    if (!p) continue;
    const pId = String(p.id ?? '').trim();
    const bareOrc = String(p.orcamentoId || (pId.startsWith('fup_') ? pId.slice(4) : ''))
      .trim()
      .replace(/^orc_/, '');
    const refKey = bareOrc ? `orc_${bareOrc}` : pId;
    if (!refKey) continue;

    const existing = fupByRef.get(refKey);
    if (!existing) {
      fupByRef.set(refKey, p);
    } else {
      const existingStatus = String(existing.status || '').trim().toLowerCase();
      const incomingStatus = String(p.status || '').trim().toLowerCase();
      const existingSold = existingStatus === 'vendido' || existingStatus === 'fechado';
      const incomingSold = incomingStatus === 'vendido' || incomingStatus === 'fechado';

      const existingTs = new Date(existing.updatedAt || existing.dataAtualizacao || 0).getTime() || 0;
      const incomingTs = new Date(p.updatedAt || p.dataAtualizacao || 0).getTime() || 0;
      const mergedHistMap = new Map<string, any>();
      [...(existing.historico || []), ...(p.historico || [])].forEach((h: any) => {
        if (h && h.id) mergedHistMap.set(h.id, h);
      });
      const mergedHist = Array.from(mergedHistMap.values()).sort(
        (a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)
      );
      const primary =
        incomingSold && !existingSold
          ? p
          : existingSold && !incomingSold
          ? existing
          : incomingTs > existingTs
          ? p
          : existing;
      const secondary = primary === p ? existing : p;
      fupByRef.set(refKey, {
        ...secondary,
        ...primary,
        id: existing.id || primary.id,
        orcamentoId: primary.orcamentoId || secondary.orcamentoId,
        pedido: primary.pedido || secondary.pedido,
        ...(mergedHist.length > 0 ? { historico: mergedHist } : {}),
      });
    }
  }
  return Array.from(fupByRef.values());
}

const inFlightKeyPromises = new Map<string, Promise<{ ok: boolean; hasData: boolean; data?: any }>>();
const recentKeyFetchCache = new Map<string, { hasData: boolean; data?: any; fetchedAt: number }>();
const sessionVerifiedKeys = new Set<string>();
const KEY_FETCH_CACHE_TTL_MS = 15000;

let activeReadSlots = 0;
const readSlotQueue: Array<() => void> = [];

async function withSupabaseReadSlot<T>(task: () => Promise<T>): Promise<T> {
  const maxConcurrent = collectionWriteQueues.size > 0 ? 1 : 2;
  if (activeReadSlots >= maxConcurrent) {
    await new Promise<void>((resolve) => readSlotQueue.push(resolve));
  }
  activeReadSlots++;
  try {
    return await task();
  } finally {
    activeReadSlots--;
    const next = readSlotQueue.shift();
    if (next) next();
  }
}

export function invalidateSupabaseKeyCache(key?: string) {
  if (key) {
    recentKeyFetchCache.delete(key);
  } else {
    recentKeyFetchCache.clear();
  }
}

export function primeSupabaseKeyCache(key: string, data: any, remoteUpdatedAt?: string) {
  recentKeyFetchCache.set(key, {
    hasData: data !== undefined && data !== null,
    data,
    fetchedAt: Date.now(),
  });
  sessionVerifiedKeys.add(key);
  if (remoteUpdatedAt) {
    setKnownRemoteUpdatedAt(key, remoteUpdatedAt);
  }
}

/**
 * Busca chaves específicas diretamente no Supabase com:
 * - deduplicação in-flight e cache curto (15s, invalidado automaticamente pelo Realtime/saves)
 * - verificação leve por `updated_at` (~30 bytes) antes de baixar coleções JSONB pesadas
 * - semáforo de concorrência para não esgotar conexões do banco
 * - AbortController único sem retentativas órfãs após timeout
 */
export async function fetchSupabaseKeysIndividually(
  keys: string[],
  timeoutMs = 20000,
  options?: { maxCacheAgeMs?: number; skipVersionCheck?: boolean }
): Promise<{
  rows: Map<string, any>;
  succeededKeys: Set<string>;
  failedKeys: string[];
}> {
  const rows = new Map<string, any>();
  const succeededKeys = new Set<string>();
  const failedKeys: string[] = [];

  if (isEmergencyOfflineMode()) {
    return { rows, succeededKeys, failedKeys: keys || [] };
  }

  const client = getSupabaseClient();
  if (!client || !Array.isArray(keys) || keys.length === 0) {
    return { rows, succeededKeys, failedKeys: keys || [] };
  }

  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  const now = Date.now();
  const maxCacheAgeMs = options?.maxCacheAgeMs ?? KEY_FETCH_CACHE_TTL_MS;
  const keysToFetch: string[] = [];
  const waitPromises: Array<{ key: string; promise: Promise<{ ok: boolean; hasData: boolean; data?: any }> }> = [];

  for (const k of uniqueKeys) {
    const cached = recentKeyFetchCache.get(k);
    if (cached && now - cached.fetchedAt < maxCacheAgeMs) {
      succeededKeys.add(k);
      if (cached.hasData) {
        rows.set(k, cached.data);
      }
      continue;
    }

    const inFlight = inFlightKeyPromises.get(k);
    if (inFlight) {
      waitPromises.push({ key: k, promise: inFlight });
      continue;
    }

    keysToFetch.push(k);
  }

  const resolvers = new Map<string, (val: { ok: boolean; hasData: boolean; data?: any }) => void>();
  for (const k of keysToFetch) {
    const p = new Promise<{ ok: boolean; hasData: boolean; data?: any }>((resolve) => {
      resolvers.set(k, resolve);
    });
    inFlightKeyPromises.set(k, p);
  }

  const resolveKey = (k: string, result: { ok: boolean; hasData: boolean; data?: any }) => {
    inFlightKeyPromises.delete(k);
    if (result.ok) {
      sessionVerifiedKeys.add(k);
      recentKeyFetchCache.set(k, { hasData: result.hasData, data: result.data, fetchedAt: Date.now() });
      succeededKeys.add(k);
      if (result.hasData) {
        rows.set(k, result.data);
      }
    } else {
      failedKeys.push(k);
    }
    const r = resolvers.get(k);
    if (r) r(result);
  };

  // Verificação leve por updated_at (~30 bytes/chave) antes de baixar JSONB completo
  const pendingKeySet = new Set<string>(getPendingSyncRecords().map((r) => r.collectionKey));
  const versionCheckCandidates: string[] = [];
  const fullFetchKeys: string[] = [];

  for (const k of keysToFetch) {
    const canVersionCheck =
      !options?.skipVersionCheck &&
      remoteUpdatedAtCache.has(k) &&
      getLocalRawSafe(k) !== null &&
      !collectionWriteQueues.has(k) &&
      !pendingKeySet.has(k) &&
      (!PRODUCT_CATALOG_AUTHORITATIVE_KEYS.has(k) || sessionVerifiedKeys.has(k));

    if (canVersionCheck) {
      versionCheckCandidates.push(k);
    } else {
      fullFetchKeys.push(k);
    }
  }

  if (versionCheckCandidates.length > 0) {
    try {
      const metaRows = await withSupabaseReadSlot(() =>
        withAbortableTimeout<any>(
          (signal) =>
            client
              .from('fenix_kv_store')
              .select('key, updated_at')
              .in('key', versionCheckCandidates)
              .abortSignal(signal),
          Math.min(10000, timeoutMs),
          'Tempo limite ao verificar versão das coleções no Supabase.'
        )
      );

      if (!metaRows?.error && Array.isArray(metaRows?.data)) {
        const metaMap = new Map<string, string>();
        for (const mRow of metaRows.data) {
          if (mRow && mRow.key && mRow.updated_at) {
            metaMap.set(mRow.key, String(mRow.updated_at));
          }
        }

        for (const k of versionCheckCandidates) {
          const remoteTs = metaMap.get(k);
          const knownTs = remoteUpdatedAtCache.get(k);
          if (!remoteTs) {
            // Chave ainda não existe ou foi removida no servidor — confirma via busca completa
            fullFetchKeys.push(k);
            continue;
          }

          if (knownTs && areTimestampsEqual(remoteTs, knownTs)) {
            const localRaw = getLocalRawSafe(k);
            if (localRaw !== null) {
              try {
                const cachedArr = parsedCollectionCache.get(k);
                const parsedLocal =
                  cachedArr && cachedArr.raw === localRaw
                    ? [...cachedArr.parsed]
                    : JSON.parse(localRaw);
                resolveKey(k, { ok: true, hasData: true, data: parsedLocal });
                continue;
              } catch {
                // fallback para busca completa se o cache local estiver corrompido
              }
            }
          }

          fullFetchKeys.push(k);
        }
      } else {
        fullFetchKeys.push(...versionCheckCandidates);
      }
    } catch {
      fullFetchKeys.push(...versionCheckCandidates);
    }
  }

  const heavyKeys = fullFetchKeys.filter((k) => HEAVY_COLLECTION_KEYS.has(k));
  const lightKeys = fullFetchKeys.filter((k) => !HEAVY_COLLECTION_KEYS.has(k));

  const queryBatches: string[][] = [];
  for (const hk of heavyKeys) {
    queryBatches.push([hk]);
  }
  for (let i = 0; i < lightKeys.length; i += 5) {
    queryBatches.push(lightKeys.slice(i, i + 5));
  }

  const fetchBatch = async (batch: string[]) => {
    try {
      const deadlineAt = Date.now() + timeoutMs;
      const res = await withSupabaseReadSlot(() =>
        executeWithRetry(
          async () => {
            const remainingMs = Math.max(3000, deadlineAt - Date.now());
            const queryResult = await withAbortableTimeout<any>(
              (signal) =>
                client
                  .from('fenix_kv_store')
                  .select('key, data, updated_at')
                  .in('key', batch)
                  .abortSignal(signal),
              remainingMs,
              'Tempo limite excedido ao consultar dados no Supabase.'
            );
            if (queryResult?.error) throw queryResult.error;
            return queryResult?.data || [];
          },
          2,
          500,
          { deadlineAt, retryOnPoolSaturation: false }
        )
      );

      if (!Array.isArray(res)) {
        batch.forEach((k) => resolveKey(k, { ok: false, hasData: false }));
        return;
      }

      const rowMap = new Map<string, any>();
      for (const row of res) {
        if (!row || !row.key) continue;
        if (row.updated_at) {
          setKnownRemoteUpdatedAt(row.key, String(row.updated_at));
        }
        let parsed = row.data;
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {}
        }
        rowMap.set(row.key, parsed);
      }

      for (const k of batch) {
        if (rowMap.has(k)) {
          resolveKey(k, { ok: true, hasData: true, data: rowMap.get(k) });
        } else {
          resolveKey(k, { ok: true, hasData: false });
        }
      }
    } catch (err) {
      console.warn(`[SUPABASE-FETCH] Falha ao buscar lote [${batch.join(', ')}]:`, err);
      batch.forEach((k) => resolveKey(k, { ok: false, hasData: false }));
    }
  };

  // Executa com concorrência controlada e cede prioridade caso o usuário dispare um salvamento
  for (let i = 0; i < queryBatches.length; i += 2) {
    if (collectionWriteQueues.size > 0) {
      await new Promise((r) => setTimeout(r, 150));
    }
    const group = queryBatches.slice(i, i + 2);
    await Promise.all(group.map((b) => fetchBatch(b)));
  }

  if (waitPromises.length > 0) {
    await Promise.all(
      waitPromises.map(async ({ key, promise }) => {
        try {
          const r = await promise;
          if (r.ok) {
            succeededKeys.add(key);
            if (r.hasData) rows.set(key, r.data);
          } else {
            failedKeys.push(key);
          }
        } catch {
          failedKeys.push(key);
        }
      })
    );
  }

  return { rows, succeededKeys, failedKeys };
}

const inFlightModuleSync = new Map<string, Promise<void>>();

function mergeUserThemesForSync(remoteRaw: any, localRaw: any): Record<string, any> {
  const result: Record<string, any> = {};
  const ingest = (src: any) => {
    if (!src || typeof src !== 'object' || Array.isArray(src)) return;
    for (const [uid, st] of Object.entries(src)) {
      if (!st || typeof st !== 'object') continue;
      const cur = result[uid];
      const remTs = Date.parse((st as any).updatedAt || '') || 0;
      const curTs = cur ? Date.parse(cur.updatedAt || '') || 0 : -1;
      if (!cur || remTs >= curTs) {
        result[uid] = st;
      }
    }
  };
  ingest(remoteRaw);
  ingest(localRaw);
  return result;
}

function mergeUserNotifPrefsForSync(remoteRaw: any, localRaw: any): Record<string, any> {
  return mergeUserThemesForSync(remoteRaw, localRaw);
}

function mirrorNotifPrefsMapToLocal(finalData: Record<string, any>): void {
  if (typeof localStorage === 'undefined' || !finalData || typeof finalData !== 'object') return;
  for (const [uidKey, val] of Object.entries(finalData)) {
    if (!val || typeof val !== 'object') continue;
    const entry = val as Record<string, any>;
    const rawUserId = typeof entry.userId === 'string' && entry.userId.trim() ? entry.userId : uidKey;
    const normUid = rawUserId
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '_') || 'padrao';
    try {
      const existingRaw =
        localStorage.getItem(`fenix_user_notif_prefs_${rawUserId}`) ||
        localStorage.getItem(`fenix_user_notif_prefs_${normUid}`);
      let existingParsed: any = null;
      if (existingRaw) {
        try {
          existingParsed = JSON.parse(existingRaw);
        } catch {}
      }
      const merged = {
        ...entry,
        ...(existingParsed?.customAudioGeneral && !entry.customAudioGeneral
          ? { customAudioGeneral: existingParsed.customAudioGeneral }
          : {}),
        ...(existingParsed?.customAudioPerType && !entry.customAudioPerType
          ? { customAudioPerType: existingParsed.customAudioPerType }
          : {}),
      };
      const serialized = JSON.stringify(merged);
      localStorage.setItem(`fenix_user_notif_prefs_${rawUserId}`, serialized);
      localStorage.setItem(`fenix_user_notif_prefs_${normUid}`, serialized);
    } catch {}
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fenix_notif_prefs_updated'));
  }
}

function applyMirroredLocalKeys(key: string, finalData: any): void {
  if (!key || finalData === undefined || finalData === null) return;
  try {
    if (key === 'fenix_promocoes_ativas_db') {
      setLocalCollectionSafe('fenix_promocoes_cache_v2', finalData);
    } else if (key === 'fenix_metas_config_data' && typeof finalData === 'object') {
      setLocalCollectionSafe('fenix_metas_config_v2', finalData);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('fenix_metas_config_updated'));
    } else if (key === 'fenix_individual_metas_map' && typeof finalData === 'object') {
      setLocalCollectionSafe('fenix_metas_individuais_v1', finalData);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('fenix_metas_config_updated'));
    } else if (key === 'fenix_whatsapp_templates_by_category' && typeof finalData === 'object') {
      setLocalCollectionSafe('fenix_config_whatsapp_categories_v2', finalData);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('fenix_orcamento_msg_updated'));
    } else if (key === 'fenix_user_themes_v1' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fenix_remote_user_themes_updated', { detail: finalData }));
    } else if (key === 'fenix_notificacoes_config_v2' && typeof finalData === 'object') {
      mirrorNotifPrefsMapToLocal(finalData);
    } else if (key === 'fenix_anotacoes_db' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fenix_anotacoes_realtime_updated', { detail: { key, data: finalData } }));
    }
  } catch {
    // ignore
  }
}

export async function syncModuleData(tabName: string, force = false): Promise<void> {
  if (isEmergencyOfflineMode()) return;

  const keys = TAB_COLLECTIONS_MAP[tabName];
  if (!keys || keys.length === 0) return;

  if (!force && hasPendingWrites()) {
    return;
  }

  const now = Date.now();
  const throttleMs = activeRealtimeChannel ? 25000 : 15000;
  if (!force && moduleLastSyncTime[tabName] && now - moduleLastSyncTime[tabName] < throttleMs) {
    return;
  }

  const existing = inFlightModuleSync.get(tabName);
  if (existing) {
    return existing;
  }

  const syncPromise = (async () => {
    try {
      // Antes de baixar dados do módulo, envia eventuais registros pendentes para não haver divergência
      if (getPendingSyncRecords().length > 0) {
        await flushAllPendingSync().catch(() => {});
      }
      const res = await pullDataFromSupabase(keys);
      if (res.success) {
        moduleLastSyncTime[tabName] = Date.now();
      }
    } finally {
      inFlightModuleSync.delete(tabName);
    }
  })();

  inFlightModuleSync.set(tabName, syncPromise);
  return syncPromise;
}

/**
 * Consulta e atualiza uma única coleção do Supabase com timeout seguro de 25 segundos
 */
export async function pullCollectionFromSupabase(key: string, timeoutMs = 25000): Promise<boolean> {
  const res = await withTimeout(pullDataFromSupabase([key], timeoutMs), timeoutMs + 1000, {
    success: false,
    pulledCount: 0,
  });
  return res.success;
}

/**
 * Consulta e atualiza um conjunto específico de coleções do Supabase com timeout seguro
 */
export async function pullCollectionsFromSupabase(keys: string[], timeoutMs = 25000): Promise<boolean> {
  const res = await withTimeout(pullDataFromSupabase(keys, timeoutMs), timeoutMs + 1000, {
    success: false,
    pulledCount: 0,
  });
  return res.success;
}

/**
 * Pulls data from Supabase into memory cache + localStorage (Restore / Pull).
 * - Busca chaves pesadas individualmente em paralelo com timeout generoso (25s).
 * - Nunca retorna success: true se lotes falharem/expirarem.
 * - Preserva alterações pendentes (IndexedDB STORE_PENDING + fila legada) e respeita exclusões (tombstones).
 */
export async function pullDataFromSupabase(
  specificKeys?: string[],
  timeoutMs = 25000
): Promise<{
  success: boolean;
  pulledCount: number;
  error?: string;
}> {
  if (isEmergencyOfflineMode()) {
    return {
      success: false,
      pulledCount: 0,
      error: 'Modo emergencial local ativo (IndexedDB).',
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, pulledCount: 0, error: 'Supabase não inicializado.' };
  }

  currentSyncStatus.isSyncing = true;
  notifyStatus();

  try {
    let targetKeys: string[];

    if (specificKeys && Array.isArray(specificKeys) && specificKeys.length > 0) {
      targetKeys = specificKeys.includes(DELETED_RECORDS_STORAGE_KEY)
        ? specificKeys
        : [DELETED_RECORDS_STORAGE_KEY, ...specificKeys];
    } else {
      targetKeys = SYNC_COLLECTIONS.map((c) => c.key);
    }

    const { rows, failedKeys } = await fetchSupabaseKeysIndividually(targetKeys, timeoutMs);

    if (rows.size === 0 && failedKeys.length > 0) {
      currentSyncStatus.isSyncing = false;
      currentSyncStatus.error = 'Timeout ou falha de rede ao consultar Supabase.';
      notifyStatus();
      return {
        success: false,
        pulledCount: 0,
        error: currentSyncStatus.error,
      };
    }

    // 1. Atualiza primeiro o mapa global de exclusões (tombstones) para que todas as coleções seguintes o respeitem
    const remoteTombstones = rows.get(DELETED_RECORDS_STORAGE_KEY);
    if (remoteTombstones && typeof remoteTombstones === 'object' && !Array.isArray(remoteTombstones)) {
      const mergedTombstones = mergeDeletionTombstoneMaps(remoteTombstones, getDeletionTombstonesMap());
      setLocalCollectionSafe(DELETED_RECORDS_STORAGE_KEY, mergedTombstones);
    }

    const allIdbPending = getPendingSyncRecords();
    let legacyQueue: PendingSyncItem[] = [];
    try {
      const rawQ = getLocalRawSafe(OFFLINE_SYNC_QUEUE_KEY);
      if (rawQ) {
        const parsedQ = JSON.parse(rawQ);
        if (Array.isArray(parsedQ)) legacyQueue = parsedQ;
      }
    } catch {}

    let pulledCount = 0;
    for (const [key, parsedData] of rows.entries()) {
      if (parsedData === undefined || key === DELETED_RECORDS_STORAGE_KEY) continue;
      try {
        const currentLocalRaw = getLocalRawSafe(key);
        let localParsed: any = null;
        let localList: any[] = [];
        if (currentLocalRaw) {
          try {
            localParsed = JSON.parse(currentLocalRaw);
            if (Array.isArray(localParsed)) localList = localParsed;
          } catch {}
        }

        const keyIdbPending = allIdbPending.filter((r) => r.collectionKey === key);
        const keyLegacyPending = legacyQueue.filter((q) => q.collectionKey === key && q.item);
        const pendingDeletes = new Set<string>(
          keyIdbPending.filter((r) => r.op === 'delete').map((r) => r.itemId)
        );
        const deletedMap = getDeletedIdsForCollection(key);

        let finalData: any = parsedData;

        if (key === 'fenix_anotacoes_db') {
          finalData = mergeAnotacoesForSync(parsedData, localParsed, keyIdbPending);
        } else if (key === 'fenix_promocoes_ativas_db') {
          const remArr = Array.isArray(parsedData) ? parsedData : [];
          finalData = mergePromocoesForSync(
            remArr.length > 0 ? remArr : localList,
            localList,
            keyIdbPending
          );
          if (keyIdbPending.length === 0 && remArr.length === 0 && localList.length > 0) {
            finalData = localList;
          }
        } else if (key === 'fenix_user_themes_v1') {
          finalData = mergeUserThemesForSync(parsedData, localParsed);
        } else if (key === 'fenix_notificacoes_config_v2') {
          finalData = mergeUserNotifPrefsForSync(parsedData, localParsed);
        } else if (Array.isArray(parsedData)) {
          const pendingUpsertItems: any[] = [
            ...keyIdbPending.filter((r) => r.op === 'upsert' && r.item).map((r) => r.item),
            ...keyLegacyPending.map((q) => q.item),
          ];

          const cleanRemote = parsedData.filter(
            (it) => !isItemTombstoned(key, it, 'id', deletedMap)
          );
          const cleanLocal = localList.filter(
            (it) => !isItemTombstoned(key, it, 'id', deletedMap)
          );

          if (parsedData.length === 0 && cleanLocal.length > 0 && pendingDeletes.size === 0) {
            finalData = cleanLocal;
            saveWholeCollectionToSupabase(key, cleanLocal).catch(() => {});
          } else if (key === 'fenix_metas_sales_db') {
            const salesList: any[] = [];
            const findMatchingSaleIdx = (candidate: any): number => {
              const id = String(candidate.id || '').trim();
              const fupId = candidate.followUpId ? String(candidate.followUpId).trim() : '';
              const orcId = candidate.orcamentoId ? String(candidate.orcamentoId).trim() : '';
              const bareOrc = orcId.replace(/^orc_/, '');
              const cleanPed = candidate.pedido ? String(candidate.pedido).replace(/^#+/, '').trim() : '';
              const clientNorm = (candidate.cliente || candidate.clientName || '').trim().toLowerCase();

              return salesList.findIndex((existing) => {
                const eId = String(existing.id || '').trim();
                const eFupId = existing.followUpId ? String(existing.followUpId).trim() : '';
                const eOrcId = existing.orcamentoId ? String(existing.orcamentoId).trim() : '';
                const eBareOrc = eOrcId.replace(/^orc_/, '');

                if (id && eId && id === eId) return true;
                if (fupId && eFupId && fupId === eFupId) return true;
                if (bareOrc && eBareOrc && bareOrc === eBareOrc) return true;
                if (fupId && eOrcId && (fupId === eOrcId || fupId === `fup_${eBareOrc}`)) return true;
                if (orcId && eFupId && (eFupId === orcId || eFupId === `fup_${bareOrc}`)) return true;

                const ePed = existing.pedido ? String(existing.pedido).replace(/^#+/, '').trim() : '';
                const eCli = (existing.cliente || existing.clientName || '').trim().toLowerCase();
                const bothHaveDiffOrcs = Boolean(bareOrc && eBareOrc && bareOrc !== eBareOrc);
                if (!bothHaveDiffOrcs && cleanPed && ePed && cleanPed === ePed && clientNorm && eCli && clientNorm === eCli) {
                  return true;
                }
                return false;
              });
            };

            for (const p of cleanRemote) {
              if (!p) continue;
              const idx = findMatchingSaleIdx(p);
              if (idx < 0) salesList.push(p);
            }

            for (const loc of [...cleanLocal, ...pendingUpsertItems]) {
              if (!loc) continue;
              const idx = findMatchingSaleIdx(loc);
              if (idx < 0) {
                salesList.push(loc);
              } else {
                const existing = salesList[idx];
                const existingTs = new Date(existing.updatedAt || existing.dataAtualizacao || 0).getTime() || 0;
                const locTs = new Date(loc.updatedAt || loc.dataAtualizacao || 0).getTime() || 0;
                if (locTs > existingTs) {
                  salesList[idx] = { ...existing, ...loc, id: existing.id || loc.id };
                }
              }
            }
            finalData = salesList;
          } else if (key === 'fenix_followup_cards_v2') {
            finalData = mergeFollowUpArraysSafe(cleanRemote, [...cleanLocal, ...pendingUpsertItems]);
          } else if (key === 'fenix_clients_db') {
            finalData = mergeClientsPreservingNewFirst(
              [...pendingUpsertItems, ...cleanRemote],
              cleanLocal,
              new Set(deletedMap.keys())
            );
          } else if (PRODUCT_CATALOG_AUTHORITATIVE_KEYS.has(key)) {
            finalData = mergeAuthoritativeCatalogCollection(
              key,
              cleanRemote,
              cleanLocal,
              keyIdbPending,
              pendingUpsertItems,
              pendingDeletes,
              deletedMap
            );
          } else {
            let merged = safeMergeLists(cleanRemote, cleanLocal, 'id');
            if (pendingUpsertItems.length > 0) {
              const idF = keyIdbPending[0]?.idField || keyLegacyPending[0]?.idField || 'id';
              merged = mergeItemsIntoCollection(key, merged, [], pendingUpsertItems, idF).updatedList;
            }
            if (pendingDeletes.size > 0) {
              merged = merged.filter((it: any) => {
                const xId = extractCollectionItemId(it);
                return !xId || !pendingDeletes.has(xId);
              });
            }
            finalData = merged;
          }
        }

        const stringVal = typeof finalData === 'string' ? finalData : JSON.stringify(finalData);
        if (currentLocalRaw !== stringVal) {
          setLocalCollectionSafe(key, stringVal);
          pulledCount++;
          dispatchCollectionEvents(key);
        }
        applyMirroredLocalKeys(key, finalData);
      } catch (storageErr) {
        console.error(`Erro ao gravar ${key} no cache/storage:`, storageErr);
      }
    }

    currentSyncStatus.connected = true;
    currentSyncStatus.lastSyncTime = new Date().toLocaleTimeString('pt-BR');
    currentSyncStatus.error = failedKeys.length > 0 ? `Algumas coleções falharam: ${failedKeys.join(', ')}` : null;
    currentSyncStatus.isSyncing = false;
    notifyStatus();

    return {
      success: failedKeys.length === 0,
      pulledCount,
      ...(failedKeys.length > 0 ? { error: currentSyncStatus.error || undefined } : {}),
    };
  } catch (err: any) {
    const errorMsg = err?.message || 'Não foi possível carregar os dados. Operando com dados locais.';
    currentSyncStatus.isSyncing = false;
    currentSyncStatus.error = errorMsg;
    notifyStatus();
    return { success: false, pulledCount: 0, error: errorMsg };
  }
}

const collectionWriteQueues = new Map<string, Promise<any>>();

export function hasPendingWrites(): boolean {
  return collectionWriteQueues.size > 0;
}

export function enqueueCollectionWrite<T>(collectionKey: string, task: () => Promise<T>): Promise<T> {
  const prev = collectionWriteQueues.get(collectionKey) || Promise.resolve();
  const current = prev.catch(() => {}).then(task);
  const cleanup = current.then(
    () => {
      if (collectionWriteQueues.get(collectionKey) === cleanup) {
        collectionWriteQueues.delete(collectionKey);
      }
    },
    () => {
      if (collectionWriteQueues.get(collectionKey) === cleanup) {
        collectionWriteQueues.delete(collectionKey);
      }
    }
  );
  collectionWriteQueues.set(collectionKey, cleanup);
  return current;
}

export async function withAbortableTimeout<T>(
  runWithSignal: (signal: AbortSignal) => any,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  const controller = new AbortController();
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const err: any = new Error(timeoutMessage);
      err.code = 'DatabaseTimeout';
      err.isClientTimeout = true;
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve(runWithSignal(controller.signal)), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

function getWriteTimeoutMs(collectionKey: string): number {
  return HEAVY_COLLECTION_KEYS.has(collectionKey) ? 35000 : 20000;
}

/**
 * Busca a coleção remota apenas se necessário:
 * 1) Reutiliza leitura recente (< 15s) ou leitura em andamento (inFlightKeyPromises) para evitar consultas duplicadas.
 * 2) Quando há cache local sincronizado (com hint de updated_at persistido), valida somente `updated_at` antes de baixar o JSONB inteiro.
 * 3) Usa AbortController + timeout delimitado sem deixar conexões zumbis no navegador.
 */
async function fetchRemoteCollectionForWrite<T>(
  client: SupabaseClient,
  collectionKey: string
): Promise<{ remoteList: T[]; localList: T[] }> {
  const localRaw = getLocalRawSafe(collectionKey);
  const localList: T[] = getLocalCollectionSafe<T>(collectionKey, []);

  // 1. Reaproveita cache recém-baixado (< 15s; invalidado automaticamente por saves/Realtime)
  const recentFetch = recentKeyFetchCache.get(collectionKey);
  if (recentFetch && Date.now() - recentFetch.fetchedAt < KEY_FETCH_CACHE_TTL_MS) {
    const cachedRemote = Array.isArray(recentFetch.data) ? (recentFetch.data as T[]) : [];
    return { remoteList: cachedRemote, localList };
  }

  // 2. Se já existe uma leitura desta mesma chave em andamento, aguarda até 8s (sem somar 25s extra)
  const inFlight = inFlightKeyPromises.get(collectionKey);
  if (inFlight) {
    try {
      const res = await withAbortableTimeout<{ ok: boolean; hasData: boolean; data?: any }>(
        () => inFlight,
        8000,
        'Tempo limite excedido ao aguardar sincronização em andamento.'
      );
      if (res?.ok) {
        const remoteFromFlight = Array.isArray(res.data) ? (res.data as T[]) : [];
        return { remoteList: remoteFromFlight, localList };
      }
    } catch {
      // Se a leitura paralela expirou/falhou, segue para tentativa direta dedicada com abortSignal próprio
    }
  }

  const knownRemoteUpdatedAt = remoteUpdatedAtCache.get(collectionKey);
  const hasPendingForCol = getPendingSyncRecords().some((r) => r.collectionKey === collectionKey);
  const hasUsableLocalCache = Boolean(
    knownRemoteUpdatedAt &&
      !hasPendingForCol &&
      localRaw !== null &&
      localList.length > 0 &&
      (memoryCollectionCache.has(collectionKey) || typeof localStorage !== 'undefined')
  );

  // 3. Verificação leve apenas de `updated_at` (~30 bytes) quando já temos estado sincronizado
  if (hasUsableLocalCache) {
    const { data: metaRow, error: metaErr } = await withAbortableTimeout<any>(
      (signal) =>
        client
          .from('fenix_kv_store')
          .select('updated_at')
          .eq('key', collectionKey)
          .abortSignal(signal)
          .maybeSingle(),
      10000,
      'Tempo limite excedido ao verificar versão no Supabase.'
    );

    if (metaErr) {
      throw metaErr;
    }

    if (!metaRow) {
      return { remoteList: [], localList };
    }

    if (metaRow.updated_at && areTimestampsEqual(metaRow.updated_at, knownRemoteUpdatedAt)) {
      return { remoteList: localList, localList };
    }
  }

  // 4. Consulta completa com AbortController único (25s para coleções pesadas, 18s para demais)
  const { data: remoteRow, error: fetchErr } = await withAbortableTimeout<any>(
    (signal) =>
      client
        .from('fenix_kv_store')
        .select('data, updated_at')
        .eq('key', collectionKey)
        .abortSignal(signal)
        .maybeSingle(),
    HEAVY_COLLECTION_KEYS.has(collectionKey) ? 25000 : 18000,
    'Tempo limite excedido ao consultar dados no Supabase.'
  );

  if (fetchErr) {
    throw fetchErr;
  }

  let remoteList: T[] = [];
  if (remoteRow && remoteRow.data !== undefined) {
    let rData = remoteRow.data;
    if (typeof rData === 'string') {
      try {
        rData = JSON.parse(rData);
      } catch {}
    }
    if (Array.isArray(rData)) {
      remoteList = rData;
    }
  }

  const remoteUpdatedAt = remoteRow?.updated_at ? String(remoteRow.updated_at) : undefined;
  primeSupabaseKeyCache(collectionKey, remoteList, remoteUpdatedAt);

  return { remoteList, localList };
}

function mergeItemsIntoCollection<T extends Record<string, any>>(
  collectionKey: string,
  remoteList: T[],
  localList: T[],
  items: T[],
  idField: string
): { updatedList: T[]; savedItems: T[] } {
  const incomingIds = new Set<string>();
  for (const it of items) {
    if (!it) continue;
    const id = extractCollectionItemId(it, idField);
    if (id) incomingIds.add(id);
  }
  const deletedMap = getDeletedIdsForCollection(collectionKey);

  const baseMap = new Map<string, any>();
  for (const rem of remoteList) {
    if (!rem) continue;
    const rId = String(rem[idField] ?? rem.id ?? rem._id ?? rem.idOrcamento ?? rem.pedido ?? '').trim();
    if (rId && !incomingIds.has(rId) && isItemTombstoned(collectionKey, rem, idField, deletedMap)) continue;
    if (rId) baseMap.set(rId, rem);
  }
  // Adiciona itens locais apenas se ainda não constarem no Supabase e não tiverem sido excluídos
  for (const loc of localList) {
    if (!loc) continue;
    const lId = String(loc[idField] ?? loc.id ?? loc._id ?? loc.idOrcamento ?? loc.pedido ?? '').trim();
    if (lId && !incomingIds.has(lId) && isItemTombstoned(collectionKey, loc, idField, deletedMap)) continue;
    if (lId && !baseMap.has(lId)) {
      baseMap.set(lId, loc);
    }
  }

  let workingList: T[] = deduplicateListById(Array.from(baseMap.values()), idField);
  const savedItems: T[] = [];

  for (const item of items) {
    if (!item) continue;
    let itemId = (item as any)[idField] ?? (item as any).id ?? (item as any)._id ?? (item as any).idOrcamento ?? (item as any).pedido;
    if (itemId === undefined || itemId === null || String(itemId).trim() === '') {
      itemId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      (item as any)[idField] = itemId;
    }

    const cleanItemId = String(itemId).trim();
    const itemOrcId = (item as any).orcamentoId ? String((item as any).orcamentoId).trim() : '';
    const itemFupId = (item as any).followUpId ? String((item as any).followUpId).trim() : '';
    const itemPed = (item as any).pedido ? String((item as any).pedido).replace(/^#+/, '').trim() : '';
    const itemCli = ((item as any).cliente || (item as any).clientName || '').trim().toLowerCase();

    const existingIndex = workingList.findIndex((x: any) => {
      if (!x) return false;
      const xId = String(x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? '').trim();
      if (xId === cleanItemId) return true;

      if (collectionKey === 'fenix_followup_cards_v2' && itemOrcId) {
        const itemBareOrc = itemOrcId.replace(/^orc_/, '');
        const xOrcId = x.orcamentoId ? String(x.orcamentoId).trim() : '';
        const xBareOrc = xOrcId.replace(/^orc_/, '');
        if (xOrcId && (xOrcId === itemOrcId || (itemBareOrc && xBareOrc === itemBareOrc))) return true;
        if (
          xId === `fup_${itemOrcId}` ||
          xId === itemOrcId ||
          (itemBareOrc && (xId === `fup_${itemBareOrc}` || xId === itemBareOrc || xId === `fup_orc_${itemBareOrc}`))
        ) {
          return true;
        }
      }

      if (collectionKey === 'fenix_metas_sales_db') {
        const itemBareOrc = itemOrcId.replace(/^orc_/, '');
        const xFupId = x.followUpId ? String(x.followUpId).trim() : '';
        const xOrcId = x.orcamentoId ? String(x.orcamentoId).trim() : '';
        const xBareOrc = xOrcId.replace(/^orc_/, '');
        if (itemFupId && (xFupId === itemFupId || xOrcId === itemFupId || xId === `v_orc_${itemFupId}`)) return true;
        if (
          itemOrcId &&
          (xOrcId === itemOrcId ||
            (itemBareOrc && xBareOrc === itemBareOrc) ||
            xFupId === `fup_${itemOrcId}` ||
            xId === `v_orc_${itemOrcId}` ||
            (itemBareOrc && xId === `v_orc_${itemBareOrc}`))
        ) {
          return true;
        }
        const xPed = x.pedido ? String(x.pedido).replace(/^#+/, '').trim() : '';
        const xCli = (x.cliente || x.clientName || '').trim().toLowerCase();
        const bothHaveDiffOrcs = Boolean(itemBareOrc && xBareOrc && itemBareOrc !== xBareOrc);
        if (!bothHaveDiffOrcs && itemPed && xPed && itemPed === xPed && (!itemCli || !xCli || itemCli === xCli)) {
          return true;
        }
      }

      return false;
    });

    if (existingIndex >= 0) {
      const existingItem = workingList[existingIndex] as any;
      const canonicalId = existingItem[idField] ?? itemId;
      const updatedItem = {
        ...existingItem,
        ...item,
        [idField]: canonicalId,
        updatedAt: (item as any).updatedAt || new Date().toISOString(),
      };
      workingList[existingIndex] = updatedItem;
      savedItems.push(updatedItem);
    } else {
      const insertedItem = {
        ...item,
        updatedAt: (item as any).updatedAt || new Date().toISOString(),
      };
      workingList = APPEND_NEW_ITEM_COLLECTIONS.has(collectionKey)
        ? [...workingList, insertedItem]
        : [insertedItem, ...workingList];
      savedItems.push(insertedItem);
    }
  }

  return { updatedList: workingList, savedItems };
}

/**
 * Saves a single item into a collection stored in Supabase fenix_kv_store.
 * - Otimizada com verificação leve de updated_at para evitar baixar JSONs pesados sem necessidade.
 * - Serializada por coleção para impedir corridas e bloqueios no banco.
 * - Merge seguro com base local e remota sem perder registros.
 * - Timeout limitado e retentativa rápida em erros transitórios.
 */
export async function saveItemToSupabase<T extends Record<string, any>>(
  collectionKey: string,
  item: T,
  idFieldOrUser = 'id',
  currentUser?: string
): Promise<{ success: boolean; data?: T; savedLocally?: boolean; error?: string }> {
  // Resolve idField vs currentUser defensivamente
  let idField = 'id';
  let resolvedUser = currentUser;

  if (currentUser === undefined) {
    if (idFieldOrUser && idFieldOrUser !== 'id' && idFieldOrUser !== '_id' && !(idFieldOrUser in item)) {
      resolvedUser = idFieldOrUser;
      idField = 'id';
    } else {
      idField = idFieldOrUser || 'id';
    }
  } else {
    idField = idFieldOrUser || 'id';
  }

  const user =
    resolvedUser ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('fenix_active_user_name') || localStorage.getItem('fenix_saved_username')
      : null) ||
    'Usuário Fênix';

  // Garante que o item possua um identificador válido
  let itemId = (item as any)[idField] ?? (item as any).id ?? (item as any)._id ?? (item as any).idOrcamento ?? (item as any).pedido;
  if (itemId === undefined || itemId === null || String(itemId).trim() === '') {
    itemId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    (item as any)[idField] = itemId;
  }

  const cleanItemId = String(itemId).trim();

  // MODO EMERGENCIAL LOCAL (IndexedDB): salva imediatamente sem depender do Supabase
  if (isEmergencyOfflineMode()) {
    return enqueueCollectionWrite(collectionKey, async () => {
      const localList = getLocalCollectionSafe<T>(collectionKey, []);
      const { updatedList, savedItems } = mergeItemsIntoCollection<T>(
        collectionKey,
        localList,
        [],
        [item],
        idField
      );

      if (localList.length > 0 && updatedList.length === 0) {
        return {
          success: false,
          error: 'Falha de integridade local: a lista não pode ser esvaziada.',
          data: item,
        };
      }

      const finalSaved = (savedItems[0] || item) as T;
      const savedId = String((finalSaved as any)[idField] ?? cleanItemId);
      clearDeletionTombstones(collectionKey, [savedId]);
      setLocalCollectionSafe(collectionKey, updatedList);
      markRecordPendingSync({
        collectionKey,
        itemId: savedId,
        op: 'upsert',
        item: finalSaved,
        idField,
        user,
      });
      dispatchCollectionEvents(collectionKey);

      return {
        success: true,
        data: finalSaved,
      };
    });
  }

  const client = getSupabaseClient();
  if (!client) {
    const localList = getLocalCollectionSafe<T>(collectionKey, []);
    const { updatedList, savedItems } = mergeItemsIntoCollection<T>(
      collectionKey,
      localList,
      [],
      [item],
      idField
    );
    const finalSaved = (savedItems[0] || item) as T;
    const savedId = String((finalSaved as any)[idField] ?? cleanItemId);
    clearDeletionTombstones(collectionKey, [savedId]);
    if (updatedList.length > 0) {
      setLocalCollectionSafe(collectionKey, updatedList);
      dispatchCollectionEvents(collectionKey);
    }
    markRecordPendingSync({
      collectionKey,
      itemId: savedId,
      op: 'upsert',
      item: finalSaved,
      idField,
      user,
    });
    return {
      success: false,
      savedLocally: true,
      error: 'Não foi possível salvar no servidor. Registro preservado localmente para sincronização.',
      data: finalSaved,
    };
  }

  return enqueueCollectionWrite(collectionKey, async () => {
    try {
      return await executeWithRetry(async () => {
        const { remoteList, localList } = await fetchRemoteCollectionForWrite<T>(client, collectionKey);
        const { updatedList, savedItems } = mergeItemsIntoCollection<T>(
          collectionKey,
          remoteList,
          localList,
          [item],
          idField
        );

        // Proteção anti-perda: lista nunca pode ficar vazia se havia dados existentes
        if ((remoteList.length > 0 || localList.length > 0) && updatedList.length === 0) {
          throw new Error('Falha de integridade: a lista não pode ser esvaziada durante o salvamento.');
        }

        const nowIso = new Date().toISOString();
        lastSelfSavedTimestamps[collectionKey] = nowIso;

        // Upsert no Supabase com confirmação imediata (retorna apenas updated_at) e AbortController
        const { data: upsertRow, error: upsertErr } = await withAbortableTimeout<any>(
          (signal) =>
            client
              .from('fenix_kv_store')
              .upsert(
                {
                  key: collectionKey,
                  data: updatedList,
                  updated_at: nowIso,
                  updated_by: user,
                },
                { onConflict: 'key' }
              )
              .select('updated_at')
              .abortSignal(signal)
              .maybeSingle(),
          getWriteTimeoutMs(collectionKey),
          'Tempo limite excedido ao confirmar salvamento no Supabase.'
        );

        if (upsertErr) {
          throw upsertErr;
        }

        const confirmedUpdatedAt = upsertRow?.updated_at ? String(upsertRow.updated_at) : nowIso;
        lastSelfSavedTimestamps[collectionKey] = confirmedUpdatedAt;
        primeSupabaseKeyCache(collectionKey, updatedList, confirmedUpdatedAt);

        // Confirmação do Supabase: atualiza cache em memória + IndexedDB + localStorage seguro e limpa pendência
        clearDeletionTombstones(collectionKey, [cleanItemId]);
        setLocalCollectionSafe(collectionKey, updatedList);
        removePendingSyncRecord(collectionKey, cleanItemId);
        dispatchCollectionEvents(collectionKey);

        return {
          success: true,
          data: savedItems[0] || item,
        };
      }, 2, 500, { retryOnPoolSaturation: false });
    } catch (err: any) {
      console.error(`Erro ao salvar item em ${collectionKey} no Supabase:`, err);
      clearKnownRemoteUpdatedAt(collectionKey);
      // Preserva localmente no IndexedDB e marca como pendente de sincronização
      const localList = getLocalCollectionSafe<T>(collectionKey, []);
      const { updatedList, savedItems } = mergeItemsIntoCollection<T>(
        collectionKey,
        localList,
        [],
        [item],
        idField
      );
      const finalSaved = (savedItems[0] || item) as T;
      const savedId = String((finalSaved as any)[idField] ?? cleanItemId);
      clearDeletionTombstones(collectionKey, [savedId]);
      if (updatedList.length > 0) {
        setLocalCollectionSafe(collectionKey, updatedList);
        dispatchCollectionEvents(collectionKey);
      }
      markRecordPendingSync({
        collectionKey,
        itemId: savedId,
        op: 'upsert',
        item: finalSaved,
        idField,
        user,
      });
      queuePendingItem(collectionKey, finalSaved, idField, user);

      const errorMessage = formatSupabaseErrorMessage(
        err,
        'Não foi possível salvar no banco de dados Supabase.'
      );

      return {
        success: false,
        savedLocally: true,
        error: errorMessage,
        data: finalSaved,
      };
    }
  });
}

/**
 * Grava múltiplos itens de uma mesma coleção em uma única operação atômica.
 */
export async function saveBatchItemsToSupabase<T extends Record<string, any>>(
  collectionKey: string,
  items: T[],
  idField = 'id',
  currentUser?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, count: 0 };
  }
  if (items.length === 1) {
    const res = await saveItemToSupabase<T>(collectionKey, items[0], idField, currentUser);
    return { success: res.success, count: res.success ? 1 : 0, error: res.error };
  }

  const user =
    currentUser ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('fenix_active_user_name') || localStorage.getItem('fenix_saved_username')
      : null) ||
    'Usuário Fênix';

  if (isEmergencyOfflineMode()) {
    return enqueueCollectionWrite(collectionKey, async () => {
      const localList = getLocalCollectionSafe<T>(collectionKey, []);
      const { updatedList, savedItems } = mergeItemsIntoCollection<T>(
        collectionKey,
        localList,
        [],
        items,
        idField
      );

      if (localList.length > 0 && updatedList.length === 0) {
        return {
          success: false,
          count: 0,
          error: 'Falha de integridade local: a lista não pode ser esvaziada.',
        };
      }

      clearDeletionTombstones(
        collectionKey,
        savedItems.map((it) => String((it as any)[idField] ?? (it as any).id ?? ''))
      );
      setLocalCollectionSafe(collectionKey, updatedList);
      markRecordsBatchPendingSync(
        savedItems.map((it) => ({
          collectionKey,
          itemId: String((it as any)[idField] ?? (it as any).id ?? Date.now()),
          op: 'upsert' as const,
          item: it,
          idField,
          user,
        }))
      );
      dispatchCollectionEvents(collectionKey);

      return { success: true, count: savedItems.length };
    });
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      count: 0,
      error: 'Não foi possível salvar. Verifique sua conexão e tente novamente.',
    };
  }

  return enqueueCollectionWrite(collectionKey, async () => {
    try {
      return await executeWithRetry(async () => {
        const { remoteList, localList } = await fetchRemoteCollectionForWrite<T>(client, collectionKey);
        const { updatedList, savedItems } = mergeItemsIntoCollection<T>(
          collectionKey,
          remoteList,
          localList,
          items,
          idField
        );

        if ((remoteList.length > 0 || localList.length > 0) && updatedList.length === 0) {
          throw new Error('Falha de integridade: a lista não pode ser esvaziada durante o salvamento.');
        }

        const nowIso = new Date().toISOString();
        lastSelfSavedTimestamps[collectionKey] = nowIso;

        const { data: upsertRow, error: upsertErr } = await withAbortableTimeout<any>(
          (signal) =>
            client
              .from('fenix_kv_store')
              .upsert(
                {
                  key: collectionKey,
                  data: updatedList,
                  updated_at: nowIso,
                  updated_by: user,
                },
                { onConflict: 'key' }
              )
              .select('updated_at')
              .abortSignal(signal)
              .maybeSingle(),
          getWriteTimeoutMs(collectionKey),
          'Tempo limite excedido ao salvar lote no Supabase.'
        );

        if (upsertErr) {
          throw upsertErr;
        }

        const confirmedUpdatedAt = upsertRow?.updated_at ? String(upsertRow.updated_at) : nowIso;
        lastSelfSavedTimestamps[collectionKey] = confirmedUpdatedAt;
        primeSupabaseKeyCache(collectionKey, updatedList, confirmedUpdatedAt);

        clearDeletionTombstones(
          collectionKey,
          savedItems.map((it) => String((it as any)[idField] ?? (it as any).id ?? ''))
        );
        setLocalCollectionSafe(collectionKey, updatedList);
        savedItems.forEach((it) => {
          const sId = (it as any)[idField] ?? (it as any).id;
          if (sId) removePendingSyncRecord(collectionKey, String(sId));
        });
        dispatchCollectionEvents(collectionKey);

        return { success: true, count: savedItems.length };
      }, 2, 500, { retryOnPoolSaturation: false });
    } catch (err: any) {
      console.error(`Erro ao salvar lote em ${collectionKey} no Supabase:`, err);
      clearKnownRemoteUpdatedAt(collectionKey);
      const localList = getLocalCollectionSafe<T>(collectionKey, []);
      const { updatedList, savedItems } = mergeItemsIntoCollection<T>(
        collectionKey,
        localList,
        [],
        items,
        idField
      );
      clearDeletionTombstones(
        collectionKey,
        savedItems.map((it) => String((it as any)[idField] ?? (it as any).id ?? ''))
      );
      if (updatedList.length > 0) {
        setLocalCollectionSafe(collectionKey, updatedList);
        dispatchCollectionEvents(collectionKey);
      }
      markRecordsBatchPendingSync(
        savedItems.map((it) => ({
          collectionKey,
          itemId: String((it as any)[idField] ?? (it as any).id ?? Date.now()),
          op: 'upsert' as const,
          item: it,
          idField,
          user,
        }))
      );
      items.forEach((it) => queuePendingItem(collectionKey, it, idField, user));
      return {
        success: false,
        count: 0,
        error: formatSupabaseErrorMessage(
          err,
          'Não foi possível salvar lote no banco de dados Supabase.'
        ),
      };
    }
  });
}

/**
 * Deletes a single item from a collection (or locally in IndexedDB during emergency mode).
 */
export async function deleteItemFromSupabase(
  collectionKey: string,
  itemId: string | number,
  idFieldOrUser = 'id',
  currentUser?: string
): Promise<{ success: boolean; savedLocally?: boolean; error?: string }> {
  // Resolve idField vs currentUser defensivamente
  let idField = 'id';
  let resolvedUser = currentUser;

  if (currentUser === undefined) {
    if (idFieldOrUser && idFieldOrUser !== 'id' && idFieldOrUser !== '_id') {
      resolvedUser = idFieldOrUser;
      idField = 'id';
    } else {
      idField = idFieldOrUser || 'id';
    }
  } else {
    idField = idFieldOrUser || 'id';
  }

  const user =
    resolvedUser ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('fenix_active_user_name') || localStorage.getItem('fenix_saved_username')
      : null) ||
    'Usuário Fênix';

  const cleanDeleteId = String(itemId).trim();

  if (isEmergencyOfflineMode()) {
    return enqueueCollectionWrite(collectionKey, async () => {
      const localList = getLocalCollectionSafe<any>(collectionKey, []);
      const deletedObj = localList.find((x: any) => {
        if (!x) return false;
        const xId = String(x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? '').trim();
        return xId === cleanDeleteId;
      });
      const updatedList = localList.filter((x: any) => {
        if (!x) return false;
        const xId = String(x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? '').trim();
        return xId !== cleanDeleteId;
      });

      setLocalCollectionSafe(collectionKey, updatedList);
      recordDeletionTombstones(collectionKey, [cleanDeleteId], user);
      markRecordPendingSync({
        collectionKey,
        itemId: cleanDeleteId,
        op: 'delete',
        idField,
        user,
        summaryLabel:
          deletedObj?.name ||
          deletedObj?.nome ||
          deletedObj?.clientName ||
          deletedObj?.cliente ||
          cleanDeleteId,
      });
      dispatchCollectionEvents(collectionKey);
      return { success: true };
    });
  }

  const client = getSupabaseClient();
  if (!client) {
    const localList = getLocalCollectionSafe<any>(collectionKey, []);
    const deletedObj = localList.find((x: any) => {
      if (!x) return false;
      const xId = String(x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? '').trim();
      return xId === cleanDeleteId;
    });
    const updatedLocal = localList.filter((x: any) => {
      if (!x) return false;
      const xId = String(x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? '').trim();
      return xId !== cleanDeleteId;
    });
    setLocalCollectionSafe(collectionKey, updatedLocal);
    recordDeletionTombstones(collectionKey, [cleanDeleteId], user);
    markRecordPendingSync({
      collectionKey,
      itemId: cleanDeleteId,
      op: 'delete',
      idField,
      user,
      summaryLabel:
        deletedObj?.name ||
        deletedObj?.nome ||
        deletedObj?.clientName ||
        deletedObj?.cliente ||
        cleanDeleteId,
    });
    dispatchCollectionEvents(collectionKey);
    return {
      success: false,
      savedLocally: true,
      error: 'Sem conexão com o banco de dados. Exclusão registrada na fila de sincronização.',
    };
  }

  return enqueueCollectionWrite(collectionKey, async () => {
    try {
      return await executeWithRetry(async () => {
        const { remoteList, localList } = await fetchRemoteCollectionForWrite<any>(client, collectionKey);
        const deletedMap = getDeletedIdsForCollection(collectionKey);

        const baseMap = new Map<string, any>();
        for (const rem of remoteList) {
          if (!rem) continue;
          const rId = String(rem[idField] ?? rem.id ?? rem._id ?? rem.idOrcamento ?? rem.pedido ?? '').trim();
          if (rId && isItemTombstoned(collectionKey, rem, idField, deletedMap)) continue;
          if (rId) baseMap.set(rId, rem);
        }
        for (const loc of localList) {
          if (!loc) continue;
          const lId = String(loc[idField] ?? loc.id ?? loc._id ?? loc.idOrcamento ?? loc.pedido ?? '').trim();
          if (lId && isItemTombstoned(collectionKey, loc, idField, deletedMap)) continue;
          if (lId && !baseMap.has(lId)) baseMap.set(lId, loc);
        }
        const baseList = deduplicateListById(Array.from(baseMap.values()), idField);
        const updatedList = baseList.filter((x: any) => {
          if (!x) return false;
          const xId = String(x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? '').trim();
          return xId !== cleanDeleteId;
        });

        const nowIso = new Date().toISOString();
        lastSelfSavedTimestamps[collectionKey] = nowIso;

        const { data: upsertRow, error: upsertErr } = await withAbortableTimeout<any>(
          (signal) =>
            client
              .from('fenix_kv_store')
              .upsert(
                {
                  key: collectionKey,
                  data: updatedList,
                  updated_at: nowIso,
                  updated_by: user,
                },
                { onConflict: 'key' }
              )
              .select('updated_at')
              .abortSignal(signal)
              .maybeSingle(),
          getWriteTimeoutMs(collectionKey),
          'Tempo limite excedido ao excluir no Supabase.'
        );

        if (upsertErr) {
          throw upsertErr;
        }

        const confirmedUpdatedAt = upsertRow?.updated_at ? String(upsertRow.updated_at) : nowIso;
        lastSelfSavedTimestamps[collectionKey] = confirmedUpdatedAt;
        primeSupabaseKeyCache(collectionKey, updatedList, confirmedUpdatedAt);

        setLocalCollectionSafe(collectionKey, updatedList);
        removePendingSyncRecord(collectionKey, cleanDeleteId);
        await recordDeletionTombstones(collectionKey, [cleanDeleteId], user);
        dispatchCollectionEvents(collectionKey);

        return { success: true };
      }, 2, 500, { retryOnPoolSaturation: false });
    } catch (err: any) {
      console.error(`Erro ao excluir de ${collectionKey} no Supabase:`, err);
      clearKnownRemoteUpdatedAt(collectionKey);
      // Preserva a exclusão localmente e agenda remoção na fila offline para o item não ressuscitar
      const localList = getLocalCollectionSafe<any>(collectionKey, []);
      const deletedObj = localList.find((x: any) => {
        if (!x) return false;
        const xId = String(x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? '').trim();
        return xId === cleanDeleteId;
      });
      const updatedLocal = localList.filter((x: any) => {
        if (!x) return false;
        const xId = String(x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? '').trim();
        return xId !== cleanDeleteId;
      });
      setLocalCollectionSafe(collectionKey, updatedLocal);
      void recordDeletionTombstones(collectionKey, [cleanDeleteId], user);
      markRecordPendingSync({
        collectionKey,
        itemId: cleanDeleteId,
        op: 'delete',
        idField,
        user,
        summaryLabel:
          deletedObj?.name ||
          deletedObj?.nome ||
          deletedObj?.clientName ||
          deletedObj?.cliente ||
          cleanDeleteId,
      });
      dispatchCollectionEvents(collectionKey);
      return {
        success: false,
        savedLocally: true,
        error: formatSupabaseErrorMessage(
          err,
          'Não foi possível confirmar a exclusão no servidor. Exclusão registrada na fila de sincronização.'
        ),
      };
    }
  });
}

/**
 * Exclui múltiplos itens de uma mesma coleção de forma atômica, gravando tombstones sincronizados.
 */
export async function deleteBatchItemsFromSupabase(
  collectionKey: string,
  itemIds: Array<string | number>,
  idField = 'id',
  currentUser?: string
): Promise<{ success: boolean; count: number; savedLocally?: boolean; error?: string }> {
  const cleanIds = Array.from(
    new Set((itemIds || []).map((id) => String(id ?? '').trim()).filter(Boolean))
  );
  if (cleanIds.length === 0) {
    return { success: true, count: 0 };
  }
  if (cleanIds.length === 1) {
    const res = await deleteItemFromSupabase(collectionKey, cleanIds[0], idField, currentUser);
    return {
      success: res.success,
      count: res.success ? 1 : 0,
      savedLocally: res.savedLocally,
      error: res.error,
    };
  }

  const user =
    currentUser ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('fenix_active_user_name') || localStorage.getItem('fenix_saved_username')
      : null) ||
    'Usuário Fênix';
  const idSet = new Set(cleanIds);

  if (isEmergencyOfflineMode()) {
    return enqueueCollectionWrite(collectionKey, async () => {
      const localList = getLocalCollectionSafe<any>(collectionKey, []);
      const updatedList = localList.filter((x: any) => {
        if (!x) return false;
        const xId = String(x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? '').trim();
        return !idSet.has(xId);
      });
      setLocalCollectionSafe(collectionKey, updatedList);
      await recordDeletionTombstones(collectionKey, cleanIds, user);
      markRecordsBatchPendingSync(
        cleanIds.map((delId) => ({
          collectionKey,
          itemId: delId,
          op: 'delete' as const,
          idField,
          user,
          summaryLabel: delId,
        }))
      );
      dispatchCollectionEvents(collectionKey);
      return { success: true, count: cleanIds.length };
    });
  }

  const client = getSupabaseClient();
  if (!client) {
    const localList = getLocalCollectionSafe<any>(collectionKey, []);
    const updatedLocal = localList.filter((x: any) => {
      if (!x) return false;
      const xId = String(x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? '').trim();
      return !idSet.has(xId);
    });
    setLocalCollectionSafe(collectionKey, updatedLocal);
    void recordDeletionTombstones(collectionKey, cleanIds, user);
    markRecordsBatchPendingSync(
      cleanIds.map((delId) => ({
        collectionKey,
        itemId: delId,
        op: 'delete' as const,
        idField,
        user,
        summaryLabel: delId,
      }))
    );
    dispatchCollectionEvents(collectionKey);
    return {
      success: false,
      count: 0,
      savedLocally: true,
      error: 'Sem conexão com o banco de dados. Exclusões registradas na fila de sincronização.',
    };
  }

  return enqueueCollectionWrite(collectionKey, async () => {
    try {
      return await executeWithRetry(async () => {
        const { remoteList, localList } = await fetchRemoteCollectionForWrite<any>(client, collectionKey);
        const deletedMap = getDeletedIdsForCollection(collectionKey);

        const baseMap = new Map<string, any>();
        for (const rem of remoteList) {
          if (!rem) continue;
          const rId = String(rem[idField] ?? rem.id ?? rem._id ?? rem.idOrcamento ?? rem.pedido ?? '').trim();
          if (rId && isItemTombstoned(collectionKey, rem, idField, deletedMap)) continue;
          if (rId) baseMap.set(rId, rem);
        }
        for (const loc of localList) {
          if (!loc) continue;
          const lId = String(loc[idField] ?? loc.id ?? loc._id ?? loc.idOrcamento ?? loc.pedido ?? '').trim();
          if (lId && isItemTombstoned(collectionKey, loc, idField, deletedMap)) continue;
          if (lId && !baseMap.has(lId)) baseMap.set(lId, loc);
        }
        const baseList = deduplicateListById(Array.from(baseMap.values()), idField);
        const updatedList = baseList.filter((x: any) => {
          if (!x) return false;
          const xId = String(x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? '').trim();
          return !idSet.has(xId);
        });

        const nowIso = new Date().toISOString();
        lastSelfSavedTimestamps[collectionKey] = nowIso;

        const { data: upsertRow, error: upsertErr } = await withAbortableTimeout<any>(
          (signal) =>
            client
              .from('fenix_kv_store')
              .upsert(
                {
                  key: collectionKey,
                  data: updatedList,
                  updated_at: nowIso,
                  updated_by: user,
                },
                { onConflict: 'key' }
              )
              .select('updated_at')
              .abortSignal(signal)
              .maybeSingle(),
          getWriteTimeoutMs(collectionKey),
          'Tempo limite excedido ao excluir lote no Supabase.'
        );

        if (upsertErr) {
          throw upsertErr;
        }

        const confirmedUpdatedAt = upsertRow?.updated_at ? String(upsertRow.updated_at) : nowIso;
        lastSelfSavedTimestamps[collectionKey] = confirmedUpdatedAt;
        primeSupabaseKeyCache(collectionKey, updatedList, confirmedUpdatedAt);

        setLocalCollectionSafe(collectionKey, updatedList);
        cleanIds.forEach((delId) => removePendingSyncRecord(collectionKey, delId));
        await recordDeletionTombstones(collectionKey, cleanIds, user);
        dispatchCollectionEvents(collectionKey);

        return { success: true, count: cleanIds.length };
      }, 2, 500, { retryOnPoolSaturation: false });
    } catch (err: any) {
      console.error(`Erro ao excluir lote em ${collectionKey} no Supabase:`, err);
      clearKnownRemoteUpdatedAt(collectionKey);
      const localList = getLocalCollectionSafe<any>(collectionKey, []);
      const updatedLocal = localList.filter((x: any) => {
        if (!x) return false;
        const xId = String(x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? '').trim();
        return !idSet.has(xId);
      });
      setLocalCollectionSafe(collectionKey, updatedLocal);
      void recordDeletionTombstones(collectionKey, cleanIds, user);
      markRecordsBatchPendingSync(
        cleanIds.map((delId) => ({
          collectionKey,
          itemId: delId,
          op: 'delete' as const,
          idField,
          user,
          summaryLabel: delId,
        }))
      );
      dispatchCollectionEvents(collectionKey);
      return {
        success: false,
        count: 0,
        savedLocally: true,
        error: formatSupabaseErrorMessage(
          err,
          'Não foi possível confirmar a exclusão em lote no servidor. Exclusões registradas na fila de sincronização.'
        ),
      };
    }
  });
}

/**
 * Salva coleção preservando exatamente a ordenação informada em `orderedList`
 * sem perder registros remotos concorrentes e respeitando tombstones.
 */
export async function saveCollectionOrderToSupabase<T extends Record<string, any>>(
  collectionKey: string,
  orderedList: T[],
  idField = 'id',
  currentUser?: string
): Promise<{ success: boolean; error?: string }> {
  const user =
    currentUser ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('fenix_active_user_name') || localStorage.getItem('fenix_saved_username')
      : null) ||
    'Usuário Fênix';

  const dedupedIncoming = deduplicateListById(orderedList, idField);

  if (dedupedIncoming.length === 0) {
    const existingLocal = getLocalCollectionSafe(collectionKey, []);
    if (existingLocal.length > 0) {
      return {
        success: false,
        error: 'Operação bloqueada por segurança: a lista ordenada não pode sobrescrever dados existentes com vazio.',
      };
    }
  }

  if (isEmergencyOfflineMode()) {
    return enqueueCollectionWrite(collectionKey, async () => {
      setLocalCollectionSafe(collectionKey, dedupedIncoming);
      markRecordPendingSync({
        collectionKey,
        itemId: '__collection__',
        op: 'collection',
        item: dedupedIncoming,
        idField,
        user,
        summaryLabel:
          SYNC_COLLECTIONS.find((c) => c.key === collectionKey)?.label || collectionKey,
      });
      dispatchCollectionEvents(collectionKey);
      return { success: true };
    });
  }

  const client = getSupabaseClient();
  if (!client) {
    setLocalCollectionSafe(collectionKey, dedupedIncoming);
    return {
      success: false,
      error: 'Não foi possível salvar a nova ordem no servidor. Verifique sua conexão.',
    };
  }

  return enqueueCollectionWrite(collectionKey, async () => {
    try {
      return await executeWithRetry(async () => {
        const { remoteList } = await fetchRemoteCollectionForWrite<any>(client, collectionKey);
        const deletedMap = getDeletedIdsForCollection(collectionKey);
        const cleanRemoteList = remoteList.filter(
          (it: any) => !isItemTombstoned(collectionKey, it, idField, deletedMap)
        );

        const incomingMap = new Map<string, T>();
        const orderedIds: string[] = [];
        for (const item of dedupedIncoming) {
          if (!item) continue;
          const id = extractCollectionItemId(item, idField);
          if (!id) continue;
          incomingMap.set(id, item);
          orderedIds.push(id);
        }

        const remoteById = new Map<string, any>();
        const extraRemoteItems: any[] = [];
        for (const rem of cleanRemoteList) {
          if (!rem) continue;
          const id = extractCollectionItemId(rem, idField);
          if (!id) continue;
          remoteById.set(id, rem);
          if (!incomingMap.has(id)) {
            extraRemoteItems.push(rem);
          }
        }

        const mergedOrdered: T[] = [];
        for (const id of orderedIds) {
          const inc = incomingMap.get(id)!;
          const rem = remoteById.get(id);
          mergedOrdered.push(rem ? { ...rem, ...inc } : inc);
        }
        for (const extra of extraRemoteItems) {
          mergedOrdered.push(extra);
        }

        const nowIso = new Date().toISOString();
        lastSelfSavedTimestamps[collectionKey] = nowIso;

        const { data: upsertRow, error: upsertErr } = await withAbortableTimeout<any>(
          (signal) =>
            client
              .from('fenix_kv_store')
              .upsert(
                {
                  key: collectionKey,
                  data: mergedOrdered,
                  updated_at: nowIso,
                  updated_by: user,
                },
                { onConflict: 'key' }
              )
              .select('updated_at')
              .abortSignal(signal)
              .maybeSingle(),
          getWriteTimeoutMs(collectionKey),
          'Tempo limite excedido ao salvar ordenação no Supabase.'
        );

        if (upsertErr) throw upsertErr;

        const confirmedUpdatedAt = upsertRow?.updated_at ? String(upsertRow.updated_at) : nowIso;
        lastSelfSavedTimestamps[collectionKey] = confirmedUpdatedAt;
        primeSupabaseKeyCache(collectionKey, mergedOrdered, confirmedUpdatedAt);
        setLocalCollectionSafe(collectionKey, mergedOrdered);
        dispatchCollectionEvents(collectionKey);

        return { success: true };
      }, 2, 500, { retryOnPoolSaturation: false });
    } catch (err: any) {
      clearKnownRemoteUpdatedAt(collectionKey);
      setLocalCollectionSafe(collectionKey, dedupedIncoming);
      dispatchCollectionEvents(collectionKey);
      return {
        success: false,
        error: formatSupabaseErrorMessage(
          err,
          'Não foi possível salvar a nova ordenação no banco de dados Supabase.'
        ),
      };
    }
  });
}

/**
 * Saves a whole collection payload with ANTI-WIPE GUARD.
 * No modo emergencial local, salva imediatamente no IndexedDB e registra como pendente de sincronização.
 */
export async function saveWholeCollectionToSupabase(
  collectionKey: string,
  data: any,
  currentUser?: string
): Promise<{ success: boolean; error?: string }> {
  const user =
    currentUser ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('fenix_active_user_name') || localStorage.getItem('fenix_saved_username')
      : null) ||
    'Usuário Fênix';

  // 1. ANTI-WIPE PROTECTION (local + memória):
  if (Array.isArray(data) && data.length === 0) {
    const existingLocal = getLocalCollectionSafe(collectionKey, []);
    if (existingLocal.length > 0) {
      console.warn(`[ANTI-WIPE] Bloqueada tentativa de sobrescrever ${collectionKey} com array vazio (${existingLocal.length} itens preservados).`);
      return { success: false, error: 'Operação bloqueada por segurança: dados existentes não podem ser apagados em lote.' };
    }
  }

  if (isEmergencyOfflineMode()) {
    return enqueueCollectionWrite(collectionKey, async () => {
      const dataToSave = Array.isArray(data) ? deduplicateListById(data) : data;
      setLocalCollectionSafe(collectionKey, dataToSave);
      markRecordPendingSync({
        collectionKey,
        itemId: '__collection__',
        op: 'collection',
        item: dataToSave,
        idField: 'id',
        user,
        summaryLabel:
          SYNC_COLLECTIONS.find((c) => c.key === collectionKey)?.label || collectionKey,
      });
      dispatchCollectionEvents(collectionKey);
      return { success: true };
    });
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'Não foi possível salvar. Verifique sua conexão e tente novamente.',
    };
  }

  return enqueueCollectionWrite(collectionKey, async () => {
    try {
      return await executeWithRetry(async () => {
        let dataToSave = Array.isArray(data) ? deduplicateListById(data) : data;

        let fetchedRemoteList: any[] | null = null;

        // 2. PROTEÇÃO REMOTA UNIVERSAL ANTI-TRUNCAMENTO para coleções críticas do CRM:
        // Consulta o Supabase antes de gravar e faz merge preservando todos os registros remotos existentes.
        if (PROTECTED_MERGE_COLLECTIONS.has(collectionKey) && Array.isArray(data)) {
          const { remoteList } = await fetchRemoteCollectionForWrite<any>(client, collectionKey);
          const deletedMap = getDeletedIdsForCollection(collectionKey);
          const cleanRemoteList = remoteList.filter(
            (it: any) => !isItemTombstoned(collectionKey, it, 'id', deletedMap)
          );
          fetchedRemoteList = cleanRemoteList;

          if (cleanRemoteList.length > 0 && data.length === 0) {
            throw new Error(`[ANTI-WIPE] Bloqueada sobrescrita vazia em ${collectionKey} (${cleanRemoteList.length} registros remotos preservados).`);
          }

          if (cleanRemoteList.length > 0) {
            if (collectionKey === 'fenix_metas_sales_db') {
              const mergedSales: any[] = [];
              const findIdx = (candidate: any): number => {
                const id = String(candidate.id || '').trim();
                const fupId = candidate.followUpId ? String(candidate.followUpId).trim() : '';
                const orcId = candidate.orcamentoId ? String(candidate.orcamentoId).trim() : '';
                const bareOrc = orcId.replace(/^orc_/, '');
                const cleanPed = candidate.pedido ? String(candidate.pedido).replace(/^#+/, '').trim() : '';
                const clientNorm = (candidate.cliente || candidate.clientName || '').trim().toLowerCase();

                return mergedSales.findIndex((existing) => {
                  const eId = String(existing.id || '').trim();
                  const eFupId = existing.followUpId ? String(existing.followUpId).trim() : '';
                  const eOrcId = existing.orcamentoId ? String(existing.orcamentoId).trim() : '';
                  const eBareOrc = eOrcId.replace(/^orc_/, '');

                  if (id && eId && id === eId) return true;
                  if (fupId && eFupId && fupId === eFupId) return true;
                  if (bareOrc && eBareOrc && bareOrc === eBareOrc) return true;
                  if (fupId && eOrcId && (fupId === eOrcId || fupId === `fup_${eBareOrc}`)) return true;
                  if (orcId && eFupId && (eFupId === orcId || eFupId === `fup_${bareOrc}`)) return true;

                  const ePed = existing.pedido ? String(existing.pedido).replace(/^#+/, '').trim() : '';
                  const eCli = (existing.cliente || existing.clientName || '').trim().toLowerCase();
                  const bothHaveDiffOrcs = Boolean(bareOrc && eBareOrc && bareOrc !== eBareOrc);
                  if (!bothHaveDiffOrcs && cleanPed && ePed && cleanPed === ePed && clientNorm && eCli && clientNorm === eCli) {
                    return true;
                  }
                  return false;
                });
              };

              cleanRemoteList.forEach((s: any) => {
                if (!s) return;
                if (findIdx(s) < 0) mergedSales.push(s);
              });

              data.forEach((s: any) => {
                if (!s) return;
                const idx = findIdx(s);
                if (idx < 0) {
                  mergedSales.push(s);
                } else {
                  const existing = mergedSales[idx];
                  const existingTs = new Date(existing.updatedAt || existing.dataAtualizacao || 0).getTime() || 0;
                  const incomingTs = new Date(s.updatedAt || s.dataAtualizacao || 0).getTime() || 0;
                  if (incomingTs >= existingTs) {
                    mergedSales[idx] = { ...existing, ...s, id: existing.id || s.id };
                  }
                }
              });

              dataToSave = mergedSales;
            } else if (collectionKey === 'fenix_followup_cards_v2') {
              dataToSave = mergeFollowUpArraysSafe(cleanRemoteList, data);
            } else {
              dataToSave = safeMergeLists(cleanRemoteList, data, 'id');
            }
          }
        }

        // 3. Evita envio redundante de payloads pesados quando o conteúdo mesclado já é idêntico ao remoto
        if (
          fetchedRemoteList &&
          fetchedRemoteList.length > 0 &&
          Array.isArray(dataToSave) &&
          fetchedRemoteList.length === dataToSave.length
        ) {
          try {
            if (JSON.stringify(fetchedRemoteList) === JSON.stringify(dataToSave)) {
              primeSupabaseKeyCache(collectionKey, dataToSave, remoteUpdatedAtCache.get(collectionKey));
              setLocalCollectionSafe(collectionKey, dataToSave);
              clearAllPendingSyncForCollection(collectionKey);
              return { success: true };
            }
          } catch {
            // Se falhar comparação, segue para gravação normal
          }
        }

        const nowIso = new Date().toISOString();
        lastSelfSavedTimestamps[collectionKey] = nowIso;

        const { data: upsertRow, error: upsertErr } = await withAbortableTimeout<any>(
          (signal) =>
            client
              .from('fenix_kv_store')
              .upsert(
                {
                  key: collectionKey,
                  data: dataToSave,
                  updated_at: nowIso,
                  updated_by: user,
                },
                { onConflict: 'key' }
              )
              .select('updated_at')
              .abortSignal(signal)
              .maybeSingle(),
          getWriteTimeoutMs(collectionKey),
          'Tempo limite excedido ao salvar coleção no Supabase.'
        );

        if (upsertErr) {
          throw upsertErr;
        }

        const confirmedUpdatedAt = upsertRow?.updated_at ? String(upsertRow.updated_at) : nowIso;
        lastSelfSavedTimestamps[collectionKey] = confirmedUpdatedAt;
        primeSupabaseKeyCache(collectionKey, dataToSave, confirmedUpdatedAt);

        setLocalCollectionSafe(collectionKey, dataToSave);
        clearAllPendingSyncForCollection(collectionKey);
        dispatchCollectionEvents(collectionKey);

        return { success: true };
      }, 2, 500, { retryOnPoolSaturation: false });
    } catch (err: any) {
      console.error(`Erro ao salvar ${collectionKey} no Supabase:`, err);
      clearKnownRemoteUpdatedAt(collectionKey);
      const dataToPreserve = Array.isArray(data) ? deduplicateListById(data) : data;
      setLocalCollectionSafe(collectionKey, dataToPreserve);
      markRecordPendingSync({
        collectionKey,
        itemId: '__collection__',
        op: 'collection',
        item: dataToPreserve,
        idField: 'id',
        user,
        summaryLabel:
          SYNC_COLLECTIONS.find((c) => c.key === collectionKey)?.label || collectionKey,
      });
      dispatchCollectionEvents(collectionKey);
      return {
        success: false,
        error: formatSupabaseErrorMessage(
          err,
          'Não foi possível salvar no servidor. Alteração preservada localmente para sincronização.'
        ),
      };
    }
  });
}

// ============================================================================
// MOTOR DE SINCRONIZAÇÃO MANUAL SEGURA (MODO EMERGENCIAL -> SUPABASE)
// Nunca executa automaticamente; exige conexão validada e nunca duplica ou apaga dados.
// ============================================================================

async function fetchRemoteRowDirect(
  client: SupabaseClient,
  collectionKey: string,
  timeoutMs = 20000
): Promise<{ exists: boolean; data: any; updatedAt?: string }> {
  const { data: row, error } = await withAbortableTimeout<any>(
    (signal) =>
      client
        .from('fenix_kv_store')
        .select('data, updated_at')
        .eq('key', collectionKey)
        .abortSignal(signal)
        .maybeSingle(),
    timeoutMs,
    `Tempo limite excedido ao consultar ${collectionKey} no Supabase.`
  );
  if (error) throw error;
  if (!row || row.data === undefined || row.data === null) {
    return { exists: false, data: null };
  }
  let parsed = row.data;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {}
  }
  return {
    exists: true,
    data: parsed,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function mergeAnotacoesForSync(
  remoteRaw: any,
  localRaw: any,
  pendingRecs: PendingOfflineRecord[]
): any {
  const emptyDb = {
    version: 2,
    notes: [] as any[],
    categoriesByUser: { vanessa: [], jhessica: [] },
    deletedCategoryIdsByUser: { vanessa: [], jhessica: [] },
    sheetConfigByUser: {
      vanessa: { headerTitle: 'ANOTAÇÃO', headerIcon: 'clipboard-pen', headerStyle: 'curvas_oficiais' },
      jhessica: { headerTitle: 'ANOTAÇÃO', headerIcon: 'clipboard-pen', headerStyle: 'curvas_oficiais' },
    },
  };

  const toDb = (raw: any) => {
    if (!raw || typeof raw !== 'object') return { ...emptyDb };
    if (Array.isArray(raw)) return { ...emptyDb, notes: raw };
    return {
      version: 2,
      notes: Array.isArray(raw.notes) ? raw.notes : [],
      categoriesByUser: {
        vanessa: Array.isArray(raw.categoriesByUser?.vanessa) ? raw.categoriesByUser.vanessa : [],
        jhessica: Array.isArray(raw.categoriesByUser?.jhessica) ? raw.categoriesByUser.jhessica : [],
      },
      deletedCategoryIdsByUser: {
        vanessa: Array.isArray(raw.deletedCategoryIdsByUser?.vanessa) ? raw.deletedCategoryIdsByUser.vanessa : [],
        jhessica: Array.isArray(raw.deletedCategoryIdsByUser?.jhessica) ? raw.deletedCategoryIdsByUser.jhessica : [],
      },
      sheetConfigByUser: {
        vanessa: raw.sheetConfigByUser?.vanessa || emptyDb.sheetConfigByUser.vanessa,
        jhessica: raw.sheetConfigByUser?.jhessica || emptyDb.sheetConfigByUser.jhessica,
      },
    };
  };

  const remDb = toDb(remoteRaw);
  const locDb = toDb(localRaw);

  const notesMap = new Map<string, any>();
  for (const n of remDb.notes) {
    if (n && n.id) notesMap.set(String(n.id), n);
  }

  for (const rec of pendingRecs) {
    if (rec.itemId === '__meta__') continue;
    if (rec.op === 'delete') {
      notesMap.delete(rec.itemId);
    } else if (rec.op === 'upsert') {
      const localNote =
        locDb.notes.find((n: any) => String(n?.id) === rec.itemId) || rec.item;
      if (localNote && localNote.id) {
        const existing = notesMap.get(String(localNote.id));
        if (!existing) {
          notesMap.set(String(localNote.id), localNote);
        } else {
          const exTs = Date.parse(existing.updatedAt || existing.createdAt || '') || 0;
          const locTs = Date.parse(localNote.updatedAt || localNote.createdAt || '') || 0;
          notesMap.set(String(localNote.id), locTs >= exTs ? localNote : existing);
        }
      }
    }
  }

  const hasMetaChange = pendingRecs.some((r) => r.itemId === '__meta__' || r.op === 'collection');
  const mergeCats = (remCats: any[], locCats: any[]) => {
    if (hasMetaChange && locCats.length > 0) return locCats;
    return safeMergeLists(remCats, locCats, 'id');
  };

  return {
    version: 2,
    notes: Array.from(notesMap.values()).sort((a: any, b: any) =>
      String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || ''))
    ),
    categoriesByUser: {
      vanessa: mergeCats(remDb.categoriesByUser.vanessa, locDb.categoriesByUser.vanessa),
      jhessica: mergeCats(remDb.categoriesByUser.jhessica, locDb.categoriesByUser.jhessica),
    },
    deletedCategoryIdsByUser: {
      vanessa: Array.from(
        new Set([
          ...remDb.deletedCategoryIdsByUser.vanessa,
          ...locDb.deletedCategoryIdsByUser.vanessa,
        ])
      ),
      jhessica: Array.from(
        new Set([
          ...remDb.deletedCategoryIdsByUser.jhessica,
          ...locDb.deletedCategoryIdsByUser.jhessica,
        ])
      ),
    },
    sheetConfigByUser: {
      vanessa: hasMetaChange ? locDb.sheetConfigByUser.vanessa : remDb.sheetConfigByUser.vanessa,
      jhessica: hasMetaChange ? locDb.sheetConfigByUser.jhessica : remDb.sheetConfigByUser.jhessica,
    },
  };
}

function mergePromocoesForSync(
  remoteList: any[],
  localList: any[],
  pendingRecs: PendingOfflineRecord[]
): any[] {
  const map = new Map<string, any>();
  for (const c of Array.isArray(remoteList) ? remoteList : []) {
    if (c && c.id) map.set(String(c.id), c);
  }

  for (const rec of pendingRecs) {
    if (rec.op === 'delete') {
      map.delete(rec.itemId);
      continue;
    }

    const localCampaign =
      (Array.isArray(localList) ? localList.find((c: any) => String(c?.id) === rec.itemId) : null) ||
      rec.item;
    if (!localCampaign || !localCampaign.id) continue;

    const remoteCampaign = map.get(String(localCampaign.id));
    if (!remoteCampaign) {
      map.set(String(localCampaign.id), localCampaign);
      continue;
    }

    // Mescla vendas de lote (lotSales) sem duplicar por id/saleToken e preserva lotes atualizados
    const salesMap = new Map<string, any>();
    for (const s of [...(remoteCampaign.lotSales || []), ...(localCampaign.lotSales || [])]) {
      if (!s) continue;
      const k = String(s.saleToken || s.id || '');
      if (k) salesMap.set(k, s);
    }

    const remTs = Date.parse(remoteCampaign.updatedAt || '') || 0;
    const locTs = Date.parse(localCampaign.updatedAt || '') || 0;
    const winner = locTs >= remTs ? localCampaign : remoteCampaign;
    const loser = winner === localCampaign ? remoteCampaign : localCampaign;

    map.set(String(localCampaign.id), {
      ...loser,
      ...winner,
      lotSales: Array.from(salesMap.values()),
    });
  }

  return Array.from(map.values());
}

/**
 * Sincronização manual segura:
 * 1) Testa a conexão antes de enviar qualquer dado (nunca tenta se o Supabase estiver instável).
 * 2) Lê a coleção atual do Supabase e mescla apenas as alterações pendentes (sem sobrescrever ou duplicar registros).
 * 3) Atualiza IndexedDB + cache e remove apenas os registros confirmados da lista de pendentes.
 */
export async function syncPendingOfflineRecordsToSupabase(
  currentUser = 'Vanessa Gomes'
): Promise<{
  success: boolean;
  syncedCount: number;
  remainingCount: number;
  error?: string;
  syncedCollections: string[];
}> {
  const pendingRecords = getPendingSyncRecords();
  if (pendingRecords.length === 0) {
    return {
      success: true,
      syncedCount: 0,
      remainingCount: 0,
      syncedCollections: [],
    };
  }

  const conn = await testSupabaseConnection();
  if (!conn.success) {
    return {
      success: false,
      syncedCount: 0,
      remainingCount: pendingRecords.length,
      error: conn.error || 'Supabase ainda instável. Dados locais preservados sem alterações.',
      syncedCollections: [],
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      syncedCount: 0,
      remainingCount: pendingRecords.length,
      error: 'Cliente Supabase não inicializado.',
      syncedCollections: [],
    };
  }

  currentSyncStatus.isSyncing = true;
  notifyStatus();

  const grouped = new Map<string, PendingOfflineRecord[]>();
  for (const rec of pendingRecords) {
    const arr = grouped.get(rec.collectionKey) || [];
    arr.push(rec);
    grouped.set(rec.collectionKey, arr);
  }

  let syncedCount = 0;
  const syncedCollections: string[] = [];
  let lastError: string | undefined;

  for (const [collectionKey, recs] of grouped.entries()) {
    try {
      await enqueueCollectionWrite(collectionKey, async () => {
        const remoteRes = await fetchRemoteRowDirect(client, collectionKey, getWriteTimeoutMs(collectionKey));
        const localRaw = getLocalRawSafe(collectionKey);
        let localParsed: any = null;
        if (localRaw) {
          try {
            localParsed = JSON.parse(localRaw);
          } catch {
            localParsed = localRaw;
          }
        }

        let finalPayload: any;

        if (collectionKey === 'fenix_anotacoes_db') {
          finalPayload = mergeAnotacoesForSync(remoteRes.data, localParsed, recs);
        } else if (collectionKey === 'fenix_promocoes_ativas_db') {
          const remArr = Array.isArray(remoteRes.data) ? remoteRes.data : [];
          const locArr = Array.isArray(localParsed) ? localParsed : [];
          finalPayload = mergePromocoesForSync(remArr, locArr, recs);
        } else if (collectionKey === DELETED_RECORDS_STORAGE_KEY) {
          finalPayload = mergeDeletionTombstoneMaps(remoteRes.data, localParsed || recs[0]?.item);
        } else if (collectionKey === 'fenix_user_themes_v1') {
          finalPayload = mergeUserThemesForSync(remoteRes.data, localParsed || recs[0]?.item);
        } else if (collectionKey === 'fenix_notificacoes_config_v2') {
          finalPayload = mergeUserNotifPrefsForSync(remoteRes.data, localParsed || recs[0]?.item);
        } else {
          const collectionRec = recs.find((r) => r.op === 'collection');
          const upsertRecs = recs.filter((r) => r.op === 'upsert' && r.item);
          const deleteRecs = recs.filter((r) => r.op === 'delete');

          if (collectionRec && !Array.isArray(collectionRec.item) && typeof collectionRec.item === 'object') {
            const remObj =
              remoteRes.exists && remoteRes.data && typeof remoteRes.data === 'object' && !Array.isArray(remoteRes.data)
                ? remoteRes.data
                : {};
            finalPayload = { ...remObj, ...collectionRec.item };
          } else {
            let workingList: any[] = Array.isArray(remoteRes.data) ? [...remoteRes.data] : [];
            const idField = recs[0]?.idField || 'id';

            if (collectionRec && Array.isArray(collectionRec.item)) {
              if (collectionKey === 'fenix_followup_cards_v2') {
                workingList = mergeFollowUpArraysSafe(workingList, collectionRec.item);
              } else {
                workingList = safeMergeLists(workingList, collectionRec.item, idField);
              }
            }

            if (upsertRecs.length > 0) {
              const itemsToMerge = upsertRecs.map((r) => {
                if (Array.isArray(localParsed)) {
                  const fresh = localParsed.find(
                    (it: any) =>
                      String(it?.[r.idField] ?? it?.id ?? it?._id ?? '').trim() === r.itemId
                  );
                  if (fresh) return fresh;
                }
                return r.item;
              });
              const { updatedList } = mergeItemsIntoCollection(
                collectionKey,
                workingList,
                workingList.length === 0 && Array.isArray(localParsed) ? localParsed : [],
                itemsToMerge,
                idField
              );
              workingList = updatedList;
            }

            if (deleteRecs.length > 0) {
              const delIds = new Set(deleteRecs.map((d) => d.itemId));
              workingList = workingList.filter((x: any) => {
                if (!x) return false;
                const xId = String(
                  x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? ''
                ).trim();
                return !delIds.has(xId);
              });
            }

            if (Array.isArray(remoteRes.data) && remoteRes.data.length > 0 && workingList.length === 0 && deleteRecs.length === 0) {
              throw new Error(`Proteção anti-wipe impediu gravação vazia em ${collectionKey}.`);
            }

            finalPayload = workingList;
          }
        }

        const nowIso = new Date().toISOString();
        lastSelfSavedTimestamps[collectionKey] = nowIso;

        const { data: upsertRow, error: upsertErr } = await withAbortableTimeout<any>(
          (signal) =>
            client
              .from('fenix_kv_store')
              .upsert(
                {
                  key: collectionKey,
                  data: finalPayload,
                  updated_at: nowIso,
                  updated_by: currentUser,
                },
                { onConflict: 'key' }
              )
              .select('updated_at')
              .abortSignal(signal)
              .maybeSingle(),
          getWriteTimeoutMs(collectionKey),
          `Tempo limite ao sincronizar ${collectionKey}.`
        );

        if (upsertErr) throw upsertErr;

        const confirmedAt = upsertRow?.updated_at ? String(upsertRow.updated_at) : nowIso;
        lastSelfSavedTimestamps[collectionKey] = confirmedAt;
        primeSupabaseKeyCache(collectionKey, finalPayload, confirmedAt);

        setLocalCollectionSafe(collectionKey, finalPayload);
        if (collectionKey === 'fenix_promocoes_ativas_db') {
          setLocalCollectionSafe('fenix_promocoes_cache_v2', finalPayload);
        }

        for (const r of recs) {
          removePendingSyncByQueueKey(r.queueKey);
          syncedCount++;
        }
        syncedCollections.push(collectionKey);
        dispatchCollectionEvents(collectionKey);
        if (collectionKey === 'fenix_anotacoes_db' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fenix_anotacoes_realtime_updated'));
        }
      });
    } catch (err: any) {
      console.warn(`[SAFE-SYNC] Falha ao sincronizar ${collectionKey}:`, err);
      lastError = formatSupabaseErrorMessage(err, `Erro ao sincronizar ${collectionKey}.`);
    }
  }

  const remainingCount = getPendingSyncRecords().length;
  currentSyncStatus.isSyncing = false;
  currentSyncStatus.connected = remainingCount === 0;
  currentSyncStatus.lastSyncTime = new Date().toLocaleTimeString('pt-BR');
  currentSyncStatus.error = lastError || null;
  notifyStatus();

  return {
    success: remainingCount === 0 && !lastError,
    syncedCount,
    remainingCount,
    error: lastError,
    syncedCollections,
  };
}

let inFlightFlushPromise: Promise<{
  success: boolean;
  syncedCount: number;
  remainingCount: number;
}> | null = null;

/**
 * Esvazia de forma segura e serializada todas as filas locais pendentes
 * (IndexedDB STORE_PENDING + fila legada localStorage fenix_pending_sync_queue_v1).
 */
export async function flushAllPendingSync(
  currentUser = 'Usuário Fênix'
): Promise<{
  success: boolean;
  syncedCount: number;
  remainingCount: number;
}> {
  if (isEmergencyOfflineMode()) {
    return {
      success: false,
      syncedCount: 0,
      remainingCount: getPendingSyncRecords().length,
    };
  }

  if (inFlightFlushPromise) {
    return inFlightFlushPromise;
  }

  inFlightFlushPromise = (async () => {
    let totalSynced = 0;
    try {
      const idbRes = await syncPendingOfflineRecordsToSupabase(currentUser);
      totalSynced += idbRes.syncedCount;

      const legacySynced = await drainPendingSyncQueue();
      totalSynced += legacySynced;

      const remainingCount = getPendingSyncRecords().length;
      return {
        success: idbRes.success && remainingCount === 0,
        syncedCount: totalSynced,
        remainingCount,
      };
    } catch {
      return {
        success: false,
        syncedCount: totalSynced,
        remainingCount: getPendingSyncRecords().length,
      };
    } finally {
      inFlightFlushPromise = null;
    }
  })();

  return inFlightFlushPromise;
}

/**
 * Baixa atualizações do Supabase de forma segura (mesclando sem apagar nem sobrescrever pendentes offline).
 */
export async function pullAndMergeFromSupabaseSafe(): Promise<{
  success: boolean;
  updatedCollections: number;
  error?: string;
}> {
  const conn = await testSupabaseConnection();
  if (!conn.success) {
    return {
      success: false,
      updatedCollections: 0,
      error: conn.error || 'Supabase ainda instável.',
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, updatedCollections: 0, error: 'Supabase não inicializado.' };
  }

  const pendingByCol = new Map<string, PendingOfflineRecord[]>();
  for (const rec of getPendingSyncRecords()) {
    const arr = pendingByCol.get(rec.collectionKey) || [];
    arr.push(rec);
    pendingByCol.set(rec.collectionKey, arr);
  }

  // Busca registro de exclusões primeiro para que todas as coleções respeitem tombstones
  const allKeys = [
    DELETED_RECORDS_STORAGE_KEY,
    ...SYNC_COLLECTIONS.map((c) => c.key).filter((k) => k !== DELETED_RECORDS_STORAGE_KEY),
  ];
  let updatedCollections = 0;

  currentSyncStatus.isSyncing = true;
  notifyStatus();

  try {
    for (let i = 0; i < allKeys.length; i += 4) {
      const batch = allKeys.slice(i, i + 4);
      const { data: rows, error } = await withAbortableTimeout<any>(
        (signal) =>
          client
            .from('fenix_kv_store')
            .select('key, data, updated_at')
            .in('key', batch)
            .abortSignal(signal),
        20000,
        'Tempo limite ao consultar coleções no Supabase.'
      );

      if (error || !Array.isArray(rows)) continue;

      for (const row of rows) {
        if (!row?.key || row.data === undefined || row.data === null) continue;
        const key = row.key as string;
        let remData = row.data;
        if (typeof remData === 'string') {
          try {
            remData = JSON.parse(remData);
          } catch {}
        }

        const localRaw = getLocalRawSafe(key);
        let localParsed: any = null;
        if (localRaw) {
          try {
            localParsed = JSON.parse(localRaw);
          } catch {}
        }

        const pendingRecs = pendingByCol.get(key) || [];
        let mergedData: any = remData;

        if (key === DELETED_RECORDS_STORAGE_KEY) {
          mergedData = mergeDeletionTombstoneMaps(remData, localParsed);
        } else if (key === 'fenix_user_themes_v1') {
          mergedData = mergeUserThemesForSync(remData, localParsed);
        } else if (key === 'fenix_notificacoes_config_v2') {
          mergedData = mergeUserNotifPrefsForSync(remData, localParsed);
        } else if (key === 'fenix_anotacoes_db') {
          mergedData = mergeAnotacoesForSync(remData, localParsed, pendingRecs);
        } else if (key === 'fenix_promocoes_ativas_db') {
          const remArr = Array.isArray(remData) ? remData : [];
          const locArr = Array.isArray(localParsed) ? localParsed : [];
          mergedData = mergePromocoesForSync(
            remArr.length > 0 ? remArr : locArr,
            locArr,
            pendingRecs
          );
          if (pendingRecs.length === 0 && remArr.length === 0 && locArr.length > 0) {
            mergedData = locArr;
          }
        } else if (Array.isArray(remData)) {
          const deletedMap = getDeletedIdsForCollection(key);
          const cleanRem = remData.filter((it) => !isItemTombstoned(key, it, 'id', deletedMap));
          const locArr = (Array.isArray(localParsed) ? localParsed : []).filter(
            (it) => !isItemTombstoned(key, it, 'id', deletedMap)
          );
          const pendingUpsertItems = pendingRecs
            .filter((r) => r.op === 'upsert' && r.item)
            .map((r) => r.item);
          const pendingDeletes = new Set(
            pendingRecs.filter((r) => r.op === 'delete').map((d) => d.itemId)
          );

          if (PRODUCT_CATALOG_AUTHORITATIVE_KEYS.has(key)) {
            mergedData = mergeAuthoritativeCatalogCollection(
              key,
              cleanRem,
              locArr,
              pendingRecs,
              pendingUpsertItems,
              pendingDeletes,
              deletedMap
            );
          } else {
            if (remData.length === 0 && locArr.length > 0) {
              mergedData = locArr;
            } else if (key === 'fenix_followup_cards_v2') {
              mergedData = mergeFollowUpArraysSafe(cleanRem, locArr);
            } else if (key === 'fenix_clients_db') {
              mergedData = mergeClientsPreservingNewFirst(cleanRem, locArr, new Set(deletedMap.keys()));
            } else {
              mergedData = safeMergeLists(cleanRem, locArr, 'id');
            }

            // Garante prevalência absoluta de alterações pendentes offline
            const pendingUpserts = pendingRecs.filter((r) => r.op === 'upsert' && r.item);
            if (pendingUpserts.length > 0) {
              const idF = pendingUpserts[0].idField || 'id';
              mergedData = mergeItemsIntoCollection(
                key,
                mergedData,
                [],
                pendingUpserts.map((u) => u.item),
                idF
              ).updatedList;
            }
            if (pendingDeletes.size > 0) {
              const idF = pendingRecs[0]?.idField || 'id';
              mergedData = mergedData.filter(
                (it: any) =>
                  !pendingDeletes.has(
                    String(it?.[idF] ?? it?.id ?? it?._id ?? it?.idOrcamento ?? it?.pedido ?? '').trim()
                  )
              );
            }
          }
        }

        const serialized = JSON.stringify(mergedData);
        if (localRaw !== serialized) {
          setLocalCollectionSafe(key, serialized);
          updatedCollections++;
          dispatchCollectionEvents(key);
        }
        applyMirroredLocalKeys(key, mergedData);
      }
    }

    currentSyncStatus.isSyncing = false;
    currentSyncStatus.connected = true;
    currentSyncStatus.lastSyncTime = new Date().toLocaleTimeString('pt-BR');
    currentSyncStatus.error = null;
    notifyStatus();

    return { success: true, updatedCollections };
  } catch (err: any) {
    const errorMsg = formatSupabaseErrorMessage(err, 'Falha ao mesclar dados do Supabase.');
    currentSyncStatus.isSyncing = false;
    currentSyncStatus.error = errorMsg;
    notifyStatus();
    return { success: false, updatedCollections, error: errorMsg };
  }
}

let inFlightReadOnlyClientsPromise: Promise<{
  success: boolean;
  addedCount: number;
  clients: any[];
}> | null = null;
let lastReadOnlyClientsAttemptAt = 0;

/**
 * Consulta SOMENTE LEITURA (SELECT) da coleção `fenix_clients_db` no Supabase para garantir que
 * clientes antigos e recentemente cadastrados já salvos no banco apareçam no CRM,
 * mesclando sem apagar, sem duplicar e SEM enviar nenhuma gravação automática ao Supabase.
 */
export async function fetchClientsReadOnlyFromSupabaseAndMerge(force = false): Promise<{
  success: boolean;
  addedCount: number;
  clients: any[];
}> {
  const localNow = getLocalCollectionSafe<any>('fenix_clients_db', []);
  const now = Date.now();

  if (!force && now - lastReadOnlyClientsAttemptAt < 25000 && inFlightReadOnlyClientsPromise === null) {
    return { success: false, addedCount: 0, clients: localNow };
  }

  if (inFlightReadOnlyClientsPromise) {
    return inFlightReadOnlyClientsPromise;
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, addedCount: 0, clients: localNow };
  }

  lastReadOnlyClientsAttemptAt = now;

  inFlightReadOnlyClientsPromise = (async () => {
    try {
      const { data: row, error } = await withAbortableTimeout<any>(
        (signal) =>
          client
            .from('fenix_kv_store')
            .select('data, updated_at')
            .eq('key', 'fenix_clients_db')
            .abortSignal(signal)
            .maybeSingle(),
        15000,
        'Tempo limite na consulta somente leitura de clientes.'
      );

      if (error || !row || row.data === undefined || row.data === null) {
        return {
          success: false,
          addedCount: 0,
          clients: getLocalCollectionSafe<any>('fenix_clients_db', []),
        };
      }

      let remoteData = row.data;
      if (typeof remoteData === 'string') {
        try {
          remoteData = JSON.parse(remoteData);
        } catch {}
      }

      if (!Array.isArray(remoteData)) {
        return {
          success: false,
          addedCount: 0,
          clients: getLocalCollectionSafe<any>('fenix_clients_db', []),
        };
      }

      const currentLocal = getLocalCollectionSafe<any>('fenix_clients_db', []);
      const localIdsBefore = new Set(
        currentLocal.map((c: any) => String(c?.id ?? '').trim()).filter(Boolean)
      );

      const pendingClientRecs = getPendingSyncRecords().filter(
        (r) => r.collectionKey === 'fenix_clients_db'
      );
      const tombstonedClients = getDeletedIdsForCollection('fenix_clients_db');
      const pendingDeletes = new Set([
        ...pendingClientRecs.filter((r) => r.op === 'delete').map((r) => r.itemId),
        ...Array.from(tombstonedClients.keys()),
      ]);
      const pendingUpsertsMap = new Map<string, any>();
      for (const rec of pendingClientRecs) {
        if (rec.op === 'upsert' && rec.item) {
          pendingUpsertsMap.set(rec.itemId, rec.item);
        }
      }

      const currentLocalMap = new Map<string, any>();
      for (const loc of currentLocal) {
        if (!loc || typeof loc !== 'object') continue;
        const id = String(loc.id ?? '').trim();
        if (id && !currentLocalMap.has(id)) {
          currentLocalMap.set(id, loc);
        }
      }

      // Mescla não-destrutiva:
      // 1) Clientes remotos preservando ordem do banco (novos primeiro), preservando edições offline pendentes ou mais recentes
      // 2) Clientes locais não presentes no remoto ficam no topo (exceto se forem apenas seed antigo)
      // 3) Respeita tombstones de exclusão e nunca rebaixa clientes novos abaixo do seed antigo
      const remoteIds = new Set<string>();
      const normalizedRemote: any[] = [];
      for (const rem of remoteData) {
        if (!rem || typeof rem !== 'object') continue;
        const id = String(rem.id ?? '').trim();
        if (
          !id ||
          remoteIds.has(id) ||
          (!pendingUpsertsMap.has(id) && isItemTombstoned('fenix_clients_db', rem, 'id', tombstonedClients))
        ) {
          continue;
        }
        remoteIds.add(id);

        const pendingEdit = pendingUpsertsMap.get(id);
        if (pendingEdit) {
          normalizedRemote.push({ ...rem, ...pendingEdit });
          continue;
        }

        const loc = currentLocalMap.get(id);
        if (loc) {
          const locTs = new Date(loc.updatedAt || 0).getTime() || 0;
          const remTs = new Date(rem.updatedAt || 0).getTime() || 0;
          if (locTs > remTs && remTs > 0) {
            normalizedRemote.push({ ...rem, ...loc });
          } else {
            normalizedRemote.push({ ...loc, ...rem });
          }
        } else {
          normalizedRemote.push(rem);
        }
      }

      const localOnly: any[] = [];
      for (const loc of currentLocal) {
        if (!loc || typeof loc !== 'object') continue;
        const id = String(loc.id ?? '').trim();
        if (
          !id ||
          remoteIds.has(id) ||
          (!pendingUpsertsMap.has(id) && isItemTombstoned('fenix_clients_db', loc, 'id', tombstonedClients))
        ) {
          continue;
        }
        localOnly.push(loc);
      }

      // Garante que registros novos locais venham antes dos remotos e que nenhum item de seed
      // empurre clientes novos para baixo
      const localOnlyNormalized = mergeClientsPreservingNewFirst(localOnly, [], pendingDeletes);
      const localOnlyNonSeed = localOnlyNormalized.filter((c: any) => {
        const id = String(c?.id ?? '').trim();
        return pendingUpsertsMap.has(id) || !isOfficialSeedClientId(id);
      });
      const localOnlySeedRemainder = localOnlyNormalized.filter((c: any) => {
        const id = String(c?.id ?? '').trim();
        return !pendingUpsertsMap.has(id) && isOfficialSeedClientId(id);
      });

      const finalMerged = [...localOnlyNonSeed, ...normalizedRemote, ...localOnlySeedRemainder];
      let addedCount = 0;
      for (const c of finalMerged) {
        const id = String(c?.id ?? '').trim();
        if (id && !localIdsBefore.has(id)) addedCount++;
      }

      const nextSerialized = JSON.stringify(finalMerged);
      const prevSerialized = getLocalRawSafe('fenix_clients_db');
      if (finalMerged.length > 0 && nextSerialized !== prevSerialized) {
        setLocalCollectionSafe('fenix_clients_db', finalMerged);
        dispatchCollectionEvents('fenix_clients_db');
      }

      return {
        success: true,
        addedCount,
        clients: finalMerged,
      };
    } catch {
      return {
        success: false,
        addedCount: 0,
        clients: getLocalCollectionSafe<any>('fenix_clients_db', []),
      };
    } finally {
      inFlightReadOnlyClientsPromise = null;
    }
  })();

  return inFlightReadOnlyClientsPromise;
}


