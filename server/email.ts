/**
 * Transactional email through Resend (https://resend.com). On when RESEND_API_KEY and EMAIL_FROM
 * are set (EMAIL_FROM must be on a domain verified in Resend, e.g. "Launchpad <team@yourdomain.com>").
 * Otherwise nothing is sent and callers fall back to showing a copyable link.
 */
export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export async function sendEmail(
  msg: { to: string; subject: string; text: string; html?: string },
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ sent: boolean; id?: string; error?: string }> {
  if (!emailEnabled()) return { sent: false, error: 'EMAIL_NOT_CONFIGURED' };
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html ?? `<p>${escapeHtml(msg.text).replace(/\n/g, '<br>')}</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      console.warn('[email] Resend refused:', res.status, String(body.message ?? '').slice(0, 200));
      return { sent: false, error: `HTTP_${res.status}` };
    }
    return { sent: true, id: body.id };
  } catch (err) {
    console.warn('[email] send failed:', (err as Error).message);
    return { sent: false, error: 'NETWORK_ERROR' };
  }
}

export { escapeHtml };
