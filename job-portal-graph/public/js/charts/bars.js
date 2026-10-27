/**
 * public/js/charts/bars.js — ranked-bars chart (Ticket 37).
 *
 * Renders a D3 SVG horizontal bar chart showing ranked jobs by match_pct.
 * Every value traces directly to the API payload (plan §R2).
 * A "Show as table" toggle exposes the same rows in an accessible table.
 *
 * Plan §10.5: hovering/selecting a bar dispatches to the store (hover/selection).
 */
import { setState, getState, subscribe } from '../store.js';

const BAND_COLOR = {
  Strong: 'var(--color-accent, #34c759)',
  Moderate: 'var(--color-warning, #ff9500)',
  Low: 'var(--color-danger, #ff3b30)',
  Unscored: 'var(--color-ink-muted-48, #86868b)',
};

/**
 * @param {HTMLElement} container
 * @returns {{ render(ranked: object[]): void, clear(): void }}
 */
export function initBars(container) {
  container.innerHTML = '';

  // Build toggle
  const toolbar = document.createElement('div');
  toolbar.className = 'chart-toolbar';
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'chart-toggle-btn';
  toggleBtn.textContent = 'Show as table';
  toggleBtn.setAttribute('aria-pressed', 'false');
  toolbar.append(toggleBtn);

  const svgWrap = document.createElement('div');
  svgWrap.className = 'chart-svg-wrap';
  svgWrap.setAttribute('aria-hidden', 'true');

  const tableWrap = document.createElement('div');
  tableWrap.className = 'chart-table-wrap';
  tableWrap.hidden = true;

  container.append(toolbar, svgWrap, tableWrap);

  let tableMode = false;
  toggleBtn.addEventListener('click', () => {
    tableMode = !tableMode;
    toggleBtn.textContent = tableMode ? 'Show as chart' : 'Show as table';
    toggleBtn.setAttribute('aria-pressed', String(tableMode));
    svgWrap.hidden = tableMode;
    tableWrap.hidden = !tableMode;
  });

  let currentRanked = [];

  // Sync selection highlight from store
  subscribe((state) => {
    if (state.selection?.type === 'Job') {
      highlightBar(state.selection.id);
    }
  });

  function highlightBar(jobId) {
    const svgEl = svgWrap.querySelector('svg');
    if (!svgEl) return;
    // D3 not available in this scope; use DOM directly
    svgEl.querySelectorAll('[data-job-id]').forEach((el) => {
      el.classList.toggle('bar-selected', el.dataset.jobId === jobId);
    });
  }

  function render(ranked) {
    currentRanked = ranked || [];
    svgWrap.innerHTML = '';
    tableWrap.innerHTML = '';

    if (currentRanked.length === 0) {
      svgWrap.innerHTML = '<p class="muted chart-empty">No ranked jobs to display.</p>';
      tableWrap.innerHTML = '<p class="muted chart-empty">No ranked jobs to display.</p>';
      return;
    }

    drawSvg(currentRanked, svgWrap);
    drawTable(currentRanked, tableWrap);
  }

  function drawSvg(ranked, wrap) {
    if (!window.d3) {
      wrap.innerHTML = '<p class="muted">D3 not loaded — showing table view instead.</p>';
      tableMode = true;
      tableWrap.hidden = false;
      svgWrap.hidden = true;
      return;
    }
    const d3 = window.d3;

    const margin = { top: 8, right: 48, bottom: 24, left: 160 };
    const W = wrap.clientWidth || 380;
    const barH = 22;
    const gap = 6;
    const H = ranked.length * (barH + gap) + margin.top + margin.bottom;

    const svg = d3
      .select(wrap)
      .append('svg')
      .attr('width', W)
      .attr('height', H)
      .attr('role', 'img')
      .attr('aria-label', 'Ranked jobs by match percentage');

    const xScale = d3
      .scaleLinear()
      .domain([0, 100])
      .range([margin.left, W - margin.right]);

    const xAxis = d3.axisBottom(xScale).ticks(5).tickFormat((d) => `${d}%`);
    svg
      .append('g')
      .attr('transform', `translate(0,${H - margin.bottom})`)
      .call(xAxis)
      .attr('class', 'chart-axis');

    const grp = svg
      .append('g')
      .attr('class', 'bars-group')
      .selectAll('g')
      .data(ranked)
      .join('g')
      .attr('transform', (_, i) => `translate(0,${margin.top + i * (barH + gap)})`);

    // Label
    grp
      .append('text')
      .attr('x', margin.left - 6)
      .attr('y', barH / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('class', 'bar-label')
      .text((d) => truncate(d.job_title, 22));

    // Bar rect
    grp
      .append('rect')
      .attr('x', margin.left)
      .attr('y', 0)
      .attr('height', barH)
      .attr('width', (d) => xScale(d.match_pct ?? 0) - margin.left)
      .attr('rx', 4)
      .attr('fill', (d) => BAND_COLOR[d.band] || BAND_COLOR.Unscored)
      .attr('class', 'bar-rect')
      .attr('data-job-id', (d) => d.job_id)
      .attr('tabindex', '0')
      .attr('role', 'button')
      .attr('aria-label', (d) => `${d.job_title}: ${d.match_pct ?? 'unscored'}%`)
      .on('click', (event, d) => {
        setState({ selection: { type: 'Job', id: d.job_id } });
        window.dispatchEvent(new CustomEvent('bars-select', { detail: { jobId: d.job_id } }));
      })
      .on('mouseover', (event, d) => {
        setState({ hover: { type: 'Job', id: d.job_id } });
      })
      .on('mouseout', () => {
        setState({ hover: null });
      })
      .on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setState({ selection: { type: 'Job', id: d.job_id } });
        }
      });

    // Value label
    grp
      .append('text')
      .attr('x', (d) => xScale(d.match_pct ?? 0) + 4)
      .attr('y', barH / 2)
      .attr('dy', '0.35em')
      .attr('class', 'bar-value-label')
      .text((d) => (d.match_pct !== null ? `${d.match_pct}%` : 'Unscored'));
  }

  function drawTable(ranked, wrap) {
    const table = document.createElement('table');
    table.className = 'chart-table';
    table.setAttribute('aria-label', 'Ranked jobs');
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th scope="col">Job</th>
        <th scope="col">Employer</th>
        <th scope="col">Match</th>
        <th scope="col">Band</th>
        <th scope="col">Mandatory</th>
      </tr>`;
    table.append(thead);

    const tbody = document.createElement('tbody');
    for (const d of ranked) {
      const tr = document.createElement('tr');
      tr.dataset.jobId = d.job_id;
      tr.setAttribute('tabindex', '0');
      tr.innerHTML = `
        <td>${escHtml(d.job_title)}</td>
        <td>${escHtml(d.employer?.company_name ?? '')}</td>
        <td>${d.match_pct !== null ? `${d.match_pct}%` : 'Unscored'}</td>
        <td>${escHtml(d.band ?? 'Unscored')}</td>
        <td>${d.mandatory_ok ? 'Yes' : 'No'}</td>`;
      tr.addEventListener('click', () => {
        setState({ selection: { type: 'Job', id: d.job_id } });
        window.dispatchEvent(new CustomEvent('bars-select', { detail: { jobId: d.job_id } }));
      });
      tbody.append(tr);
    }
    table.append(tbody);
    wrap.append(table);
  }

  return { render, clear: () => render([]) };
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
