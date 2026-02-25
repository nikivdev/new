#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-9031}"
ROOT_PASSWORD="${ROOT_PASSWORD:-dev-password}"
API_TOKEN="${API_TOKEN:-dev-token}"

LOG_FILE="${ROOT_DIR}/.smoke-effect4.log"

fail() {
  echo "$1"
  echo "--- effect4 log tail ---"
  tail -n 80 "${LOG_FILE}" 2>/dev/null || true
  exit 1
}

cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cd "${ROOT_DIR}"

PORT="${PORT}" ROOT_PASSWORD="${ROOT_PASSWORD}" API_TOKEN="${API_TOKEN}" \
  bun run --cwd api/effect4 dev >"${LOG_FILE}" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null

TOKEN="$(curl -fsS -X POST "http://127.0.0.1:${PORT}/api/auth/login" \
  -H "content-type: application/json" \
  --data "{\"password\":\"${ROOT_PASSWORD}\"}" | jq -r '.token')"

if [ -z "${TOKEN}" ] || [ "${TOKEN}" = "null" ]; then
  fail "smoke failed: login did not return token"
fi

UNAUTH_CODE="$(curl -sS -o /dev/null -w "%{http_code}" \
  "http://127.0.0.1:${PORT}/api/auth/session")"
if [ "${UNAUTH_CODE}" != "401" ]; then
  fail "smoke failed: expected 401 for missing auth, got ${UNAUTH_CODE}"
fi

BADJSON_CODE="$(curl -sS -o /dev/null -w "%{http_code}" \
  -X POST "http://127.0.0.1:${PORT}/v1/chat/completions" \
  -H "authorization: Bearer ${TOKEN}" \
  -H "content-type: application/json" \
  --data "{bad")"
if [ "${BADJSON_CODE}" != "400" ]; then
  fail "smoke failed: expected 400 for invalid JSON, got ${BADJSON_CODE}"
fi

STREAM_CHUNK="$(curl -N -sS -X POST "http://127.0.0.1:${PORT}/v1/chat/completions" \
  -H "authorization: Bearer ${TOKEN}" \
  -H "content-type: application/json" \
  --data '{"messages":[{"role":"user","content":"hello starter"}]}' | sed -n '1,3p')"
if ! echo "${STREAM_CHUNK}" | grep -q '^data: '; then
  fail "smoke failed: stream did not return SSE data lines"
fi

FREE_CHUNK="$(curl -N -sS -X POST "http://127.0.0.1:${PORT}/free" \
  -H "authorization: Bearer ${TOKEN}" \
  -H "content-type: application/json" \
  --data '{"messages":[{"role":"user","content":"hello free route"}]}' | sed -n '1,2p')"
if ! echo "${FREE_CHUNK}" | grep -q '^data: '; then
  fail "smoke failed: /free did not return SSE data lines"
fi

echo "effect4 smoke: ok"
