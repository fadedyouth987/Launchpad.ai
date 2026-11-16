import { useCallback, useState } from 'react';

const KEY = 'launchpad-dismissed-hints-v1';

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Remembers which onboarding hints this browser has dismissed. */
export function useDismissed(): {
  isDismissed: (id: string) => boolean;
  dismiss: (id: string) => void;
  reset: () => void;
} {
  const [ids, setIds] = useState<string[]>(read);
  const dismiss = useCallback((id: string) => {
    setIds((prev) => {
      const next = Array.from(new Set([...prev, id]));
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage full or blocked: the hint just comes back next visit */
      }
      return next;
    });
  }, []);
  const reset = useCallback(() => {
    setIds([]);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);
  return { isDismissed: (id) => ids.includes(id), dismiss, reset };
}
