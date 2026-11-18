import React, { Suspense, lazy } from 'react';

// The dashboard (and everything behind sign-in) is a separate chunk from the sign-in screen.
const Dashboard = lazy(() => import('./Dashboard'));
import { AuthGate } from './components/Shell/AuthGate';
import { WorkspaceLoader } from './components/Shell/WorkspaceLoader';

export default function App() {
  return (
    <AuthGate>
      {(session, endDemo) => (
        <WorkspaceLoader identityKey={session.kind === 'user' ? session.user.uid : 'demo'}>
          {(workspaces, setWorkspaces) => (
            <Suspense
              fallback={
                <div
                  role="status"
                  className="min-h-screen grid place-items-center text-sm font-semibold text-ink-subtle"
                >
                  Loading workspace…
                </div>
              }
            >
              <Dashboard
                key={session.kind === 'user' ? session.user.uid : 'demo'}
                workspaces={workspaces}
                setWorkspaces={setWorkspaces}
                session={session.kind === 'user' ? { mode: 'account', uid: session.user.uid } : { mode: 'demo' }}
                onEndDemo={endDemo}
              />
            </Suspense>
          )}
        </WorkspaceLoader>
      )}
    </AuthGate>
  );
}
