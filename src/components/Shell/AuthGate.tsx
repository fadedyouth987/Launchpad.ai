import React, { useEffect, useState } from 'react';
import { completePasswordReset, onAuthChange, type AuthUser } from '../../lib/auth';
import { apiFetch } from '../../lib/api';
import { AuthModal } from '../Modals/AuthModal';
import { CenteredCard } from './CenteredCard';

export type Session = { kind: 'demo' } | { kind: 'user'; user: AuthUser };

type ServerAuthMode = 'neon' | 'demo-mode' | 'not-configured';

const DEMO_SESSION_KEY = 'launchpad-demo-session';

/**
 * Nothing in the app renders until the visitor is signed in (Neon Auth), or — only when the
 * server runs with DEMO_MODE=true — has chosen to continue with the shared demo workspace.
 */
export const AuthGate: React.FC<{ children: (session: Session, endDemo: () => void) => React.ReactNode }> = ({
  children,
}) => {
  const [serverMode, setServerMode] = useState<ServerAuthMode | 'unreachable' | null>(null);
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [demoChosen, setDemoChosen] = useState(() => sessionStorage.getItem(DEMO_SESSION_KEY) === '1');
  const [modal, setModal] = useState<'signin' | 'signup' | null>(null);

  useEffect(() => onAuthChange(setUser), []);

  useEffect(() => {
    apiFetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((h) => setServerMode(h?.auth ?? 'not-configured'))
      .catch(() => setServerMode('unreachable'));
  }, []);

  const startDemo = () => {
    sessionStorage.setItem(DEMO_SESSION_KEY, '1');
    setDemoChosen(true);
  };
  const endDemo = () => {
    sessionStorage.removeItem(DEMO_SESSION_KEY);
    setDemoChosen(false);
  };

  const resetToken = new URLSearchParams(window.location.search).has('reset-password')
    ? new URLSearchParams(window.location.search).get('token')
    : null;
  if (resetToken) return <ResetPasswordCard token={resetToken} />;

  if (serverMode === null || user === undefined) return <CenteredCard title="Loading…" testId="auth-loading" />;

  if (serverMode === 'unreachable') {
    return (
      <CenteredCard title="Can't reach the server" testId="auth-unreachable">
        <p className="text-sm text-ink-subtle">Check that the Launchpad server is running, then reload.</p>
      </CenteredCard>
    );
  }

  if (serverMode === 'demo-mode' && demoChosen) return <>{children({ kind: 'demo' }, endDemo)}</>;
  if (user && serverMode === 'neon') return <>{children({ kind: 'user', user }, endDemo)}</>;
  if (user && serverMode === 'demo-mode') return <>{children({ kind: 'demo' }, endDemo)}</>;

  return (
    <CenteredCard title="Sign in to Launchpad" testId="sign-in-gate">
      {serverMode === 'not-configured' ? (
        <p className="text-sm text-amber-700 dark:text-amber-300" data-testid="auth-not-configured">
          Server sign-in isn't configured yet. An administrator needs to set DATABASE_URL and the Neon Auth settings
          (run `neon deploy`), or DEMO_MODE=true for a local demo.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-subtle">Sign in or create an account to open your workspaces.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setModal('signin')}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold"
            >
              Sign in
            </button>
            <button
              onClick={() => setModal('signup')}
              className="flex-1 py-2.5 rounded-xl bg-surface-muted hover:bg-line-strong text-sm font-bold"
            >
              Create account
            </button>
          </div>
        </>
      )}
      {serverMode === 'demo-mode' && (
        <div className="pt-3 border-t border-line space-y-2">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Demo mode is on: you can explore shared sample workspaces without an account. Data resets when the server
            restarts.
          </p>
          <button
            onClick={startDemo}
            data-testid="start-demo"
            className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-sm font-bold"
          >
            Continue with demo workspace
          </button>
        </div>
      )}
      {modal && <AuthModal isOpen onClose={() => setModal(null)} initialMode={modal} themeMode="dark" />}
    </CenteredCard>
  );
};

/** Landing page for the emailed reset link (Neon Auth redirects back with ?reset-password=1&token=…). */
const ResetPasswordCard: React.FC<{ token: string }> = ({ token }) => {
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | string>('idle');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setState('Password must be at least 8 characters long.');
    setState('busy');
    try {
      await completePasswordReset(token, password);
      setState('done');
    } catch (err) {
      setState((err as Error).message || 'The reset link is invalid or has expired.');
    }
  };
  const finish = () => window.location.replace(window.location.pathname);
  return (
    <CenteredCard title="Choose a new password" testId="reset-password">
      {state === 'done' ? (
        <>
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Password updated. You can sign in with it now.
          </p>
          <button
            onClick={finish}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold"
          >
            Continue to sign in
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm text-ink-muted">
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl bg-surface border border-line-strong px-3 py-2 text-sm"
            />
          </label>
          {state !== 'idle' && state !== 'busy' && (
            <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
              {state}
            </p>
          )}
          <button
            type="submit"
            disabled={state === 'busy'}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold disabled:opacity-60"
          >
            {state === 'busy' ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      )}
    </CenteredCard>
  );
};
