import 'dotenv/config';
import http from 'node:http';
import { connectDb, disconnectDb, mongoose } from './db.js';
import { handleApiRoutes } from './routes/recovery.js';
import {
  ensureRecoveryService,
  stopRecoveryService,
} from './services/recoveryProcess.js';
import { recoveryHealth } from './services/recoveryProxy.js';

const PORT = Number(process.env.PORT || 3000);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function main() {
  const conn = await connectDb();
  console.log(
    `MongoDB connected via Mongoose (db=${conn.name}, host=${conn.host})`,
  );

  await ensureRecoveryService();

  const server = http.createServer(async (req, res) => {
    const method = req.method || 'GET';
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (pathname === '/health' || pathname === '/api/health') {
      const recovery = await recoveryHealth();
      sendJson(res, recovery.ok ? 200 : 503, {
        status: recovery.ok ? 'ok' : 'degraded',
        mongo: {
          readyState: mongoose.connection.readyState,
          db: mongoose.connection.name,
        },
        recovery: recovery.body || { ok: false },
      });
      return;
    }

    if (handleApiRoutes(pathname, method, req, res)) {
      return;
    }

    sendJson(res, 404, {
      error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
    });
  });

  server.listen(PORT, () => {
    console.log(`Backend (Node proxy) listening on http://127.0.0.1:${PORT}`);
    console.log('  All /api/* requests proxied to FastAPI on :5055');
    console.log('  GET  /api/health');
    console.log('  GET  /api/hubs');
    console.log('  GET  /api/graph');
    console.log('  GET  /api/vehicles');
    console.log('  GET  /api/vehicles/:vehicleId');
    console.log('  GET  /api/shipments');
    console.log('  GET  /api/shipments/:shipmentId');
    console.log('  GET  /api/recovery/:shipmentId');
    console.log('  POST /api/recovery/analyze/:shipmentId');
    console.log('  POST /api/recovery/graph/refresh');
  });

  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    stopRecoveryService();
    server.close();
    await disconnectDb();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Backend failed to start:', err.message);
  stopRecoveryService();
  process.exit(1);
});
