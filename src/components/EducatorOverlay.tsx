import React, { useState } from 'react';
import { BookOpen, Compass, PlayCircle, X } from 'lucide-react';
import { EDUCATOR_LESSONS, TOUR_STEPS, type LessonConfig } from '../data/glossaryAndLessons';

interface EducatorOverlayProps {
  onApplyLesson: (lesson: LessonConfig) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const EducatorOverlay: React.FC<EducatorOverlayProps> = ({
  onApplyLesson,
  onClose,
  isModal = false,
}) => {
  const [activeLessonId, setActiveLessonId] = useState<string>(EDUCATOR_LESSONS[0].id);
  const [tourIdx, setTourIdx] = useState(0);

  const activeLesson =
    EDUCATOR_LESSONS.find((l) => l.id === activeLessonId) || EDUCATOR_LESSONS[0];

  return (
    <div
      className={`rounded-lg border border-slate-800 bg-[#0B101B] p-5 space-y-5 ${
        isModal ? 'shadow-2xl max-w-4xl w-full mx-auto' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100 inline-flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            Educator Mode — Interactive South Pole Lessons
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Launch pre-built orbital scenarios directly into the workspace to explore polar twilight, lunar libration, and landing site tradeoffs.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close lessons panel"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Quick 3-Step Guided Tour */}
      <div className="rounded-lg border border-slate-800 bg-[#07090E] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-cyan-400 inline-flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5" />
            Quick Guided Tour ({tourIdx + 1} / {TOUR_STEPS.length})
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={tourIdx === 0}
              onClick={() => setTourIdx((i) => Math.max(0, i - 1))}
              className="px-2.5 py-1 text-xs rounded border border-slate-800 text-slate-300 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setTourIdx((i) => (i + 1) % TOUR_STEPS.length)}
              className="px-2.5 py-1 text-xs rounded bg-slate-800 text-slate-100"
            >
              {tourIdx === TOUR_STEPS.length - 1 ? 'Restart Tour' : 'Next Step'}
            </button>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-100">{TOUR_STEPS[tourIdx].title}</div>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            {TOUR_STEPS[tourIdx].body}
          </p>
        </div>
      </div>

      {/* 3 Ready-Made Lessons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {EDUCATOR_LESSONS.map((lesson) => {
          const isSelected = lesson.id === activeLesson.id;
          return (
            <button
              key={lesson.id}
              type="button"
              onClick={() => setActiveLessonId(lesson.id)}
              className={`text-left p-3.5 rounded-lg border transition-colors ${
                isSelected
                  ? 'bg-slate-900 border-cyan-500/70'
                  : 'bg-[#07090E] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="text-[11px] text-slate-400 mb-1">
                {lesson.audience} · {lesson.durationLabel}
              </div>
              <div className="text-xs font-semibold text-slate-100 leading-snug">
                {lesson.title}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Lesson Detail & Launch CTA */}
      <div className="rounded-lg border border-slate-800 bg-[#07090E] p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-1.5">
            <h3 className="text-sm font-semibold text-slate-100">{activeLesson.title}</h3>
            <p className="text-xs text-slate-300 leading-relaxed">{activeLesson.summary}</p>
            <p className="text-xs text-emerald-400 leading-relaxed">
              Key takeaway: {activeLesson.keyTakeaway}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onApplyLesson(activeLesson)}
            className="px-4 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <PlayCircle className="w-4 h-4" />
            Load Lesson Into Workspace
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80">
          {activeLesson.steps.map((st, idx) => (
            <div key={idx} className="space-y-1">
              <div className="text-xs font-semibold text-slate-200">{st.heading}</div>
              <p className="text-xs text-slate-400 leading-relaxed">{st.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
