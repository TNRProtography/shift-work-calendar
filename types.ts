
export type ShiftType = 'AM' | 'PM' | 'Night' | 'Sick' | 'Annual' | 'Custom';

export interface ShiftTemplate {
  id: string;
  name: string;
  type: ShiftType;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  icon: string;
  color: string;
}

export type ExtraHoursType = 'none' | 'before' | 'after';

export interface ShiftEntry {
  id: string;
  templateId: string;
  date: string; // ISO String (YYYY-MM-DD)
  isSwapped: boolean;
  swappedWith?: string;
  extraHours: ExtraHoursType;
  note?: string;
}

export type ViewType = 'Month' | 'Week' | 'List';

export interface AppState {
  shifts: ShiftEntry[];
  templates: ShiftTemplate[];
  selectedDate: string;
  view: ViewType;
}

export type SkinTheme = 'default' | 'sunflower' | 'black-dog' | 'nursing';

export interface AppSettings {
  darkMode: boolean;
  skin: SkinTheme;
  weekStartsOnMonday: boolean;
  highlightWeekends: boolean;
  compactMode: boolean;
  reduceMotion: boolean;
}
