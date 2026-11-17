import { Router } from 'express';
import { z } from 'zod';
import { DEMO_MODE, requireAuth } from '../auth';
import { dataWriteRateLimiter, webhookRateLimiter } from '../rateLimit';
import { handle, parseBody, workspaceFromParam } from '../http';
import { recordAudit } from '../audit';
import { acceptInvite, createInvite, INVITE_DAYS, listInvites, revokeInvite } from '../invites';
import { emailEnabled, escapeHtml, sendEmail } from '../email';
import { appUrl } from '../payments';
import { seatUsage } from '../memberLimits';
import { db } from '../db';

const inviteSchema = z
  .object({
    email: z.string().trim().email().max(320),
    role: z.enum(['admin', 'approver', 'creator', 'viewer']).default('creator'),
  })
  .strict();
const acceptSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/) }).strict();

export function inviteRoutes(emailFetch?: typeof fetch) {
  const r = Router();

  r.get(
    '/workspaces/:workspaceId/invites',
    requireAuth,
    handle('invites/list', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      const invites = await listInvites(req.authContext!.uid, ws);
      const seats = DEMO_MODE ? null : await seatUsage(db(), ws);
      res.json({ success: true, emailEnabled: emailEnabled(), invites, seats });
    }),
  );

  // Owner/admin invites someone by email. The link is returned once; it is also emailed when Resend
  // is configured. Rate limited like other outbound actions.
  r.post(
    '/workspaces/:workspaceId/invites',
    requireAuth,
    webhookRateLimiter,
    handle('invites/create', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      const body = parseBody(inviteSchema, req, res);
      if (!body) return;
      const uid = req.authContext!.uid;
      const { invite, token, workspaceName } = await createInvite(uid, ws, body.email, body.role);
      // Token in the URL fragment: never sent to the web host, so it cannot end up in access logs.
      const inviteUrl = `${appUrl()}/#invite=${token}`;
      const inviter = req.authContext!.name || req.authContext!.email || 'A teammate';
      const mail = await sendEmail(
        {
          to: invite.email,
          subject: `${inviter} invited you to ${workspaceName} on Launchpad`,
          text: `${inviter} invited you to join the workspace "${workspaceName}" on Launchpad as ${invite.role}.\n\nAccept: ${inviteUrl}\n\nSign in or create an account with ${invite.email}. The link expires in ${INVITE_DAYS} days.`,
          html: `<p>${escapeHtml(inviter)} invited you to join the workspace <strong>${escapeHtml(workspaceName)}</strong> on Launchpad as <strong>${invite.role}</strong>.</p><p><a href="${inviteUrl}">Accept the invitation</a></p><p>Sign in or create an account with ${escapeHtml(invite.email)}. The link expires in ${INVITE_DAYS} days.</p>`,
        },
        emailFetch,
      );
      await recordAudit({
        workspaceId: ws,
        uid,
        ip: req.ip,
        action: 'member.invite',
        details: `Invited ${invite.email} as ${invite.role}${mail.sent ? ' (email sent)' : ' (link shown to inviter)'}.`,
      });
      res.status(201).json({ success: true, invite, inviteUrl, emailSent: mail.sent, emailEnabled: emailEnabled() });
    }),
  );

  r.delete(
    '/workspaces/:workspaceId/invites/:inviteId',
    requireAuth,
    dataWriteRateLimiter,
    handle('invites/revoke', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      if (!/^inv-[A-Za-z0-9_-]{1,100}$/.test(req.params.inviteId))
        return res.status(400).json({ error: 'INVALID_ID', message: 'Invalid id.' });
      const ok = await revokeInvite(req.authContext!.uid, ws, req.params.inviteId);
      if (!ok) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invitation not found.' });
      await recordAudit({
        workspaceId: ws,
        uid: req.authContext!.uid,
        ip: req.ip,
        action: 'member.invite.revoke',
        details: `Revoked ${req.params.inviteId}.`,
      });
      res.json({ success: true });
    }),
  );

  r.post(
    '/invites/accept',
    requireAuth,
    dataWriteRateLimiter,
    handle('invites/accept', async (req, res) => {
      const body = parseBody(acceptSchema, req, res);
      if (!body) return;
      const out = await acceptInvite(req.authContext!.uid, req.authContext!.email, body.token);
      await recordAudit({
        workspaceId: out.workspaceId,
        uid: req.authContext!.uid,
        ip: req.ip,
        action: 'member.join',
        details: `Joined through an invitation as ${out.role}.`,
      });
      res.json({ success: true, ...out });
    }),
  );

  return r;
}
