# Telangana Logistics — Driver Navigation Mobile App Module

> **ISOLATION NOTICE**:
> This module currently operates entirely on local/mock data and has **NO connection to the main logistics backend**, database, FastAPI endpoints, WebSockets, or authentication system.

An independent, tactical mobile navigation application designed for truck drivers operating within the Telangana logistics warehouse ecosystem.

---

## Key Features

1. **Map-First Tactical Cockpit**: Full-screen dark tactical logistics map featuring live truck location, compass bearing, nearby warehouse pins, and glowing route corridors.
2. **Google Maps Platform Navigation Engine**:
   - Integrated with Google Maps API key & Google Directions API (`services/googleMapsService.ts`).
   - Solution Attribution Tagged (`gmp_git_agentskills_v1`) per Google Maps Platform policies.
   - Decodes Google Encoded Polylines and provides real-time turn-by-turn road steps with intersection coordinates.
   - Automatic off-route deviation detection (>75m) triggering live Google Directions recalculation.
   - Deep-links directly to native Google Maps App Voice Navigation as an optional fallback via `[ OPEN IN GOOGLE MAPS ]`.
   - Dynamic API key validation & tester tool directly inside **Settings**.
3. **In-App Text-to-Speech (TTS) Voice Guidance**:
   - Native `expo-speech` and Web Speech API engine (`services/voiceGuidanceService.ts`).
   - Proximity milestones: announces turns at 1 km, 500 m, 200 m, and immediately at intersection.
   - Intelligent throttling and deduplication prevents redundant voice announcements.
   - One-tap Mute / Unmute toggle accessible on the map HUD and in the Turn-by-Turn cockpit.
4. **3D Heads-Up Navigator Follow Mode**:
   - Camera smoothly tracks and locks onto the driver's vehicle.
   - Dynamic compass rotation & pitch (52° perspective in native maps, rotated compass orientation in web).
   - Toggleable via floating Compass / Crosshair HUD buttons.
5. **Real Device GPS Tracking**: Requests location permissions and streams real-time telemetry (`latitude`, `longitude`, `speed`, `heading`) via `expo-location` with navigation-grade accuracy.
6. **Turn-by-Turn Navigation HUD & Distance Countdown**:
   - Live distance to maneuver countdown in meters/km.
   - Dynamic turn maneuver icons (right, left, fork, merge, roundabout, u-turn).
   - "Then" secondary banner with next-after-next maneuver preview.
   - Real-time route completion progress bar.
7. **Simulation Mode for Demonstrations**: Opt-in simulation engine allowing simulated vehicle movement along Telangana highway corridors with speed multipliers (`1x`, `3x`, `5x`, `10x`), play/pause/reset controls, and progress tracking.
8. **Telangana Warehouse Ecosystem**: 11 strategically mapped logistics hubs across Hyderabad, Medchal, Secunderabad, Warangal, Karimnagar, Nizamabad, Khammam, Nalgonda, Suryapet, Mahbubnagar, and Sangareddy.
9. **Multi-Leg Recovery Workflow (Core Feature)**:
   - Emergency dispatch alert banner and modal (`Shipment SH-1047`, 500 units, Priority HIGH).
   - Automated two-leg itinerary:
     * **Leg 1**: Divert from current position $\rightarrow$ Recovery Warehouse (Hyderabad North Hub / Medchal).
     * **Arrival & Inspection**: Geofenced arrival detection at recovery hub $\rightarrow$ cargo verification (`500 units`) $\rightarrow$ [ CONFIRM PICKUP ].
     * **Leg 2**: Automatic transition to final destination (Warangal Regional Depot).
     * **Completion**: Delivery verification and sign-off.

---

## Directory Structure

```text
mobile-driver-app/
├── App.tsx                     # Main application shell with tactical bottom tab bar
├── app/
│   ├── index.tsx               # Main map-first cockpit & navigation view
│   ├── navigation.tsx          # Active turn-by-turn navigation HUD
│   ├── recovery.tsx            # Dedicated recovery mission control & timeline
│   ├── warehouse.tsx           # Telangana warehouse directory & routing selector
│   └── settings.tsx            # Driver profile, GPS/SIM telemetry & integration docs
│
├── components/
│   ├── MapView.tsx             # Universal map (Native Google/Apple Maps + Web Tactical Canvas)
│   ├── DriverMarker.tsx        # Rotating truck marker with heading & radar pulse
│   ├── WarehouseMarker.tsx     # Stylized hub pins (Standard, Recovery, Destination)
│   ├── NavigationHeader.tsx    # Tactical status bar (TRK-218, GPS/SIM badge, quick recovery)
│   ├── NavigationBottomSheet.tsx# Navigation card (Distance, ETA, Maneuver, Go/Stop)
│   ├── RecoveryBanner.tsx      # Emergency dispatch alert, pickup modal & completion sheet
│   ├── SimulationControls.tsx  # Floating simulation dock (Play, Pause, Reset, 1x-10x Speed)
│   └── WarehouseCard.tsx       # Hub selector item with distance telemetry
│
├── context/
│   └── NavigationContext.tsx   # Centralized reactive driver state & workflow engine
│
├── data/
│   ├── warehouses.ts           # 11 Telangana logistics hubs with precise lat/lng
│   ├── routes.ts               # Highway polylines along NH-163, NH-44, NH-65, SH-1
│   └── mockDriver.ts           # Driver TRK-218 profile & base station metadata
│
├── services/
│   ├── locationService.ts      # Implements DriverLocationProvider (GPS & Simulation)
│   ├── navigationService.ts    # Haversine distance, ETA, bearing & geofence arrival checks
│   └── mockRecoveryService.ts  # Implements RecoveryProvider (Recovery state machine)
│
├── types/
│   └── navigation.ts           # Strict TypeScript contracts & provider interfaces
│
├── utils/
│   ├── distance.ts             # Haversine formula, compass bearing, proximity detection
│   └── formatting.ts           # Distance (km/m), ETA (h/m), and clock arrival formatters
│
├── app.json                    # Expo configuration & location permissions
├── package.json                # Standalone dependencies
├── tsconfig.json               # TypeScript configuration
└── README.md
```

---

## Installation & Setup

Navigate into the isolated directory:

```bash
cd mobile-driver-app
npm install
```

---

## Running the Application

### Option A: Web Browser (Instant Preview)
```bash
npm run web
```
*Opens an interactive web preview with an SVG/Canvas dark tactical logistics map that functions identically to the mobile app.*

### Option B: Mobile Device via Expo Go (iOS / Android)
```bash
npm run start
```
*Scan the QR code with the **Expo Go** app on your iPhone or Android phone.*

### Option C: Native Simulator
```bash
npm run ios       # iOS Simulator (requires Xcode on macOS)
npm run android   # Android Emulator (requires Android Studio)
```

---

## Required Permissions

Configured in `mobile-driver-app/app.json`:
- **iOS**: `NSLocationWhenInUseUsageDescription`:
  *"Allow Telangana Logistics Driver app to track your vehicle location for navigation and warehouse arrival detection."*
- **Android**:
  - `ACCESS_FINE_LOCATION`
  - `ACCESS_COARSE_LOCATION`

---

## Google Maps Platform Integration & Navigation

The app is equipped with Google Maps Platform services:
- **API Key Configuration**: Stored in `config/maps.ts` (`arXX1tFcT9O2plSvFzAZrv4R7VI=`) and in `app.json` for Android/iOS native SDKs.
- **Solution Attribution ID**: Sent as header `X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1` on all Directions API requests per Google Maps Platform guidelines.
- **Live Directions API Routing**: Queries Google Maps Directions endpoint (`https://maps.googleapis.com/maps/api/directions/json`) with driver origin coordinates, destination hub coordinates, and decodes the route polyline with step-by-step maneuvers.
- **Heads-Up Navigator Tracking**: Tapping the floating compass or selecting a destination engages 3D camera follow mode with dynamic vehicle heading, turning the cockpit into a live dashboard navigator.
- **One-Tap Voice Navigation**: Tapping `[ GMAP ]` on the bottom card or `[ OPEN IN GOOGLE MAPS APP ]` in the Turn-by-Turn screen opens the route directly in Google Maps for live turn-by-turn voice guidance (`google.navigation:q=lat,lng` or universal web intent).
- **Graceful Fallback**: If the key is restricted or offline, the app falls back seamlessly to internal Telangana highway polylines with zero crashes.
- **API Key Tester in Settings**: Go to **Settings** $\rightarrow$ **GOOGLE MAPS PLATFORM NAVIGATION** to test or change the active API key anytime with live diagnostic feedback.

---

## How GPS Mode Works

1. On startup, `services/locationService.ts` prompts the user for foreground location permission.
2. When granted:
   - Driver marker updates live with real device GPS coordinates, heading, and speed.
   - Distance and ETA to the selected warehouse recalculate dynamically.
   - If permission is denied or running on desktop simulator, the app falls back cleanly to the Hyderabad Central Hub base location without crashing.

---

## How Simulation Mode Works

For presentations and hackathon demos without driving on actual highways:

1. Tap the **GPS / SIM** badge in the top header or enable **Simulation Mode** in Settings.
2. The **SIMULATION ENGINE** dock will appear above the bottom sheet.
3. Tap `[ START SIMULATION ]`:
   - The truck marker will begin traveling along the active highway corridor waypoints (e.g. NH-163 to Warangal or NH-44 to Medchal).
   - Heading rotates realistically to face the direction of road travel.
   - Distance counts down and ETA updates in real-time.
4. Use speed multiplier buttons (`1x`, `3x`, `5x`, `10x`) to speed up demo playback.
5. Tap `[ PAUSE ]` or `[ RESET ]` anytime.

---

## How to Test the Recovery Workflow

The **Recovery Assignment** is the primary operational scenario:

1. **Trigger the Assignment**:
   - In the top header or the **Recovery** tab, tap the red `[ RECOVERY ]` button.
2. **Accept the Assignment**:
   - The emergency modal appears:
     * `Shipment: SH-1047`
     * `Priority: HIGH`
     * `Recovery Warehouse: Hyderabad North Hub (Medchal)`
     * `Final Destination: Warangal Regional Depot`
     * `Cargo: 500 units`
   - Tap `[ ACCEPT RECOVERY ]`.
3. **Leg 1 (Pickup)**:
   - The navigation bottom sheet switches to:
     * `🚨 RECOVERY ROUTE · LEG 1 OF 2 (PICKUP)`
     * Route line highlights in tactical warning amber (`#f59e0b`).
     * Target set to Hyderabad North Hub.
4. **Arrival at Recovery Warehouse**:
   - As the simulated or real vehicle reaches within 600m of Hyderabad North Hub:
   - The modal `✓ ARRIVED AT RECOVERY HUB` opens automatically.
   - Shows: `Shipment SH-1047`, `500 units`.
   - Tap `[ CONFIRM PICKUP & LOAD ]`.
5. **Leg 2 (Final Delivery)**:
   - The app automatically switches route to Leg 2 (Medchal $\rightarrow$ Warangal Regional Depot).
   - Bottom sheet turns emerald green: `✓ CARGO SECURED · LEG 2 OF 2 (FINAL DELIVERY)`.
   - Route continues smoothly toward Warangal.
6. **Arrival at Final Destination**:
   - As the truck arrives at Warangal Regional Depot:
   - `✓ MISSION COMPLETED` dialog confirms that all 500 units of `SH-1047` are checked in and secured.
   - Tap `[ RETURN TO STANDBY ]` to reset.

---

## Future Backend Integration Boundary

This application is decoupled using provider interfaces defined in `types/navigation.ts`:

```typescript
export interface DriverLocationProvider {
  getCurrentLocation(): Promise<LocationCoordinate>;
  watchLocation(callback: (location: LocationCoordinate) => void): () => void;
  isSimulating(): boolean;
  setSimulating(simulating: boolean): void;
}

export interface RecoveryProvider {
  getRecoveryAssignment(): Promise<RecoveryAssignment | null>;
  acceptRecovery(id: string): Promise<void>;
  confirmPickup(id: string): Promise<void>;
  completeRecovery(id: string): Promise<void>;
}
```

When connecting to the real platform in the future:
1. Replace `MockDriverLocationProvider` in `services/locationService.ts` with `ApiDriverLocationProvider` (streaming coordinates via WebSocket or HTTP telemetry).
2. Replace `MockRecoveryProvider` in `services/mockRecoveryService.ts` with `ApiRecoveryProvider` (consuming FastAPI dispatch endpoints).
3. **No UI components or screen files will need to be rewritten.**
