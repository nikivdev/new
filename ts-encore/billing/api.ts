import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { getDefaultPriceId, getFrontendUrl } from "./config";
import { normalizeSubscriptionStatus, stripeClient } from "./stripe";
import {
  getAccount,
  getOrCreateAccount,
  getLatestSubscription,
  setLatestSubscriptionInactive,
  updateAccount,
  upsertSubscription,
} from "./store";

interface CheckoutRequest {
  account_id: string;
  email?: string;
  price_id?: string;
}

interface CheckoutResponse {
  url: string;
}

interface PortalRequest {
  account_id: string;
}

interface PortalResponse {
  url: string;
}

interface SubscriptionResponse {
  status: "active" | "trialing" | "past_due" | "canceled" | "inactive";
  current_period_end?: string;
  price_id?: string;
}

function requireAccountId(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw APIError.invalidArgument("account_id is required");
  }

  return trimmed;
}

function normalizeOptionalString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const checkout = api(
  { expose: true, method: "POST", path: "/billing/checkout" },
  async (req: CheckoutRequest): Promise<CheckoutResponse> => {
    const accountId = requireAccountId(req?.account_id);
    const email = normalizeOptionalString(req.email);

    let account = await getOrCreateAccount(accountId, email);

    if (!account.stripeCustomerId) {
      const customer = await stripeClient.createCustomer({
        email: account.email ?? email,
        metadata: { account_id: account.id },
        idempotencyKey: `billing-customer:${account.id}`,
      });
      account = await updateAccount(account.id, {
        stripeCustomerId: customer.id,
      });
    }

    if (!account.stripeCustomerId) {
      throw APIError.internal("stripe customer was not persisted");
    }

    let priceId = normalizeOptionalString(req.price_id);
    if (!priceId) {
      try {
        priceId = getDefaultPriceId();
      } catch (error) {
        log.error("billing.checkout.config_error", {
          account_id: account.id,
          error: error instanceof Error ? error.message : String(error),
        });
        throw APIError.internal("default price is not configured");
      }
    }

    if (!priceId || priceId === "price_replace_me") {
      throw APIError.invalidArgument("price_id is not configured");
    }

    let frontendUrl: string;
    try {
      frontendUrl = getFrontendUrl();
    } catch (error) {
      log.error("billing.checkout.config_error", {
        account_id: account.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("frontend URL is not configured");
    }

    const session = await stripeClient.createCheckoutSession({
      customerId: account.stripeCustomerId,
      priceId,
      successUrl: `${frontendUrl}/billing/success`,
      cancelUrl: `${frontendUrl}/billing/cancel`,
      metadata: { account_id: account.id },
    });

    log.info("billing.checkout", {
      account_id: account.id,
      session_id: session.id,
    });

    return { url: session.url };
  }
);

export const portal = api(
  { expose: true, method: "POST", path: "/billing/portal" },
  async (req: PortalRequest): Promise<PortalResponse> => {
    const accountId = requireAccountId(req?.account_id);

    const account = await getAccount(accountId);
    if (!account || !account.stripeCustomerId) {
      throw APIError.notFound("stripe customer not found");
    }

    let frontendUrl: string;
    try {
      frontendUrl = getFrontendUrl();
    } catch (error) {
      log.error("billing.portal.config_error", {
        account_id: account.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("frontend URL is not configured");
    }

    const session = await stripeClient.createPortalSession({
      customerId: account.stripeCustomerId,
      returnUrl: `${frontendUrl}/billing`,
    });

    return { url: session.url };
  }
);

export const subscription = api(
  { expose: true, method: "GET", path: "/billing/subscription/:account_id" },
  async ({ account_id }: { account_id: string }): Promise<SubscriptionResponse> => {
    const accountId = requireAccountId(account_id);

    const account = await getAccount(accountId);
    if (!account?.stripeCustomerId) {
      if (account) {
        await setLatestSubscriptionInactive(account.id);
      }
      return { status: "inactive" };
    }

    const stripeSub = await stripeClient.getLatestSubscription(account.stripeCustomerId);
    if (!stripeSub) {
      await setLatestSubscriptionInactive(account.id);
      return { status: "inactive" };
    }

    const status = normalizeSubscriptionStatus(stripeSub.status);
    const currentPeriodEnd = stripeSub.current_period_end
      ? new Date(stripeSub.current_period_end * 1000).toISOString()
      : undefined;
    const priceId = stripeSub.items.data[0]?.price?.id ?? undefined;

    await upsertSubscription({
      accountId: account.id,
      stripeSubscriptionId: stripeSub.id,
      priceId,
      status,
      currentPeriodEnd,
    });

    return {
      status,
      current_period_end: currentPeriodEnd,
      price_id: priceId,
    };
  }
);

export const subscriptionCached = api(
  { expose: true, method: "GET", path: "/billing/subscription/:account_id/cached" },
  async ({ account_id }: { account_id: string }): Promise<SubscriptionResponse> => {
    const accountId = requireAccountId(account_id);

    const subscription = await getLatestSubscription(accountId);
    if (!subscription) {
      return { status: "inactive" };
    }

    return {
      status: subscription.status,
      current_period_end: subscription.currentPeriodEnd,
      price_id: subscription.priceId,
    };
  }
);
