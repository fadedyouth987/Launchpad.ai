import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { NAV_SECTIONS, type TabId } from '../../navigation';

/**
 * "Go to page" search: filters every page by name, section and description. Arrow keys move,
 * Enter opens, Escape clears. Ctrl+K / ⌘K focuses it from anywhere.
 */
export function PageFinder({ onNavigate }: { onNavigate: (id: TabId) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return NAV_SECTIONS.flatMap((s) => s.items.map((item) => ({ item, section: s.title }))).filter(
      ({ item, section }) => !needle || `${item.label} ${section} ${item.description}`.toLowerCase().includes(needle),
    );
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = (id: TabId) => {
    onNavigate(id);
    setQ('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative w-full max-w-sm">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Go to page
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${results[active].item.id}` : undefined}
        placeholder="Go to page…  (Ctrl K)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            choose(results[active].item.id);
          } else if (e.key === 'Escape') {
            setQ('');
            setOpen(false);
          }
        }}
        className="h-10 w-full rounded-control border border-line-strong bg-surface-muted pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle hover:border-brand-500"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Pages"
          className="absolute left-0 right-0 z-50 mt-1.5 max-h-80 overflow-y-auto rounded-control border border-line bg-surface py-1 shadow-popover"
        >
          {results.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No page matches “{q}”.</li>}
          {results.map(({ item, section }, i) => (
            <li
              key={item.id}
              id={`${listId}-${item.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(item.id);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-brand-50 dark:bg-brand-900/40' : ''}`}
            >
              <span className="block text-sm font-semibold text-ink">{item.label}</span>
              <span className="block text-2xs text-ink-subtle">{section}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
