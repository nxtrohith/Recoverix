# Architecture — SH-205 Intelligent Shipment Piggybacking

Hackathon prototype focused on recovering misplaced shipments by evaluating piggyback options on existing routes.

## Stack

- Node.js (ESM)
- MongoDB via Mongoose
- TypeScript for schema/type definitions (`src/models`)

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

## Out of scope (for now)

APIs, controllers, services, auth, seed data, and recovery scoring business logic.
