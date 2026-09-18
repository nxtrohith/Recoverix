# SH-205 Frontend

Functional admin dashboard for the Intelligent Shipment Piggybacking prototype.

## Setup

```bash
cd frontend
cp .env.example .env   # if needed
npm install
npm run dev
```

Or from repo root: `npm run frontend`

## Config

`VITE_API_BASE_URL` — FastAPI base URL (default `http://127.0.0.1:5055`).

You can also point it at the Node proxy (`http://127.0.0.1:3000`).

## Stack

- React + Vite
- Leaflet / react-leaflet for the logistics map
- Centralized client: `src/api/client.js`

UI is intentionally basic — redesign later without changing the API layer.
