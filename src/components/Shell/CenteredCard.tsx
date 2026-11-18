import React from 'react';
import { Sparkles } from 'lucide-react';

/** The theme chosen in the app (Dark mode toggle), so screens shown before the dashboard match it. */
const storedTheme = (): 'light' | 'dark' => {
  try {
    return localStorage.getItem('launchpad-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

/** Full-screen centred card used by the loading, sign-in and onboarding screens. */
export const CenteredCard: React.FC<{ title: string; children?: React.ReactNode; testId?: string }> = ({
  title,
  children,
  testId,
}) => (
  <div className={storedTheme() === 'dark' ? 'dark' : undefined}>
    <main className="min-h-screen flex items-center justify-center bg-canvas text-ink p-6" data-testid={testId}>
      <div className="w-full max-w-md bg-surface border border-line rounded-card p-8 space-y-5 shadow-card">
        {/* Same mark as the app's sidebar */}
        <div className="flex items-center space-x-2">
          <span className="grid h-9 w-9 place-items-center rounded-control bg-brand-600 text-white" aria-hidden="true">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="font-extrabold text-lg">Launchpad AI</span>
        </div>
        <h1 className="text-xl font-bold">{title}</h1>
        {children}
      </div>
    </main>
  </div>
);
