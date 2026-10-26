/**
 * TEST ONLY — tests/helpers/setup.js (Ticket 13)
 *
 * Global setup for Vitest to enforce test environment guards.
 */
import { assertTestInstance } from './guard.js';

// Verify test instance guard before test run
assertTestInstance();
