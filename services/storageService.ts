
import { ShiftEntry, ShiftTemplate } from '../types';

const STORAGE_KEY_SHIFTS = 'shiftflow_entries_v1';
const STORAGE_KEY_TEMPLATES = 'shiftflow_templates_v1';
const STORAGE_KEY_LAST_SYNC = 'shiftflow_last_sync_v1';
const KV_NAMESPACE = 'CAL_KV';

const persistLocal = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const fetchFromKV = async (key: string) => {
  try {
    const response = await fetch(`/api/kv?namespace=${KV_NAMESPACE}&key=${encodeURIComponent(key)}`);
    if (!response.ok) return null;
    const text = await response.text();
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'value' in parsed) {
      return (parsed as { value: unknown }).value;
    }
    return parsed;
  } catch {
    return null;
  }
};

const persistToKV = (key: string, value: unknown) => {
  void fetch('/api/kv', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ namespace: KV_NAMESPACE, key, value })
  }).catch(() => null);
};

const setLastSynced = (timestamp: string) => {
  localStorage.setItem(STORAGE_KEY_LAST_SYNC, timestamp);
};

/**
 * Service to handle data persistence.
 * Designed to be easily swapped with Cloudflare KV fetch calls.
 */
export const StorageService = {
  saveShifts: (shifts: ShiftEntry[]) => {
    persistLocal(STORAGE_KEY_SHIFTS, shifts);
    persistToKV(STORAGE_KEY_SHIFTS, shifts);
  },
  
  getShifts: (): ShiftEntry[] => {
    const data = localStorage.getItem(STORAGE_KEY_SHIFTS);
    return data ? JSON.parse(data) : [];
  },

  saveTemplates: (templates: ShiftTemplate[]) => {
    persistLocal(STORAGE_KEY_TEMPLATES, templates);
    persistToKV(STORAGE_KEY_TEMPLATES, templates);
  },

  getTemplates: (defaults: ShiftTemplate[]): ShiftTemplate[] => {
    const data = localStorage.getItem(STORAGE_KEY_TEMPLATES);
    return data ? JSON.parse(data) : defaults;
  },

  getLastSynced: (): string | null => {
    return localStorage.getItem(STORAGE_KEY_LAST_SYNC);
  },

  pushToKV: (shifts: ShiftEntry[], templates: ShiftTemplate[]) => {
    persistToKV(STORAGE_KEY_SHIFTS, shifts);
    persistToKV(STORAGE_KEY_TEMPLATES, templates);
    setLastSynced(new Date().toISOString());
  },

  pullFromKV: async (defaults: ShiftTemplate[]) => {
    const [remoteShifts, remoteTemplates] = await Promise.all([
      fetchFromKV(STORAGE_KEY_SHIFTS),
      fetchFromKV(STORAGE_KEY_TEMPLATES)
    ]);

    const shifts = Array.isArray(remoteShifts) ? remoteShifts as ShiftEntry[] : [];
    const templates = Array.isArray(remoteTemplates) && remoteTemplates.length > 0
      ? remoteTemplates as ShiftTemplate[]
      : defaults;

    if (shifts.length === 0 && (!Array.isArray(remoteTemplates) || remoteTemplates.length === 0)) {
      return null;
    }

    persistLocal(STORAGE_KEY_SHIFTS, shifts);
    persistLocal(STORAGE_KEY_TEMPLATES, templates);
    setLastSynced(new Date().toISOString());
    return { shifts, templates };
  }
};
