import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { GLOSSARY } from '../data/glossaryAndLessons';

interface GlossaryTooltipProps {
  termKey: keyof typeof GLOSSARY;
  label?: string;
  className?: string;
}

export const GlossaryTooltip: React.FC<GlossaryTooltipProps> = ({
  termKey,
  label,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const entry = GLOSSARY[termKey];
  if (!entry) return null;

  return (
    <span
      className={`relative inline-flex items-center gap-1 ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span>{label ?? entry.term}</span>
      <button
        type="button"
        aria-label={`Explain ${entry.term}`}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center text-slate-400 hover:text-cyan-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 rounded"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 bottom-full mb-2 z-50 w-72 p-3 rounded-lg bg-slate-900 border border-slate-700 text-left shadow-xl pointer-events-none"
        >
          <span className="block text-xs font-semibold text-slate-100 mb-1">
            {entry.term}
          </span>
          <span className="block text-xs text-slate-300 leading-relaxed mb-1">
            {entry.shortDef}
          </span>
          <span className="block text-[11px] text-slate-400 leading-relaxed">
            {entry.detail}
          </span>
        </span>
      )}
    </span>
  );
};
