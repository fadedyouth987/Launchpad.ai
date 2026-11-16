import { useCallback, useEffect, useState } from 'react';
import { isTabId, type TabId } from '../navigation';

const fromHash = (): TabId | null => {
  const id = window.location.hash.replace(/^#\/?/, '');
  return isTabId(id) ? id : null;
};

/**
 * The active page, kept in the URL hash (#/studio) so the browser back button, reloads and shared
 * links land on the same page.
 */
export function useHashTab(initial: TabId = 'overview'): [TabId, (tab: string) => void] {
  const [tab, setTab] = useState<TabId>(() => fromHash() ?? initial);
  useEffect(() => {
    const onHash = () => {
      const t = fromHash();
      if (t) setTab(t);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((next: string) => {
    if (!isTabId(next)) {
      console.warn(`[nav] unknown page "${next}"`);
      return;
    }
    setTab(next);
    if (window.location.hash !== `#/${next}`) window.location.hash = `/${next}`;
    window.scrollTo({ top: 0 });
  }, []);
  return [tab, navigate];
}
