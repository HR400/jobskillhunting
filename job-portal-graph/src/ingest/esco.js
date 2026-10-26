/**
 * src/ingest/esco.js — ESCO skill suggestions (plan §4, Ticket 17).
 *
 * Suggestions only: local catalogue rows always come first, and a failure here
 * never fails the request. Successful responses are cached; a failure is
 * remembered briefly so a dead ESCO does not add a timeout to every search.
 */
import { config } from '../config.js';
import { skillKey } from '../lib/skillKey.js';

const SEARCH_URL = 'https://ec.europa.eu/esco/api/search';
const TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const RETRY_AFTER_MS = 30 * 1000;

const cache = new Map(); // `${query}|${limit}` -> { at, ttl, suggestions }
let available = config.ENABLE_ESCO;

/** Whether the last ESCO attempt succeeded (and the feature is enabled). */
export function escoAvailable() {
  return available;
}

/** @returns {Promise<Array<{skill_key: string, name: string, uri: string, source: 'esco'}>>} */
export async function searchEsco(q, limit = 20) {
  if (!config.ENABLE_ESCO) return [];

  const cacheKey = `${q.toLowerCase()}|${limit}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.suggestions;

  try {
    const url = `${SEARCH_URL}?text=${encodeURIComponent(q)}&type=skill&language=en&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`ESCO responded ${res.status}`);

    const body = await res.json();
    const suggestions = (body?._embedded?.results ?? []).map((result) => ({
      skill_key: skillKey(result.title),
      name: result.title,
      uri: result.uri,
      source: 'esco',
    }));

    available = true;
    cache.set(cacheKey, { at: Date.now(), ttl: CACHE_TTL_MS, suggestions });
    return suggestions;
  } catch {
    available = false;
    cache.set(cacheKey, { at: Date.now(), ttl: RETRY_AFTER_MS, suggestions: [] });
    return [];
  }
}
