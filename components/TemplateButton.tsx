
import React from 'react';
import { ShiftTemplate } from '../types';

interface TemplateButtonProps {
  template: ShiftTemplate;
  onClick: (template: ShiftTemplate) => void;
  active?: boolean;
}

export const TemplateButton: React.FC<TemplateButtonProps> = ({ template, onClick, active }) => {
  return (
    <button
      onClick={() => onClick(template)}
      className={`
        flex items-center gap-4 p-4 w-full rounded-[1.25rem] transition-all duration-200 border-2
        ${active ? 'ring-4 ring-indigo-500/20 border-indigo-500 scale-[0.98]' : 'border-transparent hover:scale-[1.02] active:scale-[0.97] hover:shadow-lg'}
        ${template.color}
        shadow-sm relative overflow-hidden
      `}
    >
      <span className="text-3xl filter drop-shadow-sm">{template.icon}</span>
      <div className="flex flex-col items-start min-w-0">
        <span className="font-black text-xs md:text-sm uppercase tracking-wider truncate text-inherit">{template.name}</span>
        {template.type !== 'Sick' && template.type !== 'Annual' ? (
          <span className="text-[10px] font-bold opacity-80 uppercase tracking-tight">
            {template.startTime} - {template.endTime}
          </span>
        ) : (
          <span className="text-[10px] font-black opacity-80 uppercase tracking-widest">
            Full Day Block
          </span>
        )}
      </div>
      <div className="ml-auto opacity-20">
        <div className="w-8 h-8 rounded-full border-4 border-current" />
      </div>
    </button>
  );
};
