# TypeScript Encore HTTP Starter

A small Encore.ts starter for HTTP services with a few basic endpoints.

## Quickstart

- `f setup` to install dependencies
- `f dev` to run the development server
- `f test` to run tests (Encore bootstraps infra before running your test runner)

Once running, open the local dev dashboard at `http://localhost:9400`.

## Endpoints

- `GET /healthz` health check
- `GET /v1/hello/:name` greeting
- `POST /v1/messages` create an in-memory message
- `GET /v1/messages/:id` fetch a message by id

Example:

```bash
curl http://localhost:4000/healthz
curl http://localhost:4000/v1/hello/encore
curl -X POST http://localhost:4000/v1/messages \
  -H 'Content-Type: application/json' \
  -d '{"client_id":"demo","body":"hello"}'
```

## Notes

Messages are stored in-memory for the starter. Swap in a database once you
move beyond the template.

## Payments scaffold

This starter includes a `billing` service with Stripe-based endpoints:

- `POST /billing/checkout`
- `POST /billing/portal`
- `GET /billing/subscription/:account_id`
- `GET /billing/subscription/:account_id/cached`

Configure billing via Encore secrets:

- `StripeSecretKey`
- `StripeDefaultPriceId`
- `BillingFrontendUrl`

## Database

The billing service uses an Encore-managed Postgres database defined in
`billing/db.ts` with migrations in `billing/migrations`.
Run `f dev` and Encore will boot a local Postgres instance.

## Production config (PlanetScale Postgres)

This repo includes `infra.config.json` for connecting Encore to an external
Postgres instance. Update the placeholders to your PlanetScale host/db/user and
set the password via environment variable:

- `DB_PASSWORD`

Encore secrets needed for billing:

- `StripeSecretKey`
- `StripeDefaultPriceId`
- `BillingFrontendUrl`
