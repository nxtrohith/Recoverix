/**
 * Spawn and supervise the Python recovery API (graph cache lives there).
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECOVERY_HOST, RECOVERY_PORT, recoveryHealth } from './recoveryProxy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

let child = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start the Python recovery API if it is not already healthy.
 * @returns {Promise<import('node:child_process').ChildProcess | null>}
 */
export async function ensureRecoveryService() {
  const existing = await recoveryHealth();
  if (existing.ok) {
    console.log(
      `Recovery API already running at http://${RECOVERY_HOST}:${RECOVERY_PORT}`,
    );
    return null;
  }

  const args = [
    'run',
    'python',
    '-m',
    'graph.api_server',
    '--host',
    RECOVERY_HOST,
    '--port',
    String(RECOVERY_PORT),
  ];

  child = spawn('uv', args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  child.stdout.on('data', (buf) => {
    process.stdout.write(`[recovery] ${buf}`);
  });
  child.stderr.on('data', (buf) => {
    process.stderr.write(`[recovery] ${buf}`);
  });
  child.on('exit', (code, signal) => {
    console.error(
      `Recovery API exited (code=${code}, signal=${signal})`,
    );
    child = null;
  });

  // Wait until /health succeeds (graph warm-up can take a few seconds).
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await sleep(400);
    const health = await recoveryHealth();
    if (health.ok) {
      console.log(
        `Recovery API ready at http://${RECOVERY_HOST}:${RECOVERY_PORT}`,
      );
      return child;
    }
    if (child?.exitCode != null) {
      throw new Error('Recovery API process exited during startup');
    }
  }

  throw new Error('Timed out waiting for Recovery API /health');
}

export function stopRecoveryService() {
  if (child && !child.killed) {
    child.kill('SIGTERM');
    child = null;
  }
}
