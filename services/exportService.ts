
import { ShiftEntry, ShiftTemplate } from '../types';
import { format, parseISO, addHours, subHours } from 'date-fns';

export const ExportService = {
  getAdjustedTimes: (shift: ShiftEntry, template: ShiftTemplate) => {
    const dateStr = shift.date;
    let start = parseISO(`${dateStr}T${template.startTime}:00`);
    let end = parseISO(`${dateStr}T${template.endTime}:00`);

    if (template.endTime < template.startTime) {
      end = addHours(end, 24);
    }

    if (shift.extraHours === 'before') {
      start = subHours(start, 4);
    } else if (shift.extraHours === 'after') {
      end = addHours(end, 4);
    }

    return { start, end };
  },

  generateICS: (shifts: ShiftEntry[], templates: ShiftTemplate[]) => {
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//ShiftFlow//Calendar Export//EN\n";

    shifts.forEach(shift => {
      const template = templates.find(t => t.id === shift.templateId);
      if (!template) return;

      const { start, end } = ExportService.getAdjustedTimes(shift, template);
      const stamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");
      
      // Full day for leaves
      if (template.type === 'Sick' || template.type === 'Annual') {
        const dtStart = format(parseISO(shift.date), "yyyyMMdd");
        const dtEnd = format(addHours(parseISO(shift.date), 24), "yyyyMMdd");
        icsContent += "BEGIN:VEVENT\n";
        icsContent += `DTSTART;VALUE=DATE:${dtStart}\n`;
        icsContent += `DTEND;VALUE=DATE:${dtEnd}\n`;
      } else {
        icsContent += "BEGIN:VEVENT\n";
        icsContent += `DTSTART:${format(start, "yyyyMMdd'T'HHmmss")}\n`;
        icsContent += `DTEND:${format(end, "yyyyMMdd'T'HHmmss")}\n`;
      }

      icsContent += `UID:${shift.id}@shiftflow.app\n`;
      icsContent += `DTSTAMP:${stamp}\n`;
      icsContent += `SUMMARY:${template.icon} ${template.name}${shift.isSwapped ? ' (Swapped)' : ''}${shift.extraHours !== 'none' ? ' + Extra' : ''}\n`;
      icsContent += `DESCRIPTION:ShiftFlow Entry. Swapped: ${shift.isSwapped ? 'Yes' : 'No'}. ${shift.swappedWith ? 'With: ' + shift.swappedWith : ''}\n`;
      icsContent += "END:VEVENT\n";
    });

    icsContent += "END:VCALENDAR";

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'shiftflow_roster.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  getGoogleCalendarLink: (shift: ShiftEntry, template: ShiftTemplate) => {
    const { start, end } = ExportService.getAdjustedTimes(shift, template);
    const fmt = (d: Date) => format(d, "yyyyMMdd'T'HHmmss'Z'");
    
    const details = `ShiftFlow recorded shift. Swapped: ${shift.isSwapped ? 'Yes' : 'No'}${shift.swappedWith ? ' with ' + shift.swappedWith : ''}`;
    const text = `${template.icon} ${template.name}${shift.extraHours !== 'none' ? ' (incl. Extra Hours)' : ''}`;
    
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(details)}`;
  }
};
