#!/usr/bin/env bash
# Start all local SH-205 services for development.
#
# Services:
#   FastAPI recovery API  → http://127.0.0.1:5055
#   Node API gateway      → http://127.0.0.1:3000  (proxies /api/* → :5055)
#   Vite frontend         → http://127.0.0.1:5173
#
# Usage:
#   ./dev.sh              # start everything
#   ./dev.sh --install    # npm install (root + frontend) + uv sync, then start
#   ./dev.sh --no-frontend
#   ./dev.sh --no-recovery   # let Node spawn FastAPI itself
#
# Ctrl+C stops all child processes.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

NODE_PORT="${PORT:-3000}"
RECOVERY_HOST="${RECOVERY_API_HOST:-127.0.0.1}"
RECOVERY_PORT="${RECOVERY_API_PORT:-5055}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

DO_INSTALL=0
START_FRONTEND=1
START_RECOVERY=1

PIDS=()

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage ;;
    --install) DO_INSTALL=1 ;;
    --no-frontend) START_FRONTEND=0 ;;
    --no-recovery) START_RECOVERY=0 ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Try ./dev.sh --help" >&2
      exit 1
      ;;
  esac
  shift
done

color() {
  local code="$1"; shift
  if [[ -t 1 ]]; then
    printf '\033[%sm%s\033[0m' "$code" "$*"
  else
    printf '%s' "$*"
  fi
}

info()  { echo "$(color 36 '[dev]') $*"; }
ok()    { echo "$(color 32 '[dev]') $*"; }
warn()  { echo "$(color 33 '[dev]') $*" >&2; }
fail()  { echo "$(color 31 '[dev]') $*" >&2; exit 1; }

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  echo
  info "Shutting down services..."
  # Kill process groups so npm/uv children die too.
  local pid
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  sleep 0.4
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    fi
  done
  ok "Stopped."
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$port" 2>/dev/null | grep -q ":$port"
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local deadline=$((SECONDS + 45))
  while (( SECONDS < deadline )); do
    if curl -sf --max-time 1 "$url" >/dev/null 2>&1; then
      ok "$label is ready → $url"
      return 0
    fi
    sleep 0.4
  done
  warn "$label did not become ready at $url (continuing anyway)"
  return 1
}

prefix_logs() {
  local tag="$1"
  local code="$2"
  while IFS= read -r line || [[ -n "$line" ]]; do
    printf '%s %s\n' "$(color "$code" "[$tag]")" "$line"
  done
}

start_bg() {
  local tag="$1"
  local color_code="$2"
  shift 2
  info "Starting $tag: $*"
  # New session so cleanup can signal the whole tree.
  setsid "$@" > >(prefix_logs "$tag" "$color_code") 2> >(prefix_logs "$tag" "$color_code" >&2) &
  PIDS+=($!)
}

# ── prerequisites ──────────────────────────────────────────────
require_cmd node
require_cmd npm
require_cmd uv
require_cmd curl

[[ -f "$ROOT/.env" ]] || fail "Missing .env — copy .env.example and fill MONGODB_URI / MONGODB_DB_NAME"

if [[ ! -d "$ROOT/node_modules" ]] || [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  warn "node_modules missing — run ./dev.sh --install (or npm install)"
fi

if [[ "$DO_INSTALL" -eq 1 ]]; then
  info "Installing Node dependencies (root)..."
  npm install
  info "Installing Node dependencies (frontend)..."
  npm --prefix frontend install
  info "Syncing Python deps (uv)..."
  uv sync
fi

# ── port checks ────────────────────────────────────────────────
if port_in_use "$NODE_PORT"; then
  fail "Port $NODE_PORT already in use (Node gateway). Stop the other process or set PORT=..."
fi
if [[ "$START_RECOVERY" -eq 1 ]] && port_in_use "$RECOVERY_PORT"; then
  warn "Port $RECOVERY_PORT already in use — reusing existing Recovery API"
  START_RECOVERY=0
fi
if [[ "$START_FRONTEND" -eq 1 ]] && port_in_use "$FRONTEND_PORT"; then
  fail "Port $FRONTEND_PORT already in use (Vite). Stop the other process or set FRONTEND_PORT=..."
fi

info "Project root: $ROOT"
echo
info "Planned services:"
[[ "$START_RECOVERY" -eq 1 ]] && echo "  • Recovery API  http://${RECOVERY_HOST}:${RECOVERY_PORT}"
echo "  • Node gateway  http://127.0.0.1:${NODE_PORT}"
[[ "$START_FRONTEND" -eq 1 ]] && echo "  • Frontend      http://127.0.0.1:${FRONTEND_PORT}"
echo

# ── start services ─────────────────────────────────────────────
if [[ "$START_RECOVERY" -eq 1 ]]; then
  start_bg "recovery" 35 \
    uv run python -m graph.api_server --host "$RECOVERY_HOST" --port "$RECOVERY_PORT"
  wait_for_http "http://${RECOVERY_HOST}:${RECOVERY_PORT}/health" "Recovery API" || true
fi

start_bg "backend" 34 \
  npm run dev

wait_for_http "http://127.0.0.1:${NODE_PORT}/api/health" "Node gateway" || true

if [[ "$START_FRONTEND" -eq 1 ]]; then
  # Ensure frontend talks to the Node gateway (not FastAPI directly).
  export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://127.0.0.1:${NODE_PORT}}"
  start_bg "frontend" 36 \
    npm --prefix frontend run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT"
fi

echo
ok "Dev stack is up. Press Ctrl+C to stop all services."
echo
echo "  Dashboard   http://127.0.0.1:${FRONTEND_PORT}"
echo "  API health  http://127.0.0.1:${NODE_PORT}/api/health"
echo "  Recovery    http://${RECOVERY_HOST}:${RECOVERY_PORT}/health"
echo

# Wait until any child exits (or Ctrl+C).
while true; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      warn "A service exited (pid=$pid). Stopping the rest..."
      exit 1
    fi
  done
  sleep 1
done
