import { secret } from "encore.dev/config";

const frontendUrl = secret("BillingFrontendUrl");
const defaultPriceId = secret("StripeDefaultPriceId");

function requireTrimmed(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }

  return trimmed;
}

export function getFrontendUrl(): string {
  return requireTrimmed(frontendUrl(), "BillingFrontendUrl").replace(/\/+$/, "");
}

export function getDefaultPriceId(): string {
  return requireTrimmed(defaultPriceId(), "StripeDefaultPriceId");
}
