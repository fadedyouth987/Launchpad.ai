import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, PlusCircle, Zap } from 'lucide-react';
import type { Workspace } from '../../types';
import { NAV_SECTIONS, findNavItem, type NavSection, type TabId } from '../../navigation';

/** Sections in the top bar; Workspace & Billing and Settings live in the workspace menu. */
const MENU_SECTIONS = new Set(['workspace', 'settings']);

/** Closes a popover on Escape or a click outside it. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open, close]);
  return ref;
}

const tabClass = (active: boolean) =>
  `inline-flex h-10 items-center gap-1 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
    active
      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100'
      : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
  }`;

/** Page links inside a menu: name plus its one-line description. */
function MenuLinks({ section, activeTab, go }: { section: NavSection; activeTab: TabId; go: (id: TabId) => void }) {
  return (
    <ul className="space-y-0.5">
      {section.items.map((item) => {
        const Icon = item.icon;
        const current = item.id === activeTab;
        return (
          <li key={item.id}>
            <a
              href={`#/${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                go(item.id);
              }}
              aria-current={current ? 'page' : undefined}
              className={`flex gap-3 rounded-control px-3 py-2.5 ${current ? 'bg-brand-50 dark:bg-brand-900/40' : 'hover:bg-surface-muted'}`}
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${current ? 'text-brand-700 dark:text-brand-200' : 'text-ink-subtle'}`}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span
                  className={`block text-sm font-semibold ${current ? 'text-brand-700 dark:text-brand-100' : 'text-ink'}`}
                >
                  {item.label}
                  {item.badge && (
                    <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-2xs font-bold text-brand-800">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-ink-subtle">{item.description}</span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function SectionTab({ section, activeTab, go }: { section: NavSection; activeTab: TabId; go: (id: TabId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const active = section.items.some((i) => i.id === activeTab);
  // A section with one page is a plain link (Overview, Insights).
  if (section.items.length === 1) {
    const only = section.items[0];
    return (
      <a
        href={`#/${only.id}`}
        onClick={(e) => {
          e.preventDefault();
          go(only.id);
        }}
        aria-current={active ? 'page' : undefined}
        className={tabClass(active)}
      >
        {section.id === 'start' ? only.label : section.title}
      </a>
    );
  }
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={tabClass(active)}
      >
        {section.title}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-2 w-80 rounded-card border border-line bg-surface p-2 shadow-popover">
          <MenuLinks
            section={section}
            activeTab={activeTab}
            go={(id) => {
              setOpen(false);
              go(id);
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Desktop (lg and up) section tabs. Small screens use the slide-out menu instead. */
export function TopNav({ activeTab, onNavigate }: { activeTab: TabId; onNavigate: (id: TabId) => void }) {
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
      {NAV_SECTIONS.filter((s) => !MENU_SECTIONS.has(s.id)).map((s) => (
        <SectionTab key={s.id} section={s} activeTab={activeTab} go={onNavigate} />
      ))}
    </nav>
  );
}

/**
 * Workspace chip (desktop): switch workspace, see and top up credits, and reach the Workspace & Billing and
 * Settings pages.
 */
export function WorkspaceMenu({
  currentWorkspace,
  workspaces,
  onSelectWorkspace,
  activeTab,
  onNavigate,
  onOpenTopUp,
  footer,
}: {
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  onSelectWorkspace: (id: string) => void;
  activeTab: TabId;
  onNavigate: (id: TabId) => void;
  onOpenTopUp: () => void;
  /** Theme and account controls, shown at the bottom of the menu. */
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const inMenu = MENU_SECTIONS.has(findNavItem(activeTab).section.id);
  const go = (id: TabId) => {
    setOpen(false);
    onNavigate(id);
  };
  return (
    <div ref={ref} className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        data-testid="workspace-menu"
        className={`inline-flex h-10 max-w-[15rem] items-center gap-2 rounded-control border px-3 text-sm font-semibold ${
          inMenu
            ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100'
            : 'border-line-strong bg-surface text-ink hover:bg-surface-muted'
        }`}
      >
        <span className="truncate">{currentWorkspace.name}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-[80vh] w-96 overflow-y-auto rounded-card border border-line bg-surface p-3 shadow-popover">
          {workspaces.length > 1 && (
            <div className="mb-3">
              <p className="px-1 pb-1 text-2xs font-bold uppercase tracking-wider text-ink-subtle">Switch workspace</p>
              <ul>
                {workspaces.map((ws) => {
                  const selected = ws.id === currentWorkspace.id;
                  return (
                    <li key={ws.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectWorkspace(ws.id);
                          setOpen(false);
                        }}
                        aria-pressed={selected}
                        className={`flex w-full items-center justify-between gap-2 rounded-control px-3 py-2 text-left text-sm ${
                          selected
                            ? 'bg-brand-50 font-bold text-brand-800 dark:bg-brand-900/40 dark:text-brand-100'
                            : 'hover:bg-surface-muted'
                        }`}
                      >
                        <span className="truncate">{ws.name}</span>
                        {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="mb-3 flex items-center justify-between gap-3 rounded-control bg-brand-50 px-3 py-2.5 dark:bg-brand-900/30">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-800 dark:text-brand-100">
              <Zap className="h-4 w-4" aria-hidden="true" /> AI credits{' '}
              <span className="font-mono" data-testid="header-credits">
                {currentWorkspace.creditsRemaining.toLocaleString()}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenTopUp();
              }}
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 underline underline-offset-2 dark:text-brand-200"
            >
              <PlusCircle className="h-4 w-4" aria-hidden="true" /> Top up
            </button>
          </div>
          {NAV_SECTIONS.filter((s) => MENU_SECTIONS.has(s.id)).map((s) => (
            <div key={s.id} className="mb-2 last:mb-0">
              <p className="px-1 pb-1 text-2xs font-bold uppercase tracking-wider text-ink-subtle">{s.title}</p>
              <MenuLinks section={s} activeTab={activeTab} go={go} />
            </div>
          ))}
          {footer && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">{footer}</div>}
        </div>
      )}
    </div>
  );
}
