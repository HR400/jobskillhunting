/**
 * public/js/store.js — the one pub/sub store every linked view subscribes to
 * (plan §10.5, Ticket 31). No dependencies; views import and subscribe.
 */

const state = {
  mode: 'match', // active tab: match | gap | network | whatif | recruiter | explore | report
  selection: null, // focused node/bar: { id, type }
  hover: null, // transient: { id, type }
  filters: { status: 'Open', q: '', limit: 20, skip: 0 },
  hypothetical: [], // [{ skill_key, proficiency, years }]
};

const listeners = new Set();

export function getState() {
  return state;
}

/** Shallow-merges `patch` into the state and notifies every subscriber. */
export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of [...listeners]) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Toggles one hypothetical skill on/off by skill_key. */
export function toggleHypothetical(entry) {
  const rest = state.hypothetical.filter((h) => h.skill_key !== entry.skill_key);
  const alreadyThere = rest.length !== state.hypothetical.length;
  setState({ hypothetical: alreadyThere ? rest : [...rest, entry] });
}

export function resetHypothetical() {
  setState({ hypothetical: [] });
}
