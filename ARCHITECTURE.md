# Architecture — SH-205 Intelligent Shipment Piggybacking

Hackathon prototype focused on recovering misplaced shipments by evaluating piggyback options on existing routes.

## Stack

- Node.js (ESM)
- MongoDB via Mongoose
- TypeScript for schema/type definitions (`src/models`)
- Python (`uv` + NetworkX + FastAPI/uvicorn) for the logistics graph + recovery API
- React + Vite frontend (`frontend/`) talking to the Node API gateway over HTTP (`VITE_API_BASE_URL`, default `:3000`; Node proxies `/api/*` to FastAPI `:5055`)

## Data layer

Seven Mongoose collections under `src/models/`:

| Model | Role |
| --- | --- |
| `Location` | Warehouses, hubs, DCs, origins, destinations |
| `Vehicle` | Transport assets with capacity and current load |
| `Route` | Existing routes with embedded `stops[]` (no separate RouteStop collection) |
| `Shipment` | Packages in transit (`currentLocation` = actual hub; `expectedLocation` = cached route-progress hub) |
| `RecoveryCase` | Misplaced-shipment recovery case |
| `RecoveryOption` | Ranked piggyback strategy candidates (core decision schema) |
| `ShipmentEvent` | Shipment tracking history |
| `Incident` | Live demo incident record (simulate → assign → resolve) |

Shared subdocuments live in `src/models/shared.ts`: `capacity`, `coordinates`, `recoveryScores`.

Canonical network tables (also in MongoDB, not Mongoose models yet):

| Collection | Role |
| --- | --- |
| `telangana_nodes` | Hub nodes (`hub_name`, city, type, lat/lon) |
| `telangana_edges` | Directed legs (`source_name` → `destination_name`, distance, time) |

## Relationship summary

```
Location ← referenced by Vehicle, Route, Shipment, RecoveryCase, RecoveryOption, ShipmentEvent
Vehicle  ↔ Route (Vehicle.currentRoute / Route.vehicle)
Shipment → Route?, Vehicle?
RecoveryCase → Shipment, Location, RecoveryOption?
RecoveryOption → RecoveryCase, Shipment, Route, Vehicle, Location(s)
ShipmentEvent → Shipment, Location, Route?, Vehicle?
```

## Connection

`src/db.js` owns the Mongoose connection (`connectDb` / `getDb` / `disconnectDb`). Models register against the default connection when imported.

Python graph code reads the same `.env` (`MONGODB_URI`, `MONGODB_DB_NAME`) via `graph.graph_builder.connect_mongo()`.

## Graph layer (`graph/`)

MongoDB remains the source of truth. NetworkX is an in-memory computational layer only (not persisted).

```
MongoDB (telangana_nodes + telangana_edges)
    → graph_builder.build_graph()
    → graph_cache (in-memory DiGraph, refreshable)
    → graph_metrics / graph_queries
    → shipment_state / vehicle_state / recovery_context / candidate_generator
    → recovery_scorer (feasibility + weighted scoring + selection)
    → recovery_orchestrator.analyze_shipment_recovery()
    → recovery_persistence (selected plan → recoverycases / recoveryoptions)
    → Node API proxy  GET /api/recovery/:shipmentId
```

- **Graph type:** `nx.DiGraph` — route legs are directional; reverse edges are rare/absent.
- **Node id:** `hub_name` (matches `Location.graphNodeKey`)
- **Edge weights:** separate attributes `avg_distance_km`, `avg_time_min` (no synthetic single weight; no `cost` in DB yet — scorer uses a configurable ₹/km proxy)
- **Demo (graph):** `uv run python scripts/demo_graph.py`
- **Demo (recovery):** `uv run python scripts/demo_recovery.py [shipment_id_or_tracking_number]`
- **Demo (scoring):** `uv run python scripts/demo_scoring.py [shipment_id_or_tracking_number]`
- **Demo (orchestrator):** `uv run python scripts/demo_orchestrator.py [shipment_id_or_tracking_number]`
- **API:** `npm run recovery:api` → FastAPI on `:5055` (or `npm start` → Node on `:3000` proxies to `:5055`)
- **Frontend:** `npm run frontend` → Vite on `:5173` (uses `frontend/.env` → `VITE_API_BASE_URL`, default Node `:3000`)

### Recovery pipeline modules

| Module | Responsibility |
| --- | --- |
| `graph/shipment_state.py` | Resolve a Shipment into a `ShipmentState`: **actualNode** = last confirming event / `currentLocation`; **expectedNode** = route-progress hub from `assignedRoute` stops + on-route events (persisted `expectedLocation` is a cache only). Misplaced when both known and they differ. Recovery pickup = actualNode. |
| `graph/vehicle_state.py` | Query active vehicles, resolve locations + **currentRoute hub sequence**, compute available capacity. Driver handle = vehicle number (no separate Driver entity). |
| `graph/recovery_context.py` | Bridge: assembles `RecoveryContext` from shipment state + vehicle state + graph. Pickup = actual hub. Entry point: `get_recovery_context(db, G, identifier)`. |
| `graph/candidate_generator.py` | Enumerate raw piggyback `RecoveryCandidate` objects using **existing active routes** for `at_node` / `pass_through` / `detour`. Shortest-path alone is not pass_through. No scoring. |
| `graph/recovery_scorer.py` | Feasibility filter + configurable weighted scoring + selection. Does not write MongoDB. |
| `graph/recovery_persistence.py` | Idempotent persist of selected (+ rejected) plans into `recoverycases` / `recoveryoptions`. |
| `graph/graph_cache.py` | In-memory NetworkX cache; `get_graph()` / `refresh_graph()`. |
| `graph/recovery_orchestrator.py` | End-to-end coordinator: `analyze_shipment_recovery(shipment_id)` → score → persist plan. No algorithms/formulas. |
| `graph/api_server.py` | FastAPI recovery API (uvicorn; spawned by Node). |
| `src/routes/recovery.js` | Thin Node controllers that proxy to the Python API. |

**Layer separation:**
- `GRAPH` — "Can something travel from A to B?" (NetworkX)
- **OPERATIONAL STATE** — "Where is the shipment/vehicle right now (actual), and where should it be (expected)?" (MongoDB)
- `CANDIDATE GENERATION` — "Could this vehicle/route potentially recover this shipment?"
- `OPTIMIZATION` — "Which feasible option should be selected?" (`score_recovery_candidates`)
- `ORCHESTRATION` — "Run the full pipeline for a shipment ID" (`analyze_shipment_recovery`)
- `API` — "Expose JSON over HTTP" (Node proxy → Python recovery service)

### Scoring notes

- Weights live in `DEFAULT_WEIGHTS` (`time`, `cost`, `capacity`, `deadline`, `priority`, `detour`, `connectivity`) and are easy to retune for demos.
- Hard constraints (capacity / unreachable / deadline / invalid path) reject before weighted ranking.
- Detour component uses RouteBaseline when present; otherwise piggyback facts (`at_node` / `pass_through` → no extra km). Missing baseline is never invented.
- Connectivity is a softened minor tie-breaker (weight 0.05) so it cannot dominate route compatibility.
- Each scored candidate exposes component scores + a bullet explanation; selection text contrasts why others ranked lower.
- **Persistence:** After a feasible analysis (`RECOVERY_PLAN_AVAILABLE`), `graph/recovery_persistence.py` upserts the selected plan into `recoveryoptions` and links it from `recoverycases.selectedOption` (+ `incidents.selectedRecoveryOption`). Rejected alternatives are stored lightly for audit. Repeated analyze is idempotent (same candidate fingerprint → same option id). Assignment prefers the persisted selected option over re-scoring. Score fields map scorer `time` → `scores.deliveryTime` and include `detour` / `connectivity`.

### Location ↔ Graph node bridging

`Location.graphNodeKey` (a `String` field on the Location Mongoose model) stores the
`hub_name` of the corresponding `telangana_nodes` record.  All 91 operational locations
have `graphNodeKey` populated.  The graph node key is the single join between the
Mongoose operational models and the NetworkX graph.

### REST API

All endpoints are served by the FastAPI server (`graph/api_server.py`) on port 5055.
The Node.js layer (port 3000) acts as a thin proxy — it forwards all `/api/*` requests
to FastAPI transparently.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | MongoDB connectivity + graph status |
| `GET` | `/api/hubs` | All operational locations (`locations` collection) |
| `GET` | `/api/graph` | Telangana network topology for map rendering (nodes + edges) |
| `GET` | `/api/vehicles` | All vehicles with capacity, load, location, route, and optional driver profile fields |
| `GET` | `/api/vehicles/:vehicleId` | Single vehicle detail + NetworkX shortest path to destination |
| `GET` | `/api/shipments` | Lightweight shipment list for admin dashboard |
| `GET` | `/api/shipments/:shipmentId` | Full shipment detail + recent tracking events + active incident |
| `GET` | `/api/recovery/:shipmentId` | Full recovery analysis JSON |
| `POST` | `/api/recovery/:shipmentId/calculate` | Same pipeline (explicit calculate verb) |
| `POST` | `/api/recovery/:shipmentId/assign` | Assign a recovery candidate + simulated driver notification |
| `POST` | `/api/recovery/:shipmentId/pickup` | Simulated driver pickup confirmation (does not resolve incident) |
| `POST` | `/api/recovery/:shipmentId/resolve` | Resolve incident after pickup (end of demo workflow) |
| `POST` | `/api/recovery/analyze/:shipmentId` | Same as GET (explicit analyze) |
| `POST` | `/api/recovery/graph/refresh` | Rebuild in-memory NetworkX graph from MongoDB |
| `POST` | `/api/incidents/simulate` | Simulate MISPLACED_SHIPMENT on an existing shipment |
| `GET` | `/api/incidents/active` | Active incidents for dashboard alerts |
| `GET` | `/api/incidents/by-shipment/:shipmentId` | Latest incident for a shipment |

Recovery response `status` values: `RECOVERY_PLAN_AVAILABLE` | `NO_FEASIBLE_RECOVERY`.

Incident lifecycle (computed + persisted): `NORMAL` → `MISPLACED` → `RECOVERY_ANALYSIS` → `RECOVERY_ASSIGNED` → `PICKUP_CONFIRMED` → `RECOVERED`.

Demo recovery workflow:

```
Late detection (package already on wrong / outbound vehicle)
  → Sarvam call to current driver (configurable script; non-blocking)
Analyze → candidates → score → select best → Persist recovery plan
  → Assign (uses persisted plan) → Sarvam call to recovery driver
  → Driver confirms pickup (POST /pickup) → Shipment recovered
  → Resolve incident
```

When Sarvam Instant Outbound env is incomplete, calls fall back to the log stub.
Scripts: `SARVAM_SCRIPT_LATE_DETECTION` / `SARVAM_SCRIPT_RECOVERY_ASSIGN`.
Phone: vehicle `phone` fields if present, else `SARVAM_DEMO_DRIVER_PHONE`.

Recovery response includes `recoveryPlan: { id, status, score, … }` when a plan was persisted (null when `NO_FEASIBLE_RECOVERY`).

Incident DB statuses: `OPEN` / `RECOVERY_REQUIRED` → `ASSIGNED` → `PICKUP_CONFIRMED` → `RESOLVED`.
Pickup confirmation sets shipment `status=recovered` and writes `recovery_pickup_confirmed`; operator `resolve` closes the incident.

### API module layout

| Module | Responsibility |
| --- | --- |
| `graph/api_models.py` | Pydantic response models (strict types, JSON-safe) |
| `graph/api_services.py` | Service layer — MongoDB batch queries + data assembly |
| `graph/api_server.py` | FastAPI routes + CORS + error handlers |
| `graph/incident_service.py` | Simulate / assign / pickup-confirm / resolve incident workflow (MongoDB) |
| `graph/recovery_persistence.py` | Persist selected recovery plans; assign/resolve status transitions |
| `graph/services/driver_communication.py` | Driver notify: Sarvam Instant Outbound + log fallback; env scripts |
| `graph/services/sarvam_outbound.py` | Sarvam Conversations Instant Outbound HTTP client |

**CORS:** Controlled by the `CORS_ORIGINS` env var (comma-separated). Defaults to
`localhost:3000/3001/5173/5174/8081/8082/19006` (includes Expo web). Set `CORS_ORIGINS=*` for permissive hackathon deployment.

**Performance:** Vehicle and shipment list endpoints batch-load all referenced locations
and routes in a small number of MongoDB round-trips (not one query per document).

## Driver mobile app (`mobile-driver-app/`)

Expo / React Native driver cockpit connected to the same Node gateway (`EXPO_PUBLIC_API_BASE_URL`, default `:3000`). Does **not** duplicate recovery logic or place Sarvam calls. UI tokens mirror the dashboard **NeoBrutalism** palette (`config/theme.ts`: light blue bg, hard black borders, offset shadows, `#5294FF` main). Navigation uses a colorful Google Maps–style roadmap (JS Maps / native light style) with a turn-banner overlay; without a Maps key the SVG schematic simulates parks, water, roads, and a blue route casing.

**Local bootstrap:** `./dev-mobile.sh` (vs `./dev.sh` for dashboard). Installs mobile deps, writes `mobile-driver-app/.env`, runs `seed:demo-drivers`, starts Recovery + Node + Expo Metro (`:8082`). Flags: `--install`, `--web` / `--android` / `--ios`, `--with-frontend`, `--no-seed`, `--no-backend`.

| Area | Role |
| --- | --- |
| `app/index` | Driver Selection — exactly 3 demo profiles resolved against live `/api/vehicles` |
| `app/cockpit` | Navigation map + HUD + recovery alert + pickup/resolve actions |
| `config/theme.ts` | Shared NeoBrutalism tokens (aligned with `frontend/src/index.css`) |
| `config/mapStyles.ts` | Light colorful map style for native MapView |
| `services/api.ts` | Same REST surface as the operator dashboard client |
| `services/directions.ts` | Google Directions when keyed; else graph hub polyline from `/api/graph` |
| `services/mockGps.ts` | Demo GPS walk along the active route for geofence demos |
| `hooks/useDriverCockpit.ts` | Polls `/api/incidents/active` + vehicle detail; maps backend lifecycle → mission status |

Demo drivers are stamped onto real vehicles via `npm run seed:demo-drivers` (`driverId` / `driverName` / `phone`). Vehicle list responses expose those fields plus current hub `coordinates`.

## Frontend (`frontend/`)

Marketing landing + logistics ops dashboard styled with **NeoBrutalism / shadcn** (`frontend/src/components/ui/*`, blue registry tokens in `frontend/src/index.css`). Semantic status/surface tokens live alongside the palette so colors can be refined globally later. The React app calls the **Node gateway** (`VITE_API_BASE_URL`, default `http://127.0.0.1:3000`); it must not hardcode the FastAPI `:5055` URL in components. Routing via `react-router-dom`.

| Path | Role |
| --- | --- |
| `frontend/src/api/client.js` | Centralized Node-gateway client (health, graph, hubs, vehicles, shipments, recovery, incidents) |
| `frontend/src/types/api.ts` | TypeScript types for API response shapes (mirrors FastAPI / orchestrator JSON) |
| `frontend/src/hooks/useRecoveryData.js` | Recovery data layer: loading/error/data, refresh, analyze/assign/pickup/resolve (no optimistic lifecycle) |
| `frontend/src/App.jsx` | Route table: `/` landing, `/dashboard/*` nested dashboard routes |
| `frontend/src/pages/LandingPage.jsx` | NeoBrutalism marketing landing (brand hero, features, process/stats, CTA) |
| `frontend/src/layouts/DashboardLayout.jsx` | Sidebar shell + shared dashboard state/hooks; provides Outlet context |
| `frontend/src/components/Sidebar.jsx` | Left nav (Overview, Shipments, Fleet, Hubs, Exceptions, Search) + Network → Graph nodes + global search |
| `frontend/src/components/ui/*` | Installed NeoBrutalism/shadcn primitives (button, card, badge, alert, dialog, …) |
| `frontend/src/components/ops/*` | Thin app helpers composing UI kit (PageHeader, KpiCard, StatusBadge, DetailField, EmptyState) |
| `frontend/src/pages/*` | Overview / Shipments / Vehicles / Hubs / GraphNodes / Recovery / Search views consuming outlet context |
| `frontend/src/components/*` | MetricsBar, SearchPanel, LogisticsMap, NetworkGraph (imperative 3d-force-graph ego viz), ShipmentPanel, VehiclePanel, HubPanel, IncidentAlert, RecoveryCandidates, RecoveryPlan |
| `frontend/src/lib/egoSubgraph.js` | Client ego-neighborhood extract over `/api/graph` (BFS hops; degree for sizing only) |
| `frontend/src/components/recovery/*` | Operator recovery incident view, action panel (state-gated confirmations), `RecoveryTimeline` (backend-driven lifecycle + event history), candidate helpers, `recoveryMapState` (map overlay derivation) — assignment uses persisted plan only |

Map data comes only from `GET /api/graph` (node lat/lon + edges). The **Graph nodes** tab (`/dashboard/graph`) renders a **3D** ego neighborhood (default 1 undirected hop; optional 2) over those same edges — camera opens on the highest-degree hub; node color = `hub_type`; size = degree; no centrality dashboard. `LogisticsMap` overlays recovery context from existing API fields only:

- expected route ← `shipment.plannedRoute` / `network.plannedRoute`
- pickup / actual ← incident hub / `actualNode` / `currentNode`
- recovery path ← assigned `incident.recoveryPath` or `selectedRecovery.path` / candidate `path`
- path segments (when present) ← `vehicleToPickupPath`, `vehicleToDestinationPath`, `existingRouteNodes` from candidates / selectedRecovery / recoveryPlan / incident (sourced from candidate_generator; not recomputed in React)
- vehicle existing movement ← `existingRouteNodes`, else `GET /api/vehicles/:id` `currentPath`
- candidate type ← backend `pickupCase` / `candidateType` (`at_node` | `pass_through` | `detour`)

Expanding a candidate in RecoveryCandidates previews that candidate’s backend `path` on the map (selected plan stays dominant). No client-side routing/scoring.

## Out of scope (for now)

Auth, seed data, ML/RL optimizers, and centrality dashboards.
