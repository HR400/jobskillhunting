/**
 * TEST ONLY — tests/helpers/app.js (Ticket 13)
 *
 * Supertest application factory backed by the test database on port 7688.
 */
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initTestDb } from './db.js';

let appInstance = null;

export async function getTestApp() {
  await initTestDb();
  if (!appInstance) {
    appInstance = createApp();
  }
  return request(appInstance);
}
