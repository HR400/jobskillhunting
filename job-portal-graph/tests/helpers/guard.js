/**
 * TEST ONLY — tests/helpers/guard.js (Ticket 13)
 *
 * Enforces Rule R4:
 * Refuses to run tests if NEO4J_TEST_URI is missing or equals NEO4J_URI.
 */
import { config } from '../../src/config.js';

export function assertTestInstance(testUri = config.NEO4J_TEST_URI, runtimeUri = config.NEO4J_URI) {
  if (!testUri || !testUri.trim()) {
    throw new Error('NEO4J_TEST_URI is required to run tests against the test instance');
  }
  if (testUri.trim() === runtimeUri.trim()) {
    throw new Error(`Refusing to run tests against the runtime Neo4j instance (${runtimeUri})`);
  }
}
