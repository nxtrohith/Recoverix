# 🚛 Recoverix: Intelligent Shipment Piggybacking

> **Autonomous logistics recovery system that turns shipment exceptions into actionable in-transit piggybacking assignments across the Telangana freight network — with real-time Sarvam AI voice calls to drivers in Telugu.**

---

## 📌 Executive Summary

When a high-value shipment is misplaced or delayed at a freight terminal, traditional logistics systems either wait for the next scheduled run or dispatch an expensive dedicated recovery vehicle.

**Intelligent Shipment Piggybacking (Recoverix)** solves this by analyzing active in-network vehicles and their existing routes. It dynamically identifies passing or nearby freight trucks with residual capacity, reroutes them to the misplaced hub, and piggybacks the cargo to its final destination — then immediately calls the assigned driver via a Sarvam AI Voice Agent in Telugu with the full recovery brief.

```
Shipment Exception (Actual ≠ Expected Hub)
           │
           ▼
Telangana Logistics Graph Search (NetworkX, 91 nodes / 143 edges)
           │
           ▼
Candidate Generation (at_node / pass_through / detour)
           │
           ▼
Feasibility Engine (Capacity + Hard Deadline + Max Detour)
           │
           ▼
Deterministic Weighted Scoring
           │
           ▼
Optimal Vehicle Selection & Driver Assignment
           │
     ┌─────┴─────────────────────────┐
     ▼                               ▼
Sarvam AI Outbound Call       Driver Mobile App
(Telugu Voice Notification)   (Turn-by-Turn Navigation)
```

---

## 🌟 System Components

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Operator Control Tower** | React, Vite, Leaflet | Web dashboard to monitor live shipments, visualize graph nodes/routes, inspect divergence, and trigger recovery assignments. |
| **Piggyback Intelligence Engine** | Python 3.11+, FastAPI, NetworkX | In-memory graph search that evaluates capacity, routes, detour ratios, and deadlines across 91 Telangana logistics hubs. |
| **Driver Companion Mobile App** | Expo, React Native, Google Maps | Driver cockpit with live GPS tracking, 3D follow camera, turn-by-turn voice navigation, and recovery mission alerts. |
| **Outbound Voice Integration** | Sarvam AI Conversations API | Automated outbound phone calls in Telugu (configurable) notifying drivers of urgent cargo recovery tasks. |

---

## 🚀 Key Features

### 1. Expected vs. Actual Hub Divergence Detection
- **`expectedNode`**: Where the package should be per its planned route (`assignedRoute`).
- **`actualNode`**: Where the shipment was last physically confirmed via scan events (`currentLocation`).
- **Mismatch Trigger**: Automatically flags the shipment as `MISPLACED` and uses the actual hub as the pickup origin for recovery.

### 2. Piggyback Candidate Classification
- **`at_node`**: Vehicle is already stationed at the recovery pickup hub.
- **`pass_through`**: The pickup hub lies directly along the vehicle's active route — zero detour cost.
- **`detour`**: Vehicle diverts from its planned corridor to retrieve cargo, bounded by a strict `max_detour_ratio` (default ≤ 3.0×).

### 3. Hard Feasibility & Deterministic Scoring
- **Hard Constraints**: Rejects candidates exceeding residual weight/volume capacity or that cannot meet the shipment deadline.
- **Multi-Factor Scoring**:

  ```
  Score = 0.25(Time) + 0.20(Deadline) + 0.15(Cost) + 0.15(Capacity)
        + 0.10(Priority) + 0.10(Detour) + 0.05(Connectivity)
  ```

### 4. Sarvam AI Outbound Voice Call (Telugu)
- On assignment, the backend automatically calls the driver's phone number via **Sarvam Instant Outbound API**.
- The voice agent speaks in Telugu, including the shipment ID, pickup hub, and final destination.
- **Idempotency**: A call is placed only once per assignment. Use the explicit "Retry Call" action to re-trigger.
- Call status is polled every 5 seconds and displayed live on the operator dashboard.

### 5. Recovery Workflow State Machine

```
MISPLACED → [Analyze] → RECOVERY_PLAN_AVAILABLE
          → [Assign]  → ASSIGNED  (+Sarvam call triggered)
          → [Pickup]  → PICKUP_CONFIRMED
          → [Resolve] → RESOLVED
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│               Operator Control Tower (:5173 / :5174)         │
│    React + Vite  │  Leaflet Map  │  Recovery Action Panel    │
└────────────────────────┬─────────────────────────────────────┘
                         │ REST / JSON
┌────────────────────────▼─────────────────────────────────────┐
│              Recovery Core Engine (:8000 / :5055)            │
│   FastAPI API  │  Recovery Orchestrator  │  Scoring Engine   │
│   NetworkX DiGraph (in-memory, 91 nodes, 143 edges)          │
└──────┬──────────────────┬───────────────────────────┬────────┘
       │                  │                           │
       ▼                  ▼                           ▼
  MongoDB Atlas    Sarvam AI Outbound       Node.js Proxy
  (shipments,      (Telugu voice call       (src/index.js)
   incidents,       to driver phone)
   driver_calls)
                         │
┌────────────────────────▼─────────────────────────────────────┐
│                 Driver Mobile App (:8082)                     │
│   Expo / React Native  │  Google Maps  │  Turn-by-Turn Voice │
└──────────────────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```text
Conv-Software-Hackathon/
├── frontend/                        # Operator Web Dashboard (React + Vite + Leaflet)
│   ├── src/
│   │   ├── components/
│   │   │   └── recovery/            # Incident view, timeline, action panel, call status
│   │   ├── hooks/
│   │   │   ├── useRecoveryData.js   # Recovery state, call polling & retry logic
│   │   │   └── useShipmentData.js
│   │   ├── api/
│   │   │   └── client.js            # All API fetch methods incl. call status & retry
│   │   ├── pages/                   # Overview, Shipments, Vehicles & Recovery pages
│   │   └── types/                   # TypeScript API contract schemas
│   └── package.json
│
├── graph/                           # Python Recovery Intelligence Core
│   ├── api_server.py                # FastAPI REST server (port 8000 / 5055)
│   ├── api_models.py                # Pydantic request/response models
│   ├── api_services.py              # Data retrieval & serialisation helpers
│   ├── candidate_generator.py       # at_node / pass_through / detour generation
│   ├── recovery_scorer.py           # Constraint validation & multi-objective scoring
│   ├── recovery_orchestrator.py     # End-to-end pipeline coordination
│   ├── incident_service.py          # Recovery workflow + Sarvam call + idempotency
│   ├── shipment_state.py            # Expected vs. actual divergence engine
│   ├── graph_cache.py               # In-memory NetworkX graph management
│   └── services/
│       └── sarvam_outbound.py       # Sarvam AI outbound voice call client
│
├── mobile-driver-app/               # Driver Turn-by-Turn Cockpit (Expo / React Native)
│   ├── app/                         # Screens: Cockpit, Navigation, Recovery, Hubs, Settings
│   ├── components/                  # MapView, HUD telemetry, Simulation dock
│   ├── services/                    # Google Directions, voice guidance, mock GPS
│   └── config/                      # Design tokens & theme
│
├── scripts/                         # Developer utilities
│   ├── demo_orchestrator.py         # Interactive CLI end-to-end recovery demo
│   └── seed_demo_misplaced.py       # Seeds SHP-DEMO-MISPLACED incident in MongoDB
│
├── src/                             # Node.js backend proxy & Mongoose schemas
├── data/                            # Static Telangana hub & route graph data
├── package.json                     # Root npm runner scripts
├── pyproject.toml                   # Python environment config (uv)
└── .env                             # Environment secrets & connection strings
```

---

## ⚡ Quick Start

### Prerequisites
- **Node.js** v18+
- **Python** 3.11+ with [`uv`](https://github.com/astral-sh/uv)
- **MongoDB** Atlas cluster (or local instance)

### 1. Environment Configuration

Copy `.env.example` to `.env` and fill in the values:

```env
# MongoDB
MONGODB_URI="mongodb+srv://<user>:<password>@cluster0.bxk7mqg.mongodb.net"
MONGODB_DB_NAME="hackathon_new"

# Sarvam AI Voice Calling
SARVAM_API_KEY="sk_samvaad_..."
SARVAM_ORG_ID="..."
SARVAM_WORKSPACE_ID="..."
SARVAM_APP_ID="..."
SARVAM_DEFAULT_LANGUAGE="Telugu"

# Sarvam Outbound (required for live calls)
SARVAM_APP_VERSION="1"
SARVAM_CONNECTION_ID="..."                 # SIP/PSTN connection ID
SARVAM_AGENT_PHONE_NUMBER="+91XXXXXXXXXX"  # Agent caller ID (Sarvam number)
SARVAM_DEMO_DRIVER_PHONE="+91XXXXXXXXXX"   # Driver number for demo calls
```

### 2. Install Dependencies

```bash
# Root (Node.js proxy + scripts)
npm install

# Frontend
npm --prefix frontend install

# Python backend
uv sync
```

### 3. Seed the Demo Incident

```bash
npm run seed:demo-misplaced
```

Creates **SHP-DEMO-MISPLACED** in MongoDB — a pre-built misplacement scenario with driver contact info.

### 4. Start the Backend

```bash
# Standard (port 5055)
npm run recovery:api

# Or with hot-reload on port 8000
uv run uvicorn graph.api_server:app --host 0.0.0.0 --port 8000 --reload
```

### 5. Start the Operator Dashboard

```bash
npm run frontend
# http://localhost:5173 (or :5174 if port busy)
```

### 6. Start the Driver Mobile App _(optional)_

```bash
# Stamp 3 demo drivers onto real vehicles (once)
npm run seed:demo-drivers

cd mobile-driver-app
npm install
npm start
# Press 'w' for browser at http://localhost:8082
```

Select **Ramesh Kumar** (TS-09-UB-1077) for the Kamareddy → Karimnagar recovery demo.

---

## 🧪 End-to-End Demo Flow

The seeded scenario traces a real misplacement across the Telangana network:

| Stage | Hub | Status |
| :--- | :--- | :--- |
| Origin | `Hyderabad_Shamshbd_H` | Package loaded & departed |
| **Planned next hub** | `Medchal_MROoffce_D` | Expected handoff |
| **Actual hub (wrong)** | `Kamareddy_Devenply_I` | Confirmed misplaced ✗ |
| Final destination | `Karimnagar_KamnHbRD_I` | Must arrive by deadline |

### Operator Dashboard Steps

1. **Open** → `http://localhost:5173`
2. **Go to** → Recovery tab in the sidebar
3. **Find** → `SHP-DEMO-MISPLACED` (flagged as MISPLACED)
4. **Click "Analyze"** → candidate scoring runs (49 vehicles across 91 hubs evaluated)
5. **Review candidates** → ranked by composite score; top pick pre-selected
6. **Click "Assign"** → confirm the dialog (vehicle, pickup hub, destination, driver)
   - ⚡ Sarvam outbound call is triggered to the driver's phone **in Telugu**
7. **Watch the call status card**:
   - `📞 Calling driver…` → `🟢 Driver answered` → `✅ Driver confirmed`
   - Auto-polls every **5 seconds**
8. **Answer the phone** — hear the Telugu voice agent read the recovery brief
9. **Click "Confirm Pickup"** once driver arrives
10. **Click "Resolve"** to close the incident

### CLI Smoke Tests

```bash
# Run full recovery pipeline without the UI
npm run recovery:demo -- SHP-DEMO-MISPLACED

# Check live call status
curl http://localhost:8000/api/recovery/SHP-DEMO-MISPLACED/call-status

# Force a new outbound call (overrides idempotency)
curl -X POST http://localhost:8000/api/recovery/SHP-DEMO-MISPLACED/retry-call \
     -H "Content-Type: application/json" -d '{}'

# Test call to any number (no incident required)
curl -X POST http://localhost:8000/api/sarvam/test-call \
     -H "Content-Type: application/json" \
     -d '{"phone": "+91XXXXXXXXXX"}'
```

---

## 📡 API Reference

### Core

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Healthcheck — MongoDB + NetworkX graph status |
| `GET` | `/api/graph` | Full Telangana graph topology (nodes + edges) |
| `GET` | `/api/hubs` | All logistics hubs |
| `GET` | `/api/shipments` | All shipments with current statuses |
| `GET` | `/api/shipments/{shipmentId}` | Shipment detail + events |
| `GET` | `/api/vehicles` | All vehicles with location and capacity |
| `GET` | `/api/vehicles/{vehicleId}` | Single vehicle detail |

### Recovery

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/recovery/{shipmentId}` | Piggybacking analysis — candidates, scores, plan |
| `POST` | `/api/recovery/{shipmentId}/calculate` | Re-run candidate scoring |
| `POST` | `/api/recovery/{shipmentId}/assign` | Assign vehicle → triggers Sarvam call |
| `POST` | `/api/recovery/{shipmentId}/pickup` | Confirm driver collected the shipment |
| `POST` | `/api/recovery/{shipmentId}/resolve` | Close the recovery incident |

### Voice Call

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/recovery/{shipmentId}/call-status` | Live call status for active incident |
| `POST` | `/api/recovery/{shipmentId}/retry-call` | Force a new Sarvam call |
| `POST` | `/api/sarvam/test-call` | Test outbound call to any number |

### Incident Management

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/incidents/active` | All open recovery incidents |
| `GET` | `/api/incidents/by-shipment/{shipmentId}` | Incident for a specific shipment |
| `POST` | `/api/incidents/simulate` | Simulate a misplacement event |
| `POST` | `/api/recovery/graph/refresh` | Reload NetworkX graph from MongoDB |

---

## 🔊 Sarvam Voice Agent Behaviour

When a vehicle is assigned, the backend:

1. Looks up the driver's phone number from the vehicle/incident record.
2. Normalises to E.164 format (handles Indian 10-digit, `+91`, `91` prefixes).
3. Builds a dynamic Telugu message:

   ```
   నమస్కారం [Driver Name] గారు. మీకు ఒక ముఖ్యమైన రికవరీ అసైన్మెంట్ ఉంది.
   షిప్మెంట్ [ID] తప్పు హబ్లో ఉన్నట్లు గుర్తించబడింది.
   మీరు [Pickup Hub] కి వెళ్లి ఆ షిప్మెంట్ను తీసుకుని [Destination] కి తరలించాలి.
   దయచేసి ఈ అసైన్మెంట్ను నిర్ధారించండి.
   ```

4. Places the call via Sarvam Instant Outbound API and records the attempt ID in MongoDB (`driver_calls` collection).
5. **Idempotency**: Subsequent assign requests return the existing call record — no duplicate calls. Use `/retry-call` to force a new attempt.

> **Configurable language**: Set `SARVAM_DEFAULT_LANGUAGE=Hindi` (or `Kannada`, `Tamil`, etc.) in `.env`.

---

## 🛡️ License

Built for the **Convergence Software Hackathon** under the **ISC License**.
