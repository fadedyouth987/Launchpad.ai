-- Monthly plan subscriptions (Stripe Billing). One row per workspace that has ever subscribed; kept in
-- sync only by the signed Stripe webhook. workspaces.plan follows the plan of an active subscription.
CREATE TABLE workspace_subscriptions (
  workspace_id text PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text NOT NULL UNIQUE,
  plan text NOT NULL CHECK (plan IN ('starter', 'professional', 'enterprise')),
  -- Stripe subscription status: active, trialing, past_due, unpaid, canceled, incomplete, incomplete_expired, paused.
  status text NOT NULL CHECK (char_length(status) <= 40),
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  -- Stripe event time of the last applied change; older (out-of-order) events are ignored.
  last_event_at timestamptz NOT NULL DEFAULT to_timestamp(0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_subscriptions_customer_idx ON workspace_subscriptions (stripe_customer_id);
