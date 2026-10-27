/**
 * src/queries/decay.js — effective proficiency as Cypher (Ticket 56, plan §11.2).
 *
 * λ = 0 (the default) returns the stored proficiency, so every query keeps its
 * current behaviour. With λ > 0 the value decays by `exp(-λ × years unused)`;
 * a missing `last_used_year` means "no evidence of staleness", so it does not
 * decay. The expression is a parameter, never inlined into Cypher text.
 */
export function effectiveProficiency(edge) {
  return `CASE WHEN $decayLambda > 0
    THEN ${edge}.proficiency * exp(-$decayLambda * (date().year - coalesce(${edge}.last_used_year, date().year)))
    ELSE ${edge}.proficiency END`;
}
