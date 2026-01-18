
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
  CheckCircle2
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

  // --- Initial Load ---
  useEffect(() => {
    const savedShifts = StorageService.getShifts();
    const savedTemplates = StorageService.getTemplates(DEFAULT_TEMPLATES);
    setShifts(savedShifts);
    setTemplates(savedTemplates);
  }, []);

  // --- Persist ---
  useEffect(() => {
    StorageService.saveShifts(shifts);
  }, [shifts]);

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
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const existing = getShiftForDateStr(dateStr);

    if (existing) {
      setOverwriteWarning({ date: dateStr, existing, pendingTemplateId: template.id });
      return;
    }

    executeAddShift(dateStr, template.id);
  };

  const deleteShift = (id: string) => {
    setShifts(shifts.filter(s => s.id !== id));
  };

  const resetForm = () => {
    setSwapped(false);
    setSwappedWith('');
    setIsExtraHoursChecked(false);
    setExtraHoursType('after');
  };

  const selectedShift = selectedDate ? getShiftForDate(selectedDate) : null;
  const selectedTemplate = selectedShift ? templates.find(t => t.id === selectedShift.templateId) : null;

  return (
    <div className="h-full flex flex-col md:flex-row bg-slate-50 text-slate-900 overflow-hidden">
      
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex w-80 bg-white border-r border-slate-200 p-6 flex-col gap-4 shadow-sm z-10 shrink-0 h-full">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-100">
            <CalendarIcon className="text-white w-5 h-5" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">ShiftFlow</h1>
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
          <div className="flex items-center gap-2 md:gap-4">
            <h2 className="text-base md:text-xl font-black text-slate-900 min-w-[100px]">
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
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
            
            <div className={`space-y-3 transition-all duration-300 ease-out overflow-hidden md:max-h-none md:opacity-100 ${isDetailsExpanded ? 'max-h-[60vh] opacity-100 overflow-y-auto pr-1' : 'max-h-0 opacity-0 md:opacity-100'}`}>
              <div 
                onClick={() => setIsExtraHoursChecked(!isExtraHoursChecked)}
                className={`flex items-center justify-between p-3 rounded-2xl border transition-all duration-300 ease-out ${isExtraHoursChecked ? 'bg-rose-50 border-rose-200 shadow-sm' : 'bg-slate-50 border-slate-100'}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded flex items-center justify-center transition-all ${isExtraHoursChecked ? 'bg-rose-600 text-white shadow-sm' : 'bg-white border border-slate-300 text-transparent'}`}>
                     <CheckCircle2 size={12} strokeWidth={4} />
                  </div>
                  <label className="text-[10px] font-black text-slate-800 uppercase tracking-tight flex items-center gap-2 cursor-pointer">
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
                      onClick={() => setExtraHoursType(type as 'before' | 'after')}
                      className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-300 ease-out ${extraHoursType === type ? 'bg-white shadow text-rose-600' : 'text-slate-500'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}

              <div 
                onClick={() => setSwapped(!swapped)}
                className={`flex items-center justify-between p-3 rounded-2xl border transition-all duration-300 ease-out ${swapped ? 'bg-amber-50 border-amber-200 shadow-sm' : 'bg-slate-50 border-slate-100'}`}
              >
                <div className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded flex items-center justify-center transition-all ${swapped ? 'bg-amber-600 text-white shadow-sm' : 'bg-white border border-slate-300 text-transparent'}`}>
                       <CheckCircle2 size={12} strokeWidth={4} />
                    </div>
                    <label className="text-[10px] font-black text-slate-800 uppercase tracking-tight flex items-center gap-2 cursor-pointer">
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
                    onChange={(e) => setSwappedWith(e.target.value)}
                    className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:border-indigo-500 outline-none placeholder:text-slate-300"
                  />
                </div>
              )}

              <div className="text-[8px] text-slate-400 font-black uppercase text-center bg-slate-50 p-2 rounded-xl">
                Apply a shift template to save
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
