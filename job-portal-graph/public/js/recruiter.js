/**
 * public/js/recruiter.js — recruiter / employer view (Ticket 45, plan §10.6).
 *
 * Job picker → Q4 candidates as a matrix plus a canvas with the job at the
 * centre and candidates on rings by band. Identities come from the server:
 * `candidate.unmasked` is only true above BLIND_UNMASK_THRESHOLD, and a masked
 * row carries nothing but `Candidate #XXXX`.
 */
import { ApiError, api } from './api.js';

const BAND_COLOR = { Strong: '#34c759', Moderate: '#ff9500', Low: '#ff3b30' };
const RING_RADIUS = { Strong: 120, Moderate: 220, Low: 300 };

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (child === undefined || child === null) continue;
    node.append(child);
  }
  return node;
}

export function initRecruiter(panel) {
  const select = el('select', { id: 'recruiter-job', 'aria-label': 'Job to review' });
  const status = el('p', { className: 'muted', id: 'recruiter-status', 'aria-live': 'polite' }, 'Loading your jobs…');
  const table = el('div', { className: 'chart-table-wrap', id: 'recruiter-table' });
  const canvasSlot = el('div', { className: 'recruiter-canvas', id: 'recruiter-canvas' });
  panel.append(el('h2', { className: 'panel-title' }, 'Recruiter'), select, status, el('div', { className: 'recruiter-body' }, table, canvasSlot));

  let empId = null;
  let network = null;

  select.addEventListener('change', () => load(select.value));

  select.hidden = true;
  boot();

  async function boot() {
    try {
      const me = await api.get('/auth/me');
      if (me.role !== 'employer') {
        status.textContent = me.role === 'recruiter'
          ? 'Recruiter view: sign in as the employer you represent to see its candidates.'
          : 'Recruiter view is for employer and recruiter accounts.';
        return;
      }
      empId = me.profileId;
      const jobs = await api.get(`/jobs?employerId=${encodeURIComponent(empId)}&limit=100`);
      const posted = jobs.jobs ?? [];
      if (posted.length === 0) {
        status.textContent = 'You have not posted a job yet.';
        return;
      }
      for (const job of posted) {
        select.append(el('option', { value: job.job_id }, job.job_title));
      }
      select.hidden = false;
      await load(posted[0].job_id);
    } catch (err) {
      status.textContent = err instanceof ApiError ? err.message : 'Failed to load the recruiter view.';
    }
  }

  async function load(jobId) {
    status.textContent = 'Loading recommendations…';
    try {
      const res = await api.get(`/recruiter/${encodeURIComponent(empId)}/recommendations?limit=100`);
      const rows = res.recommendations.filter((r) => r.job_id === jobId);
      if (rows.length === 0) {
        status.textContent = `No candidate reaches the ${res.threshold}% screening threshold for this job.`;
        table.textContent = '';
        renderRings([], jobId);
        return;
      }
      status.textContent = `${rows.length} candidate${rows.length === 1 ? '' : 's'} at or above ${res.threshold}%; names appear above ${res.blindThreshold}% only.`;
      renderMatrix(rows);
      renderRings(rows, jobId);
    } catch (err) {
      status.textContent = err instanceof ApiError ? err.message : 'Failed to load recommendations.';
      table.textContent = '';
    }
  }

  function renderMatrix(rows) {
    table.textContent = '';
    const node = el('table', { className: 'chart-table recruiter-table', 'aria-label': 'Candidates by match' });
    const head = el('thead');
    const headRow = el('tr');
    for (const label of ['Candidate', 'Match', 'Band', 'Mandatory', 'Matched skills']) {
      headRow.append(el('th', { scope: 'col' }, label));
    }
    head.append(headRow);
    const body = el('tbody');
    for (const row of rows) {
      const tr = el('tr', { 'data-cand-id': row.cand_id, 'data-masked': String(!row.candidate.unmasked) });
      tr.append(
        el('td', {}, row.candidate.unmasked ? row.candidate.name : `${row.candidate.ref} (masked)`),
        el('td', {}, `${row.match_pct}%`),
        el('td', {}, row.band),
        el('td', {}, row.mandatory_ok ? 'Yes' : 'No'),
        el('td', {}, (row.matched_skills ?? []).join(', ')),
      );
      body.append(tr);
    }
    node.append(head, body);
    table.append(node);
  }

  function renderRings(rows, jobId) {
    if (!window.vis?.Network) {
      canvasSlot.textContent = 'vis-network library not loaded.';
      return;
    }
    network?.destroy();
    canvasSlot.textContent = '';

    const nodes = [{ id: jobId, label: 'This job', shape: 'dot', size: 26, color: '#0071e3', x: 0, y: 0, fixed: true }];
    const edges = [];
    const perBand = {};
    for (const row of rows) {
      const band = row.band in RING_RADIUS ? row.band : 'Low';
      perBand[band] = (perBand[band] ?? 0) + 1;
      const index = perBand[band] - 1;
      const total = rows.filter((r) => (r.band in RING_RADIUS ? r.band : 'Low') === band).length;
      const angle = (2 * Math.PI * index) / Math.max(total, 1);
      const radius = RING_RADIUS[band];
      nodes.push({
        id: row.cand_id,
        label: `${row.candidate.unmasked ? row.candidate.name : row.candidate.ref}\n${row.match_pct}%`,
        title: `${row.match_pct}% · ${band} · ${(row.matched_skills ?? []).join(', ')}`,
        shape: 'dot',
        size: 14 + (row.match_pct / 100) * 12,
        color: BAND_COLOR[band],
        x: Math.round(radius * Math.cos(angle)),
        y: Math.round(radius * Math.sin(angle)),
        fixed: true,
      });
      edges.push({ from: jobId, to: row.cand_id, color: { color: BAND_COLOR[band] }, dashes: !row.mandatory_ok });
    }

    network = new window.vis.Network(
      canvasSlot,
      { nodes: new window.vis.DataSet(nodes), edges: new window.vis.DataSet(edges) },
      {
        physics: false,
        nodes: { font: { size: 11 } },
        interaction: { hover: true },
        layout: { improvedLayout: false },
      },
    );
    // Check seam for the Playwright ticket: read the real positions, never drive them.
    window.__recruiter = network;
  }

  return { reload: boot };
}
