# Assistant Rules (api/ts)

Follow Effect best practices from:
`/Users/nikiv/repos/Makisuo/skills/effect-best-practices`

Enable strict linting via oxlint (custom oxc rules). Override as needed:

```
RISE_OXLINT_CONFIG=/path/to/.oxlintrc.json
RISE_OXLINT_BIN=/path/to/oxlint
```

Traces are shipped to the local AI server by default:
- `LINSA_TRACE_ENDPOINT` (default `http://127.0.0.1:7331/v1/trace`)
- `LINSA_TRACE_FILE` (fallback JSONL)

Skills (on-demand):
- rise-dev-logs: Use only when debugging Rise dev logs, Expo/Metro errors, hot reload issues, or when the user says "failed" while running rise dev/mobile.
- rise-dev-traces: Use only when debugging Rise behavior/regressions or when the user asks for traces/logs, proxy traces, fish traces, MoonBit compiler output, or AI trace context.
