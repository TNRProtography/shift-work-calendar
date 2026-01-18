
import { AppSettings, ShiftTemplate } from './types';

export const DEFAULT_TEMPLATES: ShiftTemplate[] = [
  {
    id: 't-am',
    name: 'AM Shift',
    type: 'AM',
    startTime: '06:45',
    endTime: '15:15',
    icon: '🌅',
    color: 'bg-amber-100 text-amber-700 border-amber-200'
  },
  {
    id: 't-pm',
    name: 'PM Shift',
    type: 'PM',
    startTime: '14:45',
    endTime: '23:15',
    icon: '🌇',
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200'
  },
  {
    id: 't-night',
    name: 'Night Shift',
    type: 'Night',
    startTime: '22:45',
    endTime: '06:15',
    icon: '🌙',
    color: 'bg-slate-800 text-slate-100 border-slate-700'
  },
  {
    id: 't-sick',
    name: 'Sick Leave',
    type: 'Sick',
    startTime: '00:00',
    endTime: '23:59',
    icon: '🤒',
    color: 'bg-rose-100 text-rose-700 border-rose-200'
  },
  {
    id: 't-annual',
    name: 'Annual Leave',
    type: 'Annual',
    startTime: '00:00',
    endTime: '23:59',
    icon: '🌴',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200'
  }
];

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const DEFAULT_SETTINGS: AppSettings = {
  darkMode: false,
  skin: 'default',
  weekStartsOnMonday: false,
  highlightWeekends: true,
  compactMode: false,
  reduceMotion: false
};
