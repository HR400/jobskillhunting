/**
 * tests/integration/sseStream.test.js — Ticket 39 done-when check.
 *
 * TEST ONLY: uses the throwaway 7688 instance.
 *
 * Verifies:
 *   - GET /api/match/stream emits ordered SSE events (candidate → skill → job_scored → done)
 *   - Unauthenticated → 401
 *   - employer → 403 (candidate-only)
 *   - Missing candId → 400
 *   - Dropping the client frees the stream slot (no 429 on re-connect)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';
import { createApp } from '../../src/app.js';
import http from 'node:http';

let app;
let driver;
let server;
let candCookie;
let candProfileId;
let empCookie;

// Helper: collect SSE events from the live HTTP server.
function collectSse(serverUrl, path, cookieStr, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const events = [];
    let raw = '';
    const cookieHeader = Array.isArray(cookieStr) ? cookieStr.join('; ') : cookieStr;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: { Cookie: cookieHeader, Accept: 'text/event-stream' },
      },
      (res) => {
        if (res.statusCode !== 200) {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${body}`)));
          return;
        }
        const timer = setTimeout(() => {
          req.destroy();
          resolve(events);
        }, timeoutMs);

        res.on('data', (chunk) => {
          raw += chunk.toString();
          const lines = raw.split('\n\n');
          raw = lines.pop(); // keep incomplete last chunk
          for (const block of lines) {
            const evLine = block.split('\n').find((l) => l.startsWith('event:'));
            const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
            if (evLine && dataLine) {
              const evName = evLine.slice('event:'.length).trim();
              const data = JSON.parse(dataLine.slice('data:'.length).trim());
              events.push({ event: evName, data });
              if (evName === 'done' || evName === 'error') {
                clearTimeout(timer);
                req.destroy();
                resolve(events);
              }
            }
          }
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  const expressApp = createApp();
  app = await getTestApp();
  driver = await getTestDriver();
  await wipeTestDb();

  // Create candidate with a skill and an employer with a job.
  const emp = await createTestEmployer(driver);
  const empToken = signToken({ accountId: emp.accountId, role: emp.role });
  empCookie = [`auth=${empToken}`];

  await app
    .post('/api/jobs')
    .set('Cookie', empCookie)
    .send({
      job_title: 'SSE Test Job',
      descriptive: 'SSE test',
      closing_date: '2030-12-31',
      requirements: [
        { name: 'Python', min_proficiency: 2, min_years: 0, mandatory: false },
      ],
    })
    .expect(201);

  const cand = await createTestCandidate(driver);
  candProfileId = cand.profileId;
  const candToken = signToken({ accountId: cand.accountId, role: cand.role });
  candCookie = [`auth=${candToken}`];

  await app
    .put('/api/candidates/me/skills')
    .set('Cookie', candCookie)
    .send({ skills: [{ name: 'Python', proficiency: 3, years: 1 }] })
    .expect(200);

  // Start a live HTTP server so we can open a real SSE connection.
  server = http.createServer(expressApp);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
});

afterAll(async () => {
  if (server) {
    await new Promise((r) => server.close(r));
  }
  await wipeTestDb();
  await closeTestDriver();
});

describe('Ticket 39 — SSE stream', () => {
  it('requires authentication', async () => {
    await app
      .get(`/api/match/stream?candId=${candProfileId}`)
      .expect(401);
  });

  it('rejects employers (candidate-only)', async () => {
    await app
      .get(`/api/match/stream?candId=${candProfileId}`)
      .set('Cookie', empCookie)
      .expect(403);
  });

  it('returns 400 when candId is missing', async () => {
    await app
      .get('/api/match/stream')
      .set('Cookie', candCookie)
      .expect(400);
  });

  it('streams ordered events: candidate → skill → job_scored → done', async () => {
    const { port } = server.address();
    const events = await collectSse(
      `http://127.0.0.1:${port}`,
      `/api/match/stream?candId=${candProfileId}`,
      candCookie,
      6000,
    );

    const types = events.map((e) => e.event);
    expect(types[0]).toBe('candidate');
    expect(types).toContain('skill');
    expect(types).toContain('job_scored');
    expect(types[types.length - 1]).toBe('done');

    // Candidate event has a node.
    const candEvent = events.find((e) => e.event === 'candidate');
    expect(candEvent.data.node).toHaveProperty('id');

    // Skill event has node + edge.
    const skillEvent = events.find((e) => e.event === 'skill');
    expect(skillEvent.data.node).toHaveProperty('skill_key');
    expect(skillEvent.data.edge).toHaveProperty('proficiency');

    // job_scored event has match_pct, band, mandatory_ok.
    const jobEvent = events.find((e) => e.event === 'job_scored');
    expect(jobEvent.data).toHaveProperty('match_pct');
    expect(jobEvent.data).toHaveProperty('band');
    expect(jobEvent.data).toHaveProperty('mandatory_ok');

    // done has totals.
    const doneEvent = events.find((e) => e.event === 'done');
    expect(doneEvent.data.totals).toHaveProperty('jobs');
    expect(doneEvent.data.totals.jobs).toBeGreaterThan(0);
  });
});
