# Recoverix — Intelligent Shipment Piggybacking

> Autonomous logistics recovery that turns shipment exceptions into in-transit piggyback assignments across the Telangana freight network — powered by a NetworkX routing graph, a deterministic multi-criteria optimizer, explainable AI judgments (TypeSafe Jev), Sarvam AI outbound voice calls in Telugu, and a live React Native driver cockpit.

<p align="left">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white">
  <img alt="Node" src="https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.1xx-009688?logo=fastapi&logoColor=white">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white">
  <img alt="NetworkX" src="https://img.shields.io/badge/NetworkX-DiGraph-orange">
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white">
  <img alt="Expo" src="https://img.shields.io/badge/Expo-52-000020?logo=expo&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-ISC-blue">
</p>

---

## Executive Summary

When a high-value shipment is misplaced or delayed at a freight terminal, traditional systems wait for the next scheduled run or dispatch a dedicated recovery vehicle. Both are slow and expensive.

**Recoverix** treats recovery as a *graph search + constrained optimization* problem. It analyzes every active in-network vehicle and its live route, finds trucks with residual capacity that can absorb the orphaned shipment, ranks piggyback options (`at_node` / `pass_through` / `detour`), assigns the best feasible plan, then notifies the driver via a **Sarvam AI Instant Outbound** voice call (Telugu by default) and pushes the mission to the driver mobile app.

```
Shipment Exception (Actual Hub ≠ Expected Hub)
           │
           ▼
Telangana Logistics Graph  (NetworkX DiGraph — 91 hubs / 143 directed edges)
           │
           ▼
Candidate Generation       (at_node / pass_through / detour)
           │
           ▼
Hard Feasibility Filter    (capacity · reachability · deadline)
           │
           ▼
Weighted Multi-Criteria Scoring  (+ optional TypeSafe Jev soft judgment)
           │
           ▼
Persist Recovery Plan → Assign Vehicle
           │
     ┌─────┴──────────────────────────┐
     ▼                                ▼
Sarvam AI Outbound Call        Driver Mobile Cockpit
(Telugu voice brief)           (Nav · pickup · resolve)
           │
           ▼
Optimization KPIs fed back to the Operator Control Tower
```

---

## What's New (Latest Release)

| Area | Change |
| :--- | :--- |
| **Optimization KPI engine** | New `GET /api/incidents/stats` aggregation in `graph/incident_service.py` — solved count, active count, resolution rate, average recovery score with per-component breakdown, and mean detection→pickup recovery time |
| **Overview dashboard rebuild** | `MetricsBar` now surfaces outcome KPIs (Optimization score · Misplaced solved · Resolution rate · Avg pickup time) instead of static topology counts; hover reveals the weighted component breakdown |
| **Honest latency metric** | Recovery duration measures **detection → pickup confirmed**, deliberately excluding the manual "resolve" close-out so the KPI reflects real operational speed, not operator click timing |
| **Dashboard data layer** | `DashboardLayout` fetches lists and KPI stats in parallel with independent loading/error states and a unified refresh |
| **Typed API contracts** | `IncidentStats` added to `frontend/src/types/api.ts`; JSDoc-typed client method `getIncidentStats()` |
| **Rebrand + XAI** | Project renamed SH-205 → **Recoverix**; TypeSafe **Jev** integrated for explainable, confidence-gated recovery judgments |
| **3D ego-network view** | `3d-force-graph` + Three.js ego-neighborhood visualization of the hub network |
| **Driver mobile app** | Expo cockpit with GPS/mock-GPS telemetry, geofenced arrival detection, turn-by-turn voice guidance, and NeoBrutalism theming |

---

## Technology Stack

### Languages & Runtimes
`Python 3.11+` · `JavaScript (ES2023, ESM)` · `TypeScript 5/7` · `JSX/TSX` · `Bash`

### Frontend — Operator Control Tower
| Library | Purpose |
| :--- | :--- |
| **React 19** | UI runtime (concurrent rendering, hooks) |
| **Vite 8** + `@vitejs/plugin-react` | Dev server, HMR, production bundling |
| **React Router 7** | Nested dashboard routing (`react-router-dom`) |
| **Tailwind CSS 4** + `@tailwindcss/vite` | Utility-first styling engine |
| **@base-ui/react** | Headless accessible primitives (shadcn-style `ui/*` layer) |
| **class-variance-authority**, `clsx`/`cn`, `tw-animate-css` | Variant-driven component API + animation utilities |
| **Framer Motion 13** | Layout/gesture animation for panels and timelines |
| **Leaflet 1.9** + **react-leaflet 5** | 2D geospatial map, route overlays, hub markers |
| **3d-force-graph 1.80** + **Three.js 0.186** | WebGL 3D force-directed ego-network visualization |
| **lucide-react** | Icon system |
| **oxlint** | Rust-based linting (fast CI feedback) |

### API Gateway — Node.js
| Library | Purpose |
| :--- | :--- |
| **Node.js 18+ (native ESM)** | Gateway runtime on `:3000` |
| **Mongoose 9** | Schema modeling, validation, indexes |
| **TypeScript** | Typed schema definitions in `src/models/*.ts` |
| **dotenv** | Environment configuration |
| **nodemon**, **tsx** | Dev watch + TS execution |

The gateway reverse-proxies `/api/*` to FastAPI (full path + query string + `content-length` forwarding), owns the canonical Mongoose schema, and can optionally spawn the Python service as a child process.

### Recovery Intelligence — Python
| Library | Purpose |
| :--- | :--- |
| **FastAPI** + **uvicorn[standard]** | Async REST service on `:5055`, auto OpenAPI docs |
| **NetworkX** | Directed logistics graph, shortest paths, centrality, components |
| **PyMongo** | Direct driver access for graph loading and incident aggregation |
| **pandas** | Dataset filtering, edge/node table construction |
| **geopy** (Nominatim + geodesic) | Hub geocoding and great-circle distance |
| **pyvis** | Interactive standalone HTML graph render |
| **Pydantic** (via FastAPI) | Request/response schema validation |
| **typesafe-sdk** | TypeSafe **Jev** System One judgments (explainable AI) |
| **python-dotenv**, **dnspython** | Config + MongoDB SRV resolution |
| **uv** + **hatchling** | Reproducible dependency resolution (`uv.lock`) and packaging |

### Driver Mobile App
| Library | Purpose |
| :--- | :--- |
| **Expo 52** + **React Native 0.76** | Cross-platform driver cockpit (iOS / Android / Web) |
| **expo-router 4** | File-system based navigation |
| **react-native-maps 1.18** | Native map + polyline route rendering |
| **expo-location** | Live GPS telemetry with mock-GPS fallback for demos |
| **expo-speech** | On-device turn-by-turn voice guidance |
| **@react-native-async-storage/async-storage** | Driver session persistence |
| **react-native-gesture-handler / screens / safe-area-context** | Native gesture + layout primitives |
| **react-native-web** | Browser demo mode (`press w`) |

### Data, AI & Infrastructure
| Service | Purpose |
| :--- | :--- |
| **MongoDB Atlas** | Operational store (`shipments`, `vehicles`, `routes`, `incidents`, `recoverycases`, `recoveryoptions`, `driver_calls`) + canonical network (`telangana_nodes`, `telangana_edges`) |
| **Sarvam AI — Conversations Instant Outbound** | Indic-language outbound voice calls (Telugu default; Hindi / Kannada / Tamil / English configurable) |
| **TypeSafe Jev** | Typed System One judgments for urgency classification and top-K candidate selection |
| **Google Directions API** | Real road geometry + encoded polylines for the driver app (graceful graph-polyline fallback) |
| **OpenStreetMap / Nominatim** | Hub geocoding source |
| **Delhivery public logistics dataset** | Source of real Telangana inter-hub trip observations |

---

## Algorithms & Techniques

This is not a CRUD app — the core is an algorithmic decision engine.

### Graph algorithms
- **Directed graph modeling** (`nx.DiGraph`) — hubs as nodes, observed trips as weighted directed edges (`avg_distance_km`, `avg_time_min`, trip frequency).
- **Dijkstra shortest path** (`nx.shortest_path` with edge weight) — time- or distance-optimal routing between any two hubs; `nx.path_weight` for exact path cost.
- **Degree centrality** and **Brandes betweenness centrality** — hub criticality ranking, used as a scoring tie-breaker and for map visual weighting.
- **Weakly / strongly connected components** — network integrity validation at graph-build time.
- **Ego-neighborhood subgraph extraction** (`frontend/src/lib/egoSubgraph.js`) — client-side k-hop expansion around a focus node with degree-weighted sizing, keeping the 3D view legible on a 91-node network.
- **Force-directed layout** (d3-force-3d inside `3d-force-graph`) — physics-based 3D placement of the ego network.
- **Convex hull computation** (3D control tower branch) — geographic boundary envelope for the Telangana region.

### Optimization & decision-making
- **Constraint satisfaction pre-filter** — hard rejects on capacity overflow, unreachable path, and deadline violation, each recorded with a machine-readable rejection reason.
- **Candidate classification heuristic** — prefers existing movement over new movement: `at_node` ▸ `pass_through` ▸ `detour`. Crucially, a mathematically valid `shortest_path(vehicle → pickup → destination)` is *not* treated as a piggyback opportunity; `pass_through` is only asserted when the pickup hub lies on the vehicle's **actual ordered route stops**.
- **Weighted Sum Model (multi-criteria decision analysis)** with min-max normalized components:

  ```
  Score = 0.25·Time + 0.20·Deadline + 0.15·Cost + 0.15·Capacity
        + 0.10·Priority + 0.10·Detour + 0.05·Connectivity
  ```

- **Bounded detour ratio** — diversions capped at `max_detour_ratio` (default ≤ 3.0× baseline route length).
- **Priority-weighted urgency mapping** — `critical/urgent → 1.0`, `high → 0.85`, `medium/normal → 0.55`, `low → 0.35`.
- **Variance compression** on the connectivity term (blend factor 0.4) so centrality stays a minor tie-breaker rather than dominating.
- **Confidence-gated AI override** — TypeSafe Jev may re-select among the top-K (K=5) scored candidates, but only above a `0.45` confidence floor; otherwise the deterministic score winner stands. Determinism is never sacrificed to a model.

### State, geospatial & systems techniques
- **Expected-vs-actual state reconciliation** — `expectedNode` derived from `assignedRoute` progress + on-route scan events; `actualNode` from the last confirming scan; divergence triggers `MISPLACED`.
- **Haversine / geodesic distance** — used both server-side (geopy) and client-side (mobile app) for proximity math.
- **Geofencing state machine** — `far → approaching → arrived` proximity classification driving automatic arrival prompts.
- **Google encoded-polyline decoding** — custom decoder in `mobile-driver-app/services/directions.ts` for road-accurate route geometry.
- **TTL-bounded in-memory analysis cache** (`RECOVERY_ANALYSIS_CACHE_TTL_SEC`, default 600s) with explicit invalidation on simulate/assign/pickup/resolve and a `?force=true` bypass.
- **Idempotent side effects** — one voice call per assignment, keyed in `driver_calls`; `/retry-call` is the only path to a new attempt.
- **E.164 phone normalization** before any outbound telephony call.
- **Graceful degradation everywhere** — no Sarvam credentials → logged call stub; no TypeSafe key → deterministic `explanationTrace`; no Google key → NetworkX graph polyline; no GPS → mock GPS track.
- **Deterministic coordinate jittering** (seeded) — separates co-located hubs on the map without nondeterministic rendering.
- **Discrete-event simulation** (SimPy, simulation branch) — truck processes advancing over graph edge travel times, emitting typed JSON events.

---

## System Components

| Component | Stack | Role |
| :--- | :--- | :--- |
| **Operator Control Tower** | React + Vite + Leaflet + 3D force graph | Landing + ops dashboard: shipments, fleet, hubs, exceptions, map overlays, recovery assignment, call status, explanation trace, optimization KPIs |
| **Node API Gateway** | Node.js + Mongoose | `:3000` — proxies `/api/*` to FastAPI; owns canonical schema definitions |
| **Piggyback Intelligence** | FastAPI + NetworkX | `:5055` — graph search, candidate generation, scoring, orchestration, incidents, Sarvam integration |
| **Explainability Layer** | TypeSafe Jev + `recovery_xai` | `explanationTrace[]` on analyze/simulate; confidence-gated Choice among top-K |
| **Driver Companion** | Expo / React Native | Cockpit with GPS or mock GPS, native maps or graph polyline, recovery alerts, pickup & resolve actions |
| **Voice Layer** | Sarvam Instant Outbound | Late-detection + assignment calls; idempotent; log stub when env incomplete |

---

## Key Features

### 1. Expected vs. actual hub divergence
- **`expectedNode`** — planned route progress (`assignedRoute` + on-route events).
- **`actualNode`** — last confirming scan / `currentLocation`.
- Mismatch → `MISPLACED`; pickup origin becomes the actual hub.

### 2. Piggyback candidate classes
- **`at_node`** — vehicle is already at the pickup hub (zero marginal movement).
- **`pass_through`** — pickup lies on the vehicle's active route (no detour).
- **`detour`** — bounded diversion, ratio-capped.

### 3. Feasibility, scoring & explainability
Hard rejects come first (capacity, unreachable path, deadline), then the weighted score ranks survivors. Every response carries an `explanationTrace[]` rendered as a step-by-step operator narrative in the Recovery UI.

### 4. Plan persistence & demo cache
A successful analysis persists to `recoverycases` / `recoveryoptions`. Repeat reads hit the TTL cache; lifecycle transitions invalidate it.

### 5. Sarvam AI outbound voice
On assignment (and optionally late detection), the backend resolves the driver phone, normalizes to E.164, and places an Indic-language recovery brief call covering shipment, pickup hub, and destination. Status is polled on the dashboard every ~5s (`Calling → Answered → Confirmed`).

### 6. Recovery lifecycle

```
NORMAL → MISPLACED → RECOVERY_ANALYSIS → RECOVERY_ASSIGNED
       → PICKUP_CONFIRMED → RECOVERED
```

DB incident statuses: `OPEN` / `RECOVERY_REQUIRED` → `ASSIGNED` → `PICKUP_CONFIRMED` → `RESOLVED`.

### 7. Optimization KPIs
The Overview page reports outcomes, not vanity counts: optimization score (mean recovery score with hoverable component breakdown), misplaced-solved count, resolution rate, and average detection→pickup time.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Operator Dashboard (:5173)                                   │
│  React 19 · Vite · Leaflet · 3D ego-graph · NeoBrutalism UI   │
└───────────────────────────┬──────────────────────────────────┘
                            │ VITE_API_BASE_URL
┌───────────────────────────▼──────────────────────────────────┐
│  Node API Gateway (:3000)                                     │
│  Proxies /api/* → FastAPI · Mongoose models (src/models)      │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  Recovery Core (:5055)                                        │
│  FastAPI · Orchestrator · Scorer · Incident service · XAI     │
│  NetworkX DiGraph held in memory, hydrated from MongoDB       │
└──────┬────────────────────┬───────────────────┬──────────────┘
       │                    │                   │
       ▼                    ▼                   ▼
  MongoDB Atlas       Sarvam Outbound      TypeSafe Jev
  (ops + graph)       (driver phone)       (optional Choice)
       │
┌──────▼───────────────────────────────────────────────────────┐
│  Driver Mobile App (Expo Metro :8082)                         │
│  EXPO_PUBLIC_API_BASE_URL → Node :3000                        │
└──────────────────────────────────────────────────────────────┘
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for module boundaries, the full data model, and API internals.

---

## Project Structure

```text
Conv-Software-Hackathon/
├── frontend/                     # Operator landing + dashboard
│   └── src/
│       ├── api/client.js         # Node-gateway HTTP client (JSDoc-typed)
│       ├── types/api.ts          # API TypeScript contracts (incl. IncidentStats)
│       ├── components/           # Map, 3D graph, recovery/*, ops/*, ui/*
│       ├── hooks/                # useRecoveryData
│       ├── layouts/              # DashboardLayout (parallel data + KPI loading)
│       ├── lib/                  # egoSubgraph, graphColors, utils
│       └── pages/                # Landing, Overview, Shipments, Vehicles,
│                                 # Hubs, GraphNodes, Recovery, Search
│
├── graph/                        # Python recovery intelligence
│   ├── api_server.py             # FastAPI app (:5055)
│   ├── api_models.py             # Pydantic response models
│   ├── api_services.py           # Query/service orchestration
│   ├── shipment_state.py         # Expected vs. actual reconciliation
│   ├── vehicle_state.py          # Live fleet position + capacity
│   ├── candidate_generator.py    # at_node / pass_through / detour enumeration
│   ├── recovery_scorer.py        # Weighted multi-criteria optimizer
│   ├── recovery_orchestrator.py  # End-to-end analysis pipeline
│   ├── recovery_persistence.py   # RecoveryCase / RecoveryOption writes
│   ├── recovery_context.py       # Immutable analysis context
│   ├── incident_service.py       # Simulate → assign → pickup → resolve + KPI stats
│   ├── analysis_cache.py         # TTL cache
│   ├── graph_builder.py          # MongoDB → NetworkX DiGraph + validation report
│   ├── graph_cache.py            # Process-level graph singleton
│   ├── graph_queries.py          # Shortest path, neighbors, connectivity
│   ├── graph_metrics.py          # Degree / betweenness centrality, components
│   └── services/
│       ├── sarvam_outbound.py    # Sarvam Instant Outbound client
│       ├── driver_communication.py
│       ├── typesafe_client.py    # Jev System One wrapper
│       └── recovery_xai.py       # explanationTrace assembly
│
├── mobile-driver-app/            # Expo driver cockpit
│   ├── app/                      # Driver select + cockpit (expo-router)
│   ├── components/               # NavigationMap (native/web), HUD, alerts
│   ├── services/                 # api, directions, geofence, mission,
│   │                             # mockGps, session, voiceGuidance
│   └── config/                   # NeoBrutalism theme + map styles
│
├── src/                          # Node gateway + Mongoose/TS models
│   ├── index.js                  # Gateway + FastAPI proxy
│   ├── models/                   # Location, Vehicle, Route, Shipment,
│   │                             # RecoveryCase, RecoveryOption,
│   │                             # ShipmentEvent, Incident
│   ├── routes/recovery.js
│   └── services/                 # recoveryProcess, recoveryProxy
│
├── scripts/                      # Data pipeline, seeds, demos, tests
├── data/                         # Telangana graph assets (CSV, GraphML, HTML)
├── docs/dependency-graph.json
├── ARCHITECTURE.md · DATABASE_CLEANUP.md
├── dev.sh                        # One-shot: FastAPI + Node + Vite
├── pyproject.toml / uv.lock      # uv-managed Python deps
└── .env.example
```

---

## Quick Start

### Prerequisites
- **Node.js** 18+
- **Python** 3.11+ with [`uv`](https://docs.astral.sh/uv/)
- **MongoDB** Atlas cluster or local instance

### 1. Environment

```bash
cp .env.example .env
```

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net
MONGODB_DB_NAME=hackathon

# Optional — explainable Jev judgments
TYPESAFE_API_KEY=
# TYPESAFE_ENABLED=true
# TYPESAFE_DEFAULT_MODEL=jev-latest

# Sarvam Instant Outbound (live calls)
SARVAM_API_KEY=
SARVAM_ORG_ID=
SARVAM_WORKSPACE_ID=
SARVAM_APP_ID=
SARVAM_APP_VERSION=1
SARVAM_CONNECTION_ID=
SARVAM_AGENT_PHONE_NUMBER=+91XXXXXXXXXX
SARVAM_DEFAULT_LANGUAGE=Telugu
SARVAM_DEMO_DRIVER_PHONE=+91XXXXXXXXXX

# Frontend / mobile (defaults work locally)
# VITE_API_BASE_URL=http://127.0.0.1:3000
# EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000
# EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
```

Incomplete Sarvam config falls back to a log stub — the full workflow still runs without live telephony.

### 2. Install & run (recommended)

```bash
./dev.sh --install
# FastAPI :5055 · Node gateway :3000 · Vite :5173
```

Flags: `--no-frontend`, `--no-recovery` (let Node spawn FastAPI), `-h`.

### 3. Manual install (alternative)

```bash
npm install
npm --prefix frontend install
uv sync

npm run seed:demo-misplaced   # creates SHP-DEMO-MISPLACED
npm run recovery:api          # FastAPI :5055
npm start                     # Node gateway :3000
npm run frontend              # Vite :5173
```

### 4. Driver mobile app (optional)

```bash
npm run seed:demo-drivers
cd mobile-driver-app
cp .env.example .env          # EXPO_PUBLIC_API_BASE_URL → :3000
npm install
npm start                     # Metro :8082 — press `w` for web
```

Select **Ramesh Kumar** (TS-09-UB-1077) for the Kamareddy → Karimnagar demo.

---

## npm Scripts

| Script | Description |
| :--- | :--- |
| `npm start` / `npm run dev` | Node gateway (`:3000`), with `--watch` in dev |
| `npm run frontend` / `frontend:build` | Vite dev server / production build |
| `npm run recovery:api` | FastAPI recovery service on `:5055` |
| `npm run recovery:demo` | CLI orchestrator demo against a shipment ID |
| `npm run seed` / `seed:demo-misplaced` / `seed:demo-drivers` / `seed:workflow-visuals` | Database seeding |
| `npm run verify:driver-flow` | End-to-end driver recovery flow verification |
| `npm run test:expected-actual` / `test:recovery-workflow` | Python integration checks |
| `npm run db:cleanup` | Drop legacy collections |
| `npm run typecheck` / `build` | TypeScript validation / emit |
| `npm run mobile` | Expo Metro bundler |
| `npm --prefix frontend run lint` | oxlint |

---

## End-to-End Demo Flow

Seeded misplacement across Telangana:

| Stage | Hub | Status |
| :--- | :--- | :--- |
| Origin | `Hyderabad_Shamshbd_H` | Loaded & departed |
| Planned next | `Medchal_MROoffce_D` | Expected handoff |
| Actual (wrong) | `Kamareddy_Devenply_I` | Misplaced |
| Destination | `Karimnagar_KamnHbRD_I` | Deadline-bound |

### Operator steps
1. Open `http://localhost:5173` → Recovery.
2. Find `SHP-DEMO-MISPLACED`.
3. **Analyze** → candidates scored, plan persisted, review `explanationTrace`.
4. **Assign** → confirm dialog → Sarvam call to the recovery driver.
5. Watch call status (`Calling → Answered → Confirmed`).
6. **Confirm Pickup** → **Resolve**, then check the Overview KPI cards update.

### CLI smoke tests

```bash
npm run recovery:demo -- SHP-DEMO-MISPLACED

curl http://127.0.0.1:3000/api/incidents/stats
curl http://127.0.0.1:3000/api/recovery/SHP-DEMO-MISPLACED/call-status

curl -X POST http://127.0.0.1:3000/api/recovery/SHP-DEMO-MISPLACED/retry-call \
  -H "Content-Type: application/json" -d '{}'

curl -X POST http://127.0.0.1:3000/api/sarvam/test-call \
  -H "Content-Type: application/json" \
  -d '{"phone": "+91XXXXXXXXXX"}'
```

---

## API Reference

All routes are implemented in FastAPI (`graph/api_server.py`). The Node process on **:3000** proxies `/api/*` — use that base URL from the dashboard and mobile app. Interactive OpenAPI docs: `http://127.0.0.1:5055/docs`.

### Core
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | MongoDB + graph cache status |
| `GET` | `/api/graph` | Telangana nodes + edges (map / 3D viz) |
| `GET` | `/api/hubs` | Operational locations |
| `GET` | `/api/shipments` | Shipment list |
| `GET` | `/api/shipments/{id}` | Detail + events + active incident |
| `GET` | `/api/vehicles` | Fleet + capacity + driver profile |
| `GET` | `/api/vehicles/{id}` | Detail + shortest path when available |

### Recovery
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/recovery/{id}` | Full analysis (candidates, scores, plan, `explanationTrace`) |
| `POST` | `/api/recovery/{id}/calculate` | Same pipeline, explicit calculate |
| `POST` | `/api/recovery/analyze/{id}` | Alias of GET analyze |
| `POST` | `/api/recovery/{id}/assign` | Assign plan → Sarvam notify |
| `POST` | `/api/recovery/{id}/pickup` | Driver pickup confirmation |
| `POST` | `/api/recovery/{id}/resolve` | Close incident |
| `POST` | `/api/recovery/graph/refresh` | Rebuild in-memory NetworkX graph |

### Voice
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/recovery/{id}/call-status` | Live call status |
| `POST` | `/api/recovery/{id}/call-status` | Alternate status path |
| `POST` | `/api/recovery/{id}/retry-call` | Force a new Sarvam attempt |
| `POST` | `/api/sarvam/test-call` | Test call to any number |
| `POST` | `/api/sarvam/webhook` | Sarvam webhook receiver |

### Incidents
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/incidents/active` | Open incidents (dashboard + mobile poll) |
| `GET` | `/api/incidents/stats` | **New** — aggregate optimization KPIs |
| `GET` | `/api/incidents/by-shipment/{id}` | Latest incident for a shipment |
| `POST` | `/api/incidents/simulate` | Simulate misplacement (+ optional auto-analyze) |

Analysis statuses: `RECOVERY_PLAN_AVAILABLE` | `NO_FEASIBLE_RECOVERY`.

---

## Data Pipeline

The Telangana network is derived from real logistics data, not synthetic mock records.

1. **`scripts/filter_telangana.py`** — filters the Delhivery trip dataset down to intra-Telangana legs with pandas, parses hub codes into typed roles (`Hub`, `Intermediate`, `Delivery`, `Distribution Center`, `Collection`), and emits `telangana_nodes.csv` / `telangana_edges.csv` with averaged distance and travel time per directed edge.
2. **`scripts/geocode_hubs.py`** — geocodes hub cities via OpenStreetMap Nominatim with a persistent coordinate cache, rate-limit compliance, and seeded jitter so co-located hubs remain visually distinct.
3. **`scripts/build_graph.py`** — loads the tables into MongoDB (`telangana_nodes`, `telangana_edges`) and materializes `telangana_graph.graphml`.
4. **`scripts/visualize_graph.py`** — renders an interactive pyvis HTML network coloured by hub tier.
5. **Runtime** — `graph/graph_builder.py` hydrates a validated `nx.DiGraph` from MongoDB on startup, with a coordinate-sanity validation report and hot refresh via `/api/recovery/graph/refresh`.

**Network scale:** 91 hubs · 143 directed edges · full district coverage across Telangana.

---

## Data Model

Mongoose models under `src/models/`:

`Location` · `Vehicle` · `Route` · `Shipment` · `ShipmentEvent` · `Incident` · `RecoveryCase` · `RecoveryOption`

Canonical network collections: `telangana_nodes`, `telangana_edges`.
Join key: `Location.graphNodeKey` ↔ `hub_name`.

---

## Engineering Highlights

- **Clean layer separation** — generation (enumerate) → optimization (rank) → orchestration (decide) → persistence (record) → communication (notify). No layer reaches across another's boundary; the scorer never touches Mongo, the generator never scores.
- **Deterministic core, optional intelligence** — the system produces the same answer with zero API keys. AI is strictly additive and confidence-gated.
- **Polyglot service mesh** — React SPA → Node gateway → Python FastAPI → MongoDB, with a React Native client on the same contract, all typed end to end.
- **Typed contracts across language boundaries** — TypeScript interfaces in `frontend/src/types/api.ts` mirror Pydantic models in `graph/api_models.py` and Mongoose schemas in `src/models/`.
- **Failure-first design** — every external dependency (telephony, LLM, maps, GPS) has an explicit, tested degradation path.
- **Explainability as a first-class output** — every recovery decision emits an auditable step trace, not just a score.
- **Reproducible environments** — `uv.lock` for Python, lockfiles for all three Node workspaces, and `./dev.sh` for one-command orchestration of three services.

---

## Branch Map — Consolidated Work

All branches in this repository are my own work across the project's evolution. `rohith` is the integration branch and is a superset of the production feature set; the other branches preserve distinct engineering tracks and prototypes.

| Branch | Track | Contributions |
| :--- | :--- | :--- |
| **`rohith`** *(integration / latest)* | Full product | Recoverix rebrand, FastAPI recovery core, scorer + orchestrator + persistence, TypeSafe Jev XAI, Sarvam voice layer, Expo driver cockpit, NeoBrutalism dashboard, 3D ego-graph, optimization KPI engine |
| **`main`** | Foundation | Project scaffold, MongoDB connection layer (`src/db.js`), TypeScript config, and the eight Mongoose domain models that every later branch builds on |
| **`feature-data`** | Data engineering | Delhivery dataset ingestion, Telangana filtering, hub geocoding, and the expanded seeding pipeline (`src/seed.js`) |
| **`feature-telangana-graph`** | Graph core | `graph/graph_builder.py`, `graph_queries.py`, `graph_metrics.py`, GraphML/pyvis export, plus a **pytest suite** (`test/test_graph_builder.py`, `test_graph_metrics.py`, `test_graph_queries.py`) with fixtures in `conftest.py` |
| **`Jonsnow`** | Discrete-event simulation | **SimPy** simulation package (`backend/simulation/engine.py`, `truck.py`, `events.py`) that advances truck processes over graph travel times and emits typed JSON events, with `test/test_simulation.py` and a standalone runner (`scripts/run_simulation_example.py`) |
| **`feature-3d-control-tower`** | 3D visualization prototype | Raw **Three.js** control tower (`ThreeCanvas.tsx`, `TimelineControls.tsx`, `RightPanel.tsx`) with a custom lat/lon→scene projection and convex-hull region envelope, a TypeScript Express server (`src/server.ts`), and a **Folium** geospatial renderer (`scripts/visualize_folium_map.py`) |
| **`vaish`** | Demo experience | Three-scenario demo case engine (`graph/demo_cases.py`) covering `at_node`, `detour`, and `pass_through` patterns with multilingual drivers (Telugu / Hindi / English), driven by a `DemoCaseSwitcher` UI |

### Techniques exercised across branches
Graph theory · discrete-event simulation (SimPy) · multi-criteria optimization · explainable AI integration · real-time telephony · geospatial engineering · WebGL/Three.js rendering · cross-platform mobile development · polyglot API design · pytest-based testing of graph and simulation logic · reproducible dependency management.

---

## Roadmap

- Merge the SimPy simulation engine into the integration branch for what-if replay of recovery strategies.
- Promote the pytest graph/simulation suite into CI alongside `typecheck` and `oxlint`.
- Multi-shipment batch recovery (one vehicle absorbing several orphaned loads).
- Learned edge travel-time estimation from accumulated event history.
- Webhook-driven call status instead of dashboard polling.

---

## License

Built for the **Convergence Software Hackathon** under the **ISC License**.

**Author:** [@nxtrohith](https://github.com/nxtrohith)
