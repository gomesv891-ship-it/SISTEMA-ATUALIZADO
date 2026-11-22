/**
 * Gerenciamento de Preferências de Notificação por Usuário
 * Suporta configuração individual de toque sonoro, volume, categorias específicas de alerta e metas periódicas.
 * Persistência sincronizada com LocalStorage e Supabase.
 */

import { NotificationSoundType, playNotificationSound } from './soundAlerts';
import {
  enqueueCollectionWrite,
  getLocalRawSafe,
  getSupabaseClient,
  recordSelfSave,
  setLocalCollectionSafe,
  withAbortableTimeout,
} from './supabaseClient';
import { isEmergencyOfflineMode } from './indexedDbOfflineStore';

export type NotificationCategoryType =
  | 'tarefas'
  | 'boletos'
  | 'followup'
  | 'metas'
  | 'estoque'
  | 'tabelas'
  | 'notas'
  | 'pendencias'
  | 'posvendas'
  | 'outras';

export interface CustomAudioSound {
  fileName: string;
  dataUrl: string; // Base64 data URL (audio/...)
  fileType?: string;
  fileSize?: number; // in bytes
  uploadedAt: string;
  durationTotal?: number; // Duração total do áudio em segundos (ex: 215.4s)
  startTime?: number; // Segundo inicial do trecho na linha do tempo (ex: 35s)
  duration?: number; // Duração livre do trecho em segundos (ex: 2, 5, 10s)
}

/**
 * Normaliza o identificador de usuário para chaves seguras e isoladas.
 * Garante que cada usuário tenha suas próprias configurações 100% independentes.
 */
export function normalizeUserId(userId?: string): string {
  if (!userId || typeof userId !== 'string') return 'padrao';
  const cleaned = userId
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '_');
  return cleaned || 'padrao';
}

/**
 * Formata segundos no formato MM:SS (ex: 01:25)
 */
export function formatAudioTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const totalSecs = Math.floor(seconds);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Extrai a duração total do áudio a partir do Data URL
 */
export function getAudioDuration(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const dur = audio.duration;
        if (typeof dur === 'number' && !isNaN(dur) && isFinite(dur) && dur > 0) {
          resolve(Math.round(dur * 10) / 10);
        } else {
          resolve(30);
        }
      };
      audio.onerror = () => resolve(30);
      audio.src = dataUrl;
    } catch {
      resolve(30);
    }
  });
}

export interface UserNotificationPreferences {
  userId: string;
  enabled?: boolean; // ON/OFF geral de notificações no dispositivo
  soundType: NotificationSoundType; // Som padrão do sistema
  soundsPerType: Record<NotificationCategoryType, NotificationSoundType>;
  customAudioGeneral?: CustomAudioSound; // Áudio personalizado do computador como padrão geral
  customAudioPerType?: Partial<Record<NotificationCategoryType, CustomAudioSound>>;
  volumePercent: number; // Volume geral (0 - 100)
  volumesPerType?: Partial<Record<NotificationCategoryType, number>>; // Volume individual por categoria (0 - 100)
  scheduleEnabled?: boolean; // Restrição de horário ativa
  scheduleStartTime?: string; // ex: '08:00'
  scheduleEndTime?: string; // ex: '19:00'
  externalAlerts?: Partial<Record<NotificationCategoryType, boolean>>; // ON/OFF para notificação externa por categoria
  // Categorias específicas de alerta
  alerts: {
    pendencias: boolean;
    notas: boolean;
    tarefas: boolean;
    followup: boolean;
    boletos: boolean;
    metas: boolean;
    estoque: boolean;
    tabelas?: boolean;
    posvendas?: boolean;
  };
  // Configurações de percentuais de metas
  metaAlerts: {
    diaria: {
      pct50: boolean;
      pct75: boolean;
      pct100: boolean;
    };
    semanal: {
      pct50: boolean;
      pct75: boolean;
      pct100: boolean;
    };
    mensal: {
      pct50: boolean;
      pct75: boolean;
      pct100: boolean;
    };
  };
}

export const DEFAULT_SOUNDS_PER_TYPE: Record<NotificationCategoryType, NotificationSoundType> = {
  tarefas: 'Sino Suave (Padrão)',
  boletos: 'Campainha Corporativa (Longa)',
  followup: 'Ding Comercial',
  metas: 'Fanfarra de Conquista (Meta)',
  estoque: 'Pulso Tecnológico',
  tabelas: 'Campainha Corporativa (Longa)',
  notas: 'Chime Cristalino com Ressonância',
  pendencias: 'Alerta Duplo Atenção',
  posvendas: 'Campainha Corporativa (Longa)',
  outras: 'Sino Suave (Padrão)',
};

export const DEFAULT_NOTIF_PREFS: Omit<UserNotificationPreferences, 'userId'> = {
  enabled: true,
  soundType: 'Campainha Corporativa (Longa)',
  soundsPerType: DEFAULT_SOUNDS_PER_TYPE,
  volumePercent: 85,
  volumesPerType: {
    tarefas: 85,
    boletos: 85,
    followup: 85,
    metas: 85,
    estoque: 85,
    tabelas: 85,
    notas: 85,
    pendencias: 85,
    posvendas: 85,
    outras: 85,
  },
  scheduleEnabled: false,
  scheduleStartTime: '08:00',
  scheduleEndTime: '19:00',
  externalAlerts: {
    tarefas: true,
    boletos: true,
    followup: true,
    metas: true,
    estoque: true,
    tabelas: true,
    notas: true,
    pendencias: true,
    posvendas: true,
    outras: true,
  },
  alerts: {
    pendencias: true,
    notas: true,
    tarefas: true,
    followup: true,
    boletos: true,
    metas: true,
    estoque: true,
    tabelas: true,
    posvendas: true,
  },
  metaAlerts: {
    diaria: {
      pct50: true,
      pct75: true,
      pct100: true,
    },
    semanal: {
      pct50: true,
      pct75: true,
      pct100: true,
    },
    mensal: {
      pct50: true,
      pct75: true,
      pct100: true,
    },
  },
};

export const NOTIFICACOES_CONFIG_SUPABASE_KEY = 'fenix_notificacoes_config_v2';
export const NOTIF_AUDIO_SUPABASE_PREFIX = 'fenix_notif_audio_';

export function getNotifAudioSupabaseKey(userId: string): string {
  return `${NOTIF_AUDIO_SUPABASE_PREFIX}${normalizeUserId(userId)}`;
}

const STORAGE_PREFIX = 'fenix_user_notif_prefs_';
const CUSTOM_AUDIO_PREFIX = 'fenix_custom_audio_';
const CUSTOM_AUDIO_GENERAL_PREFIX = 'fenix_custom_audio_general_';
const DEDUPLICATION_PREFIX = 'fenix_meta_notif_fired_';

type StoredNotifPrefsEntry = UserNotificationPreferences & { updatedAt?: string };

function readNotifConfigMapLocal(): Record<string, StoredNotifPrefsEntry> {
  try {
    const raw = getLocalRawSafe(NOTIFICACOES_CONFIG_SUPABASE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {}
  return {};
}

function normalizePrefsObject(userId: string, parsed: any): UserNotificationPreferences {
  return {
    userId,
    enabled: parsed?.enabled !== undefined ? parsed.enabled : DEFAULT_NOTIF_PREFS.enabled,
    soundType: parsed?.soundType || DEFAULT_NOTIF_PREFS.soundType,
    soundsPerType: {
      ...DEFAULT_SOUNDS_PER_TYPE,
      ...(parsed?.soundsPerType || {}),
    },
    customAudioGeneral: parsed?.customAudioGeneral || undefined,
    customAudioPerType: parsed?.customAudioPerType || undefined,
    volumePercent:
      typeof parsed?.volumePercent === 'number'
        ? parsed.volumePercent
        : DEFAULT_NOTIF_PREFS.volumePercent,
    volumesPerType: {
      ...DEFAULT_NOTIF_PREFS.volumesPerType,
      ...(parsed?.volumesPerType || {}),
    },
    scheduleEnabled:
      parsed?.scheduleEnabled !== undefined
        ? parsed.scheduleEnabled
        : DEFAULT_NOTIF_PREFS.scheduleEnabled,
    scheduleStartTime: parsed?.scheduleStartTime || DEFAULT_NOTIF_PREFS.scheduleStartTime,
    scheduleEndTime: parsed?.scheduleEndTime || DEFAULT_NOTIF_PREFS.scheduleEndTime,
    externalAlerts: {
      ...DEFAULT_NOTIF_PREFS.externalAlerts,
      ...(parsed?.externalAlerts || {}),
    },
    alerts: {
      ...DEFAULT_NOTIF_PREFS.alerts,
      ...(parsed?.alerts || {}),
    },
    metaAlerts: {
      diaria: {
        ...DEFAULT_NOTIF_PREFS.metaAlerts.diaria,
        ...(parsed?.metaAlerts?.diaria || {}),
      },
      semanal: {
        ...DEFAULT_NOTIF_PREFS.metaAlerts.semanal,
        ...(parsed?.metaAlerts?.semanal || {}),
      },
      mensal: {
        ...DEFAULT_NOTIF_PREFS.metaAlerts.mensal,
        ...(parsed?.metaAlerts?.mensal || {}),
      },
    },
  };
}

function buildCompactNotifPrefsForRemote(
  prefs: UserNotificationPreferences,
  updatedAt: string
): StoredNotifPrefsEntry {
  // Remove dataUrls pesados do mapa leve de preferências; os áudios completos são sincronizados em fenix_notif_audio_<uid>
  const { customAudioGeneral: _gen, customAudioPerType: _cat, ...rest } = prefs;
  return {
    ...rest,
    userId: prefs.userId,
    updatedAt,
  };
}

function mirrorUserPrefsToLocal(uid: string, rawUserId: string, prefs: StoredNotifPrefsEntry): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const existingRaw =
      localStorage.getItem(`${STORAGE_PREFIX}${rawUserId}`) ||
      localStorage.getItem(`${STORAGE_PREFIX}${uid}`);
    let existingParsed: any = null;
    if (existingRaw) {
      try {
        existingParsed = JSON.parse(existingRaw);
      } catch {}
    }
    const merged: StoredNotifPrefsEntry = {
      ...normalizePrefsObject(rawUserId || prefs.userId || uid, prefs),
      // Preserva áudios em cache local se o mapa remoto veio sem eles
      ...(existingParsed?.customAudioGeneral && !prefs.customAudioGeneral
        ? { customAudioGeneral: existingParsed.customAudioGeneral }
        : {}),
      ...(existingParsed?.customAudioPerType && !prefs.customAudioPerType
        ? { customAudioPerType: existingParsed.customAudioPerType }
        : {}),
      updatedAt: prefs.updatedAt,
    };
    const serialized = JSON.stringify(merged);
    if (rawUserId) localStorage.setItem(`${STORAGE_PREFIX}${rawUserId}`, serialized);
    localStorage.setItem(`${STORAGE_PREFIX}${uid}`, serialized);
  } catch {}
}

export function hydrateNotifPrefsMapFromRemote(remoteMap: any): void {
  if (!remoteMap || typeof remoteMap !== 'object' || Array.isArray(remoteMap)) return;
  for (const [uidKey, val] of Object.entries(remoteMap)) {
    if (!val || typeof val !== 'object') continue;
    const entry = val as StoredNotifPrefsEntry;
    const uid = normalizeUserId(entry.userId || uidKey);
    mirrorUserPrefsToLocal(uid, entry.userId || uidKey, entry);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fenix_notif_prefs_updated'));
  }
}

async function syncUserCustomAudiosToSupabase(userId: string): Promise<void> {
  if (typeof window === 'undefined' || isEmergencyOfflineMode()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const uid = normalizeUserId(userId);
  const remoteKey = getNotifAudioSupabaseKey(userId);

  const general = getCustomAudioGeneral(userId);
  const categories: Partial<Record<NotificationCategoryType, CustomAudioSound>> = {};
  const cats: NotificationCategoryType[] = [
    'tarefas',
    'boletos',
    'followup',
    'metas',
    'estoque',
    'tabelas',
    'notas',
    'pendencias',
    'posvendas',
    'outras',
  ];
  for (const c of cats) {
    try {
      const raw = localStorage.getItem(`${CUSTOM_AUDIO_PREFIX}${uid}_${c}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.dataUrl) categories[c] = parsed;
      }
    } catch {}
  }

  const nowIso = new Date().toISOString();
  const payload = {
    userId,
    uid,
    general: general || null,
    categories,
    updatedAt: nowIso,
  };

  await enqueueCollectionWrite(remoteKey, async () => {
    try {
      recordSelfSave(remoteKey, nowIso);
      const { error } = await withAbortableTimeout<any>(
        (signal) =>
          supabase
            .from('fenix_kv_store')
            .upsert(
              {
                key: remoteKey,
                data: payload,
                updated_at: nowIso,
                updated_by: userId || 'Usuário Fênix',
              },
              { onConflict: 'key' }
            )
            .select('updated_at')
            .abortSignal(signal)
            .maybeSingle(),
        25000,
        'Tempo limite ao salvar áudio personalizado no Supabase.'
      );
      if (error) {
        console.warn('Aviso ao sincronizar áudio personalizado no Supabase:', error);
      }
    } catch (err) {
      console.warn('Aviso ao sincronizar áudio personalizado no Supabase:', err);
    }
  });
}

export async function loadUserNotificationPreferencesFromSupabase(
  userId: string
): Promise<UserNotificationPreferences> {
  const localPrefs = getUserNotificationPreferences(userId);
  if (typeof window === 'undefined' || !userId || isEmergencyOfflineMode()) {
    return localPrefs;
  }

  const supabase = getSupabaseClient();
  if (!supabase) return localPrefs;

  const uid = normalizeUserId(userId);
  const audioKey = getNotifAudioSupabaseKey(userId);

  try {
    const [prefsRes, audioRes] = await Promise.all([
      withAbortableTimeout<any>(
        (signal) =>
          supabase
            .from('fenix_kv_store')
            .select('data')
            .eq('key', NOTIFICACOES_CONFIG_SUPABASE_KEY)
            .abortSignal(signal)
            .maybeSingle(),
        12000,
        'Tempo limite ao carregar preferências de notificação.'
      ).catch(() => null),
      withAbortableTimeout<any>(
        (signal) =>
          supabase
            .from('fenix_kv_store')
            .select('data')
            .eq('key', audioKey)
            .abortSignal(signal)
            .maybeSingle(),
        15000,
        'Tempo limite ao carregar áudios personalizados.'
      ).catch(() => null),
    ]);

    let resolvedEntryFromV2 = false;
    if (prefsRes?.data?.data) {
      let parsedMap = prefsRes.data.data;
      if (typeof parsedMap === 'string') {
        try {
          parsedMap = JSON.parse(parsedMap);
        } catch {}
      }
      if (parsedMap && typeof parsedMap === 'object' && !Array.isArray(parsedMap)) {
        const localMap = readNotifConfigMapLocal();
        const mergedMap: Record<string, StoredNotifPrefsEntry> = { ...parsedMap };
        for (const [k, v] of Object.entries(localMap)) {
          const cur = mergedMap[k];
          const locTs = Date.parse(v?.updatedAt || '') || 0;
          const remTs = Date.parse(cur?.updatedAt || '') || 0;
          if (!cur || locTs > remTs) {
            mergedMap[k] = v;
          }
        }
        if (mergedMap[uid] || mergedMap[userId]) {
          resolvedEntryFromV2 = true;
        }
        setLocalCollectionSafe(NOTIFICACOES_CONFIG_SUPABASE_KEY, mergedMap);
        hydrateNotifPrefsMapFromRemote(mergedMap);
      }
    }

    if (!resolvedEntryFromV2) {
      const legacyRes = await withAbortableTimeout<any>(
        (signal) =>
          supabase
            .from('fenix_kv_store')
            .select('data')
            .eq('key', `fenix_notif_prefs_${userId}`)
            .abortSignal(signal)
            .maybeSingle(),
        8000,
        'Tempo limite ao verificar preferências legadas.'
      ).catch(() => null);
      if (legacyRes?.data?.data && typeof legacyRes.data.data === 'object') {
        mirrorUserPrefsToLocal(uid, userId, legacyRes.data.data as StoredNotifPrefsEntry);
        window.dispatchEvent(new CustomEvent('fenix_notif_prefs_updated'));
      }
    }

    if (audioRes?.data?.data) {
      let audioPayload = audioRes.data.data;
      if (typeof audioPayload === 'string') {
        try {
          audioPayload = JSON.parse(audioPayload);
        } catch {}
      }
      if (audioPayload && typeof audioPayload === 'object') {
        try {
          if (audioPayload.general && audioPayload.general.dataUrl) {
            localStorage.setItem(
              `${CUSTOM_AUDIO_GENERAL_PREFIX}${uid}`,
              JSON.stringify(audioPayload.general)
            );
          } else if (audioPayload.general === null) {
            localStorage.removeItem(`${CUSTOM_AUDIO_GENERAL_PREFIX}${uid}`);
          }

          if (audioPayload.categories && typeof audioPayload.categories === 'object') {
            const cats: NotificationCategoryType[] = [
              'tarefas',
              'boletos',
              'followup',
              'metas',
              'estoque',
              'tabelas',
              'notas',
              'pendencias',
              'posvendas',
              'outras',
            ];
            for (const c of cats) {
              const item = audioPayload.categories[c];
              const k = `${CUSTOM_AUDIO_PREFIX}${uid}_${c}`;
              if (item && item.dataUrl) {
                localStorage.setItem(k, JSON.stringify(item));
              } else if (audioPayload.categories && !(c in audioPayload.categories)) {
                localStorage.removeItem(k);
              }
            }
          }
          window.dispatchEvent(new CustomEvent('fenix_custom_audio_updated'));
        } catch (err) {
          console.warn('Aviso ao hidratar áudios personalizados localmente:', err);
        }
      }
    }
  } catch (err) {
    console.warn('Aviso ao carregar preferências de notificação do Supabase:', err);
  }

  return getUserNotificationPreferences(userId);
}

/**
 * Retorna se o momento atual está dentro do horário de notificações configurado.
 */
export function isWithinNotificationSchedule(prefs: UserNotificationPreferences): boolean {
  if (!prefs.scheduleEnabled) return true;
  const startTime = prefs.scheduleStartTime || '08:00';
  const endTime = prefs.scheduleEndTime || '19:00';

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = (isNaN(startH) ? 8 : startH) * 60 + (isNaN(startM) ? 0 : startM);
  const endMinutes = (isNaN(endH) ? 19 : endH) * 60 + (isNaN(endM) ? 0 : endM);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Horário que cruza meia-noite (ex: 22:00 às 07:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

/**
 * Solicita permissão do navegador para notificações externas nativas (Web / PWA)
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  if (Notification.permission === 'denied') {
    return 'denied';
  }
  try {
    const req = Notification.requestPermission();
    if (req && typeof (req as any).then === 'function') {
      const res = await req;
      return res;
    }
    return await new Promise<NotificationPermission>((resolve) => {
      Notification.requestPermission((perm) => resolve(perm));
    });
  } catch (err) {
    console.warn('Erro ao solicitar permissão de notificação:', err);
    return typeof Notification !== 'undefined' ? Notification.permission : 'denied';
  }
}

/**
 * Dispara uma notificação externa no dispositivo (Computador, Celular/PWA via Web Notification API)
 * Ao clicar na notificação, foca a janela e abre o item/aba relacionado diretamente.
 */
export async function sendExternalNotification(
  title: string,
  options: {
    body: string;
    icon?: string;
    tag?: string;
    targetTab?: string;
    metadata?: any;
  }
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const notifOptions: NotificationOptions = {
    body: options.body,
    icon: options.icon || '/favicon.png',
    badge: '/favicon-32x32.png',
    tag: options.tag || `fenix_${Date.now()}`,
    data: {
      targetTab: options.targetTab,
      metadata: options.metadata,
    },
  };

  // 1. Tentar via Service Worker (necessário em Android Chrome, PWA e útil em segundo plano)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((res) => setTimeout(() => res(null), 800)),
      ]);
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, notifOptions);
        return true;
      }
    } catch (swErr) {
      console.warn('Tentando fallback nativo após falha do ServiceWorker:', swErr);
    }
  }

  // 2. Construtor nativo Notification (Desktop Chrome, Edge, Safari, Firefox)
  try {
    const notif = new Notification(title, notifOptions);
    notif.onclick = () => {
      try {
        window.focus();
      } catch {}
      try {
        if (options.targetTab) {
          window.dispatchEvent(
            new CustomEvent('fenix_open_tab', {
              detail: {
                tab: options.targetTab,
                metadata: options.metadata,
              },
            })
          );
        }
      } catch {}
      try {
        notif.close();
      } catch {}
    };
    return true;
  } catch (err) {
    console.warn('Aviso: Não foi possível disparar notificação externa:', err);
    return false;
  }
}

/**
 * Retorna o áudio personalizado padrão (geral) do usuário
 */
export function getCustomAudioGeneral(userId: string): CustomAudioSound | null {
  if (typeof window === 'undefined') return null;
  const uid = normalizeUserId(userId);
  try {
    const raw = localStorage.getItem(`${CUSTOM_AUDIO_GENERAL_PREFIX}${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.dataUrl) return parsed;
    }
  } catch {}
  return null;
}

/**
 * Salva o áudio personalizado padrão (geral) do usuário
 */
export function saveCustomAudioGeneral(userId: string, audio: CustomAudioSound): void {
  if (typeof window === 'undefined') return;
  const uid = normalizeUserId(userId);
  try {
    localStorage.setItem(`${CUSTOM_AUDIO_GENERAL_PREFIX}${uid}`, JSON.stringify(audio));
    window.dispatchEvent(new CustomEvent('fenix_custom_audio_updated'));
    syncUserCustomAudiosToSupabase(userId).catch(() => {});
  } catch (err) {
    console.error('Erro ao salvar áudio padrão do usuário:', err);
  }
}

/**
 * Remove o áudio personalizado padrão (geral) do usuário
 */
export function removeCustomAudioGeneral(userId: string): void {
  if (typeof window === 'undefined') return;
  const uid = normalizeUserId(userId);
  try {
    localStorage.removeItem(`${CUSTOM_AUDIO_GENERAL_PREFIX}${uid}`);
    window.dispatchEvent(new CustomEvent('fenix_custom_audio_updated'));
    syncUserCustomAudiosToSupabase(userId).catch(() => {});
  } catch (err) {
    console.error('Erro ao remover áudio padrão do usuário:', err);
  }
}

/**
 * Valida se o arquivo é um formato de áudio aceito (MP3, WAV, M4A, OGG) e se o tamanho é adequado.
 */
export function validateAudioFile(file: File): { valid: boolean; format?: string; error?: string } {
  if (!file) {
    return { valid: false, error: 'Nenhum arquivo selecionado.' };
  }

  const name = file.name.toLowerCase();
  const ext = name.split('.').pop() || '';
  const validExtensions = ['mp3', 'wav', 'm4a', 'ogg'];

  const type = (file.type || '').toLowerCase();
  const isAudioType =
    type.includes('audio') ||
    type.includes('mpeg') ||
    type.includes('wav') ||
    type.includes('ogg') ||
    type.includes('mp4') ||
    type.includes('aac');

  if (!validExtensions.includes(ext) && !isAudioType) {
    return {
      valid: false,
      error: 'Formato inválido. Por favor, envie um arquivo nos formatos MP3, WAV, M4A ou OGG.',
    };
  }

  // Limite de 5MB para áudio de notificação para garantir fluidez e persistência confiável
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return {
      valid: false,
      error: `O arquivo possui ${(file.size / (1024 * 1024)).toFixed(1)}MB. O limite máximo permitido para toques é de 5MB.`,
    };
  }

  const detectedFormat = (ext || type.split('/')[1] || 'audio').toUpperCase();
  return { valid: true, format: detectedFormat };
}

/**
 * Converte um arquivo de áudio (File) em Data URL base64
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Falha ao processar arquivo de áudio'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

/**
 * Retorna o áudio personalizado configurado para uma categoria específica do usuário (se houver).
 * Rigorosamente INDIVIDUAL por usuário: a música escolhida por um usuário não altera nem interfere nos outros.
 */
export function getCustomAudioForCategory(
  userId: string,
  category: NotificationCategoryType
): CustomAudioSound | null {
  if (typeof window === 'undefined') return null;
  const uid = normalizeUserId(userId);
  const rawUid = (userId || '').trim();

  // 1. Tentar ler do storage dedicado por categoria usando uid normalizado
  try {
    const raw = localStorage.getItem(`${CUSTOM_AUDIO_PREFIX}${uid}_${category}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.dataUrl) return parsed;
    }
  } catch {}

  // 2. Se não encontrou, tentar com rawUid
  if (rawUid && rawUid !== uid) {
    try {
      const raw = localStorage.getItem(`${CUSTOM_AUDIO_PREFIX}${rawUid}_${category}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.dataUrl) return parsed;
      }
    } catch {}
  }

  // 3. Tentar ler do objeto de preferências do usuário específico
  try {
    const prefs = getUserNotificationPreferences(userId);
    if (prefs?.customAudioPerType?.[category]?.dataUrl) {
      return prefs.customAudioPerType[category] as CustomAudioSound;
    }
  } catch {}

  // IMPORTANTE: NÃO há fallback para 'default' ou outros usuários.
  // Cada usuário visualiza e ouve somente suas próprias configurações, mantendo o padrão se não personalizou.
  return null;
}

/**
 * Salva o áudio personalizado para uma categoria específica do usuário
 */
export function saveCustomAudioForCategory(
  userId: string,
  category: NotificationCategoryType,
  customAudio: CustomAudioSound
): void {
  if (typeof window === 'undefined') return;
  const uid = normalizeUserId(userId);

  try {
    // 1. Armazena no storage dedicado para acesso rápido e isolado por usuário
    localStorage.setItem(
      `${CUSTOM_AUDIO_PREFIX}${uid}_${category}`,
      JSON.stringify(customAudio)
    );

    // 2. Atualiza o objeto de preferências do usuário
    const prefs = getUserNotificationPreferences(userId);
    const updatedCustomAudio: Partial<Record<NotificationCategoryType, CustomAudioSound>> = {
      ...(prefs.customAudioPerType || {}),
      [category]: customAudio,
    };
    saveUserNotificationPreferences({
      ...prefs,
      userId,
      customAudioPerType: updatedCustomAudio,
    });

    window.dispatchEvent(
      new CustomEvent('fenix_custom_audio_updated', {
        detail: { userId, normalizedUserId: uid, category, customAudio },
      })
    );
    syncUserCustomAudiosToSupabase(userId).catch(() => {});
  } catch (err) {
    console.error('Erro ao salvar áudio personalizado:', err);
  }
}

/**
 * Remove o áudio personalizado e restaura o som padrão do sistema para a categoria
 */
export function removeCustomAudioForCategory(
  userId: string,
  category: NotificationCategoryType
): void {
  if (typeof window === 'undefined') return;
  const uid = normalizeUserId(userId);
  const rawUid = (userId || '').trim();

  try {
    localStorage.removeItem(`${CUSTOM_AUDIO_PREFIX}${uid}_${category}`);
    if (rawUid && rawUid !== uid) {
      localStorage.removeItem(`${CUSTOM_AUDIO_PREFIX}${rawUid}_${category}`);
    }

    const prefs = getUserNotificationPreferences(userId);
    if (prefs.customAudioPerType && prefs.customAudioPerType[category]) {
      const updated = { ...prefs.customAudioPerType };
      delete updated[category];
      saveUserNotificationPreferences({
        ...prefs,
        userId,
        customAudioPerType: updated,
      });
    }

    window.dispatchEvent(
      new CustomEvent('fenix_custom_audio_updated', {
        detail: { userId, normalizedUserId: uid, category, customAudio: null },
      })
    );
    syncUserCustomAudiosToSupabase(userId).catch(() => {});
  } catch (err) {
    console.error('Erro ao remover áudio personalizado:', err);
  }
}

/**
 * Obtém todos os áudios personalizados do usuário
 */
export function getAllCustomAudioForUser(
  userId: string
): Partial<Record<NotificationCategoryType, CustomAudioSound>> {
  const result: Partial<Record<NotificationCategoryType, CustomAudioSound>> = {};
  const categories: NotificationCategoryType[] = [
    'tarefas',
    'boletos',
    'followup',
    'metas',
    'estoque',
    'tabelas',
    'notas',
    'pendencias',
    'posvendas',
    'outras',
  ];

  for (const cat of categories) {
    const audio = getCustomAudioForCategory(userId, cat);
    if (audio) {
      result[cat] = audio;
    }
  }

  return result;
}

/**
 * Obtém as preferências salvas do usuário atual (ou padrão)
 */
export function getUserNotificationPreferences(userId: string): UserNotificationPreferences {
  if (typeof window === 'undefined' || !userId) {
    return { userId: userId || 'default', ...DEFAULT_NOTIF_PREFS };
  }

  const uid = normalizeUserId(userId);
  try {
    const raw =
      localStorage.getItem(`${STORAGE_PREFIX}${userId}`) ||
      localStorage.getItem(`${STORAGE_PREFIX}${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return normalizePrefsObject(userId, parsed);
    }

    const configMap = readNotifConfigMapLocal();
    const mapped = configMap[uid] || configMap[userId];
    if (mapped) {
      return normalizePrefsObject(userId, mapped);
    }
  } catch (err) {
    console.warn('Erro ao ler preferências de notificação:', err);
  }

  return { userId, ...DEFAULT_NOTIF_PREFS };
}

/**
 * Salva as preferências no LocalStorage e sincroniza com o Supabase (fenix_kv_store)
 */
export async function saveUserNotificationPreferences(
  userIdOrPrefs: string | UserNotificationPreferences,
  optionalPrefs?: UserNotificationPreferences
): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined') return { success: true };

  const prefs: UserNotificationPreferences =
    typeof userIdOrPrefs === 'string' && optionalPrefs
      ? { ...optionalPrefs, userId: userIdOrPrefs }
      : (userIdOrPrefs as UserNotificationPreferences);

  const uid = normalizeUserId(prefs.userId);
  const nowIso = new Date().toISOString();

  try {
    const prefsWithTs: StoredNotifPrefsEntry = { ...prefs, updatedAt: nowIso };
    const serialized = JSON.stringify(prefsWithTs);
    localStorage.setItem(`${STORAGE_PREFIX}${prefs.userId}`, serialized);
    localStorage.setItem(`${STORAGE_PREFIX}${uid}`, serialized);

    const localMap = readNotifConfigMapLocal();
    localMap[uid] = buildCompactNotifPrefsForRemote(prefs, nowIso);
    setLocalCollectionSafe(NOTIFICACOES_CONFIG_SUPABASE_KEY, localMap);

    window.dispatchEvent(new CustomEvent('fenix_notif_prefs_updated', { detail: prefs }));

    // Sincronizar com o Supabase fenix_kv_store (somente quando não estiver em modo emergencial offline)
    const supabase = getSupabaseClient();
    if (supabase && !isEmergencyOfflineMode()) {
      await enqueueCollectionWrite(NOTIFICACOES_CONFIG_SUPABASE_KEY, async () => {
        try {
          const { data: remoteRow } = await withAbortableTimeout<any>(
            (signal) =>
              supabase
                .from('fenix_kv_store')
                .select('data')
                .eq('key', NOTIFICACOES_CONFIG_SUPABASE_KEY)
                .abortSignal(signal)
                .maybeSingle(),
            10000,
            'Tempo limite ao consultar preferências de notificação.'
          ).catch(() => ({ data: null }));

          let baseMap: Record<string, StoredNotifPrefsEntry> = {};
          if (remoteRow?.data) {
            const parsedRemote =
              typeof remoteRow.data === 'string' ? JSON.parse(remoteRow.data) : remoteRow.data;
            if (parsedRemote && typeof parsedRemote === 'object' && !Array.isArray(parsedRemote)) {
              baseMap = parsedRemote;
            }
          }

          const mergedMap: Record<string, StoredNotifPrefsEntry> = {
            ...baseMap,
            ...readNotifConfigMapLocal(),
            [uid]: buildCompactNotifPrefsForRemote(prefs, nowIso),
          };

          recordSelfSave(NOTIFICACOES_CONFIG_SUPABASE_KEY, nowIso);
          const { error: upsertErr } = await withAbortableTimeout<any>(
            (signal) =>
              supabase
                .from('fenix_kv_store')
                .upsert(
                  {
                    key: NOTIFICACOES_CONFIG_SUPABASE_KEY,
                    data: mergedMap,
                    updated_at: nowIso,
                    updated_by: prefs.userId || 'Usuário Fênix',
                  },
                  { onConflict: 'key' }
                )
                .select('updated_at')
                .abortSignal(signal)
                .maybeSingle(),
            12000,
            'Tempo limite ao salvar preferências de notificação no Supabase.'
          );

          if (!upsertErr) {
            setLocalCollectionSafe(NOTIFICACOES_CONFIG_SUPABASE_KEY, mergedMap);
          } else {
            console.warn('Aviso: falha ao salvar preferências no Supabase:', upsertErr);
          }
        } catch (sbErr) {
          console.warn('Aviso: Supabase preferences sync em fallback local:', sbErr);
        }
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Erro ao salvar preferências de notificação:', err);
    return { success: false, error: err?.message || 'Falha ao salvar' };
  }
}

// Instância de áudio em reprodução para controle de prévia
let currentPreviewAudio: HTMLAudioElement | null = null;
let currentPreviewStopFn: (() => void) | null = null;

/**
 * Interrompe a prévia de áudio atual se estiver tocando
 */
export function stopAudioPreview(): void {
  if (currentPreviewStopFn) {
    try {
      currentPreviewStopFn();
    } catch {}
    currentPreviewStopFn = null;
  }
  if (currentPreviewAudio) {
    try {
      currentPreviewAudio.pause();
      currentPreviewAudio.currentTime = 0;
    } catch {}
    currentPreviewAudio = null;
  }
}

/**
 * Reproduz o trecho desejado na linha do tempo com a duração configurada.
 * Toca RIGOROSAMENTE uma única vez, sem loop.
 */
export function playAudioSnippet(
  dataUrl: string,
  startTime: number = 0,
  duration: number = 5,
  volumePercent: number = 80,
  onEnd?: () => void,
  onTimeUpdate?: (currentTime: number, progressPct: number) => void
): { audio: HTMLAudioElement; stop: () => void } | null {
  if (typeof window === 'undefined' || !dataUrl) return null;

  try {
    // Interrompe prévia anterior se ainda estiver tocando
    stopAudioPreview();

    const audio = new Audio();
    audio.src = dataUrl;
    audio.loop = false; // Toca UMA ÚNICA VEZ, SEM LOOP
    const normalizedVol = Math.max(0, Math.min(100, volumePercent)) / 100;
    audio.volume = normalizedVol;

    let stopTimer: any = null;
    let isStopped = false;

    const stop = () => {
      if (isStopped) return;
      isStopped = true;
      if (stopTimer) {
        clearTimeout(stopTimer);
        stopTimer = null;
      }
      try {
        audio.pause();
      } catch {}
      if (currentPreviewAudio === audio) {
        currentPreviewAudio = null;
        currentPreviewStopFn = null;
      }
      if (onEnd) onEnd();
    };

    audio.onloadedmetadata = () => {
      if (isStopped) return;
      const safeStart = Math.max(0, startTime);
      audio.currentTime = safeStart;
    };

    audio.ontimeupdate = () => {
      if (isStopped) return;
      const current = audio.currentTime;
      const elapsed = Math.max(0, current - startTime);
      const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 0;
      if (onTimeUpdate) {
        onTimeUpdate(current, progress);
      }
      if (elapsed >= duration || (audio.duration && current >= audio.duration)) {
        stop();
      }
    };

    audio.onended = () => {
      stop();
    };

    audio.play().then(() => {
      if (isStopped) return;
      // Garante parada estrita mesmo se ontimeupdate tiver delay
      const durationMs = Math.max(500, Math.round(duration * 1000 + 150));
      stopTimer = setTimeout(stop, durationMs);
    }).catch((err) => {
      console.warn('Aviso: Reprodução prevenida pelo navegador ou erro no arquivo:', err);
      stop();
    });

    currentPreviewAudio = audio;
    currentPreviewStopFn = stop;

    return { audio, stop };
  } catch (err) {
    console.error('Erro ao reproduzir trecho de áudio:', err);
    return null;
  }
}

/**
 * Reproduz o trecho do áudio para alertas do sistema em background.
 * Totalmente isolado do player de prévia da interface e toca UMA ÚNICA VEZ SEM LOOP.
 */
export function playNotificationAudioSnippet(
  dataUrl: string,
  startTime: number = 0,
  duration: number = 5,
  volumePercent: number = 80
): void {
  if (typeof window === 'undefined' || !dataUrl) return;

  try {
    const audio = new Audio();
    audio.src = dataUrl;
    audio.loop = false; // Toca uma única vez, sem loop
    audio.volume = Math.max(0, Math.min(100, volumePercent)) / 100;

    let isStopped = false;
    let timer: any = null;

    const stop = () => {
      if (isStopped) return;
      isStopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        audio.pause();
      } catch {}
    };

    audio.onloadedmetadata = () => {
      if (isStopped) return;
      audio.currentTime = Math.max(0, startTime);
    };

    audio.ontimeupdate = () => {
      if (isStopped) return;
      const elapsed = audio.currentTime - startTime;
      if (elapsed >= duration || (audio.duration && audio.currentTime >= audio.duration)) {
        stop();
      }
    };

    audio.onended = () => stop();

    audio.play().then(() => {
      if (isStopped) return;
      const durationMs = Math.max(500, Math.round(duration * 1000 + 200));
      timer = setTimeout(stop, durationMs);
    }).catch((err) => {
      console.warn('Alerta sonoro de notificação prevenido:', err);
      stop();
    });
  } catch (err) {
    console.warn('Erro ao instanciar áudio de notificação:', err);
  }
}

/**
 * Reproduz uma prévia de áudio completa (Data URL) e retorna o elemento de áudio criado para controle
 */
export function playAudioDataUrl(
  dataUrl: string,
  volumePercent: number = 80
): HTMLAudioElement | null {
  const result = playAudioSnippet(dataUrl, 0, 10, volumePercent);
  return result ? result.audio : null;
}

/**
 * Toca o som de notificação personalizado configurado para o usuário
 */
export function playUserCustomSound(userId: string) {
  const prefs = getUserNotificationPreferences(userId);
  if (prefs.enabled === false) return;
  if (!isWithinNotificationSchedule(prefs)) return;
  if (prefs.volumePercent <= 0) return;

  // Verifica se há som customizado geral ou em 'outras'
  const customGeneral = getCustomAudioGeneral(userId) || getCustomAudioForCategory(userId, 'outras');
  if (customGeneral?.dataUrl) {
    const start = customGeneral.startTime || 0;
    const dur = customGeneral.duration || 5;
    playNotificationAudioSnippet(customGeneral.dataUrl, start, dur, prefs.volumePercent);
    return;
  }

  playNotificationSound(prefs.soundType, prefs.volumePercent);
}

/**
 * Normaliza qualquer chave ou string de categoria do CRM para a chave padronizada
 */
export function normalizeCategoryKey(category: string): NotificationCategoryType {
  const c = (category || '').toLowerCase().trim();
  if (
    c === 'pós-vendas' ||
    c === 'pos-vendas' ||
    c === 'pós vendas' ||
    c === 'pos vendas' ||
    c === 'posvendas'
  ) {
    return 'posvendas';
  }
  if (c === 'follow-up' || c === 'followup' || c === 'follow_up') {
    return 'followup';
  }
  if (c === 'tarefas' || c === 'tarefa' || c === 'agenda') {
    return 'tarefas';
  }
  if (c === 'boletos' || c === 'boleto' || c === 'financeiro') {
    return 'boletos';
  }
  if (c === 'metas' || c === 'meta') {
    return 'metas';
  }
  if (c === 'estoque' || c === 'materiais' || c === 'controle de estoque') {
    return 'estoque';
  }
  if (c === 'notas' || c === 'nota') {
    return 'notas';
  }
  if (c === 'pendências' || c === 'pendencias' || c === 'pendencia') {
    return 'pendencias';
  }
  if (c === 'tabelas' || c === 'tabela' || c === 'tabela comercial' || c === 'tabela de revenda' || c === 'revenda') {
    return 'tabelas';
  }
  return 'outras';
}

// Debounce para evitar reproduções sonoras duplicadas em chamadas quase instantâneas
let lastSoundPlayTime = 0;
let lastSoundKey = '';

/**
 * Toca o som de notificação específico para a categoria/tipo de notificação do usuário.
 * Rigorosamente INDIVIDUAL por usuário. Toca uma única vez, sem loop.
 * Prioriza o trecho personalizado (MP3, WAV, M4A, OGG) configurado pelo usuário.
 * Se não houver arquivo, utiliza o som padrão sintetizado configurado.
 */
export function playUserCustomSoundForCategory(
  userId: string,
  category: NotificationCategoryType | string
) {
  const normalizedCat = normalizeCategoryKey(category);
  const now = Date.now();
  const soundKey = `${userId}_${normalizedCat}`;

  // Se chamado para o mesmo usuário e categoria nos últimos 400ms, ignora duplicata
  if (soundKey === lastSoundKey && now - lastSoundPlayTime < 400) {
    return;
  }
  lastSoundPlayTime = now;
  lastSoundKey = soundKey;

  const prefs = getUserNotificationPreferences(userId);

  // Se notificações gerais no dispositivo estiverem desligadas
  if (prefs.enabled === false) {
    return;
  }

  // Se estiver fora do horário configurado
  if (!isWithinNotificationSchedule(prefs)) {
    return;
  }

  // Volume individual para a categoria (se configurado), senão volume geral
  const catVolume = prefs.volumesPerType?.[normalizedCat] ?? prefs.volumePercent;
  const volume = typeof catVolume === 'number' ? catVolume : 85;

  if (volume <= 0) {
    return; // Silenciado
  }

  // Se o som/alerta estiver explicitamente desativado pelo usuário nesta categoria (exceto pendências que padrão é ativo)
  if (prefs.alerts && typeof (prefs.alerts as any)[normalizedCat] === 'boolean') {
    if ((prefs.alerts as any)[normalizedCat] === false) {
      return;
    }
  }

  // 1. Tentar tocar o áudio customizado específico da categoria configurado por ESTE usuário
  const customAudio = getCustomAudioForCategory(userId, normalizedCat);
  if (customAudio?.dataUrl) {
    const startTime = typeof customAudio.startTime === 'number' ? Math.max(0, customAudio.startTime) : 0;
    const duration = typeof customAudio.duration === 'number' && customAudio.duration > 0 ? customAudio.duration : 5;

    playNotificationAudioSnippet(customAudio.dataUrl, startTime, duration, volume);
    return;
  }

  // 2. Se houver som específico configurado para a categoria
  const specificSound =
    prefs.soundsPerType?.[normalizedCat] ||
    DEFAULT_SOUNDS_PER_TYPE[normalizedCat];

  if (specificSound) {
    playNotificationSound(specificSound, volume);
    return;
  }

  // 3. Fallback: áudio geral do usuário ou som padrão
  const customGeneral = getCustomAudioGeneral(userId) || getCustomAudioForCategory(userId, 'outras');
  if (customGeneral?.dataUrl) {
    const startTime = typeof customGeneral.startTime === 'number' ? Math.max(0, customGeneral.startTime) : 0;
    const duration = typeof customGeneral.duration === 'number' && customGeneral.duration > 0 ? customGeneral.duration : 5;
    playNotificationAudioSnippet(customGeneral.dataUrl, startTime, duration, volume);
    return;
  }

  playNotificationSound(prefs.soundType || 'Campainha Corporativa (Longa)', volume);
}

/**
 * Verifica se um alerta específico de categoria está ativado para o usuário
 */
export function isAlertCategoryEnabled(
  userId: string,
  category: 'pendencias' | 'notas' | 'tarefas' | 'followup' | 'boletos' | 'metas' | 'estoque' | 'tabelas'
): boolean {
  const prefs = getUserNotificationPreferences(userId);
  return (prefs.alerts as any)[category] ?? true;
}

/**
 * Utilitário de deduplicação periódica de marcos de meta.
 * Cada percentual deve disparar a notificação somente UMA VEZ no período correspondente.
 */
export function checkAndRegisterMetaAlert(
  userId: string,
  period: 'diaria' | 'semanal' | 'mensal',
  milestone: 50 | 75 | 100
): boolean {
  if (typeof window === 'undefined') return false;

  const prefs = getUserNotificationPreferences(userId);
  if (!prefs.alerts.metas) return false;

  const pctKey = `pct${milestone}` as 'pct50' | 'pct75' | 'pct100';
  if (!prefs.metaAlerts[period][pctKey]) return false;

  const now = new Date();
  let periodKey = '';

  if (period === 'diaria') {
    // Ex: 2026-09-18
    periodKey = now.toISOString().slice(0, 10);
  } else if (period === 'semanal') {
    // Ano + semana do ano
    const oneJan = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((now.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
    periodKey = `${now.getFullYear()}_W${weekNum}`;
  } else {
    // Ex: 2026-09
    periodKey = `${now.getFullYear()}_M${now.getMonth() + 1}`;
  }

  const storageKey = `${DEDUPLICATION_PREFIX}${userId}_${period}_${periodKey}_${milestone}`;
  const alreadyFired = localStorage.getItem(storageKey);

  if (alreadyFired) {
    return false; // Já disparou neste período
  }

  // Marca como disparado
  try {
    localStorage.setItem(storageKey, new Date().toISOString());
  } catch {}

  return true; // Pode disparar a notificação
}
