import { db } from "./db";

export type BillingSubscriptionState =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "inactive";

export interface BillingAccount {
  id: string;
  email: string | null;
  stripeCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionStatus {
  status: BillingSubscriptionState;
  currentPeriodEnd?: string;
  priceId?: string;
  stripeSubscriptionId?: string;
}

interface BillingAccountRow {
  id: string;
  email: string | null;
  stripe_customer_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface SubscriptionRow {
  stripe_subscription_id: string;
  account_id: string;
  price_id: string | null;
  status: BillingSubscriptionState;
  current_period_end: Date | null;
  created_at: Date;
  updated_at: Date;
}

function normalizeOptionalText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mapAccount(row: BillingAccountRow): BillingAccount {
  return {
    id: row.id,
    email: row.email,
    stripeCustomerId: row.stripe_customer_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSubscription(row: SubscriptionRow): SubscriptionStatus {
  return {
    status: row.status,
    currentPeriodEnd: row.current_period_end?.toISOString(),
    priceId: row.price_id ?? undefined,
    stripeSubscriptionId: row.stripe_subscription_id,
  };
}

export async function getAccount(id: string): Promise<BillingAccount | null> {
  const row = await db.queryRow<BillingAccountRow>`
    SELECT id, email, stripe_customer_id, created_at, updated_at
    FROM billing_accounts
    WHERE id = ${id}
  `;

  return row ? mapAccount(row) : null;
}

export async function getOrCreateAccount(
  id: string,
  email?: string
): Promise<BillingAccount> {
  const normalizedEmail = normalizeOptionalText(email);
  const existing = await getAccount(id);
  if (existing) {
    if (normalizedEmail && normalizedEmail !== existing.email) {
      return updateAccount(id, { email: normalizedEmail });
    }

    return existing;
  }

  const row = await db.queryRow<BillingAccountRow>`
    INSERT INTO billing_accounts (id, email, created_at, updated_at)
    VALUES (${id}, ${normalizedEmail}, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
    RETURNING id, email, stripe_customer_id, created_at, updated_at
  `;

  if (row) {
    return mapAccount(row);
  }

  const account = await getAccount(id);
  if (!account) {
    throw new Error("failed to create billing account");
  }

  if (normalizedEmail && normalizedEmail !== account.email) {
    return updateAccount(id, { email: normalizedEmail });
  }

  return account;
}

export async function updateAccount(
  id: string,
  updates: { email?: string; stripeCustomerId?: string }
): Promise<BillingAccount> {
  const email = normalizeOptionalText(updates.email);
  const stripeCustomerId = normalizeOptionalText(updates.stripeCustomerId);
  const row = await db.queryRow<BillingAccountRow>`
    INSERT INTO billing_accounts (id, email, stripe_customer_id, created_at, updated_at)
    VALUES (${id}, ${email}, ${stripeCustomerId}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, billing_accounts.email),
      stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, billing_accounts.stripe_customer_id),
      updated_at = NOW()
    RETURNING id, email, stripe_customer_id, created_at, updated_at
  `;

  if (!row) {
    throw new Error("failed to update billing account");
  }

  return mapAccount(row);
}

export async function upsertSubscription(params: {
  accountId: string;
  stripeSubscriptionId: string;
  priceId?: string;
  status: BillingSubscriptionState;
  currentPeriodEnd?: string;
}): Promise<SubscriptionStatus> {
  const currentPeriodEnd = params.currentPeriodEnd
    ? new Date(params.currentPeriodEnd)
    : null;

  const row = await db.queryRow<SubscriptionRow>`
    INSERT INTO billing_subscriptions (
      stripe_subscription_id,
      account_id,
      price_id,
      status,
      current_period_end,
      created_at,
      updated_at
    ) VALUES (
      ${params.stripeSubscriptionId},
      ${params.accountId},
      ${params.priceId ?? null},
      ${params.status},
      ${currentPeriodEnd},
      NOW(),
      NOW()
    )
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      price_id = COALESCE(EXCLUDED.price_id, billing_subscriptions.price_id),
      status = EXCLUDED.status,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = NOW()
    RETURNING stripe_subscription_id, account_id, price_id, status, current_period_end, created_at, updated_at
  `;

  if (!row) {
    throw new Error("failed to upsert subscription");
  }

  return mapSubscription(row);
}

export async function setLatestSubscriptionInactive(
  accountId: string
): Promise<SubscriptionStatus | null> {
  const row = await db.queryRow<SubscriptionRow>`
    WITH latest AS (
      SELECT stripe_subscription_id
      FROM billing_subscriptions
      WHERE account_id = ${accountId}
      ORDER BY updated_at DESC
      LIMIT 1
    )
    UPDATE billing_subscriptions
    SET
      status = 'inactive',
      current_period_end = NULL,
      updated_at = NOW()
    WHERE stripe_subscription_id = (SELECT stripe_subscription_id FROM latest)
      AND (status <> 'inactive' OR current_period_end IS NOT NULL)
    RETURNING stripe_subscription_id, account_id, price_id, status, current_period_end, created_at, updated_at
  `;

  return row ? mapSubscription(row) : null;
}

export async function getLatestSubscription(
  accountId: string
): Promise<SubscriptionStatus | null> {
  const row = await db.queryRow<SubscriptionRow>`
    SELECT stripe_subscription_id, account_id, price_id, status, current_period_end, created_at, updated_at
    FROM billing_subscriptions
    WHERE account_id = ${accountId}
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  return row ? mapSubscription(row) : null;
}
