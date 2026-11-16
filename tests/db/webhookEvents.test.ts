// Asset status changes are delivered to the workspace's webhook receivers, signed with the receiver's
// secret. A local HTTP server stands in for Zapier/Make; the SSRF check is mocked for that one URL.
import http from 'node:http';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server/app';
import { closeDb } from '../../server/db';
import { as as asUser, createUser, type TestUser } from './helpers';
import { initialCampaignAssets } from '../../src/data/initialData';

let receiverUrl = '';
vi.mock('../../server/urlSafety', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../server/urlSafety')>();
  return {
    ...real,
    checkWebhookUrl: async (url: string) =>
      receiverUrl && url.startsWith(receiverUrl)
        ? { ok: true, url: new URL(url), addresses: ['127.0.0.1'] }
        : real.checkWebhookUrl(url),
  };
});
vi.stubEnv('WEBHOOK_DELIVERY_ENABLED', 'true');

const received: Array<{ body: string; signature: string }> = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    received.push({ body, signature: String(req.headers['x-launchpad-signature'] || '') });
    res.writeHead(200).end('ok');
  });
});

const app = createApp({ ai: null });
const as = (u: TestUser) => asUser(app, u);
let owner: TestUser;
let WS: string;
let secret = '';

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  receiverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  owner = await createUser('wh-owner');
  WS = (await as(owner).post('/api/workspaces').send({ name: 'Hooks Co' })).body.workspace.id;
  const ep = await as(owner)
    .post('/api/webhooks/endpoints')
    .send({ workspaceId: WS, url: `${receiverUrl}hook` });
  expect(ep.status).toBe(201);
  secret = ep.body.secret;
});
afterAll(async () => {
  server.close();
  await closeDb();
});

describe('asset webhook events', () => {
  const asset = (status: string) => ({
    ...structuredClone(initialCampaignAssets[0]),
    id: `asset-wh-${WS.slice(-8)}`,
    status,
  });

  it('approval.requested is delivered, signed, when an asset enters review', async () => {
    const r = await as(owner)
      .put(`/api/workspaces/${WS}/campaign-assets/${asset('pending_review').id}`)
      .send(asset('pending_review'));
    expect(r.status).toBe(201);
    expect(r.body.event).toBe('approval.requested');
    expect(r.body.deliveries[0].status).toBe(200);
    const got = received.at(-1)!;
    const evt = JSON.parse(got.body);
    expect(evt).toMatchObject({
      event: 'approval.requested',
      workspaceId: WS,
      data: { asset: { status: 'pending_review' } },
    });
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]+)$/.exec(got.signature)!;
    expect(createHmac('sha256', secret).update(`${t}.${got.body}`).digest('hex')).toBe(v1);
  });

  it('no event when the status does not change; publishing sends asset.published', async () => {
    const n = received.length;
    const same = await as(owner)
      .put(`/api/workspaces/${WS}/campaign-assets/${asset('pending_review').id}`)
      .send(asset('pending_review'));
    expect(same.body.event).toBeUndefined();
    expect(received.length).toBe(n);
    const pub = await as(owner)
      .put(`/api/workspaces/${WS}/campaign-assets/${asset('published').id}`)
      .send(asset('published'));
    expect(pub.body.event).toBe('asset.published');
    expect(received.length).toBe(n + 1);
    expect(JSON.parse(received.at(-1)!.body).event).toBe('asset.published');
  });
});
