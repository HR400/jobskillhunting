import { getDriver } from './driver.js';
import { config } from '../config.js';

/**
 * Open a session, run `fn(tx)` in a managed read transaction, close session.
 * neo4j-driver retries on transient errors automatically.
 *
 * @param {(tx: import('neo4j-driver').Transaction) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function executeRead(fn) {
  const session = getDriver().session({
    database: config.NEO4J_DATABASE,
    defaultAccessMode: 'READ',
  });
  try {
    return await session.executeRead(fn, { timeout: config.QUERY_TIMEOUT_MS });
  } finally {
    await session.close();
  }
}

/**
 * Open a session, run `fn(tx)` in a managed write transaction, close session.
 *
 * @param {(tx: import('neo4j-driver').Transaction) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function executeWrite(fn) {
  const session = getDriver().session({
    database: config.NEO4J_DATABASE,
    defaultAccessMode: 'WRITE',
  });
  try {
    return await session.executeWrite(fn, { timeout: config.QUERY_TIMEOUT_MS });
  } finally {
    await session.close();
  }
}
