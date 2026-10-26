import neo4j from 'neo4j-driver';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

// Singleton driver — created once, shared across the application.
let _driver = null;

export function setDriver(driver) {
  _driver = driver;
}

export function getDriver() {
  if (!_driver) {
    _driver = neo4j.driver(
      config.NEO4J_URI,
      neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD),
      {
        // Bounded connection pool so we never exhaust Neo4j's thread pool.
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 10_000,
        // Default transaction timeout; individual wrappers pass this as well.
        defaultAccessMode: neo4j.session.READ,
        // Logging through pino so it respects our log level.
        logging: neo4j.logging.console('warn'),
      },
    );
  }
  return _driver;
}

/**
 * Verify connectivity at application boot. Throws if Neo4j is unreachable.
 */
export async function verifyConnectivity() {
  const driver = getDriver();
  await driver.verifyConnectivity({ database: config.NEO4J_DATABASE });
  logger.info({ uri: config.NEO4J_URI }, 'neo4j connectivity verified');
}

/**
 * Close the driver. Call this during graceful shutdown.
 */
export async function closeDriver() {
  if (_driver) {
    await _driver.close();
    _driver = null;
    logger.info('neo4j driver closed');
  }
}
