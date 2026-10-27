/**
 * src/lib/blind.js — blind-hiring redaction (plan §11.4, Tickets 45 / 54).
 *
 * Employer and recruiter payloads carry an anonymous ref until a candidate's
 * match is strictly above BLIND_UNMASK_THRESHOLD. Unmasking returns only the
 * fields the view needs and is logged server-side; the masked branch never
 * contains name, DOB, gender, contact or address.
 */
import { logger } from './logger.js';

const BLIND_FIELDS = ['fname', 'lname', 'dob', 'gender', 'email', 'phone', 'house_no', 'street'];

/** Anonymous, stable ref: "Candidate #A1B2". */
export function blindRef(candId) {
  return `Candidate #${String(candId).replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}

function fieldValue(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value?.toNumber === 'function') return value.toNumber();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && 'year' in value) return value.toString();
  return value;
}

/**
 * @param {object} candidate raw Candidate node properties
 * @param {number|null} matchPct
 * @param {number} threshold unmask only when matchPct > threshold
 * @param {{ viewerId?: string, jobId?: string }} context logged on unmask
 */
export function blindCandidate(candidate, matchPct, threshold, context = {}) {
  const candId = candidate.cand_id;
  const base = { cand_id: candId, ref: blindRef(candId) };
  if (matchPct === null || matchPct <= threshold) {
    return { ...base, unmasked: false };
  }
  logger.info(
    { event: 'blind unmask', candId, viewerId: context.viewerId, jobId: context.jobId, matchPct },
    'blind unmask',
  );
  const out = { ...base, unmasked: true, name: `${candidate.fname ?? ''} ${candidate.lname ?? ''}`.trim() };
  for (const field of ['dob', 'gender', 'email', 'phone']) {
    if (candidate[field] !== undefined && candidate[field] !== null) {
      out[field] = fieldValue(candidate[field]);
    }
  }
  return out;
}

export { BLIND_FIELDS };
