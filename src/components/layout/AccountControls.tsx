import React, { useEffect, useState } from 'react';
import { LogIn, LogOut, Moon, Sun } from 'lucide-react';
import { onAuthChange, logoutUser, type AuthUser } from '../../lib/auth';
import { AuthModal } from '../Modals/AuthModal';
import { SafeImg } from '../ui/SafeImg';
import { buttonClass } from '../ui/Button';

export function useAuthUser(): { user: AuthUser | null; loading: boolean } {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(
    () =>
      onAuthChange((u) => {
        setUser(u);
        setLoading(false);
      }),
    [],
  );
  return { user, loading };
}

/** Theme switch with a visible label. */
export function ThemeToggle({
  themeMode,
  onToggle,
  full = false,
}: {
  themeMode: 'light' | 'dark';
  onToggle: () => void;
  full?: boolean;
}) {
  const dark = themeMode === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={onToggle}
      className={buttonClass('secondary', 'sm', full ? 'w-full justify-between' : '')}
    >
      <span className="flex items-center gap-1.5">
        {dark ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
        Dark mode
      </span>
      <span className="text-2xs font-bold uppercase text-ink-subtle">{dark ? 'On' : 'Off'}</span>
    </button>
  );
}

/** Signed-in user with a "Sign out" button, or a "Sign in" button. */
export function AccountControls({ themeMode, full = false }: { themeMode: 'light' | 'dark'; full?: boolean }) {
  const { user, loading } = useAuthUser();
  const [authOpen, setAuthOpen] = useState(false);
  if (loading) return null;
  return (
    <>
      {user ? (
        <div className={`flex items-center gap-2 ${full ? 'w-full justify-between' : ''}`}>
          <span className="flex min-w-0 items-center gap-2">
            <SafeImg
              src={user.image}
              alt={user.name || user.email || 'You'}
              className="h-8 w-8 rounded-full object-cover"
            />
            <span className="min-w-0">
              <span className="block max-w-[10rem] truncate text-sm font-semibold text-ink">
                {user.name || user.email.split('@')[0]}
              </span>
              <span className="block text-2xs text-ink-subtle">Signed in</span>
            </span>
          </span>
          <button type="button" onClick={() => logoutUser()} className={buttonClass('ghost', 'sm')}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className={buttonClass('secondary', 'sm', full ? 'w-full' : '')}
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          Sign in
        </button>
      )}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} initialMode="signin" themeMode={themeMode} />
    </>
  );
}
