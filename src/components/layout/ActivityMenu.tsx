import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import type { AuditLog } from '../../types';
import { buttonClass } from '../ui/Button';

/** Recent workspace activity from the audit log (real entries, newest first). */
export function ActivityMenu({ logs, onOpenAll }: { logs: AuditLog[]; onOpenAll: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const recent = [...logs].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 6);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Activity, ${recent.length} recent events`}
        title="Recent activity"
        className={buttonClass('secondary', 'sm')}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        <span className="hidden xl:inline">Activity</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-3 shadow-popover">
          <p className="mb-2 px-1 text-sm font-bold text-ink">Recent activity</p>
          {recent.length === 0 ? (
            <p className="px-1 py-3 text-sm text-ink-muted">No activity in this workspace yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recent.map((l) => (
                <li key={l.id} className="rounded-control bg-surface-muted px-3 py-2">
                  <p className="text-xs font-semibold text-ink">{l.details}</p>
                  <p className="text-2xs text-ink-subtle">
                    {l.actor || 'System'} · {new Date(l.timestamp).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenAll();
            }}
            className={buttonClass('ghost', 'sm', 'mt-2 w-full')}
          >
            Open full audit log
          </button>
        </div>
      )}
    </div>
  );
}
