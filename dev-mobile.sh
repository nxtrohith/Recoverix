#!/usr/bin/env bash
# Initialise and run the SH-205 driver mobile app + required backend.
#
# Bootstraps everything the Expo cockpit needs:
#   • root + mobile npm deps (and uv sync)
#   • mobile-driver-app/.env from .env.example
#   • demo driver seed (DRV-001 / DRV-002 / DRV-003)
#   • FastAPI recovery API  → http://127.0.0.1:5055
#   • Node API gateway      → http://127.0.0.1:3000
#   • Expo Metro            → http://127.0.0.1:8082
#   • (optional) Vite dashboard for operator assign
#
# Usage:
#   ./dev-mobile.sh                 # seed + backend + Expo
#   ./dev-mobile.sh --install       # install deps, then start
#   ./dev-mobile.sh --web           # open Expo web after Metro is up
#   ./dev-mobile.sh --android       # open Android emulator / device
#   ./dev-mobile.sh --ios           # open iOS simulator (macOS)
#   ./dev-mobile.sh --with-frontend # also start Vite dashboard :5173
#   ./dev-mobile.sh --no-seed       # skip npm run seed:demo-drivers
#   ./dev-mobile.sh --no-backend    # Expo only (API already running)
#   ./dev-mobile.sh --no-recovery   # let Node spawn FastAPI itself
#
# Ctrl+C stops all child processes.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MOBILE_DIR="$ROOT/mobile-driver-app"
NODE_PORT="${PORT:-3000}"
RECOVERY_HOST="${RECOVERY_API_HOST:-127.0.0.1}"
RECOVERY_PORT="${RECOVERY_API_PORT:-5055}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
EXPO_PORT="${EXPO_PORT:-8082}"
API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-http://127.0.0.1:${NODE_PORT}}"

DO_INSTALL=0
DO_SEED=1
START_BACKEND=1
START_RECOVERY=1
START_FRONTEND=0
EXPO_TARGET=""   # "" | web | android | ios

PIDS=()

usage() {
  sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage ;;
    --install) DO_INSTALL=1 ;;
    --no-seed) DO_SEED=0 ;;
    --no-backend) START_BACKEND=0; START_RECOVERY=0 ;;
    --no-recovery) START_RECOVERY=0 ;;
    --with-frontend) START_FRONTEND=1 ;;
    --web) EXPO_TARGET=web ;;
    --android) EXPO_TARGET=android ;;
    --ios) EXPO_TARGET=ios ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Try ./dev-mobile.sh --help" >&2
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

info()  { echo "$(color 36 '[mobile]') $*"; }
ok()    { echo "$(color 32 '[mobile]') $*"; }
warn()  { echo "$(color 33 '[mobile]') $*" >&2; }
fail()  { echo "$(color 31 '[mobile]') $*" >&2; exit 1; }

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  echo
  info "Shutting down services..."
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
  local deadline=$((SECONDS + 60))
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
  setsid "$@" > >(prefix_logs "$tag" "$color_code") 2> >(prefix_logs "$tag" "$color_code" >&2) &
  PIDS+=($!)
}

ensure_mobile_env() {
  local example="$MOBILE_DIR/.env.example"
  local envfile="$MOBILE_DIR/.env"

  [[ -f "$example" ]] || fail "Missing $example"

  if [[ ! -f "$envfile" ]]; then
    info "Creating mobile-driver-app/.env from .env.example"
    cp "$example" "$envfile"
  fi

  # Keep API base URL aligned with the Node gateway we start.
  if grep -q '^EXPO_PUBLIC_API_BASE_URL=' "$envfile"; then
    sed -i.bak "s|^EXPO_PUBLIC_API_BASE_URL=.*|EXPO_PUBLIC_API_BASE_URL=${API_BASE_URL}|" "$envfile"
    rm -f "${envfile}.bak"
  else
    printf '\nEXPO_PUBLIC_API_BASE_URL=%s\n' "$API_BASE_URL" >> "$envfile"
  fi

  if ! grep -q '^EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=.\+' "$envfile"; then
    warn "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY unset — navigation falls back to graph hubs"
  fi
}

# ── prerequisites ──────────────────────────────────────────────
require_cmd node
require_cmd npm
require_cmd curl
[[ -d "$MOBILE_DIR" ]] || fail "Missing mobile-driver-app/ directory"

if [[ "$START_BACKEND" -eq 1 ]] || [[ "$DO_SEED" -eq 1 ]] || [[ "$DO_INSTALL" -eq 1 ]]; then
  require_cmd uv
fi

[[ -f "$ROOT/.env" ]] || fail "Missing root .env — copy .env.example and fill MONGODB_URI / MONGODB_DB_NAME"

if [[ ! -d "$ROOT/node_modules" ]] || [[ ! -d "$MOBILE_DIR/node_modules" ]]; then
  warn "node_modules missing — run ./dev-mobile.sh --install"
fi

if [[ "$DO_INSTALL" -eq 1 ]]; then
  info "Installing Node dependencies (root)..."
  npm install
  info "Installing Node dependencies (mobile-driver-app)..."
  npm --prefix "$MOBILE_DIR" install
  if [[ "$START_FRONTEND" -eq 1 ]]; then
    info "Installing Node dependencies (frontend)..."
    npm --prefix frontend install
  fi
  info "Syncing Python deps (uv)..."
  uv sync
fi

ensure_mobile_env

# ── seed demo drivers ─────────────────────────────────────────
if [[ "$DO_SEED" -eq 1 ]]; then
  info "Seeding demo drivers onto live vehicles..."
  npm run seed:demo-drivers
  ok "Demo drivers ready (DRV-001 / DRV-002 / DRV-003)"
fi

# ── port checks ────────────────────────────────────────────────
if [[ "$START_BACKEND" -eq 1 ]]; then
  if port_in_use "$NODE_PORT"; then
    warn "Port $NODE_PORT already in use — reusing existing Node gateway"
    START_BACKEND=0
  fi
fi
if [[ "$START_RECOVERY" -eq 1 ]] && port_in_use "$RECOVERY_PORT"; then
  warn "Port $RECOVERY_PORT already in use — reusing existing Recovery API"
  START_RECOVERY=0
fi
if [[ "$START_FRONTEND" -eq 1 ]] && port_in_use "$FRONTEND_PORT"; then
  fail "Port $FRONTEND_PORT already in use (Vite). Stop it or set FRONTEND_PORT=..."
fi
if port_in_use "$EXPO_PORT"; then
  fail "Port $EXPO_PORT already in use (Expo). Stop the other process or set EXPO_PORT=..."
fi

info "Project root: $ROOT"
echo
info "Planned services:"
[[ "$START_RECOVERY" -eq 1 ]] && echo "  • Recovery API  http://${RECOVERY_HOST}:${RECOVERY_PORT}"
[[ "$START_BACKEND" -eq 1 ]]  && echo "  • Node gateway  http://127.0.0.1:${NODE_PORT}"
[[ "$START_FRONTEND" -eq 1 ]] && echo "  • Dashboard     http://127.0.0.1:${FRONTEND_PORT}"
echo "  • Expo Metro    http://127.0.0.1:${EXPO_PORT}"
[[ -n "$EXPO_TARGET" ]] && echo "  • Expo target   ${EXPO_TARGET}"
echo "  • API base URL  ${API_BASE_URL}"
echo

# ── start backend ──────────────────────────────────────────────
if [[ "$START_RECOVERY" -eq 1 ]]; then
  start_bg "recovery" 35 \
    uv run python -m graph.api_server --host "$RECOVERY_HOST" --port "$RECOVERY_PORT"
  wait_for_http "http://${RECOVERY_HOST}:${RECOVERY_PORT}/health" "Recovery API" || true
fi

if [[ "$START_BACKEND" -eq 1 ]]; then
  start_bg "backend" 34 \
    npm run dev
fi
# Confirm gateway whether we started it or are reusing one already on the port.
wait_for_http "http://127.0.0.1:${NODE_PORT}/api/health" "Node gateway" || true

if [[ "$START_FRONTEND" -eq 1 ]]; then
  export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://127.0.0.1:${NODE_PORT}}"
  start_bg "frontend" 36 \
    npm --prefix frontend run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT"
fi

# ── start Expo ─────────────────────────────────────────────────
export EXPO_PUBLIC_API_BASE_URL="$API_BASE_URL"
case "$EXPO_TARGET" in
  web)
    EXPO_CMD=(npm --prefix "$MOBILE_DIR" run web -- --port "$EXPO_PORT")
    ;;
  android)
    EXPO_CMD=(npm --prefix "$MOBILE_DIR" run android -- --port "$EXPO_PORT")
    ;;
  ios)
    EXPO_CMD=(npm --prefix "$MOBILE_DIR" run ios -- --port "$EXPO_PORT")
    ;;
  *)
    EXPO_CMD=(npm --prefix "$MOBILE_DIR" start -- --port "$EXPO_PORT")
    ;;
esac

start_bg "expo" 33 "${EXPO_CMD[@]}"

echo
ok "Mobile stack is up. Press Ctrl+C to stop all services."
echo
echo "  Driver app   http://127.0.0.1:${EXPO_PORT}  (press w in Expo for web)"
echo "  API health   http://127.0.0.1:${NODE_PORT}/api/health"
echo "  Recovery     http://${RECOVERY_HOST}:${RECOVERY_PORT}/health"
[[ "$START_FRONTEND" -eq 1 ]] && echo "  Dashboard    http://127.0.0.1:${FRONTEND_PORT}"
echo
echo "  Demo drivers: DRV-001 Ramesh · DRV-002 Suresh · DRV-003 Priya"
echo "  Flow: pick driver → operator assigns recovery → accept → pickup → resolve"
echo

while true; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      warn "A service exited (pid=$pid). Stopping the rest..."
      exit 1
    fi
  done
  sleep 1
done
