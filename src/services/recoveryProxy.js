/**
 * Thin HTTP proxy from the Node backend to the Python recovery API.
 *
 * Keeps route handlers free of recovery business logic — that lives in
 * graph/recovery_orchestrator.py.
 */

import http from 'node:http';

const RECOVERY_HOST = process.env.RECOVERY_API_HOST || '127.0.0.1';
const RECOVERY_PORT = Number(process.env.RECOVERY_API_PORT || 5055);

/**
 * Forward a request to the Python recovery service and pipe the response.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} path
 * @param {string} [method]
 */
export function proxyToRecovery(req, res, path, method = req.method) {
  const upstreamHeaders = {
    Accept: 'application/json',
    'Content-Type': req.headers['content-type'] || 'application/json',
  };
  // Forward content-length so FastAPI doesn't have to wait for chunked-EOF
  if (req.headers['content-length']) {
    upstreamHeaders['Content-Length'] = req.headers['content-length'];
  }

  const options = {
    hostname: RECOVERY_HOST,
    port: RECOVERY_PORT,
    path,
    method,
    headers: upstreamHeaders,
  };

  const upstream = http.request(options, (upRes) => {
    const chunks = [];
    upRes.on('data', (chunk) => chunks.push(chunk));
    upRes.on('end', () => {
      const body = Buffer.concat(chunks);
      res.writeHead(upRes.statusCode || 502, {
        'Content-Type': upRes.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(body);
    });
  });

  upstream.on('error', () => {
    res.writeHead(503, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(
      JSON.stringify({
        error: {
          code: 'RECOVERY_SERVICE_UNAVAILABLE',
          message: 'Recovery service is not reachable',
        },
      }),
    );
  });

  // Recovery endpoints do not require a body; drain if present.
  if (req.readable && (method === 'POST' || method === 'PUT')) {
    req.pipe(upstream);
  } else {
    upstream.end();
  }
}

export function recoveryHealth() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: RECOVERY_HOST,
        port: RECOVERY_PORT,
        path: '/health',
        method: 'GET',
        timeout: 2000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve({
              ok: res.statusCode === 200,
              statusCode: res.statusCode,
              body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
            });
          } catch {
            resolve({ ok: false, statusCode: res.statusCode, body: null });
          }
        });
      },
    );
    req.on('error', () => resolve({ ok: false, statusCode: null, body: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, statusCode: null, body: null });
    });
    req.end();
  });
}

export { RECOVERY_HOST, RECOVERY_PORT };
