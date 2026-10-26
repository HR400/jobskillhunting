/**
 * src/services/matching.js — reference matcher (plan §8.1, Ticket 21).
 *
 * Single source of truth for the scoring rules that the Cypher in
 * src/queries/ mirrors and ticket 30 compares against. Pure functions only:
 * no driver, no I/O.
 */
import { config } from '../config.js';

export const SATISFIED = 'satisfied';
export const BELOW = 'below';
export const MISSING = 'missing';

/**
 * Per-requirement status.
 * Satisfied iff the candidate has the skill AND
 * proficiency >= coalesce(min_proficiency, 1) AND years >= coalesce(min_years, 0).
 */
export function requirementStatus(requirement, candidateSkill) {
  if (!candidateSkill) return MISSING;
  const minProficiency = requirement.min_proficiency ?? 1;
  const minYears = requirement.min_years ?? 0;
  const ok =
    (candidateSkill.proficiency ?? 0) >= minProficiency &&
    (candidateSkill.years ?? 0) >= minYears;
  return ok ? SATISFIED : BELOW;
}

/** Band labels from plan §8.1; thresholds come from the environment. */
export function bandFor(
  matchPct,
  { strong = config.BAND_STRONG, moderate = config.BAND_MODERATE } = {},
) {
  if (matchPct === null || matchPct === undefined) return 'Unscored';
  if (matchPct >= strong) return 'Strong';
  if (matchPct >= moderate) return 'Moderate';
  return 'Low';
}

/**
 * Score one candidate against one job's requirements.
 *
 * @param {Array<{skill_key: string, name?: string, skill?: string,
 *   min_proficiency?: number|null, min_years?: number|null, mandatory?: boolean}>} requirements
 * @param {Record<string, {proficiency: number, years?: number}>} skills keyed by skill_key
 */
export function scoreMatch(requirements, skills = {}) {
  const breakdown = requirements.map((r) => {
    const held = skills[r.skill_key] ?? null;
    const status = requirementStatus(r, held);
    return {
      skill_key: r.skill_key,
      skill: r.skill ?? r.name ?? r.skill_key,
      mandatory: r.mandatory === true,
      required_proficiency: r.min_proficiency ?? null,
      required_years: r.min_years ?? null,
      candidate_proficiency: held?.proficiency ?? null,
      candidate_years: held?.years ?? null,
      satisfied: status === SATISFIED,
      status,
    };
  });

  const total = breakdown.length;
  const matched = breakdown.filter((r) => r.satisfied).length;
  return {
    total,
    matched,
    // Matches Cypher round(100.0 * matched / total, 1); null when unscored.
    match_pct: total === 0 ? null : Math.round((1000 * matched) / total) / 10,
    mandatory_ok: breakdown.every((r) => !r.mandatory || r.satisfied),
    breakdown,
  };
}
