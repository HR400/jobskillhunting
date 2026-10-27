/**
 * src/lib/gds.js — GDS availability probe (Ticket 50, plan §11).
 *
 * `CALL gds.version()` runs once at boot (and lazily if a request arrives
 * before the probe finished). A missing plugin or an unreachable database is a
 * capability answer, not an error: the feature reports `unavailable`.
 */
import { executeRead } from '../db/tx.js';
import { logger } from './logger.js';

let cached = null;

async function probe() {
  try {
    const result = await executeRead((tx) => tx.run('CALL gds.version()'));
    const version = result.records[0]?.get('gdsVersion') ?? null;
    cached = { available: true, version };
    logger.info({ version }, 'gds available');
  } catch (err) {
    cached = { available: false, version: null };
    logger.info({ err }, 'gds unavailable');
  }
  return cached;
}

export function probeGds() {
  return probe();
}

export function getGds() {
  return cached ?? probe();
}
