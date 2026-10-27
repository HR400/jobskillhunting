/**
 * src/services/decay.js — skill decay (Ticket 56, plan §11.2).
 *
 * effective_proficiency = proficiency × exp(−λ × years_since_last_used)
 *
 * λ comes from `SKILL_DECAY_LAMBDA` and defaults to 0 (off). The JS mirror is
 * used for display and the reference matcher; the scoring Cypher uses the same
 * formula from src/queries/decay.js.
 */
import { config } from '../config.js';

export function yearsSinceLastUsed(lastUsedYear, now = new Date().getFullYear()) {
  if (!Number.isFinite(lastUsedYear)) return null;
  return Math.max(0, now - lastUsedYear);
}

export function effectiveProficiency(
  { proficiency, lastUsedYear },
  lambda = config.SKILL_DECAY_LAMBDA,
) {
  const years = yearsSinceLastUsed(lastUsedYear);
  if (!lambda || years === null) return proficiency ?? null;
  return Math.round(proficiency * Math.exp(-lambda * years) * 100) / 100;
}
