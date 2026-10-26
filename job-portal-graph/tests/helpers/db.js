/**
 * TEST ONLY — tests/helpers/db.js (Ticket 13)
 *
 * Driver and database management strictly for the throwaway test instance (7688).
 * Never connects to or mutates the runtime database (7687).
 */
import neo4j from 'neo4j-driver';
import { config } from '../../src/config.js';
import { setDriver } from '../../src/db/driver.js';
import { runMigrations } from '../../src/db/migrate.js';
import { assertTestInstance } from './guard.js';

let testDriver = null;
let migrationsRan = false;

export async function getTestDriver() {
  assertTestInstance();

  if (!testDriver) {
    testDriver = neo4j.driver(
      config.NEO4J_TEST_URI,
      neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_TEST_PASSWORD),
      {
        maxConnectionPoolSize: 20,
        connectionAcquisitionTimeout: 10_000,
        logging: neo4j.logging.console('error'),
      },
    );
    // Point application queries and transactions to the test driver
    setDriver(testDriver);
  }
  return testDriver;
}

export async function initTestDb() {
  const driver = await getTestDriver();
  if (!migrationsRan) {
    await runMigrations();
    migrationsRan = true;
  }
  return driver;
}

export async function wipeTestDb() {
  const driver = await getTestDriver();
  const session = driver.session({ database: config.NEO4J_DATABASE });
  try {
    await session.run('MATCH (n) DETACH DELETE n');
  } finally {
    await session.close();
  }
}

export async function closeTestDriver() {
  if (testDriver) {
    await testDriver.close();
    testDriver = null;
    migrationsRan = false;
  }
}
