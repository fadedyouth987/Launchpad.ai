import React from 'react';
import { ChevronRight, Menu, Plus } from 'lucide-react';
import type { AuditLog, Workspace } from '../types';
import { findNavItem, type TabId } from '../navigation';
import { modeLabel, type Health } from '../hooks/useHealth';
import { PageFinder } from './layout/PageFinder';
import { ActivityMenu } from './layout/ActivityMenu';
import { AccountControls, ThemeToggle } from './layout/AccountControls';
import { buttonClass } from './ui/Button';

interface TopHeaderBarProps {
  currentWorkspace: Workspace;
  activeTab: TabId;
  setActiveTab: (tab: string) => void;
  health: Health | null;
  themeMode: 'light' | 'dark';
  onToggleTheme: () => void;
  isMenuOpen: boolean;
  onOpenMenu: () => void;
  auditLogs: AuditLog[];
}

/** Sticky top bar: menu (small screens), breadcrumb, page search, status and account. */
export const TopHeaderBar: React.FC<TopHeaderBarProps> = ({
  currentWorkspace,
  activeTab,
  setActiveTab,
  health,
  themeMode,
  onToggleTheme,
  isMenuOpen,
  onOpenMenu,
  auditLogs,
}) => {
  const { item, section } = findNavItem(activeTab);
  const status = modeLabel(health);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-controls="main-navigation"
          aria-expanded={isMenuOpen}
          data-testid="mobile-nav-toggle"
          className={buttonClass('secondary', 'sm', 'lg:hidden')}
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
          Menu
        </button>

        <nav aria-label="Breadcrumb" className="min-w-0 shrink">
          <ol className="flex min-w-0 items-center gap-1.5 text-sm">
            <li className="hidden min-w-0 max-w-[12rem] truncate text-ink-muted 2xl:block">{currentWorkspace.name}</li>
            <li className="hidden 2xl:block" aria-hidden="true">
              <ChevronRight className="h-4 w-4 text-ink-subtle" />
            </li>
            <li className="hidden shrink-0 text-ink-muted sm:block">{section.title}</li>
            <li className="hidden sm:block" aria-hidden="true">
              <ChevronRight className="h-4 w-4 text-ink-subtle" />
            </li>
            <li
              aria-current="page"
              className="min-w-0 truncate whitespace-nowrap font-bold text-ink"
              data-testid="breadcrumb-current"
            >
              {item.label}
            </li>
          </ol>
        </nav>

        <div className="hidden min-w-0 flex-1 justify-center md:flex">
          <PageFinder onNavigate={setActiveTab} />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('audit_inspector')}
            title="Open System Status"
            className={`hidden h-9 items-center gap-2 rounded-full border px-3 text-2xs font-bold xl:flex ${
              status.tone === 'ok'
                ? 'border-emerald-300 bg-success-50 text-success-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                : 'border-amber-300 bg-warning-50 text-warning-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${status.tone === 'ok' ? 'bg-emerald-600' : 'bg-amber-600'}`}
              aria-hidden="true"
            />
            {status.label}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('studio')}
            aria-label="New asset"
            title="Create a new asset in AI Asset Studio"
            className={buttonClass('primary', 'sm')}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">New asset</span>
          </button>
          <ActivityMenu
            logs={auditLogs.filter((l) => l.workspaceId === currentWorkspace.id)}
            onOpenAll={() => setActiveTab('webhooks')}
          />
          <div className="hidden items-center gap-2 lg:flex">
            <ThemeToggle themeMode={themeMode} onToggle={onToggleTheme} />
            <AccountControls themeMode={themeMode} />
          </div>
        </div>
      </div>
    </header>
  );
};
