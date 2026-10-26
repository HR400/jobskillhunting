/**
 * src/lib/skillKey.js — Canonical skill key generator (plan §7.2, §16).
 *
 * Normalises a skill name into a unique canonical key by:
 * 1. Trimming leading and trailing whitespace.
 * 2. Converting all characters to lowercase.
 * 3. Collapsing multiple consecutive whitespace characters into a single space.
 */
export function skillKey(name) {
  if (typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
