# Architecture — SH-205 Intelligent Shipment Piggybacking

Hackathon prototype focused on recovering misplaced shipments by evaluating piggyback options on existing routes.

## Stack

- Node.js (ESM)
- MongoDB via Mongoose
- TypeScript for schema/type definitions (`src/models`)
- Python (`uv` + NetworkX) for the in-memory logistics graph layer

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
    → nx.DiGraph
    → graph_metrics / graph_queries
    → (future) recovery engine
```

- **Graph type:** `nx.DiGraph` — route legs are directional; reverse edges are rare/absent.
- **Node id:** `hub_name`
- **Edge weights:** separate attributes `avg_distance_km`, `avg_time_min` (no synthetic single weight; no `cost` in DB yet)
- **Demo:** `uv run python scripts/demo_graph.py`

## Out of scope (for now)

APIs, controllers, services, auth, seed data, recovery scoring, vehicle assignment, and recovery optimization.
