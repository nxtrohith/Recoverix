# SH-205 Driver Cockpit

Expo / React Native driver app wired to the live FastAPI/MongoDB recovery backend.

## Setup

**One-shot (recommended)** — from repo root:

```bash
./dev-mobile.sh --install          # deps + .env + seed drivers + API + Expo
./dev-mobile.sh --web              # same, open Expo web
./dev-mobile.sh --with-frontend    # also start operator dashboard :5173
```

Manual:

```bash
# From repo root — stamp 3 demo drivers onto real vehicles
npm run seed:demo-drivers

cd mobile-driver-app
cp .env.example .env   # edit EXPO_PUBLIC_API_BASE_URL if needed
npm install
npm start
# Press 'w' → http://localhost:8082
```

Optional Google Maps (Directions + interactive web map):

```env
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_key
```

Without a key, navigation uses Telangana graph hub coordinates from `GET /api/graph`.

## Demo drivers

| ID | Name | Vehicle | Typical route |
| --- | --- | --- | --- |
| DRV-001 | Ramesh Kumar | TS-09-UB-1077 | Kamareddy → Karimnagar |
| DRV-002 | Suresh Reddy | TS-09-UB-1047 | Hyderabad → Karimnagar |
| DRV-003 | Priya Sharma | TS-09-UB-1001 | Asifabad → Karimnagar |

## Flow

1. Select a driver → cockpit loads vehicle/location from `/api/vehicles/:id`
2. Operator assigns recovery (dashboard) to that vehicle
3. App polls `/api/incidents/active` every 5s → recovery alert
4. Accept → navigate to pickup hub
5. Arrive (geofence / Demo GPS) → `POST /api/recovery/:id/pickup`
6. Navigate to final destination → `POST /api/recovery/:id/resolve`

Sarvam outbound calls are backend-only; the app shows call status via `/api/recovery/:id/call-status`.
