/**
 * public/js/charts/gap.js — gap list (Ticket 44, plan §10.2).
 *
 * Q2 returns only unsatisfied requirements (below/missing), mandatory first.
 * Satisfied requirements come from the Q1 breakdown so all three states are
 * visible. Rows are real API values; hovering a row highlights the skill in the
 * canvas and radar through the store.
 */
import { ApiError, api } from '../api.js';
import { setState, subscribe } from '../store.js';

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else node.setAttribute(k, v);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

export function initGapList(container) {
  container.textContent = '';
  const title = el('h3', {}, 'Gap list');
  const status = el('p', { className: 'muted' }, 'Select a job to see its requirements.');
  const tableWrap = el('div', { className: 'chart-table-wrap' });
  container.append(title, status, tableWrap);

  subscribe((state) => {
    const key = state.hover?.type === 'Skill' ? state.hover.id : null;
    tableWrap.querySelectorAll('tr[data-skill-key]').forEach((row) => {
      row.classList.toggle('row-hovered', key !== null && row.dataset.skillKey === key);
    });
  });

  let requestId = 0;

  return {
    async render(candId, jobId) {
      const id = ++requestId;
      status.textContent = 'Loading gaps…';
      try {
        const [gap, match] = await Promise.all([
          api.get(`/gap/${encodeURIComponent(candId)}/${encodeURIComponent(jobId)}`),
          api.get(`/match/${encodeURIComponent(candId)}/${encodeURIComponent(jobId)}`),
        ]);
        if (id !== requestId) return;

        const satisfied = (match.match?.breakdown ?? [])
          .filter((b) => b.status === 'satisfied')
          .sort((a, b) => String(a.skill).localeCompare(String(b.skill)))
          .map((b) => ({
            skill: b.skill,
            skill_key: b.skill_key,
            mandatory: b.mandatory,
            required_proficiency: b.min_proficiency,
            required_years: b.min_years,
            current_proficiency: b.held_proficiency,
            current_years: b.held_years,
            status: 'satisfied',
          }));
        // Gaps keep Q2's order (mandatory first, then skill name).
        const rows = [
          ...gap.gaps.map((g) => ({ ...g, status: g.gap_type })),
          ...satisfied,
        ];

        status.textContent = `${gap.summary.below} below · ${gap.summary.missing} missing · ${satisfied.length} satisfied`;
        renderTable(rows);
      } catch (err) {
        if (id !== requestId) return;
        status.textContent = err instanceof ApiError ? err.message : 'Failed to load gaps.';
        tableWrap.textContent = '';
      }
    },
    clear() {
      status.textContent = 'Select a job to see its requirements.';
      tableWrap.textContent = '';
    },
  };

  function renderTable(rows) {
    tableWrap.textContent = '';
    if (rows.length === 0) {
      tableWrap.append(el('p', { className: 'muted' }, 'This job has no requirements.'));
      return;
    }
    const table = el('table', { className: 'chart-table gap-table', 'aria-label': 'Requirements and gaps' });
    const head = el('thead');
    const headRow = el('tr');
    for (const label of ['Skill', 'Required', 'Held', 'Mandatory', 'State']) {
      headRow.append(el('th', { scope: 'col' }, label));
    }
    head.append(headRow);

    const body = el('tbody');
    for (const row of rows) {
      const tr = el('tr', {
        'data-skill-key': row.skill_key || row.skill,
        'data-status': row.status,
        tabindex: '0',
        'aria-label': `${row.skill}: ${row.status}`,
      });
      tr.append(
        el('td', {}, row.skill),
        el('td', {}, `${row.required_proficiency ?? 1}/5 · ${row.required_years ?? 0} yr`),
        el('td', {}, row.current_proficiency
          ? `${row.current_proficiency}/5 · ${row.current_years ?? 0} yr`
          : '—'),
        el('td', {}, row.mandatory ? '★ Yes' : 'No'),
        el('td', { className: `status-cell status-${row.status}` }, row.status),
      );
      tr.addEventListener('mouseenter', () =>
        setState({ hover: { type: 'Skill', id: row.skill_key || row.skill } }),
      );
      tr.addEventListener('mouseleave', () => setState({ hover: null }));
      body.append(tr);
    }
    table.append(head, body);
    tableWrap.append(table);
  }
}
