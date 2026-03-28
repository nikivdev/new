import Stripe from "stripe";
import { secret } from "encore.dev/config";

const stripeSecretKey = secret("StripeSecretKey");

const stripe = new Stripe(stripeSecretKey(), {
  maxNetworkRetries: 2,
});

export type StripeSubscriptionState =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "inactive";

export interface CheckoutSessionInput {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CheckoutSessionResult {
  id: string;
  url: string;
}

export interface PortalSessionResult {
  url: string;
}

export class StripeClient {
  async createCustomer(params: {
    name?: string;
    email?: string;
    metadata?: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<Stripe.Customer> {
    return stripe.customers.create(
      {
        name: params.name,
        email: params.email,
        metadata: params.metadata,
      },
      params.idempotencyKey
        ? { idempotencyKey: params.idempotencyKey }
        : undefined
    );
  }

  async createCheckoutSession(
    input: CheckoutSessionInput
  ): Promise<CheckoutSessionResult> {
    const session = await stripe.checkout.sessions.create({
      customer: input.customerId,
      mode: "subscription",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      line_items: [
        {
          price: input.priceId,
          quantity: 1,
        },
      ],
      metadata: input.metadata,
    });

    if (!session.url) {
      throw new Error("stripe checkout session missing url");
    }

    return {
      id: session.id,
      url: session.url,
    };
  }

  async createPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<PortalSessionResult> {
    const session = await stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });

    if (!session.url) {
      throw new Error("stripe portal session missing url");
    }

    return { url: session.url };
  }

  async getLatestSubscription(
    customerId: string
  ): Promise<Stripe.Subscription | null> {
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });

    return [...subs.data].sort((left, right) => {
      const rankDiff =
        getSubscriptionRank(left.status) - getSubscriptionRank(right.status);
      if (rankDiff !== 0) {
        return rankDiff;
      }

      return right.created - left.created;
    })[0] ?? null;
  }
}

function getSubscriptionRank(status: Stripe.Subscription.Status): number {
  switch (status) {
    case "active":
      return 0;
    case "trialing":
      return 1;
    case "past_due":
      return 2;
    case "unpaid":
      return 3;
    case "paused":
      return 4;
    case "incomplete":
      return 5;
    case "incomplete_expired":
      return 6;
    case "canceled":
      return 7;
    default:
      return 8;
  }
}

export function normalizeSubscriptionStatus(
  status: Stripe.Subscription.Status | null | undefined
): StripeSubscriptionState {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
      return status;
    default:
      return "inactive";
  }
}

export const stripeClient = new StripeClient();
