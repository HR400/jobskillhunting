/**
 * public/js/app.js — layout shell behaviour (Tickets 32, 37).
 *
 * Wires the §10.2 tab list to the store, keeps the ARIA tabs pattern keyboard
 * usable (roving tabindex + arrow keys), toggles the slide-out inspector and
 * reflects the session state through the API client.
 *
 * Ticket 37: initialises D3 bar and radar charts; updates them from API data.
 */
import { api, ApiError } from './api.js';
import { setState, subscribe } from './store.js';
import { initWizard } from './forms.js';
import { initCanvas } from './canvas.js';
import { initInspector } from './inspector.js';
import { initBars } from './charts/bars.js';
import { initRadar } from './charts/radar.js';
import { initGapList } from './charts/gap.js';
import { initReferralChain } from './charts/referral.js';
import { startReveal } from './reveal.js';
import { renderUnscored, mountEmptyState } from './ingestUi.js';
import { initWhatIf } from './whatif.js';
import { initRecruiter } from './recruiter.js';

let activeCandidateId = null;
let canvasInstance = null;
let inspectorInstance = null;
let barsInstance = null;
let radarInstance = null;
let gapInstance = null;
let referralInstance = null;
let lastRanking = [];
let barsFilterSkill = null;

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
  for (const panel of document.querySelectorAll('.mode-panel')) {
    panel.hidden = panel.id !== `mode-${state.mode}`;
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
  gap: '',
  network: '',
  whatif: '',
  recruiter: '',
  explore: 'Explore arrives in Phase 6 behind the capabilities check.',
  report: 'The report is built in Phase 7 (public/report.html).',
};

function renderNote(state) {
  const note = document.getElementById('view-note');
  if (state.mode === 'report') {
    note.innerHTML = 'Research report: <a href="/report.html" target="_blank" rel="noopener">Open public/report.html</a> (print-to-PDF ready).';
    note.hidden = false;
  } else {
    note.textContent = NOTES[state.mode] ?? '';
    note.hidden = !note.textContent;
  }
}

// ── Inspector drawer ────────────────────────────────────────────────────────
const toggle = document.getElementById('inspector-toggle');
toggle.addEventListener('click', () => {
  const open = document.body.classList.toggle('inspector-open');
  toggle.setAttribute('aria-expanded', String(open));
});

// ── Load match graph & inspector ────────────────────────────────────────────
async function loadCandidateMatch(candId) {
  activeCandidateId = candId;
  try {
    const ranking = await api.get(`/match/candidate/${encodeURIComponent(candId)}/jobs`);
    lastRanking = ranking.ranked ?? [];
    renderUnscored(document.getElementById('unscored-jobs'), ranking.unscored ?? []);
    const topJob = lastRanking[0];

    // Populate the ranked-bars chart with real API data.
    if (barsInstance) {
      barsFilterSkill = null;
      barsInstance.render(lastRanking);
    }

    // Start the match reveal animation (Ticket 40)
    if (canvasInstance) {
      const verdictStrip = document.getElementById('reveal-strip');
      startReveal({
        candId,
        canvas: canvasInstance,
        verdictStrip,
        onComplete: async (_totals) => {
          if (topJob) {
            if (inspectorInstance) {
              inspectorInstance.inspectJob(candId, topJob.job_id);
            }
            gapInstance?.render(candId, topJob.job_id);
            await updateRadar(candId, topJob.job_id);
          }
          referralInstance?.render(candId);
        },
        onError: () => {
          // Fallback if SSE stream fails: render static subgraph
          if (topJob) {
            api.get(`/match/${encodeURIComponent(candId)}/${encodeURIComponent(topJob.job_id)}/subgraph`)
              .then((subgraph) => canvasInstance.render(subgraph))
              .catch(() => {});
          } else {
            canvasInstance.render({
              nodes: [{ id: candId, type: 'Candidate', label: 'You' }],
              edges: [],
            });
          }
        },
      });
    }
  } catch (err) {
    console.error('Failed to load candidate match graph:', err);
  }
}

/** Fetch Q1 breakdown and render the radar chart. */
async function updateRadar(candId, jobId) {
  if (!radarInstance) return;
  try {
    const res = await api.get(`/match/${encodeURIComponent(candId)}/${encodeURIComponent(jobId)}`);
    const breakdown = res.match?.breakdown ?? res.breakdown ?? [];
    radarInstance.render(breakdown);
  } catch {
    radarInstance.clear();
  }
}

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
        activeCandidateId = null;
        renderSession();
      }
    });
    el.append(label, out);

    if (me.role === 'candidate' && me.profileId) {
      loadCandidateMatch(me.profileId);
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      el.textContent = 'Not signed in';
      return;
    }
    el.textContent = 'Server unreachable';
  }
}

// ── Linked views (Ticket 41, plan §10.5) ────────────────────────────────────
// One store drives every view: hover highlights, selection filters and focuses.
function applyLinks(state) {
  const target = state.hover ?? state.selection;
  canvasInstance?.highlight(target?.id ?? null);
  if (state.selection?.type === 'Job') canvasInstance?.focus(state.selection.id);

  const skill = state.selection?.type === 'Skill' ? state.selection.id : null;
  if (skill !== barsFilterSkill) {
    barsFilterSkill = skill;
    barsInstance?.render(
      skill === null
        ? lastRanking
        : lastRanking.filter((j) => (j.matched_skill_keys || []).includes(skill)),
    );
  }
}

// ── Boot ────────────────────────────────────────────────────────────────────
subscribe((state) => {
  renderMode(state);
  renderNote(state);
  applyLinks(state);
});
renderMode({ mode: 'match' });

// Initialize Inspector
const inspectorSlot = document.getElementById('inspector-content');
if (inspectorSlot) {
  inspectorInstance = initInspector(inspectorSlot);
}

// Initialize Canvas
const canvasSlot = document.getElementById('match-canvas');
if (canvasSlot) {
  canvasInstance = initCanvas(canvasSlot, {
  onSelectNode: (node) => {
    setState({ selection: { type: node.nodeType, id: node.id } });
    if (node.nodeType === 'Job' && activeCandidateId) {
      inspectorInstance?.inspectJob(activeCandidateId, node.id);
      // Ticket 37: update radar when a job is selected on canvas.
      updateRadar(activeCandidateId, node.id);
      gapInstance?.render(activeCandidateId, node.id);
    } else {
      inspectorInstance?.renderNode(node);
    }
  },
  onHoverNode: (hover) => setState({ hover }),
});
}

// Ticket 37: Initialize D3 charts.
const barsSlot = document.getElementById('ranked-bars');
if (barsSlot) {
  barsInstance = initBars(barsSlot);
}
const radarSlot = document.getElementById('skill-radar');
if (radarSlot) {
  radarInstance = initRadar(radarSlot);
}
const gapSlot = document.getElementById('gap-list');
if (gapSlot) {
  gapInstance = initGapList(gapSlot);
}
const referralSlot = document.getElementById('referral-chain');
if (referralSlot) {
  referralInstance = initReferralChain(referralSlot);
}

// Ticket 37: when the user selects a job from the bars chart, also update radar.
window.addEventListener('bars-select', (e) => {
  if (e.detail?.jobId && activeCandidateId) {
    updateRadar(activeCandidateId, e.detail.jobId);
    inspectorInstance?.inspectJob(activeCandidateId, e.detail.jobId);
    gapInstance?.render(activeCandidateId, e.detail.jobId);
  }
});

// Ticket 49: show the no-jobs state, with Import only when a feed is configured.
const emptyStateSlot = document.getElementById('empty-state');
if (emptyStateSlot) mountEmptyState(emptyStateSlot);

renderSession();

// Re-render session bar when the wizard fires a session-change event.
window.addEventListener('session-change', (e) => {
  renderSession();
  if (e.detail?.profileId && e.detail?.role === 'candidate') {
    loadCandidateMatch(e.detail.profileId);
  }
});

// Ticket 43: What-if tab.
const whatIfSlot = document.getElementById('whatif-slot');
if (whatIfSlot) {
  initWhatIf(whatIfSlot, {
    getCandId: () => activeCandidateId,
    onResults: (res) => {
      // Ticket 43: newly unlocked jobs are outlined (and drawn if absent); reset clears.
      canvasInstance?.showHypothetical(res ? res.jobs : null);
    },
  });
}

// Ticket 45: recruiter view.
const recruiterPanel = document.getElementById('mode-recruiter');
if (recruiterPanel) initRecruiter(recruiterPanel);

// Initialise the profile wizard into the left-column slot.
const wizardSlot = document.getElementById('wizard-slot');
if (wizardSlot) initWizard(wizardSlot);

// Check seam for the Playwright tickets (41–46): read real view state, never drive it.
window.__app = {
  get canvas() { return canvasInstance; },
  get bars() { return barsInstance; },
  get radar() { return radarInstance; },
  get inspector() { return inspectorInstance; },
  get gap() { return gapInstance; },
  get referral() { return referralInstance; },
};

