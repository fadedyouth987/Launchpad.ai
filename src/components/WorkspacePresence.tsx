import React, { useState } from 'react';
import { apiFetch } from '../lib/api';
import { SafeImg } from './ui/SafeImg';
import { TeamInvites } from './TeamInvites';
import { Workspace, WorkspaceRole } from '../types';
import { Users, ShieldCheck, Lock, CheckCircle2, Key, UserMinus } from 'lucide-react';

interface WorkspacePresenceProps {
  currentWorkspace: Workspace;
  /** Signed-in user's id (undefined in demo mode). */
  currentUserId?: string;
  onUpdateMemberRole: (memberId: string, role: WorkspaceRole) => void;
  /** Removes a member (frees a plan seat). */
  onRemoveMember?: (memberId: string) => void;
}

export const WorkspacePresence: React.FC<WorkspacePresenceProps> = ({
  currentWorkspace,
  currentUserId,
  onUpdateMemberRole,
  onRemoveMember,
}) => {
  const myRole = currentWorkspace.members.find((m) => m.id === currentUserId)?.role;
  const canInvite = Boolean(currentUserId) && (myRole === 'owner' || myRole === 'admin');
  const [tenantIsolatedTestResult, setTenantIsolatedTestResult] = useState<string | null>(null);

  const handleTestTenantIsolation = async () => {
    try {
      const res = await apiFetch(`/api/features/multi_tenant_isolation`, {
        headers: {
          'x-workspace-id': currentWorkspace.id,
        },
      });
      const data = await res.json();
      if (data.tenantVerified) {
        setTenantIsolatedTestResult(`Access check passed: you can only see data in ${currentWorkspace.name}.`);
      } else {
        setTenantIsolatedTestResult(`ERROR: Tenant header rejected.`);
      }
    } catch {
      setTenantIsolatedTestResult('Could not reach the server to check the workspace header.');
    }
  };

  return (
    <div className="space-y-8 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
              Strict Tenant Boundaries
            </span>
          </div>
          <p className="text-sm text-ink-muted">
            Members, roles and invitations. Roles are enforced by the server on every request. Online status is not
            tracked yet.
          </p>
        </div>

        <button
          onClick={handleTestTenantIsolation}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 flex items-center space-x-1.5 transition-all"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
          <span>Verify Tenant Isolation Header</span>
        </button>
      </div>

      {tenantIsolatedTestResult && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>{tenantIsolatedTestResult}</span>
          </div>
          <button onClick={() => setTenantIsolatedTestResult(null)} className="text-ink-subtle hover:text-ink text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Workspace Member Roster Grid */}
      <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <h2 className="text-base font-bold text-ink flex items-center space-x-2">
            <Users className="w-4 h-4 text-indigo-700 dark:text-indigo-300" />
            <span>
              Active Team Members in {currentWorkspace.name} ({currentWorkspace.members.length})
            </span>
          </h2>
          <span className="text-xs text-ink-subtle">
            Plan: <strong className="text-ink uppercase">{currentWorkspace.plan}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currentWorkspace.members.map((member) => (
            <div
              key={member.id}
              className="bg-canvas p-4 rounded-xl border border-line/80 flex items-center justify-between space-x-4"
            >
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <SafeImg
                    src={member.avatar}
                    alt={member.name}
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-line"
                  />
                  <span
                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-slate-950 ${
                      member.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-ink">{member.name}</h3>
                  <p className="text-2xs text-ink-subtle">{member.email}</p>
                  {member.currentEditingAssetId && (
                    <span className="text-2xs text-amber-700 dark:text-amber-400 font-medium flex items-center space-x-1 mt-0.5">
                      <Lock className="w-3 h-3" />
                      <span>Reviewing Asset #{member.currentEditingAssetId}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {/* Role Select */}
                <select
                  aria-label={`Role for ${member.name}`}
                  value={member.role}
                  onChange={(e) => onUpdateMemberRole(member.id, e.target.value as WorkspaceRole)}
                  className="min-w-0 max-w-full bg-surface border border-line text-ink text-xs rounded-lg px-2.5 py-1.5 font-medium focus:border-indigo-500 outline-none"
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="approver">Approver</option>
                  <option value="creator">Creator</option>
                  <option value="viewer">Viewer (read only)</option>
                </select>
                {onRemoveMember &&
                  canInvite &&
                  member.role !== 'owner' &&
                  member.id !== currentUserId &&
                  (myRole === 'owner' || member.role !== 'admin') && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove ${member.name} from ${currentWorkspace.name}? They lose access immediately.`,
                          )
                        )
                          onRemoveMember(member.id);
                      }}
                      className="p-1.5 rounded-lg bg-surface border border-line hover:bg-rose-100 dark:hover:bg-rose-900 text-ink-muted"
                      aria-label={`Remove ${member.name}`}
                      title="Remove from workspace"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-ink">Invite people</h2>
        {currentUserId ? (
          <TeamInvites workspaceId={currentWorkspace.id} canInvite={canInvite} />
        ) : (
          <p className="text-sm text-ink-muted">Invitations need a signed-in account (not available in the demo).</p>
        )}
      </div>

      {/* RBAC Matrix Reference Table */}
      <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-ink flex items-center space-x-2">
          <Key className="w-4 h-4 text-purple-700 dark:text-purple-400" />
          <span>What each role can do</span>
        </h2>

        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Role permissions table (scrolls sideways)"
        >
          <table className="w-full text-left text-xs">
            <thead className="bg-canvas text-ink-subtle text-2xs font-bold uppercase">
              <tr>
                <th className="p-3">Capability</th>
                <th className="p-3 text-center">Owner</th>
                <th className="p-3 text-center">Approver</th>
                <th className="p-3 text-center">Creator</th>
                <th className="p-3 text-center">Viewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 text-ink-muted">
              <tr>
                <td className="p-3 font-medium">Generate AI Assets (15 Credits)</td>
                <td className="p-3 text-center text-emerald-700 dark:text-emerald-400">✓</td>
                <td className="p-3 text-center text-emerald-700 dark:text-emerald-400">✓</td>
                <td className="p-3 text-center text-emerald-700 dark:text-emerald-400">✓</td>
                <td className="p-3 text-center text-rose-500">✕</td>
              </tr>
              <tr>
                <td className="p-3 font-medium">Approve or reject posts</td>
                <td className="p-3 text-center text-emerald-700 dark:text-emerald-400">✓</td>
                <td className="p-3 text-center text-emerald-700 dark:text-emerald-400">✓</td>
                <td className="p-3 text-center text-rose-500">✕</td>
                <td className="p-3 text-center text-rose-500">✕</td>
              </tr>
              <tr>
                <td className="p-3 font-medium">Credit Top-Up & Stripe Subscriptions</td>
                <td className="p-3 text-center text-emerald-700 dark:text-emerald-400">✓</td>
                <td className="p-3 text-center text-rose-500">✕</td>
                <td className="p-3 text-center text-rose-500">✕</td>
                <td className="p-3 text-center text-rose-500">✕</td>
              </tr>
              <tr>
                <td className="p-3 font-medium">GDPR Data Erasure & Webhook Config</td>
                <td className="p-3 text-center text-emerald-700 dark:text-emerald-400">✓</td>
                <td className="p-3 text-center text-rose-500">✕</td>
                <td className="p-3 text-center text-rose-500">✕</td>
                <td className="p-3 text-center text-rose-500">✕</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
