import { rateLimit, ipKeyGenerator, type Store } from 'express-rate-limit';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Rate limiting (express-rate-limit), mounted AFTER requireAuth so signed-in users are limited
 * per uid; demo traffic is limited per client IP (IPv6 grouped by /56).
 *
 * Storage is pluggable. The default is process memory, which is correct for a single instance.
 * When running several instances (e.g. Cloud Run with >1 instance), register a shared store
 * BEFORE the first request, for example with Redis:
 *
 *   import { RedisStore } from 'rate-limit-redis';
 *   import { createClient } from 'redis';
 *   const redis = createClient({ url: process.env.REDIS_URL }); await redis.connect();
 *   setRateLimitStoreFactory((prefix) => new RedisStore({ prefix, sendCommand: (...a) => redis.sendCommand(a) }));
 *
 * (npm i rate-limit-redis redis). See HOW_TO_RUN.md "Rate limits".
 */
export type RateLimitStoreFactory = (prefix: string) => Store | undefined;

let storeFactory: RateLimitStoreFactory = () => undefined; // undefined = built-in MemoryStore

export function setRateLimitStoreFactory(factory: RateLimitStoreFactory) {
  storeFactory = factory;
}

interface LimiterSpec {
  name: string;
  limit: () => number;
  message: string;
}

const registry: Array<() => void> = [];

/**
 * A stable middleware whose underlying limiter is (re)built by buildRateLimiters(), which createApp()
 * calls at startup after any shared store has been registered.
 */
function lazyLimiter(spec: LimiterSpec): RequestHandler & { reset: () => void } {
  let impl: RequestHandler | null = null;
  const build = () => {
    impl = rateLimit({
      windowMs: 60_000,
      limit: spec.limit(),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      store: storeFactory(`rl:${spec.name}:`),
      keyGenerator: (r: Request) => {
        const ctx = r.authContext;
        if (ctx && !ctx.demo) return `uid:${ctx.uid}`;
        return `ip:${ipKeyGenerator(r.ip || 'unknown')}`;
      },
      handler: (_r, s) => {
        s.status(429).json({ error: 'RATE_LIMITED', message: spec.message });
      },
    });
  };
  registry.push(build);
  const handler = ((req: Request, res: Response, next: NextFunction) => {
    if (!impl) build();
    return impl!(req, res, next);
  }) as RequestHandler & { reset: () => void };
  /** Rebuilds with current settings and empty counters (tests). */
  handler.reset = build;
  return handler;
}

/** Creates every limiter with the current store and limits. Called by createApp(). */
export function buildRateLimiters() {
  registry.forEach((build) => build());
}

/** AI endpoints: AI_RATE_LIMIT_PER_MINUTE (default 20) per user. */
export const aiRateLimiter = lazyLimiter({
  name: 'ai',
  limit: () => Number(process.env.AI_RATE_LIMIT_PER_MINUTE) || 20,
  message: 'Too many AI requests. Please wait a minute and try again.',
});

/** Webhook URL checks (they perform DNS lookups): WEBHOOK_RATE_LIMIT_PER_MINUTE (default 30). */
export const webhookRateLimiter = lazyLimiter({
  name: 'webhook',
  limit: () => Number(process.env.WEBHOOK_RATE_LIMIT_PER_MINUTE) || 30,
  message: 'Too many webhook requests. Please wait a minute and try again.',
});

/** Writes to workspace data (influencers, Campaign OS, audit events): DATA_WRITE_RATE_LIMIT_PER_MINUTE (default 120). */
export const dataWriteRateLimiter = lazyLimiter({
  name: 'data',
  limit: () => Number(process.env.DATA_WRITE_RATE_LIMIT_PER_MINUTE) || 120,
  message: 'Too many changes in a short time. Please wait a moment and try again.',
});
