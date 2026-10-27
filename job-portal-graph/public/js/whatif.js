/**
 * public/js/whatif.js — What-if tab (Ticket 43, plan §8.5 / §10.5).
 *
 * The store holds the hypothetical skills; this view sends them to
 * POST /api/match/what-if (read-only) and renders stored vs hypothetical
 * numbers side by side. Every number derived from the hypothetical list is
 * labelled "hypothetical" — the server never writes anything.
 */
import { api } from './api.js';
import { getState, resetHypothetical, subscribe, toggleHypothetical } from './store.js';

/** Same canonical form as src/lib/skillKey.js. */
function skillKey(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else node.setAttribute(k, v);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

export function initWhatIf(container, { getCandId, onResults } = {}) {
  container.innerHTML = '';

  const form = el('form', { className: 'whatif-form' });
  const nameInput = el('input', {
    name: 'skill_key',
    type: 'text',
    placeholder: 'Skill you could learn',
    maxlength: '100',
    required: '',
    'aria-label': 'Hypothetical skill',
  });
  const profSelect = el('select', { name: 'proficiency', 'aria-label': 'Hypothetical proficiency' });
  for (const [value, label] of [
    ['1', '1/5 Beginner'],
    ['2', '2/5 Basic'],
    ['3', '3/5 Intermediate'],
    ['4', '4/5 Advanced'],
    ['5', '5/5 Expert'],
  ]) {
    const option = el('option', { value }, label);
    if (value === '3') option.selected = true;
    profSelect.append(option);
  }
  const yearsInput = el('input', {
    name: 'years',
    type: 'number',
    min: '0',
    max: '60',
    value: '0',
    'aria-label': 'Hypothetical years',
  });
  const addButton = el('button', { type: 'submit' }, 'Add hypothetical skill');
  form.append(nameInput, profSelect, yearsInput, addButton);

  const chips = el('ul', { className: 'whatif-chips', 'aria-label': 'Hypothetical skills' });
  const resetButton = el('button', { type: 'button', className: 'chart-toggle-btn' }, 'Reset');
  const status = el('p', { className: 'muted', 'aria-live': 'polite' });
  const results = el('div', { className: 'whatif-results' });
  container.append(
    form,
    chips,
    resetButton,
    status,
    el('p', { className: 'whatif-label' }, 'Numbers below are hypothetical: computed from max(stored, hypothetical) per skill, never written.'),
    results,
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const key = skillKey(nameInput.value);
    if (!key) return;
    toggleHypothetical({
      skill_key: key,
      proficiency: Number(profSelect.value),
      years: Number(yearsInput.value),
    });
    nameInput.value = '';
  });

  resetButton.addEventListener('click', () => resetHypothetical());

  let lastHypothetical = '[]';
  let requestId = 0;

  subscribe((state) => {
    renderChips(state.hypothetical);
    const serialized = JSON.stringify(state.hypothetical);
    if (serialized === lastHypothetical) return;
    lastHypothetical = serialized;
    run(state.hypothetical);
  });

  function renderChips(hypothetical) {
    chips.textContent = '';
    for (const entry of hypothetical) {
      const chip = el('li', { className: 'whatif-chip' });
      chip.append(
        el('span', {}, `${entry.skill_key} · ${entry.proficiency}/5 · ${entry.years} y`),
        el('button', {
          type: 'button',
          'aria-label': `Remove ${entry.skill_key}`,
          onclick: () => toggleHypothetical(entry),
        }, '×'),
      );
      chips.append(chip);
    }
  }

  async function run(hypothetical) {
    const candId = getCandId?.();
    const id = ++requestId;
    if (!candId) {
      status.textContent = 'Sign in as a candidate to run the simulator.';
      results.textContent = '';
      onResults?.(null);
      return;
    }
    if (hypothetical.length === 0) {
      status.textContent = 'Add a hypothetical skill to compare scores.';
      results.textContent = '';
      onResults?.(null);
      return;
    }
    status.textContent = 'Scoring…';
    try {
      const res = await api.post('/match/what-if', { candId, hypothetical });
      if (id !== requestId) return;
      renderResults(res);
      status.textContent = `${res.summary.jobs_improved} of ${res.summary.jobs_scored} scored jobs improve with these skills.`;
      onResults?.(res);
    } catch (err) {
      if (id !== requestId) return;
      status.textContent = `Simulator error: ${err.message}`;
      results.textContent = '';
      onResults?.(null);
    }
  }

  function renderResults(res) {
    results.textContent = '';
    const table = el('table', { className: 'chart-table whatif-table', 'aria-label': 'Hypothetical job scores' });
    const head = el('thead');
    const headRow = el('tr');
    for (const label of ['Job', 'Stored', 'Hypothetical', 'Δ', 'Band', 'Mandatory', 'Newly unlocked']) {
      headRow.append(el('th', { scope: 'col' }, label));
    }
    head.append(headRow);
    const body = el('tbody');
    for (const job of res.jobs) {
      const row = el('tr', { 'data-job-id': job.job_id });
      if (job.newly_unlocked) row.classList.add('whatif-unlocked');
      row.append(
        el('td', {}, job.job_title),
        el('td', {}, formatPct(job.stored.match_pct)),
        el('td', {}, formatPct(job.hypothetical.match_pct)),
        el('td', {}, `${job.delta_pct > 0 ? '+' : ''}${job.delta_pct}`),
        el('td', {}, job.hypothetical.band),
        el('td', {}, job.hypothetical.mandatory_ok ? 'Yes' : 'No'),
        el('td', {}, job.newly_unlocked ? 'Yes' : 'No'),
      );
      body.append(row);
    }
    table.append(head, body);
    results.append(table);
  }

  renderChips(getState().hypothetical);
  status.textContent = 'Add a hypothetical skill to compare scores.';
}

function formatPct(value) {
  return value === null || value === undefined ? 'Unscored' : `${value}%`;
}
