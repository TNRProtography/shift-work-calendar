
import { ShiftEntry, ShiftTemplate } from '../types';

const STORAGE_KEY_SHIFTS = 'shiftflow_entries_v1';
const STORAGE_KEY_TEMPLATES = 'shiftflow_templates_v1';
const KV_NAMESPACE = 'CAL_KV';

const persistToKV = (key: string, value: unknown) => {
  void fetch('/api/kv', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ namespace: KV_NAMESPACE, key, value })
  }).catch(() => null);
};

/**
 * Service to handle data persistence.
 * Designed to be easily swapped with Cloudflare KV fetch calls.
 */
export const StorageService = {
  saveShifts: (shifts: ShiftEntry[]) => {
    localStorage.setItem(STORAGE_KEY_SHIFTS, JSON.stringify(shifts));
    persistToKV(STORAGE_KEY_SHIFTS, shifts);
  },
  
  getShifts: (): ShiftEntry[] => {
    const data = localStorage.getItem(STORAGE_KEY_SHIFTS);
    return data ? JSON.parse(data) : [];
  },

  saveTemplates: (templates: ShiftTemplate[]) => {
    localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(templates));
  },

  getTemplates: (defaults: ShiftTemplate[]): ShiftTemplate[] => {
    const data = localStorage.getItem(STORAGE_KEY_TEMPLATES);
    return data ? JSON.parse(data) : defaults;
  }
};
