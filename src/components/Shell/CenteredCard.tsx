import React from 'react';

/** Full-screen centred card used by the loading, sign-in and onboarding screens. */
export const CenteredCard: React.FC<{ title: string; children?: React.ReactNode; testId?: string }> = ({
  title,
  children,
  testId,
}) => (
  <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6" data-testid={testId}>
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-5 shadow-2xl">
      <div className="flex items-center space-x-2">
        <span className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-white">
          L
        </span>
        <span className="font-extrabold text-lg">Launchpad</span>
      </div>
      <h1 className="text-xl font-bold">{title}</h1>
      {children}
    </div>
  </div>
);
