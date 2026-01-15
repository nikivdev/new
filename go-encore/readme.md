# Go Encore HTTP Starter

This is a small, production-ready Encore starter for HTTP services. It includes
structured logging, metrics, and clean API patterns out of the box.

## Quickstart

- `f setup` to install dependencies
- `f dev` to run the development server
- `f test` to run tests

Once running, open the local dev dashboard at `http://localhost:9400` to inspect
traces, logs, and metrics.

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

## Observability

- Logging uses `encore.dev/rlog`, which is automatically tied to request traces.
- Metrics are emitted via `encore.dev/metrics` in `api/metrics.go`.
- Tracing is automatic in Encore; inspect it in the local dev dashboard.

## Configuration

Defaults live in `api/config.cue` and are loaded with `encore.dev/config`:

- `ReadOnly`: disable writes to the service.
- `DefaultGreeting`: base greeting for the hello endpoint.
- `MaxMessageLength`: validation for message bodies.
