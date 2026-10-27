/**
 * benchmarks/stats.js — statistical helper functions for benchmark latency metrics (Ticket 59).
 */

export function calculatePercentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function calculateStats(samples) {
  if (!samples || samples.length === 0) {
    return { min: 0, p50: 0, p95: 0, max: 0, mean: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);

  return {
    min: Number(sorted[0].toFixed(2)),
    p50: Number(calculatePercentile(sorted, 50).toFixed(2)),
    p95: Number(calculatePercentile(sorted, 95).toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    mean: Number((sum / sorted.length).toFixed(2)),
  };
}
