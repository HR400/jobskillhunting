/**
 * src/ingest/extract.js — deterministic requirement extraction (Ticket 48, plan §4).
 *
 * A requirement is emitted only when a catalogue skill's name or one of its
 * aliases appears as a whole word in the job text. No guessing, no synonyms,
 * no minimums: the matcher treats null as "any level".
 */
export function extractRequirements(text, skills) {
  const hay = ` ${String(text ?? '').toLowerCase()} `;
  return skills
    .filter((skill) => {
      const terms = [skill.name, ...(skill.aliases ?? [])];
      return terms.some((term) => {
        const needle = String(term ?? '').trim().toLowerCase();
        if (needle.length < 2) return false;
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i').test(hay);
      });
    })
    .map((skill) => ({ skill_key: skill.skill_key, name: skill.name ?? skill.skill_key }))
    .sort((a, b) => a.skill_key.localeCompare(b.skill_key));
}
