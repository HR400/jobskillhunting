/**
 * src/lib/queryMeta.js — Cypher result metadata for plan §9.4.
 *
 * `dbTimeMs` comes from the driver summary, never a client stopwatch.
 */

/** neo4j Integer (or null) -> JS number (or null). */
export function toNumber(value) {
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return value ?? null;
}

/** Neo4j values (Integer, Date/DateTime, maps, arrays) -> JSON-safe values. */
export function plain(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  if (typeof value === 'object' && 'year' in value) return value.toString();
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

export function queryMeta({ queryName, cypher, params, result }) {
  return {
    queryName,
    cypher,
    params,
    dbTimeMs:
      toNumber(result.summary.resultAvailableAfter) +
      toNumber(result.summary.resultConsumedAfter),
    rowCount: result.records.length,
    generatedAt: new Date().toISOString(),
  };
}
