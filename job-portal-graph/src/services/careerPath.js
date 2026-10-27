/**
 * src/services/careerPath.js — step selection for career paths (Ticket 53).
 *
 * Dijkstra runs once per (held skill, missing skill) pair; this pure function
 * keeps the cheapest real path per missing skill and orders the steps so the
 * nearest requirement comes first. Unreachable skills stay visible as such.
 */
export function pickCareerSteps(missingSkills, attempts) {
  const steps = missingSkills.map((skill) => {
    const best = attempts
      .filter((attempt) => attempt.target === skill.skill_key && attempt.path?.length)
      .sort((a, b) => a.weight - b.weight)[0];
    return {
      skill_key: skill.skill_key,
      name: skill.name,
      path: best?.path ?? [],
      hops: best ? best.path.length - 1 : null,
      weight: best?.weight ?? null,
      reachable: Boolean(best),
    };
  });

  return steps.sort(
    (a, b) => (a.weight ?? Infinity) - (b.weight ?? Infinity) || a.name.localeCompare(b.name),
  );
}
