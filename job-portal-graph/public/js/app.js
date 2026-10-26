/**
 * public/js/app.js — layout shell behaviour (Ticket 32).
 *
 * Wires the §10.2 tab list to the store, keeps the ARIA tabs pattern keyboard
 * usable (roving tabindex + arrow keys), toggles the slide-out inspector and
 * reflects the session state through the API client.
 */
import { api, ApiError } from './api.js';
import { setState, subscribe } from './store.js';
import { initWizard } from './forms.js';

// ── Tabs (ARIA tabs pattern, automatic activation) ──────────────────────────
const tabs = [...document.querySelectorAll('[role="tab"]')];

function activate(tab) {
  setState({ mode: tab.dataset.mode });
  tab.focus();
}

function renderMode(state) {
  document.body.dataset.mode = state.mode;
  for (const tab of tabs) {
    const selected = tab.dataset.mode === state.mode;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
}

for (const tab of tabs) {
  tab.addEventListener('click', () => activate(tab));
}

document.getElementById('tabs').addEventListener('keydown', (event) => {
  const current = tabs.indexOf(document.activeElement);
  if (current === -1) return;
  const moves = {
    ArrowRight: (current + 1) % tabs.length,
    ArrowLeft: (current - 1 + tabs.length) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  };
  if (event.key in moves) {
    event.preventDefault();
    activate(tabs[moves[event.key]]);
  }
});

// ── Mode note for views that arrive in later tickets ────────────────────────
const NOTES = {
  match: '',
  gap: 'The gap view (Q2) is built with the Phase 4 gap ticket.',
  network: 'The referral network (Q3) is built with the Phase 4 network ticket.',
  whatif: 'The What-if tab is built with the Phase 4 what-if ticket.',
  recruiter: 'The recruiter view (Q4) is built with the Phase 4 recruiter ticket.',
  explore: 'Explore arrives in Phase 6 behind the capabilities check.',
  report: 'The report is built in Phase 7 (public/report.html).',
};

function renderNote(state) {
  const note = document.getElementById('view-note');
  note.textContent = NOTES[state.mode] ?? '';
  note.hidden = state.mode === 'match';
}

// ── Inspector drawer ────────────────────────────────────────────────────────
const toggle = document.getElementById('inspector-toggle');
toggle.addEventListener('click', () => {
  const open = document.body.classList.toggle('inspector-open');
  toggle.setAttribute('aria-expanded', String(open));
});

// ── Session state ───────────────────────────────────────────────────────────
async function renderSession() {
  const el = document.getElementById('session-state');
  el.textContent = '';
  try {
    const me = await api.get('/auth/me');
    const label = document.createElement('span');
    label.textContent = me.email;
    const out = document.createElement('button');
    out.type = 'button';
    out.textContent = 'Log out';
    out.addEventListener('click', async () => {
      try {
        await api.post('/auth/logout');
      } finally {
        renderSession();
      }
    });
    el.append(label, out);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      el.textContent = 'Not signed in';
      return;
    }
    el.textContent = 'Server unreachable';
  }
}

// ── Boot ────────────────────────────────────────────────────────────────────
subscribe((state) => {
  renderMode(state);
  renderNote(state);
});
renderMode({ mode: 'match' });
renderSession();

// Re-render session bar when the wizard fires a session-change event.
window.addEventListener('session-change', () => renderSession());

// Initialise the profile wizard into the left-column slot.
const wizardSlot = document.getElementById('wizard-slot');
if (wizardSlot) initWizard(wizardSlot);
