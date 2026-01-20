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
