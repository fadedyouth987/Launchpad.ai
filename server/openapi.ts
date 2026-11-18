/**
 * OpenAPI 3.1 description of what a workspace API key can do. Served at GET /api/v1/openapi.json
 * (importable into Postman, Insomnia, Make and Zapier's API tools). Keep in sync with KEY_ROUTES.
 */
const ws = { name: 'workspaceId', in: 'path', required: true, schema: { type: 'string' } } as const;
const id = (name: string) => ({ name, in: 'path', required: true, schema: { type: 'string' } }) as const;
const wsHeader = { name: 'x-workspace-id', in: 'header', required: true, schema: { type: 'string' } } as const;
const json = (schema: object) => ({ required: true, content: { 'application/json': { schema } } });
const ok = (description: string) => ({ description, content: { 'application/json': { schema: { type: 'object' } } } });
const errors = {
  '401': { description: 'Missing, invalid, revoked or expired key' },
  '402': { description: 'Not enough credits' },
  '403': { description: 'The key’s permissions do not allow this (or keys cannot call this endpoint)' },
  '429': { description: 'Rate limited (per key)' },
};
const scope = (s: 'read' | 'write' | 'publish') => ({ 'x-required-scope': s });

const platform = { type: 'string', enum: ['instagram', 'tiktok', 'linkedin', 'twitter', 'facebook'] };
const asset = {
  type: 'object',
  description:
    'A post. Create or update with PUT (the whole object). With the write permission a post can be draft or pending_review; approving or scheduling needs publish. Changing the text, hashtags, image, title or platform of an approved/scheduled post with only write saves it as pending_review (see status in the response).',
  required: [
    'id',
    'title',
    'platform',
    'status',
    'currentVersion',
    'versions',
    'caption',
    'hashtags',
    'imagePrompt',
    'visualDirection',
    'comments',
  ],
  properties: {
    id: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,128}$' },
    title: { type: 'string', maxLength: 200 },
    platform,
    status: { type: 'string', enum: ['draft', 'pending_review', 'approved', 'rejected', 'scheduled', 'published'] },
    caption: { type: 'string', maxLength: 2000 },
    hashtags: { type: 'array', items: { type: 'string' }, maxItems: 30 },
    scheduledTime: { type: 'string', format: 'date-time', description: 'UTC, e.g. 2026-12-01T09:00:00.000Z' },
    imageId: { type: 'string', description: 'A generated image (img-...) to attach' },
    imagePrompt: { type: 'string' },
    visualDirection: { type: 'string' },
    currentVersion: { type: 'integer' },
    versions: { type: 'array', items: { type: 'object' } },
    comments: { type: 'array', items: { type: 'object' } },
  },
};

export const OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'Launchpad API',
    version: '1.0.0',
    description:
      'Integrate other apps with a Launchpad workspace. Create a key in Settings > API keys (owners/admins) and send it as `Authorization: Bearer lp_live_...`. A key works for one workspace only. Permissions: read (view), write (create and edit drafts, generate with AI; spends credits), publish (approve, schedule and publish). Credits, approval rules and rate limits apply as for people. Every action is in the audit log under the key’s name.',
  },
  servers: [{ url: '/api', description: 'This API (prefix with your API host)' }],
  security: [{ apiKey: [] }],
  components: {
    securitySchemes: { apiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'lp_live_...' } },
    schemas: { CampaignAsset: asset },
  },
  paths: {
    '/v1/key': {
      get: {
        summary: 'Check the key: its workspace and permissions',
        ...scope('read'),
        responses: { '200': ok('Key info'), ...errors },
      },
    },
    '/workspaces/{workspaceId}/campaign-assets': {
      get: {
        summary: 'List posts',
        ...scope('read'),
        parameters: [ws],
        responses: { '200': ok('{ assets: CampaignAsset[] }'), ...errors },
      },
    },
    '/workspaces/{workspaceId}/campaign-assets/{id}': {
      put: {
        summary: 'Create or update a post',
        ...scope('write'),
        parameters: [ws, id('id')],
        requestBody: json({ $ref: '#/components/schemas/CampaignAsset' }),
        responses: { '200': ok('Updated'), '201': ok('Created'), ...errors },
      },
      delete: {
        summary: 'Delete a post (one the key created)',
        ...scope('write'),
        parameters: [ws, id('id')],
        responses: { '200': ok('Deleted'), ...errors },
      },
    },
    '/workspaces/{workspaceId}/campaign-assets/{id}/publish': {
      post: {
        summary: 'Publish an approved or scheduled LinkedIn post now (or retry a failed one)',
        ...scope('publish'),
        parameters: [ws, id('id')],
        responses: {
          '200': ok('{ url }'),
          '409': {
            description:
              'error is one of PLATFORM_NOT_SUPPORTED, NOT_APPROVED, NO_ACCOUNT, LINKEDIN_NOT_CONFIGURED, ALREADY_PUBLISHED, IN_PROGRESS, FAILED_NEEDS_RETRY',
          },
          '502': { description: "LinkedIn refused: error PUBLISH_FAILED, LinkedIn's reason in message" },
          ...errors,
        },
      },
    },
    '/workspaces/{workspaceId}/social/posts': {
      get: {
        summary: 'Publishing history (status and LinkedIn link per post)',
        ...scope('read'),
        parameters: [ws],
        responses: { '200': ok('{ posts }'), ...errors },
      },
    },
    '/workspaces/{workspaceId}/influencers': {
      get: {
        summary: 'List AI influencers',
        ...scope('read'),
        parameters: [ws],
        responses: { '200': ok('{ influencers }'), ...errors },
      },
    },
    '/generate': {
      post: {
        summary: 'Generate a post (caption, hashtags, image prompt) with AI',
        ...scope('write'),
        requestBody: json({
          type: 'object',
          required: ['workspaceId', 'prompt'],
          properties: {
            workspaceId: { type: 'string' },
            prompt: { type: 'string', maxLength: 2000 },
            platform,
            purpose: { type: 'string', enum: ['studio', 'influencer'] },
            stylePreset: { type: 'string' },
          },
        }),
        responses: {
          '200': ok('{ data: { caption, hashtags, imagePrompt, visualDirection }, costCredits, newBalance }'),
          ...errors,
        },
      },
    },
    '/trends': {
      post: {
        summary: 'Trending topics',
        ...scope('write'),
        parameters: [wsHeader],
        requestBody: json({
          type: 'object',
          properties: { category: { type: 'string' }, platform: { type: 'string' } },
        }),
        responses: { '200': ok('{ trends }'), ...errors },
      },
    },
    '/engagement/suggest-reply': {
      post: {
        summary: 'Suggest a reply to a comment',
        ...scope('write'),
        parameters: [wsHeader],
        requestBody: json({
          type: 'object',
          required: ['commentText'],
          properties: {
            commentText: { type: 'string' },
            postCaption: { type: 'string' },
            platform,
            brandTone: { type: 'string' },
          },
        }),
        responses: { '200': ok('{ reply }'), ...errors },
      },
    },
    '/images/generate': {
      post: {
        summary: 'Generate an image',
        ...scope('write'),
        requestBody: json({
          type: 'object',
          required: ['workspaceId', 'prompt'],
          properties: { workspaceId: { type: 'string' }, prompt: { type: 'string', maxLength: 2000 } },
        }),
        responses: { '200': ok('{ image, url }'), ...errors },
      },
    },
    '/workspaces/{workspaceId}/images': {
      get: {
        summary: 'List generated images',
        ...scope('read'),
        parameters: [ws],
        responses: { '200': ok('{ images }'), ...errors },
      },
    },
    '/workspaces/{workspaceId}/images/{id}': {
      get: {
        summary: 'Download an image file',
        ...scope('read'),
        parameters: [ws, id('id')],
        responses: { '200': { description: 'Image bytes' }, ...errors },
      },
    },
    '/workspaces/{workspaceId}/media/voices': {
      get: {
        summary: 'Voices available (ElevenLabs)',
        ...scope('read'),
        parameters: [ws],
        responses: { '200': ok('{ enabled, costs, standard, cloned }'), ...errors },
      },
    },
    '/workspaces/{workspaceId}/media/speech': {
      post: {
        summary: 'Text to speech (MP3)',
        ...scope('write'),
        parameters: [ws],
        requestBody: json({
          type: 'object',
          required: ['voiceId', 'text'],
          properties: {
            voiceId: { type: 'string' },
            text: { type: 'string', maxLength: 2500 },
            speed: { type: 'number' },
          },
        }),
        responses: { '200': ok('{ media }'), ...errors },
      },
    },
    '/workspaces/{workspaceId}/media/videos': {
      post: {
        summary: 'Start a talking-head video (D-ID). Poll GET media/{id} until status is ready.',
        ...scope('write'),
        parameters: [ws],
        requestBody: json({
          type: 'object',
          required: ['voiceId', 'text', 'imageUrl'],
          properties: {
            voiceId: { type: 'string' },
            text: { type: 'string' },
            imageUrl: { type: 'string', description: 'https URL of a front-facing photo' },
            speed: { type: 'number' },
          },
        }),
        responses: { '202': ok('{ media } (status processing)'), ...errors },
      },
    },
    '/workspaces/{workspaceId}/media': {
      get: {
        summary: 'List voice clips and videos',
        ...scope('read'),
        parameters: [ws],
        responses: { '200': ok('{ media }'), ...errors },
      },
    },
    '/workspaces/{workspaceId}/media/{id}': {
      get: {
        summary: 'One clip or video (checks render progress)',
        ...scope('read'),
        parameters: [ws, id('id')],
        responses: { '200': ok('{ media }'), ...errors },
      },
    },
    '/workspaces/{workspaceId}/media/{id}/content': {
      get: {
        summary: 'Download the MP3 or MP4',
        ...scope('read'),
        parameters: [ws, id('id')],
        responses: { '200': { description: 'File bytes' }, ...errors },
      },
    },
    '/billing/credits/check': {
      get: {
        summary: 'Credit balance',
        ...scope('read'),
        parameters: [wsHeader],
        responses: { '200': ok('{ creditsRemaining }'), ...errors },
      },
    },
    '/billing/ledger': {
      get: {
        summary: 'Credit history',
        ...scope('read'),
        parameters: [wsHeader],
        responses: { '200': ok('{ entries }'), ...errors },
      },
    },
  },
};
