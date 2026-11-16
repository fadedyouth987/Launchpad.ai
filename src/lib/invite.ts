const KEY = 'launchpad:invite-token';

/**
 * Invitation links look like https://app/#invite=<token>. The token is moved to sessionStorage and
 * removed from the address bar before the app routes, so it survives sign-in / sign-up.
 */
export function captureInviteToken() {
  if (typeof window === 'undefined') return;
  const m = /^#invite=([A-Za-z0-9_-]{20,100})$/.exec(window.location.hash);
  if (!m) return;
  try {
    sessionStorage.setItem(KEY, m[1]);
  } catch {
    /* storage blocked: the invite simply is not auto-accepted */
  }
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

export function takeInviteToken(): string | null {
  try {
    const t = sessionStorage.getItem(KEY);
    if (t) sessionStorage.removeItem(KEY);
    return t;
  } catch {
    return null;
  }
}
