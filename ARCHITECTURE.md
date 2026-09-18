# Architecture — SH-205 Intelligent Shipment Piggybacking

Hackathon prototype focused on recovering misplaced shipments by evaluating piggyback options on existing routes.

## Stack

- Node.js (ESM)
- MongoDB via Mongoose
- TypeScript for schema/type definitions (`src/models`)
- Python (`uv` + NetworkX + FastAPI/uvicorn) for the logistics graph + recovery API
- React + Vite frontend (`frontend/`) talking to FastAPI over HTTP (`VITE_API_BASE_URL`)

## Data layer

Seven Mongoose collections under `src/models/`:

| Model | Role |
| --- | --- |
| `Location` | Warehouses, hubs, DCs, origins, destinations |
| `Vehicle` | Transport assets with capacity and current load |
| `Route` | Existing routes with embedded `stops[]` (no separate RouteStop collection) |
| `Shipment` | Packages in transit |
| `RecoveryCase` | Misplaced-shipment recovery case |
| `RecoveryOption` | Ranked piggyback strategy candidates (core decision schema) |
| `ShipmentEvent` | Shipment tracking history |

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
- **Frontend:** `npm run frontend` → Vite on `:5173` (uses `frontend/.env` → `VITE_API_BASE_URL`)

### Recovery pipeline modules

| Module | Responsibility |
| --- | --- |
| `graph/shipment_state.py` | Resolve a Shipment + its Locations into a `ShipmentState` with graph node keys. Determine `is_misplaced` / `is_delayed`. |
| `graph/vehicle_state.py` | Query active vehicles, resolve their locations, compute available capacity. |
| `graph/recovery_context.py` | Bridge: assembles `RecoveryContext` from shipment state + vehicle state + graph. Entry point: `get_recovery_context(db, G, identifier)`. |
| `graph/candidate_generator.py` | Enumerate raw piggyback `RecoveryCandidate` objects (paths, capacity, rough deadline). No scoring. |
| `graph/recovery_scorer.py` | Feasibility filter + configurable weighted scoring + deterministic explanations + selection. Does not auto-persist. |
| `graph/graph_cache.py` | In-memory NetworkX cache; `get_graph()` / `refresh_graph()`. |
| `graph/recovery_orchestrator.py` | End-to-end coordinator: `analyze_shipment_recovery(shipment_id)`. No algorithms/formulas. |
| `graph/api_server.py` | FastAPI recovery API (uvicorn; spawned by Node). |
| `src/routes/recovery.js` | Thin Node controllers that proxy to the Python API. |

**Layer separation:**
- `GRAPH` — "Can something travel from A to B?" (NetworkX)
- `OPERATIONAL STATE` — "Where is the shipment/vehicle right now?" (MongoDB)
- `CANDIDATE GENERATION` — "Could this vehicle/route potentially recover this shipment?"
- `OPTIMIZATION` — "Which feasible option should be selected?" (`score_recovery_candidates`)
- `ORCHESTRATION` — "Run the full pipeline for a shipment ID" (`analyze_shipment_recovery`)
- `API` — "Expose JSON over HTTP" (Node proxy → Python recovery service)

### Scoring notes

- Weights live in `DEFAULT_WEIGHTS` (`time`, `cost`, `capacity`, `deadline`, `priority`, `detour`, `connectivity`) and are easy to retune for demos.
- Deadline failures are hard-rejected (not merely low-scored).
- Detour is compared to the vehicle's `currentRoute` distance/duration when present; otherwise marked **unavailable** (never fabricated).
- Hub connectivity uses degree + degree centrality of the pickup hub.
- **Persistence:** `recoveryoptions` (Mongoose `RecoveryOption`) already exists, but its `scores` subdocument has `resourceUtilization` instead of `detour`/`connectivity`. The scorer does not write to MongoDB until that mapping is decided. There is no `recovery_candidates` collection (only a sample JSON file under `data/`).

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
| `GET` | `/api/vehicles` | All vehicles with capacity, load, location, and route info |
| `GET` | `/api/vehicles/:vehicleId` | Single vehicle detail + NetworkX shortest path to destination |
| `GET` | `/api/shipments` | Lightweight shipment list for admin dashboard |
| `GET` | `/api/shipments/:shipmentId` | Full shipment detail + recent tracking events |
| `GET` | `/api/recovery/:shipmentId` | Full recovery analysis JSON |
| `POST` | `/api/recovery/analyze/:shipmentId` | Same as GET (explicit analyze) |
| `POST` | `/api/recovery/graph/refresh` | Rebuild in-memory NetworkX graph from MongoDB |

Recovery response `status` values: `RECOVERY_PLAN_AVAILABLE` | `NO_FEASIBLE_RECOVERY`.

### API module layout

| Module | Responsibility |
| --- | --- |
| `graph/api_models.py` | Pydantic response models (strict types, JSON-safe) |
| `graph/api_services.py` | Service layer — MongoDB batch queries + data assembly |
| `graph/api_server.py` | FastAPI routes + CORS + error handlers |

**CORS:** Controlled by the `CORS_ORIGINS` env var (comma-separated). Defaults to
`localhost:3000/3001/5173/5174`. Set `CORS_ORIGINS=*` for permissive hackathon deployment.

**Performance:** Vehicle and shipment list endpoints batch-load all referenced locations
and routes in a small number of MongoDB round-trips (not one query per document).

## Frontend (`frontend/`)

Functional admin dashboard (intentionally basic UI):

| Path | Role |
| --- | --- |
| `frontend/src/api/client.js` | Centralized FastAPI client (`getHealth`, `getGraph`, `getHubs`, `getVehicles`, `getShipments`, `getShipment`, `getVehicle`, `getRecoveryAnalysis`) |
| `frontend/src/App.jsx` | Dashboard state + recovery workflow |
| `frontend/src/components/*` | Header, MetricsBar, SearchPanel, LogisticsMap (Leaflet), ShipmentPanel, VehiclePanel, RecoveryCandidates, RecoveryPlan |

Map data comes only from `GET /api/graph` (node lat/lon + edges). Recovery path highlighting uses `selectedRecovery.path` from `GET /api/recovery/:id` — no client-side routing/scoring.

## Out of scope (for now)

Auth, seed data, ML/RL optimizers, centrality dashboards, automatic persistence of scored options, and visual polish of the admin UI.
