import { ClientActivity, ClientRecord } from '../types';
import {
  getLocalCollectionSafe,
  pullCollectionFromSupabase,
  saveItemToSupabase,
  setLocalCollectionSafe,
} from './supabaseClient';

export const ACTIVITIES_STORAGE_KEY = 'fenix_activities_db';

/**
 * Loads all real activities for a specific client from persistent storage.
 * Organizes strictly from most recent to oldest.
 */
export function getClientActivities(
  clientId: string,
  client?: ClientRecord | null
): ClientActivity[] {
  let list: ClientActivity[] = [];
  try {
    const parsed = getLocalCollectionSafe<ClientActivity>(ACTIVITIES_STORAGE_KEY, []);
    const seen = new Set<string>();
    list = parsed.filter((item) => {
      if (!item || item.clientId !== clientId) return false;
      if (item.id) {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
      }
      return true;
    });
  } catch {
    list = [];
  }

  // Ensure the client's real initial registration event is represented if not already explicitly logged
  if (client && !list.some((a) => a.type === 'cadastro')) {
    const regDate = client.registeredAt ? new Date(client.registeredAt) : new Date();
    const validDate = isNaN(regDate.getTime()) ? new Date() : regDate;
    const dateFormatted = validDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const timeFormatted = validDate.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const regActivity: ClientActivity = {
      id: `act_reg_${client.id}`,
      clientId: client.id,
      type: 'cadastro',
      title: 'Cliente cadastrado no sistema',
      description: `Cadastro inicial realizado como ${client.clientType || 'Cliente'}.`,
      date: dateFormatted,
      time: timeFormatted,
      userName: client.registeredBy || 'Vanessa Gomes',
      relevantInfo: client.notes ? `Obs: ${client.notes}` : undefined,
      timestamp: validDate.getTime(),
    };
    list.push(regActivity);
  }

  // Strictly organize from most recent to oldest
  list.sort((a, b) => b.timestamp - a.timestamp);

  return list;
}

/**
 * Sincroniza o histórico de atividades com o Supabase para garantir visualização entre computadores.
 */
export async function syncClientActivitiesFromSupabase(): Promise<ClientActivity[]> {
  try {
    await pullCollectionFromSupabase(ACTIVITIES_STORAGE_KEY);
  } catch {
    // fallback para cache local já hidratado
  }
  return getLocalCollectionSafe<ClientActivity>(ACTIVITIES_STORAGE_KEY, []);
}

/**
 * Adds a new activity record to the persistent database linked to a specific client
 * and syncs it asynchronously to Supabase.
 */
export function addClientActivity(
  activity: Omit<ClientActivity, 'id' | 'timestamp'> & { timestamp?: number }
): ClientActivity {
  const now = new Date();
  const timestamp = activity.timestamp || now.getTime();
  const time =
    activity.time ||
    now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const resolvedUser =
    activity.userName ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('fenix_active_user_name') || localStorage.getItem('fenix_saved_username')
      : null) ||
    'Usuário Fênix';

  const newActivity: ClientActivity = {
    ...activity,
    userName: resolvedUser,
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    time,
    timestamp,
  };

  try {
    const currentList = getLocalCollectionSafe<ClientActivity>(ACTIVITIES_STORAGE_KEY, []);
    const nextList = [newActivity, ...currentList.filter((a) => a && a.id !== newActivity.id)];
    setLocalCollectionSafe(ACTIVITIES_STORAGE_KEY, nextList);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fenix_activities_updated', {
          detail: { clientId: activity.clientId },
        })
      );
    }

    saveItemToSupabase(ACTIVITIES_STORAGE_KEY, newActivity, 'id', resolvedUser).catch((err) => {
      console.warn('Aviso ao sincronizar atividade no Supabase:', err);
    });
  } catch (err) {
    console.error('Error saving activity:', err);
  }

  return newActivity;
}
