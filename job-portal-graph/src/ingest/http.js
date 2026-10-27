/**
 * src/ingest/http.js — cached, polite JSON fetch for feed adapters (Ticket 48).
 *
 * Responses are cached on disk under `.cache/ingest` (6 h by default) so a
 * re-run does not hammer a feed. `minIntervalMs` spaces requests to one host,
 * which is how Adzuna's rate limit is respected.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = '.cache/ingest';
const lastRequest = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson(url, { ttlMs = 6 * 3600_000, minIntervalMs = 0 } = {}) {
  const file = path.join(CACHE_DIR, `${encodeURIComponent(url).replaceAll('%', '_')}.json`);
  try {
    const cached = JSON.parse(await readFile(file, 'utf8'));
    if (Date.now() - cached.at < ttlMs) return cached.body;
  } catch {
    /* no usable cache entry */
  }

  const host = new URL(url).host;
  const wait = (lastRequest.get(host) ?? 0) + minIntervalMs - Date.now();
  if (wait > 0) await sleep(wait);

  const res = await fetch(url, {
    headers: { 'user-agent': 'job-portal-graph/1.0 (links back to the source feed)' },
    signal: AbortSignal.timeout(15_000),
  });
  lastRequest.set(host, Date.now());
  if (!res.ok) throw new Error(`${host} responded ${res.status}`);

  const body = await res.json();
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, JSON.stringify({ at: Date.now(), body }));
  } catch {
    /* a cache write must never fail the ingest */
  }
  return body;
}
