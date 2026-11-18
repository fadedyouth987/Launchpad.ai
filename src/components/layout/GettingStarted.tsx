import React, { useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import type { TabId } from '../../navigation';
import { buttonClass } from '../ui/Button';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  done: boolean;
  to: TabId;
  cta: string;
}

/** First-run checklist on the Overview page. Steps tick off from real workspace data. */
export function GettingStarted({
  steps,
  onNavigate,
  onHide,
}: {
  steps: OnboardingStep[];
  onNavigate: (to: TabId) => void;
  onHide: () => void;
}) {
  const done = steps.filter((s) => s.done).length;
  const allDone = done === steps.length;
  // Once everything is done the checklist shrinks to one line; the steps stay one click away.
  const [expanded, setExpanded] = useState(!allDone);
  const showSteps = expanded || !allDone;
  return (
    <section
      aria-labelledby="getting-started-title"
      data-testid="getting-started"
      className="rounded-card border border-line bg-surface p-5 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="getting-started-title" className="text-lg font-bold text-ink">
            Getting started
          </h2>
          <p className="text-sm text-ink-muted">
            {allDone
              ? `All ${steps.length} steps done. Your workspace is set up.`
              : `${done} of ${steps.length} done. Each step opens the page where you do it.`}
          </p>
        </div>
        <div className="flex gap-2">
          {allDone && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={showSteps}
              aria-controls="getting-started-steps"
              className={buttonClass('ghost', 'sm')}
            >
              {showSteps ? 'Hide steps' : 'Show steps'}
            </button>
          )}
          <button type="button" onClick={onHide} className={buttonClass('ghost', 'sm')}>
            Hide checklist
          </button>
        </div>
      </div>
      {showSteps && (
        <ol id="getting-started-steps" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={`flex flex-col gap-2 rounded-control border p-4 ${s.done ? 'border-emerald-300 bg-success-50 dark:border-emerald-800 dark:bg-emerald-950/40' : 'border-line bg-surface-muted'}`}
            >
              <div className="flex items-center gap-2">
                {s.done ? (
                  <CheckCircle2 className="h-5 w-5 text-success-700 dark:text-emerald-300" aria-hidden="true" />
                ) : (
                  <Circle className="h-5 w-5 text-ink-subtle" aria-hidden="true" />
                )}
                <span className="text-sm font-bold text-ink">
                  {i + 1}. {s.title}
                  <span className="sr-only">{s.done ? ' (done)' : ' (to do)'}</span>
                </span>
              </div>
              <p className="flex-1 text-xs text-ink-muted">{s.description}</p>
              <button
                type="button"
                onClick={() => onNavigate(s.to)}
                className={buttonClass(s.done ? 'secondary' : 'primary', 'sm', 'self-start')}
              >
                {s.cta}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
