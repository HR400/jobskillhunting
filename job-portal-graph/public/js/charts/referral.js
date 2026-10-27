/**
 * public/js/charts/referral.js — referral chain (Ticket 44, plan §10.2).
 *
 * Q3 walks (:Candidate)-[:REFERS*1..3]->(:Candidate). The chain is rendered
 * blind-safe: every other candidate is shown as `Candidate #XXXX` (first four
 * characters of their id), never a name, email or contact detail. The viewer's
 * own node is labelled "You". Full blind enforcement for employer/recruiter
 * views is ticket 54.
 */
import { ApiError, api } from '../api.js';

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else node.setAttribute(k, v);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Anonymous, stable display ref. No name, DOB or contact ever reaches the DOM. */
export function blindRef(candId) {
  return `Candidate #${String(candId).replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}

export function initReferralChain(container) {
  container.textContent = '';
  const title = el('h3', {}, 'Referrals');
  const status = el('p', { className: 'muted' }, 'Select a job to see your referral network.');
  const authorityNote = el('p', { className: 'muted referrer-authority-note' });
  const list = el('div', { className: 'referral-list' });
  container.append(title, status, authorityNote, list);

  let requestId = 0;
  // Authority is page-wide; compute it once per page load.
  let authorityPromise = null;
  const loadAuthority = () => (authorityPromise ??= api.get('/analytics/pagerank').catch(() => null));

  return {
    async render(candId) {
      const id = ++requestId;
      status.textContent = 'Loading referral paths…';
      authorityNote.textContent = '';
      try {
        const [res, authority] = await Promise.all([
          api.get(`/referrals/${encodeURIComponent(candId)}/chain?maxHops=3`),
          loadAuthority(),
        ]);
        if (id !== requestId) return;
        const scores = new Map(
          (authority?.candidates ?? []).map((c) => [c.cand_id, c.referrer_authority]),
        );
        if (authority?.unavailable) {
          authorityNote.textContent = `Referrer authority unavailable: ${authority.unavailable}`;
        }
        list.textContent = '';
        if (res.chains.length === 0) {
          status.textContent = 'No referral paths from you yet.';
          return;
        }
        status.textContent = `${res.chains.length} referral path${res.chains.length === 1 ? '' : 's'} (max ${res.maxHops} hops).`;
        for (const chain of res.chains) {
          const row = el('p', { className: 'referral-chain', 'data-hops': String(chain.hops) });
          chain.ids.forEach((nodeId, index) => {
            if (index > 0) row.append(el('span', { className: 'referral-arrow', 'aria-hidden': 'true' }, ' → '));
            const isSelf = nodeId === candId;
            row.append(
              el('span', { className: 'referral-node' }, isSelf ? 'You' : blindRef(nodeId)),
            );
            const authority = scores.get(nodeId);
            if (typeof authority === 'number') {
              row.append(
                el('small', { className: 'muted referrer-authority' }, ` (referrer authority ${authority.toFixed(3)})`),
              );
            }
          });
          row.append(el('span', { className: 'muted' }, ` · ${chain.hops} hop${chain.hops === 1 ? '' : 's'}`));
          list.append(row);
        }
      } catch (err) {
        if (id !== requestId) return;
        status.textContent = err instanceof ApiError ? err.message : 'Failed to load referrals.';
        list.textContent = '';
      }
    },
    clear() {
      status.textContent = 'Select a job to see your referral network.';
      authorityNote.textContent = '';
      list.textContent = '';
    },
  };
}
