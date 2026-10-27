import { config } from './src/config.js';
import { logger } from './src/lib/logger.js';
import { verifyConnectivity, closeDriver } from './src/db/driver.js';
import { runMigrations } from './src/db/migrate.js';
import { probeGds } from './src/lib/gds.js';
import { createApp } from './src/app.js';

// ── Boot sequence ──────────────────────────────────────────────────────────
await verifyConnectivity();
await runMigrations();
await probeGds();

const app = createApp();

// ── Server ─────────────────────────────────────────────────────────────────
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'server listening');
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down; draining connections');

  // Do not hang forever on a stuck client.
  const force = setTimeout(() => {
    logger.fatal('shutdown timed out');
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close(async () => {
    clearTimeout(force);
    await closeDriver();
    logger.info('shutdown complete');
    process.exit(0);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => shutdown(signal));
}

// A crashed process is restarted by the supervisor; exiting beats running on
// with corrupt state.
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'unhandled rejection');
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  process.exit(1);
});
