
import { ShiftEntry, ShiftTemplate } from '../types';

const STORAGE_KEY_SHIFTS = 'shiftflow_entries_v1';
const STORAGE_KEY_TEMPLATES = 'shiftflow_templates_v1';

/**
 * Service to handle data persistence.
 * Designed to be easily swapped with Cloudflare KV fetch calls.
 */
export const StorageService = {
  saveShifts: (shifts: ShiftEntry[]) => {
    localStorage.setItem(STORAGE_KEY_SHIFTS, JSON.stringify(shifts));
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
