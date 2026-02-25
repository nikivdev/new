# Effect 4 API Smoke

## One-command smoke

```bash
cd /Users/nikiv/new/app
bun run smoke:effect4
```

## Start

```bash
cd /Users/nikiv/new/app
bun run dev:api-effect4
```

## Health

```bash
curl -sS http://127.0.0.1:9031/health
```

## Login

```bash
TOKEN="$(curl -sS -X POST http://127.0.0.1:9031/api/auth/login \
  -H 'content-type: application/json' \
  --data '{"password":"dev-password"}' | jq -r '.token')"
echo "$TOKEN"
```

## Session check

```bash
curl -sS http://127.0.0.1:9031/api/auth/session \
  -H "authorization: Bearer $TOKEN"
```

## SSE chat check

```bash
curl -N -sS -X POST http://127.0.0.1:9031/v1/chat/completions \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  --data '{"messages":[{"role":"user","content":"hello"}]}'
```

You should receive `data:` chunks and a final `data: [DONE]`.

## Error checks

Invalid JSON should return `400`:

```bash
curl -i -sS -X POST http://127.0.0.1:9031/v1/chat/completions \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  --data '{bad'
```

Missing auth should return `401`:

```bash
curl -i -sS http://127.0.0.1:9031/api/auth/session
```
