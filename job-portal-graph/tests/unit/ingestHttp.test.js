/** TEST ONLY — feed responses are cached instead of refetched (Ticket 48). */
import { describe, it, expect, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { fetchJson } from '../../src/ingest/http.js';

let hits = 0;
const server = createServer((req, res) => {
  hits += 1;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ hit: hits }));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/feed?unique=${Date.now()}`;

afterAll(() => new Promise((resolve) => server.close(resolve)));

describe('fetchJson cache (Ticket 48)', () => {
  it('serves a second call from disk and refetches once stale', async () => {
    expect(await fetchJson(url)).toEqual({ hit: 1 });
    expect(await fetchJson(url)).toEqual({ hit: 1 });
    expect(hits).toBe(1);

    expect(await fetchJson(url, { ttlMs: -1 })).toEqual({ hit: 2 });
    expect(hits).toBe(2);
  });
});
