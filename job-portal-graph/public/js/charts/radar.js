/**
 * public/js/charts/radar.js — skill radar chart (Ticket 37).
 *
 * Renders a D3 SVG radar showing the candidate's held skill levels vs the
 * required levels for the selected job. Every axis maps to one requirement
 * from the /api/match/:candId/:jobId breakdown (plan §R2).
 *
 * A "Show as table" toggle exposes the same rows as an accessible table.
 * Plan §10.5: hovering a skill dispatches to the store.
 */
import { getState, setState, subscribe } from '../store.js';

/**
 * @param {HTMLElement} container
 * @returns {{ render(breakdown: object[]): void, clear(): void }}
 */
export function initRadar(container) {
  container.innerHTML = '';

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

  // Hover highlight from store
  subscribe((state) => {
    const skillKey =
      state.hover?.type === 'Skill'
        ? state.hover.id
        : state.selection?.type === 'Skill'
          ? state.selection.id
          : null;
    if (skillKey) {
      highlightAxis(skillKey);
    } else {
      clearHighlight();
    }
  });

  function highlightAxis(skillKey) {
    const svgEl = svgWrap.querySelector('svg');
    if (!svgEl) return;
    svgEl.querySelectorAll('[data-skill-key]').forEach((el) => {
      el.classList.toggle('radar-axis-hovered', el.dataset.skillKey === skillKey);
    });
  }

  function clearHighlight() {
    const svgEl = svgWrap.querySelector('svg');
    if (!svgEl) return;
    svgEl.querySelectorAll('.radar-axis-hovered').forEach((el) =>
      el.classList.remove('radar-axis-hovered'),
    );
  }

  function render(breakdown) {
    svgWrap.innerHTML = '';
    tableWrap.innerHTML = '';

    if (!breakdown || breakdown.length === 0) {
      svgWrap.innerHTML = '<p class="muted chart-empty">No requirements to display.</p>';
      tableWrap.innerHTML = '<p class="muted chart-empty">No requirements to display.</p>';
      return;
    }

    // Cap at 12 axes to keep the radar legible.
    const axes = breakdown.slice(0, 12);

    drawSvg(axes, svgWrap);
    drawTable(breakdown, tableWrap);
  }

  function drawSvg(axes, wrap) {
    if (!window.d3) {
      wrap.innerHTML = '<p class="muted">D3 not loaded — showing table view instead.</p>';
      tableMode = true;
      tableWrap.hidden = false;
      svgWrap.hidden = true;
      return;
    }
    const d3 = window.d3;

    const size = Math.min(wrap.clientWidth || 320, 320);
    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - 36; // leave room for labels
    const levels = 5; // proficiency 1-5

    const svg = d3
      .select(wrap)
      .append('svg')
      .attr('width', size)
      .attr('height', size)
      .attr('role', 'img')
      .attr('aria-label', 'Skill radar: candidate levels vs required levels');

    const n = axes.length;
    function angle(i) {
      return (Math.PI * 2 * i) / n - Math.PI / 2;
    }
    function point(r, i) {
      return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
    }
    function polygon(values) {
      return values.map((v, i) => point((v / levels) * R, i)).join(' ');
    }

    // Grid rings
    for (let l = 1; l <= levels; l++) {
      const pts = axes.map((_, i) => point((l / levels) * R, i)).join(' ');
      svg
        .append('polygon')
        .attr('points', pts)
        .attr('class', 'radar-grid')
        .attr('fill', 'none')
        .attr('stroke', 'var(--color-ink-muted-48, #86868b)')
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.4);
    }

    // Axes
    axes.forEach((_, i) => {
      const [x, y] = point(R, i);
      svg
        .append('line')
        .attr('x1', cx)
        .attr('y1', cy)
        .attr('x2', x)
        .attr('y2', y)
        .attr('class', 'radar-axis-line')
        .attr('stroke', 'var(--color-ink-muted-48, #86868b)')
        .attr('stroke-width', 0.8)
        .attr('opacity', 0.5);
    });

    // Required polygon
    const requiredVals = axes.map((a) => a.min_proficiency ?? 1);
    svg
      .append('polygon')
      .attr('points', polygon(requiredVals))
      .attr('class', 'radar-required')
      .attr('fill', 'var(--color-warning, #ff9500)')
      .attr('fill-opacity', 0.15)
      .attr('stroke', 'var(--color-warning, #ff9500)')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4 3');

    // Held polygon
    const heldVals = axes.map((a) => a.held_proficiency ?? 0);
    svg
      .append('polygon')
      .attr('points', polygon(heldVals))
      .attr('class', 'radar-held')
      .attr('fill', 'var(--color-accent, #34c759)')
      .attr('fill-opacity', 0.25)
      .attr('stroke', 'var(--color-accent, #34c759)')
      .attr('stroke-width', 2);

    // Axis labels (interactive)
    axes.forEach((a, i) => {
      const [lx, ly] = point(R + 14, i);
      const textEl = svg
        .append('text')
        .attr('x', lx)
        .attr('y', ly)
        .attr('dy', '0.35em')
        .attr('text-anchor', Math.abs(lx - cx) < 4 ? 'middle' : lx < cx ? 'end' : 'start')
        .attr('class', 'radar-label')
        .attr('font-size', 10)
        .attr('data-skill-key', a.skill_key || a.skill)
        .attr('tabindex', '0')
        .attr('role', 'button')
        .text(truncate(a.skill, 12));

      // Dispatch hover to store (plan §10.5)
      textEl
        .on('mouseover', () => setState({ hover: { type: 'Skill', id: a.skill_key || a.skill } }))
        .on('mouseout', () => setState({ hover: null }))
        // Ticket 41: selecting an axis filters the linked views.
        .on('click', () => {
          const id = a.skill_key || a.skill;
          const current = getState().selection;
          setState({
            selection: current?.type === 'Skill' && current.id === id ? null : { type: 'Skill', id },
          });
        });
    });

    // Legend
    const legend = svg.append('g').attr('transform', `translate(${size - 100}, ${size - 36})`);
    legend
      .append('line')
      .attr('x1', 0)
      .attr('y1', 6)
      .attr('x2', 20)
      .attr('y2', 6)
      .attr('stroke', 'var(--color-accent, #34c759)')
      .attr('stroke-width', 2);
    legend
      .append('text')
      .attr('x', 24)
      .attr('y', 10)
      .attr('font-size', 9)
      .text('Held');
    legend
      .append('line')
      .attr('x1', 0)
      .attr('y1', 18)
      .attr('x2', 20)
      .attr('y2', 18)
      .attr('stroke', 'var(--color-warning, #ff9500)')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4 3');
    legend
      .append('text')
      .attr('x', 24)
      .attr('y', 22)
      .attr('font-size', 9)
      .text('Required');
  }

  function drawTable(breakdown, wrap) {
    const table = document.createElement('table');
    table.className = 'chart-table';
    table.setAttribute('aria-label', 'Skill requirements');
    table.innerHTML = `
      <thead>
        <tr>
          <th scope="col">Skill</th>
          <th scope="col">Required level</th>
          <th scope="col">Held level</th>
          <th scope="col">Status</th>
          <th scope="col">Mandatory</th>
        </tr>
      </thead>`;
    const tbody = document.createElement('tbody');
    for (const b of breakdown) {
      const tr = document.createElement('tr');
      const heldTxt = b.held_proficiency
        ? `${b.held_proficiency}/5 · ${b.held_years ?? 0} yr`
        : '—';
      const reqTxt = `${b.min_proficiency ?? 1}/5 · ${b.min_years ?? 0} yr`;
      tr.innerHTML = `
        <td>${escHtml(b.skill)}</td>
        <td>${escHtml(reqTxt)}</td>
        <td>${escHtml(heldTxt)}</td>
        <td class="status-${b.status}">${escHtml(b.status ?? '')}</td>
        <td>${b.mandatory ? '★ Yes' : 'No'}</td>`;
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
