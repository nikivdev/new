CREATE TABLE billing_accounts (
    id TEXT PRIMARY KEY,
    email TEXT,
    stripe_customer_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE billing_subscriptions (
    stripe_subscription_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
    price_id TEXT,
    status TEXT NOT NULL,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX billing_subscriptions_account_updated_idx ON billing_subscriptions(account_id, updated_at DESC);
