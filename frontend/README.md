# Recoverix Frontend

Functional admin dashboard for the Recoverix intelligent shipment recovery prototype.

## Setup

```bash
cd frontend
cp .env.example .env   # if needed
npm install
npm run dev
```

Or from repo root: `npm run frontend`

## Config

`VITE_API_BASE_URL` — Node API gateway base URL (default `http://127.0.0.1:3000`).
The Node process proxies `/api/*` to FastAPI on `:5055`.

## Stack

- React + Vite
- Leaflet / react-leaflet for the logistics map
- Centralized client: `src/api/client.js`
- Types: `src/types/api.ts`
- Recovery state: `src/hooks/useRecoveryData.js`

UI is intentionally basic — redesign later without changing the API layer.
