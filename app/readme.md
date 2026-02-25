# Web + Effect API Starter

Starter workspace for new projects that want:

- `web/`: a full TanStack Start frontend base.
- `api/ts/`: full Rise-style API stack (Effect + domain + db) for deeper backend work.
- `api/effect4/`: clean, minimal **Effect 4** API starter for fast project bootstrapping.

## Quick start

```bash
cd /Users/nikiv/new/app
bun install
```

Run full starter verification:

```bash
bun run verify:starter
```

Run the Effect 4 starter API:

```bash
bun run dev:api-effect4
```

Run web app:

```bash
bun run dev:web
```

## Effect 4 API contract (`api/effect4`)

- `GET /health`
- `POST /api/auth/login` body: `{ "password": "..." }`
- `GET /api/auth/session` with `Authorization: Bearer <token>`
- `POST /v1/chat/completions` with bearer auth, SSE stream response
- `POST /chat/completions` alias
- `POST /free` alias (same behavior in starter)

Default local env values:

- `PORT=9031`
- `ROOT_PASSWORD=dev-password`
- `API_TOKEN=dev-token`

## Validation

```bash
bun run typecheck
bun run build:web
bun run smoke:effect4
```

## Notes

- `web/` is intentionally included as a feature-rich visual baseline.
- `api/effect4` is intentionally small and stable so you can fork it quickly per project.
- `api/ts` remains available if you want the larger Rise-style stack (domain/db/canvas/billing).
- The copied `web/` baseline is build-validated (`bun run build:web`) and not used as a strict TypeScript gate in this starter.
