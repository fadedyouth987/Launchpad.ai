import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronsLeft, ChevronsRight, PlusCircle, Sparkles, X, Zap } from 'lucide-react';
import type { Workspace } from '../types';
import { NAV_SECTIONS, type TabId } from '../navigation';

interface SidebarNavProps {
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  onSelectWorkspace: (id: string) => void;
  activeTab: TabId;
  setActiveTab: (tab: string) => void;
  onOpenTopUp: () => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  /** Rendered at the bottom of the mobile drawer only (account, theme, status). */
  mobileFooter?: React.ReactNode;
}

/**
 * Main navigation. Desktop: fixed sidebar that can collapse to icons (each keeps its name as a
 * tooltip and accessible label). Below 1024px: an off-canvas drawer opened by the labelled "Menu"
 * button in the header; Escape or the backdrop closes it.
 */
export const SidebarNav: React.FC<SidebarNavProps> = ({
  currentWorkspace,
  workspaces,
  onSelectWorkspace,
  activeTab,
  setActiveTab,
  onOpenTopUp,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
  mobileFooter,
}) => {
  const [wsOpen, setWsOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wsRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const updateMoreBelow = () => {
    const el = navRef.current;
    if (el) setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  };
  useEffect(() => {
    updateMoreBelow();
    const el = navRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateMoreBelow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isCollapsed, isMobileOpen]);
  // In the mobile drawer the sidebar is always shown expanded.
  const collapsed = isCollapsed && !isMobileOpen;

  useEffect(() => {
    if (!isMobileOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobileOpen, setIsMobileOpen]);

  useEffect(() => {
    if (!wsOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setWsOpen(false);
    const onClick = (e: MouseEvent) => !wsRef.current?.contains(e.target as Node) && setWsOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [wsOpen]);

  const go = (id: TabId) => (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveTab(id);
    setIsMobileOpen(false);
  };

  const pct = Math.min(
    100,
    currentWorkspace.totalCreditsAllocated > 0
      ? (currentWorkspace.creditsRemaining / currentWorkspace.totalCreditsAllocated) * 100
      : 0,
  );

  return (
    <>
      <aside
        id="main-navigation"
        aria-label="Sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line bg-surface text-ink transition-[transform,width] duration-200 lg:z-30 ${
          collapsed ? 'lg:w-sidebar-collapsed' : 'lg:w-sidebar'
        } w-[min(20rem,88vw)] ${isMobileOpen ? 'translate-x-0 shadow-popover' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Brand + collapse */}
        <div
          className={`flex items-center gap-2 border-b border-line p-3 ${collapsed ? 'flex-col' : 'justify-between'}`}
        >
          <a
            href="#/overview"
            onClick={go('overview')}
            aria-label={collapsed ? 'Launchpad AI, go to Overview' : undefined}
            title="Go to Overview"
            className="flex min-w-0 items-center gap-3 rounded-control p-1"
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-brand-600 text-white"
              aria-hidden="true"
            >
              <Sparkles className="h-5 w-5" />
            </span>
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-base font-extrabold leading-tight">Launchpad AI</span>
                <span className="block text-2xs font-semibold text-ink-subtle">Enterprise Studio</span>
              </span>
            )}
          </a>
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-controls="main-navigation"
            aria-expanded={!isCollapsed}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden h-9 w-9 place-items-center rounded-control border border-line text-ink-muted hover:bg-surface-muted hover:text-ink lg:grid"
          >
            {isCollapsed ? (
              <ChevronsRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="flex h-9 items-center gap-1.5 rounded-control border border-line px-3 text-xs font-semibold text-ink-muted hover:bg-surface-muted lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Close menu
          </button>
        </div>

        {/* Workspace switcher */}
        <div ref={wsRef} className="relative border-b border-line p-3">
          {!collapsed && (
            <p id="ws-label" className="mb-1.5 px-1 text-2xs font-bold uppercase tracking-wider text-ink-subtle">
              Workspace
            </p>
          )}
          <button
            type="button"
            onClick={() => (collapsed ? setIsCollapsed(false) : setWsOpen(!wsOpen))}
            aria-haspopup="listbox"
            aria-expanded={wsOpen}
            aria-label={collapsed ? `Workspace: ${currentWorkspace.name}. Expand sidebar to switch.` : undefined}
            aria-describedby={collapsed ? undefined : 'ws-label'}
            title={collapsed ? currentWorkspace.name : undefined}
            data-testid="workspace-switcher"
            className={`flex w-full items-center gap-2 rounded-control border border-line-strong bg-surface-muted text-left hover:border-brand-500 ${
              collapsed ? 'h-10 justify-center' : 'px-3 py-2'
            }`}
          >
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-100 text-xs font-extrabold text-brand-800"
              aria-hidden="true"
            >
              {currentWorkspace.name.slice(0, 1).toUpperCase()}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{currentWorkspace.name}</span>
                  <span className="block text-2xs font-semibold uppercase text-ink-subtle">
                    {currentWorkspace.plan} plan
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
              </>
            )}
          </button>
          {wsOpen && !collapsed && (
            <ul
              role="listbox"
              aria-label="Switch workspace"
              className="absolute left-3 right-3 z-50 mt-1.5 overflow-hidden rounded-control border border-line bg-surface py-1 shadow-popover"
            >
              {workspaces.map((ws) => {
                const selected = ws.id === currentWorkspace.id;
                return (
                  <li key={ws.id} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectWorkspace(ws.id);
                        setWsOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm ${
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
          )}
        </div>

        {/* Sections */}
        {/* The fade at the bottom shows there are more pages below when the window is short. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <nav
            ref={navRef}
            onScroll={updateMoreBelow}
            aria-label="Main"
            className="flex-1 space-y-5 overflow-y-auto px-3 py-4"
          >
            {NAV_SECTIONS.map((section) => (
              <div key={section.id} role="group" aria-labelledby={`nav-${section.id}`}>
                <h2
                  id={`nav-${section.id}`}
                  className={`mb-1.5 px-2 text-2xs font-bold uppercase tracking-wider text-ink-subtle ${collapsed ? 'sr-only' : ''}`}
                >
                  {section.title}
                </h2>
                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = item.id === activeTab;
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        <a
                          href={`#/${item.id}`}
                          onClick={go(item.id)}
                          aria-current={active ? 'page' : undefined}
                          aria-label={collapsed ? item.label : undefined}
                          title={collapsed ? item.label : undefined}
                          data-nav={item.id}
                          className={`relative flex items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors ${
                            collapsed ? 'justify-center' : ''
                          } ${
                            active
                              ? 'bg-brand-50 font-bold text-brand-800 dark:bg-brand-900/50 dark:text-white'
                              : 'font-medium text-ink-muted hover:bg-surface-muted hover:text-ink'
                          }`}
                        >
                          {active && (
                            <span
                              className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-brand-600"
                              aria-hidden="true"
                            />
                          )}
                          <Icon
                            className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-brand-600 dark:text-brand-300' : ''}`}
                            aria-hidden="true"
                          />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                          {!collapsed && item.badge && (
                            <span className="ml-auto rounded-full bg-brand-100 px-2 py-0.5 text-2xs font-bold text-brand-800">
                              {item.badge}
                            </span>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          {moreBelow && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface to-transparent"
            />
          )}
        </div>

        {/* Credits */}
        <div className="space-y-3 border-t border-line p-3">
          {collapsed ? (
            <button
              type="button"
              onClick={onOpenTopUp}
              aria-label={`${currentWorkspace.creditsRemaining.toLocaleString()} AI credits left. Top up credits`}
              title="Top up credits"
              className="grid h-10 w-full place-items-center rounded-control border border-amber-300 bg-warning-50 text-warning-800"
            >
              <Zap className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <div className="space-y-2 rounded-card border border-line bg-surface-muted p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-semibold text-ink-muted">
                  <Zap className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  AI credits
                </span>
                <span className="font-mono font-bold text-ink" data-testid="sidebar-credits">
                  {currentWorkspace.creditsRemaining.toLocaleString()}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Credits remaining"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
                className="h-2 w-full overflow-hidden rounded-full bg-line"
              >
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
              </div>
              <button
                type="button"
                onClick={onOpenTopUp}
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface text-xs font-semibold text-ink hover:bg-surface-muted"
              >
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                Top up credits
              </button>
            </div>
          )}
          {mobileFooter && <div className="space-y-2 lg:hidden">{mobileFooter}</div>}
        </div>
      </aside>

      {isMobileOpen && (
        <div
          aria-hidden="true"
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
        />
      )}
    </>
  );
};
