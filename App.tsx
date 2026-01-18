
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  parseISO,
  addDays,
  subDays,
  differenceInMinutes,
  addHours,
  subHours
} from 'date-fns';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Users, 
  AlertTriangle,
  ClipboardList,
  LayoutGrid,
  Trash2,
  X,
  Clock,
  ExternalLink,
  Zap,
  CheckCircle2,
  Settings
} from 'lucide-react';

import { ShiftEntry, ShiftTemplate, ViewType, ExtraHoursType } from './types';
import { DEFAULT_TEMPLATES, DAYS } from './constants';
import { StorageService } from './services/storageService';
import { ExportService } from './services/exportService';
import { TemplateButton } from './components/TemplateButton';

const App: React.FC = () => {
  // --- State ---
  const [shifts, setShifts] = useState<ShiftEntry[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>(DEFAULT_TEMPLATES);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [view, setView] = useState<ViewType>('Month');
  
  // Modals & Warnings
  const [overwriteWarning, setOverwriteWarning] = useState<{ date: string; existing: ShiftEntry; pendingTemplateId: string } | null>(null);
  const [restWarning, setRestWarning] = useState<{ 
    date: string; 
    pendingTemplateId: string; 
    gapMinutes: number;
    conflictType: 'previous' | 'next';
    neighborShift: ShiftEntry;
  } | null>(null);
  
  // Form State
  const [swapped, setSwapped] = useState(false);
  const [swappedWith, setSwappedWith] = useState('');
  const [isExtraHoursChecked, setIsExtraHoursChecked] = useState(false);
  const [extraHoursType, setExtraHoursType] = useState<'before' | 'after'>('after');
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    type: 'Custom' as ShiftTemplate['type'],
    startTime: '09:00',
    endTime: '17:00',
    icon: '✨',
    color: 'bg-slate-100 text-slate-700 border-slate-200'
  });
  const [isSyncMenuOpen, setIsSyncMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // --- Initial Load ---
  useEffect(() => {
    const savedShifts = StorageService.getShifts();
    const savedTemplates = StorageService.getTemplates(DEFAULT_TEMPLATES);
    setShifts(savedShifts);
    setTemplates(savedTemplates);
    setLastSynced(StorageService.getLastSynced());
  }, []);

  // --- Persist ---
  useEffect(() => {
    StorageService.saveShifts(shifts);
  }, [shifts]);

  useEffect(() => {
    StorageService.saveTemplates(templates);
  }, [templates]);

  // --- Helpers ---
  const daysInMonth = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    const interval = eachDayOfInterval({ start, end });
    
    // Ensure we always have exactly 42 days (6 weeks) for a consistent grid
    while (interval.length < 42) {
      interval.push(addDays(interval[interval.length - 1], 1));
    }
    return interval;
  }, [currentMonth]);

  const getShiftForDateStr = useCallback((dateStr: string) => {
    return shifts.find(s => s.date === dateStr);
  }, [shifts]);

  const getShiftForDate = useCallback((date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return getShiftForDateStr(dateStr);
  }, [getShiftForDateStr]);

  const getAdjustedTimes = (dateStr: string, shift: Partial<ShiftEntry>, template: ShiftTemplate) => {
    let start = parseISO(`${dateStr}T${template.startTime}:00`);
    let end = parseISO(`${dateStr}T${template.endTime}:00`);
    if (template.endTime < template.startTime) end = addDays(end, 1);
    if (shift.extraHours === 'before') start = subHours(start, 4);
    if (shift.extraHours === 'after') end = addHours(end, 4);
    return { start, end };
  };

  const checkRestPeriod = (dateStr: string, templateId: string, currentShifts: ShiftEntry[]) => {
    const template = templates.find(t => t.id === templateId)!;
    if (template.type === 'Sick' || template.type === 'Annual') return null;

    const currentExtraHours: ExtraHoursType = isExtraHoursChecked ? extraHoursType : 'none';
    const { start: currStart, end: currEnd } = getAdjustedTimes(dateStr, { extraHours: currentExtraHours }, template);

    const prevDateStr = format(subDays(parseISO(dateStr), 1), 'yyyy-MM-dd');
    const prevShift = currentShifts.find(s => s.date === prevDateStr);
    if (prevShift) {
      const prevTemplate = templates.find(t => t.id === prevShift.templateId)!;
      if (prevTemplate.type !== 'Sick' && prevTemplate.type !== 'Annual') {
        const { end: prevEnd } = getAdjustedTimes(prevDateStr, prevShift, prevTemplate);
        const gap = differenceInMinutes(currStart, prevEnd);
        if (gap >= 0 && gap < 720) return { gap, type: 'previous' as const, neighbor: prevShift };
      }
    }

    const nextDateStr = format(addDays(parseISO(dateStr), 1), 'yyyy-MM-dd');
    const nextShift = currentShifts.find(s => s.date === nextDateStr);
    if (nextShift) {
      const nextTemplate = templates.find(t => t.id === nextShift.templateId)!;
      if (nextTemplate.type !== 'Sick' && nextTemplate.type !== 'Annual') {
        const { start: nextStart } = getAdjustedTimes(nextDateStr, nextShift, nextTemplate);
        const gap = differenceInMinutes(nextStart, currEnd);
        if (gap >= 0 && gap < 720) return { gap, type: 'next' as const, neighbor: nextShift };
      }
    }
    return null;
  };

  const executeAddShift = (dateStr: string, templateId: string, force: boolean = false) => {
    const existingInState = shifts.find(s => s.date === dateStr);
    const finalExtraHours: ExtraHoursType = isExtraHoursChecked ? extraHoursType : 'none';
    
    if (!force) {
      const restConflict = checkRestPeriod(dateStr, templateId, shifts);
      if (restConflict) {
        setRestWarning({
          date: dateStr,
          pendingTemplateId: templateId,
          gapMinutes: restConflict.gap,
          conflictType: restConflict.type,
          neighborShift: restConflict.neighbor
        });
        return;
      }
    }

    const newShifts = existingInState 
      ? shifts.filter(s => s.date !== dateStr)
      : [...shifts];

    const newShift: ShiftEntry = {
      id: crypto.randomUUID(),
      templateId,
      date: dateStr,
      isSwapped: swapped,
      swappedWith: swapped ? swappedWith : undefined,
      extraHours: finalExtraHours
    };

    setShifts([...newShifts, newShift]);
    setOverwriteWarning(null);
    setRestWarning(null);
    resetForm();
  };

  const handleAddShift = (template: ShiftTemplate) => {
    if (!selectedDate) return;
    setPendingTemplateId(template.id);
    setIsEditing(true);
    setIsDetailsExpanded(true);
  };

  const deleteShift = (id: string) => {
    setShifts(shifts.filter(s => s.id !== id));
  };

  const templateColorOptions = [
    { label: 'Slate', value: 'bg-slate-100 text-slate-700 border-slate-200' },
    { label: 'Indigo', value: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    { label: 'Emerald', value: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    { label: 'Amber', value: 'bg-amber-100 text-amber-700 border-amber-200' },
    { label: 'Rose', value: 'bg-rose-100 text-rose-700 border-rose-200' },
    { label: 'Sky', value: 'bg-sky-100 text-sky-700 border-sky-200' }
  ];

  const resetTemplateForm = () => {
    setTemplateForm({
      name: '',
      type: 'Custom',
      startTime: '09:00',
      endTime: '17:00',
      icon: '✨',
      color: 'bg-slate-100 text-slate-700 border-slate-200'
    });
  };

  const handleCreateTemplate = () => {
    if (!templateForm.name.trim()) return;
    const newTemplate: ShiftTemplate = {
      id: crypto.randomUUID(),
      name: templateForm.name.trim(),
      type: templateForm.type,
      startTime: templateForm.startTime,
      endTime: templateForm.endTime,
      icon: templateForm.icon || '🗓️',
      color: templateForm.color
    };
    setTemplates([...templates, newTemplate]);
    setIsTemplateModalOpen(false);
    resetTemplateForm();
  };

  const resetForm = () => {
    setSwapped(false);
    setSwappedWith('');
    setIsExtraHoursChecked(false);
    setExtraHoursType('after');
  };

  const selectedShift = selectedDate ? getShiftForDate(selectedDate) : null;
  const selectedTemplate = selectedShift ? templates.find(t => t.id === selectedShift.templateId) : null;
  const pendingTemplate = pendingTemplateId ? templates.find(t => t.id === pendingTemplateId) : null;

  useEffect(() => {
    if (!selectedDate) return;
    if (selectedShift) {
      setPendingTemplateId(selectedShift.templateId);
      setSwapped(selectedShift.isSwapped);
      setSwappedWith(selectedShift.swappedWith ?? '');
      setIsExtraHoursChecked(selectedShift.extraHours !== 'none');
      setExtraHoursType(selectedShift.extraHours === 'before' ? 'before' : 'after');
      setIsEditing(false);
      setIsDetailsExpanded(true);
    } else {
      setPendingTemplateId(null);
      resetForm();
      setIsEditing(true);
      setIsDetailsExpanded(true);
    }
  }, [selectedDate, selectedShift]);

  const handleSaveShift = () => {
    if (!selectedDate || !pendingTemplateId) return;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const existing = getShiftForDateStr(dateStr);
    const finalExtraHours: ExtraHoursType = isExtraHoursChecked ? extraHoursType : 'none';
    const restConflict = checkRestPeriod(dateStr, pendingTemplateId, shifts.filter(s => s.date !== dateStr));

    if (restConflict) {
      setRestWarning({
        date: dateStr,
        pendingTemplateId,
        gapMinutes: restConflict.gap,
        conflictType: restConflict.type,
        neighborShift: restConflict.neighbor
      });
      return;
    }

    if (existing) {
      const updatedShift: ShiftEntry = {
        ...existing,
        templateId: pendingTemplateId,
        isSwapped: swapped,
        swappedWith: swapped ? swappedWith : undefined,
        extraHours: finalExtraHours
      };
      setShifts(shifts.map(s => (s.id === existing.id ? updatedShift : s)));
    } else {
      const newShift: ShiftEntry = {
        id: crypto.randomUUID(),
        templateId: pendingTemplateId,
        date: dateStr,
        isSwapped: swapped,
        swappedWith: swapped ? swappedWith : undefined,
        extraHours: finalExtraHours
      };
      setShifts([...shifts, newShift]);
    }

    setIsEditing(false);
    setOverwriteWarning(null);
    setRestWarning(null);
  };

  const handleSyncNow = () => {
    setIsSyncing(true);
    StorageService.pushToKV(shifts, templates);
    const now = new Date().toISOString();
    setLastSynced(now);
    setSyncMessage('Synced to CAL_KV.');
    setTimeout(() => setIsSyncing(false), 300);
  };

  const handlePullFromCloud = async () => {
    setIsSyncing(true);
    const result = await StorageService.pullFromKV(DEFAULT_TEMPLATES);
    if (result) {
      setShifts(result.shifts);
      setTemplates(result.templates);
      setSyncMessage('Loaded latest data from CAL_KV.');
      setLastSynced(StorageService.getLastSynced());
    } else {
      setSyncMessage('No cloud data found yet.');
    }
    setTimeout(() => setIsSyncing(false), 300);
  };

  return (
    <div className="h-full flex flex-col md:flex-row bg-slate-50 text-slate-900 overflow-hidden">
      
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex w-80 bg-white border-r border-slate-200 p-6 flex-col gap-4 shadow-sm z-10 shrink-0 h-full">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-100">
              <CalendarIcon className="text-white w-5 h-5" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Nicole&apos;s Working Life</h1>
          </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Quick Templates</h3>
          <div className="space-y-2">
            {templates.map(t => (
              <TemplateButton 
                key={t.id} 
                template={t} 
                onClick={() => handleAddShift(t)} 
              />
            ))}
          </div>
          <button
            onClick={() => setIsTemplateModalOpen(true)}
            className="mt-4 w-full rounded-2xl border-2 border-dashed border-slate-200 text-slate-500 py-3 text-[10px] font-black uppercase tracking-[0.3em] hover:border-indigo-300 hover:text-indigo-600 transition-all"
          >
            + Add Template
          </button>
        </div>

        <div className="mt-auto pt-4 border-t border-slate-100 space-y-2">
          <button 
            onClick={() => ExportService.generateICS(shifts, templates)}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3 rounded-xl hover:bg-black transition-all font-bold shadow-lg text-sm"
          >
            <Download size={16} /> Bulk Export .ICS
          </button>
          <a
            href={selectedShift && selectedTemplate ? ExportService.getGoogleCalendarLink(selectedShift, selectedTemplate) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-all ${
              selectedShift && selectedTemplate
                ? 'bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-600 hover:text-white'
                : 'bg-slate-100 text-slate-400 border-slate-200 pointer-events-none'
            }`}
          >
            <ExternalLink size={16} /> Sync Selected to Google
          </a>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* Top Header */}
        <header className="h-16 md:h-20 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-3 md:gap-5">
            <div className="flex flex-col">
              <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-slate-400">Calendar</span>
              <h2 className="text-sm md:text-lg font-black text-slate-900">Nicole&apos;s Working Life</h2>
            </div>
            <div className="hidden md:block h-8 w-px bg-slate-200" />
            <div className="flex items-center gap-2 md:gap-4">
              <h3 className="text-base md:text-xl font-black text-slate-900 min-w-[100px]">
                {format(currentMonth, 'MMMM yyyy')}
              </h3>
              <div className="flex items-center bg-slate-100 rounded-xl p-1">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-700">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => setCurrentMonth(new Date())} className="px-2 text-[9px] font-black uppercase tracking-wider hover:bg-white hover:shadow-sm rounded-lg py-1 text-slate-900">
                  Today
                </button>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-700">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
              <button 
                onClick={() => setView('Month')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black transition-all ${view === 'Month' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
              >
                <LayoutGrid size={14} /> <span>Month</span>
              </button>
              <button 
                onClick={() => setView('List')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black transition-all ${view === 'List' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
              >
                <ClipboardList size={14} /> <span>Roster</span>
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => setIsSyncMenuOpen((open) => !open)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-white hover:shadow-sm transition-all text-slate-600"
                aria-label="Open sync settings"
              >
                <Settings size={16} />
              </button>
              {isSyncMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 text-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Sync</h4>
                    <span className={`text-[10px] font-bold ${isSyncing ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {isSyncing ? 'Working...' : 'Ready'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3">
                    Last synced: {lastSynced ? format(parseISO(lastSynced), 'PPpp') : 'Never'}
                  </p>
                  {syncMessage && (
                    <p className="text-[11px] text-indigo-600 font-semibold mb-3">{syncMessage}</p>
                  )}
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleSyncNow}
                      className="w-full py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all"
                    >
                      Sync to CAL_KV
                    </button>
                    <button
                      onClick={handlePullFromCloud}
                      className="w-full py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                    >
                      Pull from CAL_KV
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-2 md:p-4 lg:p-6">
          {view === 'Month' ? (
            <div className="flex-1 flex flex-col bg-white rounded-[1.5rem] md:rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden transition-all duration-300 ease-out">
              <div className="calendar-grid border-b border-slate-100 bg-slate-50/80 shrink-0">
                {DAYS.map(day => (
                  <div key={day} className="py-2 md:py-4 text-center text-[9px] font-black text-slate-500 uppercase tracking-[0.15em] border-r border-slate-100 last:border-0">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 grid-rows-6 flex-1">
                {daysInMonth.map((date, idx) => {
                  const shift = getShiftForDate(date);
                  const template = shift ? templates.find(t => t.id === shift.templateId) : null;
                  const isToday = isSameDay(date, new Date());
                  const isCurrentMonth = isSameMonth(date, currentMonth);
                  const isSelected = selectedDate && isSameDay(date, selectedDate);

                  return (
                    <div 
                      key={`${date.toISOString()}-${idx}`}
                      onClick={() => setSelectedDate(date)}
                      className={`
                        p-1 md:p-2 border-r border-b border-slate-100 cursor-pointer group transition-all duration-300 ease-out relative flex flex-col items-center justify-between
                        ${!isCurrentMonth ? 'bg-slate-50/40 opacity-20' : 'bg-white hover:bg-indigo-50/40'}
                        ${isSelected ? 'ring-2 md:ring-4 ring-inset ring-indigo-500/20 bg-indigo-50/30 z-10' : ''}
                      `}
                    >
                      <div className="w-full flex justify-between items-start">
                        <span className={`
                          text-[10px] md:text-xs font-black w-5 h-5 md:w-7 md:h-7 flex items-center justify-center rounded-full
                          ${isToday ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}
                        `}>
                          {format(date, 'd')}
                        </span>
                        {shift && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteShift(shift.id); }}
                            className="hidden md:block opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-600 transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>

                      <div className="flex-1 w-full flex items-center justify-center">
                        {shift && template ? (
                          <div className={`
                            w-full h-full max-h-[80%] rounded-xl md:rounded-2xl border flex flex-col items-center justify-center shadow-sm relative overflow-hidden transition-all duration-300 ease-out
                            ${template.color} ${isSelected ? 'scale-105 shadow-md' : 'scale-100'}
                          `}>
                            <span className="text-base md:text-3xl filter drop-shadow-sm">{template.icon}</span>
                            
                            <div className="hidden md:flex flex-wrap justify-center gap-1 mt-1">
                               {shift.extraHours !== 'none' && (
                                  <div className="bg-rose-600 text-white text-[7px] font-black px-1 py-0.5 rounded-full flex items-center gap-0.5">
                                    <Zap size={7} fill="currentColor"/> +4H
                                  </div>
                               )}
                               {shift.isSwapped && (
                                  <div className="bg-amber-600 text-white text-[7px] font-black px-1 py-0.5 rounded-full flex items-center gap-0.5 uppercase">
                                    <Users size={7} fill="currentColor"/> SWP
                                  </div>
                               )}
                            </div>

                            <div className="md:hidden flex gap-0.5 absolute bottom-1">
                               {shift.extraHours !== 'none' && <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-sm" />}
                               {shift.isSwapped && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-sm" />}
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-full" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 px-2">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] text-center mb-4">Upcoming Roster</h3>
              {shifts
                .filter(s => parseISO(s.date) >= startOfMonth(currentMonth))
                .sort((a, b) => a.date.localeCompare(b.date))
                .map(shift => {
                  const template = templates.find(t => t.id === shift.templateId);
                  if (!template) return null;
                  return (
                    <div key={shift.id} className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-4 group hover:shadow-md transition-all duration-300 ease-out hover:-translate-y-0.5">
                      <div className="flex flex-col items-center justify-center bg-slate-50 w-14 h-14 md:w-16 md:h-16 rounded-2xl border border-slate-100 shrink-0">
                        <span className="text-[9px] font-black text-slate-400 uppercase">{format(parseISO(shift.date), 'MMM')}</span>
                        <span className="text-lg font-black text-slate-900 leading-none">{format(parseISO(shift.date), 'dd')}</span>
                        <span className="text-[9px] font-bold text-slate-500 uppercase">{format(parseISO(shift.date), 'EEE')}</span>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xl">{template.icon}</span>
                          <h4 className="text-sm md:text-base font-black text-slate-900 uppercase tracking-tight truncate">{template.name}</h4>
                          {shift.extraHours !== 'none' && (
                            <span className="bg-rose-100 text-rose-700 text-[8px] font-black uppercase px-2 py-0.5 rounded-lg border border-rose-200 flex items-center gap-1">
                              <Zap size={8} /> +4h
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-slate-600 font-bold text-[10px] md:text-xs">
                           {(template.type === 'Sick' || template.type === 'Annual') ? 'Full Day Leave' : `${template.startTime} - ${template.endTime}`}
                           {shift.swappedWith && <span className="text-amber-600 flex items-center gap-1"><Users size={10} /> {shift.swappedWith}</span>}
                        </div>
                      </div>

                      <div className="flex gap-1.5">
                         <a 
                          href={ExportService.getGoogleCalendarLink(shift, template)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl transition-all duration-300 ease-out border border-indigo-100 shadow-sm"
                          title="Google Sync"
                        >
                          <ExternalLink size={16} />
                        </a>
                        <button 
                          onClick={() => deleteShift(shift.id)}
                          className="p-2 text-slate-300 hover:text-rose-600 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Mobile Template Selector Bar */}
      <div className="md:hidden bg-white border-t border-slate-200 p-2 shrink-0 z-30">
        <div className="flex items-center justify-around gap-1 overflow-x-auto custom-scrollbar py-1">
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => handleAddShift(t)}
              className={`flex flex-col items-center justify-center min-w-[50px] aspect-square rounded-2xl border transition-all duration-300 ease-out ${t.color.split(' ')[0]} ${t.color.split(' ')[1]} border-transparent active:scale-90`}
            >
                <span className="text-xl">{t.icon}</span>
                <span className="text-[7px] font-black uppercase mt-0.5 tracking-tighter">{t.name.split(' ')[0]}</span>
              </button>
            ))}
            <button 
              onClick={() => setIsTemplateModalOpen(true)}
              className="flex flex-col items-center justify-center min-w-[50px] aspect-square rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 transition-all duration-300 ease-out active:scale-90"
            >
              <span className="text-lg font-black">+</span>
              <span className="text-[7px] font-black uppercase mt-0.5">Template</span>
            </button>
            <button 
              onClick={() => ExportService.generateICS(shifts, templates)}
              className="flex flex-col items-center justify-center min-w-[50px] aspect-square rounded-2xl bg-slate-900 text-white border border-transparent transition-all duration-300 ease-out active:scale-90"
            >
              <Download size={18} />
              <span className="text-[7px] font-black uppercase mt-0.5">Save</span>
            </button>
            <a
              href={selectedShift && selectedTemplate ? ExportService.getGoogleCalendarLink(selectedShift, selectedTemplate) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex flex-col items-center justify-center min-w-[50px] aspect-square rounded-2xl border transition-all duration-300 ease-out active:scale-90 ${
                selectedShift && selectedTemplate
                  ? 'bg-white text-indigo-600 border-indigo-100'
                  : 'bg-slate-100 text-slate-400 border-slate-200 pointer-events-none'
              }`}
            >
              <ExternalLink size={18} />
              <span className="text-[7px] font-black uppercase mt-0.5">Sync</span>
            </a>
          </div>
        </div>
      </main>

      {/* Warnings & Detail Popover (Desktop + Mobile overlay) */}
      {(overwriteWarning || restWarning) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl animate-in zoom-in duration-200 border border-white/20 text-center">
            {overwriteWarning ? (
              <>
                <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="text-rose-600" size={32} />
                </div>
                <h2 className="text-xl font-black mb-2 text-slate-900">Overwrite?</h2>
                <p className="text-slate-500 font-bold text-xs mb-6 leading-relaxed">
                  Replace <span className="text-indigo-600 uppercase font-black">{templates.find(t => t.id === overwriteWarning.existing.templateId)?.name}</span>?
                </p>
                <div className="flex flex-col gap-2">
                  <button onClick={() => executeAddShift(overwriteWarning.date, overwriteWarning.pendingTemplateId)} className="w-full py-4 rounded-xl bg-rose-600 text-white font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95">Yes, Replace</button>
                  <button onClick={() => setOverwriteWarning(null)} className="w-full py-4 rounded-xl bg-slate-100 text-slate-900 font-black uppercase text-[10px] tracking-widest">Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="text-amber-600" size={32} />
                </div>
                <h2 className="text-xl font-black mb-2 text-slate-900">Short Rest!</h2>
                <p className="text-slate-500 font-bold text-xs mb-6 leading-relaxed">
                  Gap is only <span className="text-amber-600 font-black underline">{Math.floor(restWarning!.gapMinutes / 60)}h {restWarning!.gapMinutes % 60}m</span>. 
                </p>
                <div className="flex flex-col gap-2">
                  <button onClick={() => executeAddShift(restWarning!.date, restWarning!.pendingTemplateId, true)} className="w-full py-4 rounded-xl bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95">Override & Save</button>
                  <button onClick={() => setRestWarning(null)} className="w-full py-4 rounded-xl bg-slate-100 text-slate-900 font-black uppercase text-[10px] tracking-widest">Adjust Shift</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] p-6 max-w-md w-full shadow-2xl border border-white/20">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">New Template</h2>
                <p className="text-[11px] font-bold text-slate-500">Create a custom shift or event template.</p>
              </div>
              <button
                onClick={() => {
                  setIsTemplateModalOpen(false);
                  resetTemplateForm();
                }}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-all duration-300 ease-out"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Name</label>
                <input
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="Team Meeting, Training, Event..."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-900 focus:border-indigo-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Start</label>
                  <input
                    type="time"
                    value={templateForm.startTime}
                    onChange={(e) => setTemplateForm({ ...templateForm, startTime: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-900 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">End</label>
                  <input
                    type="time"
                    value={templateForm.endTime}
                    onChange={(e) => setTemplateForm({ ...templateForm, endTime: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-900 focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Icon</label>
                  <input
                    value={templateForm.icon}
                    onChange={(e) => setTemplateForm({ ...templateForm, icon: e.target.value })}
                    placeholder="✨"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-900 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Type</label>
                  <select
                    value={templateForm.type}
                    onChange={(e) => {
                      const nextType = e.target.value as ShiftTemplate['type'];
                      setTemplateForm({
                        ...templateForm,
                        type: nextType,
                        startTime: nextType === 'Sick' || nextType === 'Annual' ? '00:00' : templateForm.startTime,
                        endTime: nextType === 'Sick' || nextType === 'Annual' ? '23:59' : templateForm.endTime
                      });
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-900 focus:border-indigo-500 outline-none"
                  >
                    <option value="Custom">Custom</option>
                    <option value="Sick">Sick</option>
                    <option value="Annual">Annual</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Color</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {templateColorOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setTemplateForm({ ...templateForm, color: option.value })}
                      className={`flex items-center justify-center py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${option.value} ${templateForm.color === option.value ? 'ring-2 ring-indigo-500/40' : ''}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleCreateTemplate}
                disabled={!templateForm.name.trim()}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest shadow-lg transition-all duration-300 ease-out hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Adjustment Panel */}
      {selectedDate && (
        <div className="fixed bottom-24 md:bottom-10 right-2 md:right-10 z-40 w-[calc(100%-1rem)] md:w-80">
          <div className="bg-white/95 backdrop-blur p-5 rounded-[2rem] shadow-[0_20px_80px_-20px_rgba(0,0,0,0.3)] border border-slate-200 animate-in slide-in-from-bottom-6 duration-300">
            <div className="flex justify-between items-center mb-3">
              <div className="flex flex-col">
                <span className="font-black text-[9px] uppercase text-indigo-500 tracking-[0.2em] mb-0.5">Customize</span>
                <span className="text-xs font-black text-slate-900">{format(selectedDate, 'EEEE, MMM dd')}</span>
              </div>
              <div className="flex items-center gap-1">
                {selectedShift && (
                  <button
                    onClick={() => {
                      if (isEditing && selectedShift) {
                        setPendingTemplateId(selectedShift.templateId);
                        setSwapped(selectedShift.isSwapped);
                        setSwappedWith(selectedShift.swappedWith ?? '');
                        setIsExtraHoursChecked(selectedShift.extraHours !== 'none');
                        setExtraHoursType(selectedShift.extraHours === 'before' ? 'before' : 'after');
                        setIsEditing(false);
                      } else {
                        setIsEditing(true);
                        setIsDetailsExpanded(true);
                      }
                    }}
                    className="px-2 py-1 text-[9px] font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-50 rounded-full transition-all duration-300 ease-out"
                  >
                    {isEditing ? 'Cancel' : 'Edit'}
                  </button>
                )}
                <button
                  onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                  className="md:hidden p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-all duration-300 ease-out"
                  aria-label={isDetailsExpanded ? 'Collapse details' : 'Expand details'}
                >
                  <ChevronRight size={16} className={`transition-transform duration-300 ease-out ${isDetailsExpanded ? 'rotate-90' : '-rotate-90'}`} />
                </button>
                <button onClick={() => setSelectedDate(null)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-all duration-300 ease-out"><X size={16} strokeWidth={3} /></button>
              </div>
            </div>
            
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 mb-3">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Shift</div>
              {pendingTemplate ? (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xl">{pendingTemplate.icon}</span>
                  <div className="text-xs font-black text-slate-900">{pendingTemplate.name}</div>
                </div>
              ) : (
                <div className="mt-2 text-[10px] font-bold text-slate-500">No shift selected yet.</div>
              )}
            </div>

            <div className={`space-y-3 transition-all duration-300 ease-out overflow-hidden md:max-h-none md:opacity-100 ${isDetailsExpanded ? 'max-h-[60vh] opacity-100 overflow-y-auto pr-1' : 'max-h-0 opacity-0 md:opacity-100'}`}>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Shift Selection</label>
                <select
                  value={pendingTemplateId ?? ''}
                  onChange={(e) => setPendingTemplateId(e.target.value || null)}
                  disabled={!isEditing}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-900 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">Select a shift</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

              <div 
                onClick={() => isEditing && setIsExtraHoursChecked(!isExtraHoursChecked)}
                className={`flex items-center justify-between p-3 rounded-2xl border transition-all duration-300 ease-out ${isExtraHoursChecked ? 'bg-rose-50 border-rose-200 shadow-sm' : 'bg-slate-50 border-slate-100'} ${isEditing ? 'cursor-pointer' : 'opacity-70'}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded flex items-center justify-center transition-all ${isExtraHoursChecked ? 'bg-rose-600 text-white shadow-sm' : 'bg-white border border-slate-300 text-transparent'}`}>
                     <CheckCircle2 size={12} strokeWidth={4} />
                  </div>
                  <label className="text-[10px] font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                    <Zap size={12} className={isExtraHoursChecked ? "text-rose-600" : "text-slate-400"} />
                    Extra Hours
                  </label>
                </div>
              </div>

              {isExtraHoursChecked && (
                <div className="flex gap-1 p-1 bg-slate-100 rounded-xl animate-in fade-in zoom-in duration-200">
                  {['before', 'after'].map((type) => (
                    <button
                      key={type}
                      onClick={() => isEditing && setExtraHoursType(type as 'before' | 'after')}
                      className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-300 ease-out ${extraHoursType === type ? 'bg-white shadow text-rose-600' : 'text-slate-500'} ${isEditing ? '' : 'pointer-events-none'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}

              <div 
                onClick={() => isEditing && setSwapped(!swapped)}
                className={`flex items-center justify-between p-3 rounded-2xl border transition-all duration-300 ease-out ${swapped ? 'bg-amber-50 border-amber-200 shadow-sm' : 'bg-slate-50 border-slate-100'} ${isEditing ? 'cursor-pointer' : 'opacity-70'}`}
              >
                <div className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded flex items-center justify-center transition-all ${swapped ? 'bg-amber-600 text-white shadow-sm' : 'bg-white border border-slate-300 text-transparent'}`}>
                       <CheckCircle2 size={12} strokeWidth={4} />
                    </div>
                    <label className="text-[10px] font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                      <Users size={12} className={swapped ? "text-amber-600" : "text-slate-400"} />
                      Swapped?
                    </label>
                </div>
              </div>

              {swapped && (
                <div className="space-y-1 animate-in slide-in-from-top-1 duration-200">
                  <input 
                    type="text" 
                    placeholder="Who with? (High Contrast Text)"
                    value={swappedWith}
                    onChange={(e) => isEditing && setSwappedWith(e.target.value)}
                    disabled={!isEditing}
                    className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:border-indigo-500 outline-none placeholder:text-slate-300 disabled:bg-slate-50"
                  />
                </div>
              )}

              {isEditing && (
                <button
                  onClick={handleSaveShift}
                  disabled={!pendingTemplateId}
                  className="w-full py-3 rounded-xl bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest shadow-lg transition-all duration-300 ease-out hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                >
                  Save Shift
                </button>
              )}

              {selectedShift && (
                <button
                  onClick={() => {
                    deleteShift(selectedShift.id);
                    setSelectedDate(null);
                  }}
                  className="w-full py-3 rounded-xl bg-rose-50 text-rose-600 font-black uppercase text-[10px] tracking-widest border border-rose-200 hover:bg-rose-100 transition-all duration-300 ease-out"
                >
                  Remove Entry
                </button>
              )}
              
              <div className="text-[8px] text-slate-400 font-black uppercase text-center bg-slate-50 p-2 rounded-xl">
                Select a shift, adjust flags, then save.
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
