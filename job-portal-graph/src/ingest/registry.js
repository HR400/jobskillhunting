/**
 * src/ingest/registry.js — job-feed adapter registry (Ticket 47, plan §4).
 *
 * An adapter is `{ name, source, isConfigured(), fetchJobs({ limit }) }`.
 * `isConfigured` decides whether the feed is enabled by `.env`; the route
 * refuses to run anything that reports false.
 */

const adapters = new Map();

export function registerAdapter(adapter) {
  adapters.set(adapter.name, adapter);
  return adapter;
}

export function getAdapter(name) {
  return adapters.get(name);
}

/** Public description of every feed, without leaking keys. */
export function listAdapters() {
  return [...adapters.values()].map((adapter) => ({
    name: adapter.name,
    source: adapter.source,
    configured: Boolean(adapter.isConfigured()),
  }));
}
