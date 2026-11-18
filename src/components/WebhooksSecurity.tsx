import { useHealth } from '../hooks/useHealth';
import React, { useCallback, useEffect, useState } from 'react';
import { Dialog } from './ui/Dialog';
import { Workspace, WebhookEndpoint, WebhookDeliveryLog, AuditLog } from '../types';
import { Lock, Send, Download, Trash2, AlertTriangle, Globe, Plus, ShieldAlert, Activity } from 'lucide-react';
import { apiErrorMessage, apiJson } from '../lib/api';
import { downloadWorkspaceExport } from '../lib/workspaceApi';

interface WebhooksSecurityProps {
  currentWorkspace: Workspace;
  webhookLogs: WebhookDeliveryLog[];
  auditLogs: AuditLog[];
  onToggleLegalHold: (wsId: string) => void;
  onExecuteGdprErase: (wsId: string, confirmSlug: string) => Promise<string | null>;
}

export const WebhooksSecurity: React.FC<WebhooksSecurityProps> = ({
  currentWorkspace,
  auditLogs,
  onToggleLegalHold,
  onExecuteGdprErase,
}) => {
  const [testUrlInput, setTestUrlInput] = useState<string>('https://example.com/webhooks/launchpad');
  const [ssrfTestResult, setSsrfTestResult] = useState<{
    status?: string;
    simulated?: boolean;
    latencyMs?: number;
    statusCode?: number;
    message?: string;
    responsePreview?: string;
  } | null>(null);
  const [isTestingSsrf, setIsTestingSsrf] = useState<boolean>(false);

  const [newWebhookUrl, setNewWebhookUrl] = useState<string>('');
  const [newWebhookDesc, setNewWebhookDesc] = useState<string>('');

  const [showErasureModal, setShowErasureModal] = useState<boolean>(false);
  const [erasureConfirmationText, setErasureConfirmationText] = useState<string>('');

  // Receivers are stored on the server; the list only ever contains masked secrets.
  const [workspaceEndpoints, setWorkspaceEndpoints] = useState<WebhookEndpoint[]>([]);
  const [endpointError, setEndpointError] = useState<string | null>(null);
  const [isAddingEndpoint, setIsAddingEndpoint] = useState(false);
  // Full secret of the receiver just created. Shown once; cleared on dismiss or navigation.
  const [revealedSecret, setRevealedSecret] = useState<{ endpointId: string; secret: string } | null>(null);

  const loadEndpoints = useCallback(async () => {
    const r = await apiJson<{ endpoints: WebhookEndpoint[] }>('/api/webhooks/endpoints', {
      headers: { 'x-workspace-id': currentWorkspace.id },
    });
    if (r.ok && Array.isArray(r.data.endpoints)) setWorkspaceEndpoints(r.data.endpoints);
    else setEndpointError(apiErrorMessage(r, 'Could not load webhook receivers.'));
  }, [currentWorkspace.id]);

  useEffect(() => {
    setRevealedSecret(null);
    loadEndpoints();
  }, [loadEndpoints]);
  const workspaceAuditLogs = auditLogs.filter((a) => a.workspaceId === currentWorkspace.id);

  const handleTestWebhookDelivery = async (targetUrl?: string) => {
    const urlToTest = targetUrl || testUrlInput;
    setIsTestingSsrf(true);
    setSsrfTestResult(null);

    const r = await apiJson<Record<string, unknown>>('/api/webhooks/deliver', {
      headers: { 'x-workspace-id': currentWorkspace.id },
      json: {
        url: urlToTest,
        payload: { event: 'test.delivery', workspaceId: currentWorkspace.id, timestamp: new Date().toISOString() },
      },
    });
    setSsrfTestResult(
      r.status === 401 || r.status === 429 || r.status === 0 ? { ...r.data, message: apiErrorMessage(r) } : r.data,
    );
    setIsTestingSsrf(false);
  };

  const handleAddEndpoint = async () => {
    if (!newWebhookUrl.trim() || isAddingEndpoint) return;
    setIsAddingEndpoint(true);
    setEndpointError(null);
    const r = await apiJson<{ endpoint: WebhookEndpoint; secret: string }>('/api/webhooks/endpoints', {
      json: {
        workspaceId: currentWorkspace.id,
        url: newWebhookUrl.trim(),
        description: newWebhookDesc.trim() || undefined,
      },
    });
    setIsAddingEndpoint(false);
    if (!r.ok || !r.data.endpoint) {
      setEndpointError(apiErrorMessage(r, 'Could not register the webhook receiver.'));
      return;
    }
    setWorkspaceEndpoints((prev) => [...prev, r.data.endpoint]);
    setRevealedSecret({ endpointId: r.data.endpoint.id, secret: r.data.secret });
    setNewWebhookUrl('');
    setNewWebhookDesc('');
  };

  // Full export of everything the server stores for this workspace (secrets masked).
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const handleDownloadGdprExport = async () => {
    setExportStatus('Preparing export…');
    const err = await downloadWorkspaceExport(currentWorkspace.id, currentWorkspace.slug);
    setExportStatus(err ? `Export failed: ${err}` : 'Export downloaded.');
  };

  const [erasing, setErasing] = useState(false);
  const [erasureError, setErasureError] = useState<string | null>(null);
  const handleConfirmErase = async () => {
    setErasing(true);
    setErasureError(null);
    const err = await onExecuteGdprErase(currentWorkspace.id, erasureConfirmationText);
    setErasing(false);
    if (err) return setErasureError(err);
    setShowErasureModal(false);
    setErasureConfirmationText('');
    setWorkspaceEndpoints([]);
    setExportStatus('Workspace data erased. Ledger and audit log were kept.');
  };

  const { health } = useHealth();

  return (
    <div className="space-y-8 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <span
              data-testid="webhook-delivery-mode"
              className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${health?.integrations.webhookDelivery ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60' : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'}`}
            >
              {health
                ? health.integrations.webhookDelivery
                  ? 'Delivery live'
                  : 'Delivery simulated'
                : 'Checking delivery…'}
            </span>
          </div>
          <p className="text-sm text-ink-muted">
            Webhook receivers (
            {health?.integrations.webhookDelivery
              ? 'live: signed events are sent when an asset is sent for review, approved, scheduled, published or rejected'
              : 'simulated: no requests are sent until the server sets WEBHOOK_DELIVERY_ENABLED=true'}
            ), the audit log, a full data export of this workspace, and permanent data erasure.
          </p>
        </div>

        <button
          onClick={handleDownloadGdprExport}
          className="bg-surface-muted hover:bg-line-strong text-ink border border-line-strong px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition-colors"
        >
          <Download className="w-4 h-4 text-indigo-700 dark:text-indigo-300" />
          <span>Download data export (JSON)</span>
        </button>
      </div>
      {exportStatus && (
        <p role="status" className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          {exportStatus}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Webhooks & SSRF Guard Test Runner (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* SSRF Egress Security Test Runner */}
          <div className="bg-surface border border-line p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-sm font-bold text-ink flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>Webhook URL Check</span>
              </h2>
              <span className="text-2xs font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60">
                DNS + IP range check
              </span>
            </div>

            <p className="text-xs text-ink-subtle leading-relaxed">
              The server parses the URL (http/https only), resolves its DNS, and blocks it if any address is private,
              loopback, link-local (e.g. <code>169.254.169.254</code>), or otherwise non-public, including IPv6 and
              encoded forms like <code>http://2130706433/</code>. No request is sent either way.
            </p>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={testUrlInput}
                onChange={(e) => setTestUrlInput(e.target.value)}
                placeholder="https://api.yourdomain.com/webhook"
                className="flex-1 bg-canvas border border-line text-ink text-xs rounded-xl px-3.5 py-2.5 focus:border-indigo-500 outline-none font-mono"
              />
              <button
                onClick={() => handleTestWebhookDelivery()}
                disabled={isTestingSsrf}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 flex items-center space-x-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Test Dispatch</span>
              </button>
            </div>

            {/* Quick SSRF Attack Preset Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-2xs text-ink-subtle">Test SSRF Targets:</span>
              <button
                onClick={() => handleTestWebhookDelivery('http://127.0.0.1:8080/internal-admin')}
                className="text-2xs bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 px-2.5 py-1 rounded-lg font-mono hover:bg-rose-100 dark:hover:bg-rose-900 transition-colors"
              >
                🚫 127.0.0.1:8080
              </button>
              <button
                onClick={() => handleTestWebhookDelivery('http://169.254.169.254/latest/meta-data/')}
                className="text-2xs bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 px-2.5 py-1 rounded-lg font-mono hover:bg-rose-100 dark:hover:bg-rose-900 transition-colors"
              >
                🚫 169.254.169.254 (Cloud Metadata)
              </button>
              <button
                onClick={() => handleTestWebhookDelivery('https://example.com/webhooks/launchpad')}
                className="text-2xs bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 rounded-lg font-mono hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
              >
                ✓ Public HTTPS Endpoint
              </button>
            </div>

            {/* SSRF Result Output Box */}
            {ssrfTestResult && (
              <div
                className={`p-4 rounded-xl border text-xs font-mono space-y-2 ${
                  ssrfTestResult.status === 'blocked_ssrf'
                    ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    : ssrfTestResult.simulated
                      ? 'bg-amber-50 dark:bg-amber-950/80 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                      : 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span>Result: {ssrfTestResult.status?.toUpperCase()}</span>
                  {!ssrfTestResult.simulated && (
                    <span>
                      HTTP Status: {ssrfTestResult.statusCode} ({ssrfTestResult.latencyMs}ms)
                    </span>
                  )}
                </div>
                <p className="text-2xs leading-relaxed font-sans">
                  {ssrfTestResult.message || ssrfTestResult.responsePreview}
                </p>
              </div>
            )}
          </div>

          {/* Webhook Endpoints List */}
          <div className="bg-surface border border-line p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-sm font-bold text-ink flex items-center space-x-2">
                <Globe className="w-4 h-4 text-indigo-700 dark:text-indigo-300" />
                <span>Configured Webhook Receivers ({workspaceEndpoints.length})</span>
              </h2>
            </div>

            <div className="space-y-3">
              {workspaceEndpoints.map((ep) => (
                <div key={ep.id} className="bg-canvas p-4 rounded-xl border border-line space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-ink font-bold truncate max-w-xs">{ep.url}</span>
                    <span className="text-2xs bg-surface text-ink-subtle border border-line-strong px-2 py-0.5 rounded font-mono">
                      Never delivered
                    </span>
                  </div>
                  <p className="text-ink-subtle text-2xs">{ep.description}</p>
                  <div className="flex items-center space-x-2 text-2xs text-ink-subtle font-mono">
                    <span>Secret: {ep.secretPreview}</span>
                  </div>
                </div>
              ))}
            </div>

            {revealedSecret && (
              <div
                data-testid="webhook-secret-once"
                className="p-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/70 text-xs text-amber-900 dark:text-amber-100 space-y-2"
              >
                <p className="font-bold">Copy this signing secret now. It will not be shown again.</p>
                <code className="block break-all font-mono text-2xs bg-canvas p-2 rounded-lg">
                  {revealedSecret.secret}
                </code>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigator.clipboard?.writeText(revealedSecret.secret)}
                    className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => setRevealedSecret(null)}
                    className="px-3 py-1 rounded-lg bg-surface-muted font-bold"
                  >
                    I've saved it
                  </button>
                </div>
              </div>
            )}
            {endpointError && (
              <div
                role="alert"
                className="p-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-xs text-rose-800 dark:text-rose-200"
              >
                {endpointError}
              </div>
            )}

            {/* Add New Endpoint Input */}
            <div className="pt-2 border-t border-line space-y-2">
              <span className="text-xs font-bold text-ink-muted">Add Webhook Receiver</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  placeholder="https://api.domain.com/webhook"
                  className="bg-canvas border border-line text-ink text-xs rounded-xl px-3 py-2 outline-none"
                />
                <input
                  type="text"
                  value={newWebhookDesc}
                  onChange={(e) => setNewWebhookDesc(e.target.value)}
                  placeholder="Receiver description..."
                  className="bg-canvas border border-line text-ink text-xs rounded-xl px-3 py-2 outline-none"
                />
              </div>
              <button
                onClick={handleAddEndpoint}
                disabled={isAddingEndpoint}
                className="disabled:opacity-60 w-full bg-surface-muted hover:bg-line-strong text-ink py-2 rounded-xl text-xs font-bold border border-line-strong flex items-center justify-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Register Webhook Receiver</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Audit Logs & GDPR Controls (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* GDPR & Data Retention Policy Control */}
          <div className="bg-surface border border-line p-6 rounded-2xl space-y-4">
            <h2 className="text-sm font-bold text-ink flex items-center space-x-2 border-b border-line pb-3">
              <Lock className="w-4 h-4 text-purple-700 dark:text-purple-400" />
              <span>Data Retention Settings</span>
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-canvas rounded-xl border border-line">
                <div>
                  <span className="font-bold text-ink block">Legal Hold Status</span>
                  <span className="text-2xs text-ink-subtle">Prevents retention auto-purge when active</span>
                </div>

                <button
                  onClick={() => onToggleLegalHold(currentWorkspace.id)}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors ${
                    currentWorkspace.legalHoldActive
                      ? 'bg-amber-600 text-white'
                      : 'bg-surface-muted text-ink-subtle hover:text-ink'
                  }`}
                >
                  {currentWorkspace.legalHoldActive ? 'Legal Hold ACTIVE' : 'Enable Hold'}
                </button>
              </div>

              <div className="p-3 bg-canvas rounded-xl border border-line space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink">Retention Policy Window</span>
                  <span className="font-mono text-indigo-700 dark:text-indigo-300 font-bold">
                    {currentWorkspace.retentionDays} Days
                  </span>
                </div>
                <p className="text-2xs text-ink-subtle">
                  Setting only: automatic purging is not built yet (there are no background jobs).
                </p>
              </div>

              {/* Data Erasure Safety Trigger */}
              <div className="pt-2 border-t border-line">
                <button
                  onClick={() => setShowErasureModal(true)}
                  className="w-full bg-rose-50 dark:bg-rose-950/80 hover:bg-rose-100 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-800/80 text-rose-700 dark:text-rose-300 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Erase workspace data</span>
                </button>
              </div>
            </div>
          </div>

          {/* Immutable Security Audit Logs */}
          <div className="bg-surface border border-line p-6 rounded-2xl space-y-4">
            <h2 className="text-sm font-bold text-ink flex items-center space-x-2 border-b border-line pb-3">
              <Activity className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>Audit log</span>
            </h2>

            <div
              tabIndex={0}
              role="region"
              aria-label="Audit log entries"
              className="space-y-2.5 max-h-64 overflow-y-auto pr-1 text-xs"
            >
              {workspaceAuditLogs.length === 0 && (
                <p className="rounded-xl bg-canvas p-3 text-sm text-ink-muted">
                  No audit events yet. Saving influencers, creating webhooks, role changes and exports are recorded
                  here.
                </p>
              )}
              {workspaceAuditLogs.map((log) => (
                <div
                  data-testid="audit-log-entry"
                  key={log.id}
                  className="bg-canvas p-3 rounded-xl border border-line/80 space-y-1"
                >
                  <div className="flex items-center justify-between text-2xs text-ink-subtle">
                    <span className="font-bold text-ink-muted">{log.actor}</span>
                    <span className="font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-ink-muted text-2xs">{log.details}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Erasure Safety Modal */}
      {showErasureModal && (
        <Dialog
          onClose={() => setShowErasureModal(false)}
          label="Erase workspace data"
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-surface border border-line rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h2 className="text-base font-bold text-ink flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-rose-700 dark:text-rose-400" />
              <span>Erase this workspace's data?</span>
            </h2>
            <p className="text-xs text-ink-subtle leading-relaxed">
              Permanently deletes this workspace's campaign assets, AI influencers, Campaign OS data and webhook
              receivers from the server. The credit ledger and audit log are kept as financial and security records.
              Only the workspace owner can do this, and not while legal hold is on. Download an export first if you need
              a copy.
            </p>

            <div className="space-y-2">
              <label className="text-2xs font-bold text-ink-muted uppercase">
                Type <code className="text-rose-700 dark:text-rose-400">{currentWorkspace.slug}</code> to confirm:
              </label>
              <input
                aria-label="Type to confirm"
                type="text"
                value={erasureConfirmationText}
                onChange={(e) => setErasureConfirmationText(e.target.value)}
                placeholder={currentWorkspace.slug}
                className="w-full bg-canvas border border-line text-rose-700 dark:text-rose-300 text-xs rounded-xl p-3 font-mono outline-none focus:border-rose-500"
              />
            </div>

            {erasureError && (
              <p role="alert" className="text-xs font-bold text-rose-700 dark:text-rose-300">
                {erasureError}
              </p>
            )}
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowErasureModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-ink-subtle hover:text-ink bg-surface-muted"
              >
                Cancel
              </button>
              <button
                disabled={erasureConfirmationText !== currentWorkspace.slug || erasing}
                onClick={handleConfirmErase}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  erasureConfirmationText === currentWorkspace.slug
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30'
                    : 'bg-surface-muted text-ink-subtle cursor-not-allowed'
                }`}
              >
                {erasing ? 'Erasing…' : 'Erase permanently'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
