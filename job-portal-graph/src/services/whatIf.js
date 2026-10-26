/**
 * src/services/whatIf.js — What-If simulator helpers (plan §8.5, Ticket 29).
 *
 * The effective skill is `max(stored, hypothetical)` per skill (per field). The
 * Cypher in src/queries/whatIf.js applies that rule inline via a CASE on
 * proficiency/years; this module holds the pure parts: merging the request
 * entries and turning raw scorer rows into deltas, band changes and rank
 * changes. No I/O — the route runs everything inside executeRead.
 */
import { bandFor } from './matching.js';

const BAND_ORDER = ['Low', 'Moderate', 'Strong'];

/** Merge duplicate hypothetical entries: max wins per field, matching the query. */
export function buildHypotheticalMap(entries) {
  const map = {};
  for (const e of entries ?? []) {
    const prev = map[e.skill_key];
    map[e.skill_key] = {
      proficiency: Math.max(prev?.proficiency ?? 0, e.proficiency),
      years: Math.max(prev?.years ?? 0, e.years),
    };
  }
  return map;
}

/** One WHAT_IF_RANKING row (numbers already plain) → one delta row. */
export function whatIfRow(row, storedRank, effRank) {
  const stored = {
    matched: row.stored_matched,
    match_pct: row.stored_pct,
    band: bandFor(row.stored_pct),
    mandatory_ok: row.stored_mandatory_ok,
  };
  const hypothetical = {
    matched: row.eff_matched,
    match_pct: row.eff_pct,
    band: bandFor(row.eff_pct),
    mandatory_ok: row.eff_mandatory_ok,
  };
  const bandMoved =
    BAND_ORDER.indexOf(hypothetical.band) > BAND_ORDER.indexOf(stored.band);
  return {
    job_id: row.job_id,
    job_title: row.job_title,
    employer: { emp_id: row.emp_id, company_name: row.employer },
    total: row.total,
    stored,
    hypothetical,
    delta_pct: Math.round((row.eff_pct - row.stored_pct) * 10) / 10,
    band_changed: stored.band !== hypothetical.band,
    newly_above_band: bandMoved,
    newly_unlocked: row.stored_matched === 0 && row.eff_matched > 0,
    newly_mandatory_ok: !row.stored_mandatory_ok && row.eff_mandatory_ok,
    // Positive = the job moves up the hypothetical ranking.
    rank_change: (storedRank[row.job_id] ?? 0) - (effRank[row.job_id] ?? 0),
  };
}

/**
 * @param {Array<object>} rows WHAT_IF_RANKING output, numbers plain
 * @returns {{ jobs: object[], summary: object }}
 */
export function describeWhatIf(rows) {
  const rankOf = (pctKey, mandKey) => {
    // Same ordering as the query: mandatory-ok first, then pct, then job_id.
    const sorted = [...rows].sort(
      (a, b) =>
        Number(b[mandKey]) - Number(a[mandKey]) ||
        b[pctKey] - a[pctKey] ||
        String(a.job_id).localeCompare(String(b.job_id)),
    );
    return Object.fromEntries(sorted.map((r, i) => [r.job_id, i + 1]));
  };
  const storedRank = rankOf('stored_pct', 'stored_mandatory_ok');
  const effRank = rankOf('eff_pct', 'eff_mandatory_ok');

  const jobs = rows.map((r) => whatIfRow(r, storedRank, effRank));
  return {
    jobs,
    summary: {
      jobs_scored: jobs.length,
      jobs_improved: jobs.filter((j) => j.delta_pct > 0).length,
      newly_above_band: jobs.filter((j) => j.newly_above_band).length,
      newly_mandatory_ok: jobs.filter((j) => j.newly_mandatory_ok).length,
      newly_unlocked: jobs.filter((j) => j.newly_unlocked).length,
      rank_changed: jobs.filter((j) => j.rank_change !== 0).length,
    },
  };
}
