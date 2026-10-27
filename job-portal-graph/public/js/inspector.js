/**
 * public/js/inspector.js — inspector panel (Ticket 36).
 *
 * Implements plan §10.2 & §10.4:
 *   - Displays real node and edge properties
 *   - Per-skill breakdown table (required vs held proficiency/years, mandatory status)
 *   - Exact numbers matching /api/match/:candId/:jobId
 *   - Query transparency (query name, dbTimeMs, row count)
 */
import { api } from './api.js';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') node.append(c);
    else if (c) node.append(c);
  }
  return node;
}

export function initInspector(container) {
  return {
    async inspectJob(candId, jobId) {
      container.innerHTML = '<p class="muted">Loading match details…</p>';
      try {
        const res = await api.get(`/match/${encodeURIComponent(candId)}/${encodeURIComponent(jobId)}`);
        const match = res.match || res;
        renderMatch(container, match, res.meta);

        // Ensure inspector is visible on narrow screens.
        document.body.classList.add('inspector-open');
        const toggle = document.getElementById('inspector-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', 'true');
      } catch (err) {
        container.innerHTML = `<p class="field-error">Failed to inspect job: ${err.message}</p>`;
      }
    },
    renderNode(node) {
      renderRawNode(container, node);
    },
  };
}

function renderMatch(container, match, meta = {}) {
  container.innerHTML = '';
  const jobId = match.job_id || match.jobId;
  const jobTitle = match.job_title || match.jobTitle || `Job #${jobId}`;

  const header = el('div', { className: 'inspector-header' },
    el('h3', { className: 'inspector-job-title' }, jobTitle),
    el('p', { className: 'muted' }, `Job ID: ${jobId}`),
  );

  const pctDisplay = match.match_pct !== null && match.match_pct !== undefined
    ? `${match.match_pct}%`
    : 'Unscored';

  const metrics = el('div', { className: 'inspector-metrics' },
    el('div', { className: 'metric-card' },
      el('span', { className: 'metric-label' }, 'Match Score'),
      el('span', { className: 'metric-value', id: 'inspector-score' }, pctDisplay),
    ),
    el('div', { className: 'metric-card' },
      el('span', { className: 'metric-label' }, 'Band'),
      el('span', { className: 'metric-value', id: 'inspector-band' }, match.band || 'Unscored'),
    ),
    el('div', { className: 'metric-card' },
      el('span', { className: 'metric-label' }, 'Mandatory'),
      el('span', { className: 'metric-value', id: 'inspector-mandatory' },
        match.mandatory_ok ? 'Satisfied' : 'Missing'),
    ),
    el('div', { className: 'metric-card' },
      el('span', { className: 'metric-label' }, 'Requirements'),
      el('span', { className: 'metric-value', id: 'inspector-matched' },
        `${match.matched ?? 0} / ${match.total ?? 0}`),
    ),
  );

  // Breakdown table
  const table = el('table', { className: 'inspector-table', id: 'inspector-breakdown' });
  const thead = el('thead', {},
    el('tr', {},
      el('th', {}, 'Skill'),
      el('th', {}, 'Required'),
      el('th', {}, 'Held'),
      el('th', {}, 'Status'),
    ),
  );
  table.append(thead);

  const tbody = el('tbody', {});
  const breakdown = match.breakdown || [];
  for (const b of breakdown) {
    const statusClass = `status-${b.status}`;
    const mandBadge = b.mandatory ? ' ★' : '';
    const row = el('tr', {},
      el('td', {}, `${b.skill}${mandBadge}`),
      el('td', {}, `${b.min_proficiency}/5 · ${b.min_years} yr`),
      el('td', {}, b.held_proficiency ? `${b.held_proficiency}/5 · ${b.held_years} yr` : '—'),
      el('td', { className: `status-cell ${statusClass}` }, b.status),
    );
    tbody.append(row);
  }
  table.append(tbody);

  // Query transparency drawer (plan §10.4 #7)
  const queryMeta = meta && Object.keys(meta).length > 0 ? meta : (match.meta || {});
  const metaDrawer = el('div', { className: 'query-drawer', id: 'inspector-query-meta' },
    el('h4', { className: 'drawer-title' }, 'Query Transparency'),
    el('p', {}, `Query: ${queryMeta.queryName || 'Q1_MATCH'}`),
    el('p', {}, `Database time: ${queryMeta.dbTimeMs ?? 0} ms`),
    el('p', {}, `Rows: ${queryMeta.rowCount ?? 0}`),
  );

  container.append(header, metrics, el('h4', { className: 'section-subtitle' }, 'Skill Requirements Breakdown'), table, metaDrawer);
}

function renderRawNode(container, node) {
  container.innerHTML = '';
  const header = el('div', { className: 'inspector-header' },
    el('h3', { className: 'inspector-job-title' }, node.label || node.id),
    el('p', { className: 'muted' }, `Type: ${node.nodeType || 'Node'}`),
  );

  const propsEl = el('div', { className: 'inspector-props' });
  for (const [k, v] of Object.entries(node.rawProps || {})) {
    propsEl.append(el('p', {}, `${k}: ${v}`));
  }
  container.append(header, propsEl);
}
