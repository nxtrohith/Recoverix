# SH-205 database cleanup and graph-readiness

## Canonical collection decisions

| Collection | Decision | Reason |
| --- | --- | --- |
| `districts` | Keep | Canonical Telangana district reference; it already contains each district's headquarters and coordinates. |
| `hubs` | Keep | District-level logistics-hub reference, including capacity and operating hours. It is distinct from the 91 observed transport facilities. |
| `locations` | Keep | Canonical physical facilities used by routes, vehicles, shipments, events, and recovery records. Each location is linked to its topology node with `graphNodeKey`. |
| `telangana_nodes` | Keep | Canonical persisted NetworkX topology nodes. |
| `telangana_edges` | Keep | Canonical persisted NetworkX topology edges, including observed distance, travel time, trip count, and route type. |
| `routes` | Keep | Operational route instances: location references, vehicle, capacity/load, schedule, and status. |
| `vehicles` | Keep | Operational fleet availability and capacity. |
| `shipments` | Keep empty | Required Mongoose lifecycle entity; it is intentionally empty until a real demo scenario exists. |
| `shipmentevents` | Keep empty | Required Mongoose audit trail for misplaced-shipment detection. |
| `recoverycases` | Keep empty | Canonical Mongoose recovery-case collection. |
| `recoveryoptions` | Keep empty | Canonical Mongoose recovery-option collection, with references and ranking fields. |

## Removed after verification

| Collection | Verification | Reason |
| --- | --- | --- |
| `city_coordinates_cache` | Its 68 documents exactly matched `coordinates`; the source cache remains a local CSV used only by geocoding. | Temporary, duplicated cache. |
| `coordinates` | Identical 68-document city-coordinate copy; every transport node already has coordinates. | Redundant geographic copy. |
| `district_coordinates` | All 33 rows matched the same district headquarters and coordinates in `districts`. | Redundant geographic copy. |
| `recovery_candidates` | Its 360 payloads exactly matched `recovery_options`; both use legacy string IDs and are not referenced by code. | Obsolete pre-schema recovery data. |
| `recovery_options` | Duplicate of `recovery_candidates`, not the Mongoose `recoveryoptions` collection. | Obsolete alias. |

## MongoDB to NetworkX flow

```text
districts / hubs ── geographic context
locations ── graphNodeKey ──> telangana_nodes ──> NetworkX nodes
routes / vehicles ────────────────────────────> operational capacity and schedules
telangana_edges ──────────────────────────────> NetworkX directed edges
shipments + shipmentevents ───────────────────> misplaced detection
recoverycases + recoveryoptions ──────────────> selected recovery strategy
```

`telangana_nodes` and `telangana_edges` are topology records, while `locations`/`routes`/`vehicles` are operational records. This separation deliberately retains both representations rather than treating coordinates as the graph.

## Verified graph readiness

The cleanup script refuses to run unless every edge endpoint has a topology node, every location maps one-to-one to a topology node, and all current route/vehicle ObjectId references are valid. It adds unique topology indexes and backfills `locations.graphNodeKey` before removing legacy collections.

Run a safe check with `node scripts/cleanup_database.js`, then execute `node scripts/cleanup_database.js --apply` only after its invariants pass. The script does not create shipments, events, recovery cases, or recovery options.

## Next schema work

The active `Route` model now declares `tripCount` and `routeTypes`, which already exist in persisted route data. Districts and hubs are currently raw MongoDB reference collections rather than Mongoose models; add models only when application code needs to query them directly. Build the NetworkX loader next from `telangana_nodes` and `telangana_edges`, joining operational information through `locations.graphNodeKey` and route location references.
