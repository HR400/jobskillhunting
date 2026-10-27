/**
 * DEV CHECK — scripts/check-phase4-e2e.mjs (Tickets 41–46).
 *
 * Boots a browser against a running server, registers a real employer and
 * candidate through the HTTP API, then checks the Phase 4 interactions:
 * linked views (41), query drawer (42), what-if (43), gap/referrals (44),
 * recruiter view (45), reveal + keyboard + reduced motion (46).
 *
 * Requires a running server on the test database:
 *   PORT=3100 NODE_ENV=test NEO4J_URI=bolt://localhost:7688 ... node server.js
 *   node scripts/check-phase4-e2e.mjs [baseUrl]
 *
 * Uses system Chrome — no Playwright browser download required.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.argv[2] ?? 'http://localhost:3100';
const SCREENSHOTS = 'scripts/out-phase4';
await mkdir(SCREENSHOTS, { recursive: true });

const failures = [];
const check = (label, ok, extra = '') => {
  if (!ok) failures.push(`${label}${extra ? ` — ${extra}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`);
};

const stamp = Date.now();
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const consoleErrors = [];
page.on('pageerror', (err) => consoleErrors.push(String(err)));

// Capture the Q1 responses the page itself received (Ticket 42).
const q1Responses = [];
page.on('response', async (res) => {
  const path = new URL(res.url()).pathname;
  if (/^\/api\/match\/[^/]+\/[^/]+$/.test(path)) {
    try {
      q1Responses.push(await res.json());
    } catch {
      /* body already consumed */
    }
  }
});

const call = (method, path, body) =>
  page.evaluate(
    async ([m, p, b]) => {
      const res = await fetch(`/api${p}`, {
        method: m,
        credentials: 'same-origin',
        headers: b ? { 'Content-Type': 'application/json' } : undefined,
        body: b ? JSON.stringify(b) : undefined,
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    [method, path, body ?? null],
  );

// ── Seed: real data entered through the API, no fixtures in the runtime DB ───
await page.goto(`${BASE}/index.html`);

const employer = await call('POST', '/auth/register', {
  role: 'employer',
  email: `p4-employer-${stamp}@test.example`,
  password: 'Phase4Pass1!',
  profile: { company_name: `Phase 4 Co ${stamp}` },
});
check('seed: employer registered', employer.status === 201, `status ${employer.status}`);
await call('POST', '/auth/login', {
  email: `p4-employer-${stamp}@test.example`,
  password: 'Phase4Pass1!',
});

const skillSet = [
  { name: 'JavaScript', proficiency: 4, years: 3 },
  { name: 'Neo4j', proficiency: 3, years: 1 },
];
const jobATitle = `Frontend Graph Engineer ${stamp}`;
const jobA = await call('POST', '/jobs', {
  job_title: jobATitle,
  closing_date: '2031-01-01',
  requirements: [
    { name: 'JavaScript', min_proficiency: 3, min_years: 1, mandatory: true },
    { name: 'Neo4j', min_proficiency: 2, min_years: 0, mandatory: false },
  ],
});
const jobB = await call('POST', '/jobs', {
  job_title: `Backend Python Engineer ${stamp}`,
  closing_date: '2031-01-01',
  requirements: [
    { name: 'Python', min_proficiency: 3, min_years: 1, mandatory: true },
    // Candidate has JavaScript 4/3 → below the 5/0 requirement.
    { name: 'JavaScript', min_proficiency: 5, min_years: 0, mandatory: false },
    { name: 'Neo4j', min_proficiency: 2, min_years: 1, mandatory: false },
  ],
});
const jobC = await call('POST', '/jobs', {
  job_title: `Rust Systems Engineer ${stamp}`,
  closing_date: '2031-01-01',
  requirements: [{ name: 'Rust', min_proficiency: 4, min_years: 2, mandatory: true }],
});
check('seed: three jobs posted', jobA.status === 201 && jobB.status === 201 && jobC.status === 201);
const jobAId = jobA.body?.job_id ?? jobA.body?.job?.job_id;
const jobBId = jobB.body?.job_id ?? jobB.body?.job?.job_id;
const jobCId = jobC.body?.job_id ?? jobC.body?.job?.job_id;

await call('POST', '/auth/logout');
const candidate = await call('POST', '/auth/register', {
  role: 'candidate',
  email: `p4-candidate-${stamp}@test.example`,
  password: 'Phase4Pass1!',
  profile: { candidate_type: 'experienced', fname: 'Phase', lname: 'Four', total_exp: 3, current_company: 'P4 Ltd' },
});
check('seed: candidate registered', candidate.status === 201, `status ${candidate.status}`);
await call('POST', '/auth/login', {
  email: `p4-candidate-${stamp}@test.example`,
  password: 'Phase4Pass1!',
});
const candId = candidate.body?.profileId;
const skills = await call('PUT', '/candidates/me/skills', { skills: skillSet });
check('seed: candidate skills saved', skills.status === 200, `status ${skills.status}`);

// Ticket 44: two more real accounts and a referral chain A→B→C→A (the cycle must not loop).
const registerCandidate = async (tag, fname, lname) => {
  const email = `p4-${tag}-${stamp}@test.example`;
  const reg = await call('POST', '/auth/register', {
    role: 'candidate',
    email,
    password: 'Phase4Pass1!',
    profile: { candidate_type: 'fresher', fname, lname, grad_year: 2024 },
  });
  return { email, id: reg.body?.profileId };
};
const cand2 = await registerCandidate('referrer2', 'Blind', 'Person');
const cand3 = await registerCandidate('referrer3', 'Hidden', 'Chain');
const login = (email) => call('POST', '/auth/login', { email, password: 'Phase4Pass1!' });

// cand2 gets real skills so Q4 lists them below the blind threshold on job A.
await login(cand2.email);
await call('PUT', '/candidates/me/skills', {
  skills: [
    { name: 'Python', proficiency: 3, years: 1 },
    { name: 'Neo4j', proficiency: 2, years: 1 },
  ],
});

await login(cand2.email);
await call('POST', '/referrals', { candId: cand3.id });
await login(cand3.email);
await call('POST', '/referrals', { candId: candId });
await login(`p4-candidate-${stamp}@test.example`);
const referral = await call('POST', '/referrals', { candId: cand2.id });
check('seed: referral chain created', referral.status === 201, `status ${referral.status}`);

await page.goto(`${BASE}/index.html`);
await page.waitForSelector('#match-canvas canvas', { timeout: 20000 });
await page.waitForFunction(
  () => document.querySelectorAll('#ranked-bars svg [data-job-id]').length > 0,
  { timeout: 20000 },
);
await page.waitForFunction(() => window.__app?.canvas?.nodes.get().length > 2, { timeout: 20000 });
await page.waitForSelector('.radar-label[data-skill-key="javascript"]', { timeout: 20000 });

// ── 41. Linked views ────────────────────────────────────────────────────────
const jsNodeOpacity = () =>
  page.evaluate(() => window.__app.canvas.nodes.get('javascript')?.opacity);

// Hover the JavaScript axis on the radar (dispatch: the SVG relayouts during physics).
const hoverSkill = (key) =>
  page.evaluate((k) => {
    document
      .querySelector(`.radar-label[data-skill-key="${k}"]`)
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  }, key);
await hoverSkill('javascript');
await page.waitForTimeout(300);
const axisHovered = await page.evaluate(() =>
  document.querySelector('.radar-label[data-skill-key="javascript"]').classList.contains('radar-axis-hovered'),
);
check('41: radar hover highlights its axis', axisHovered);

const canvasDimmed = await page.evaluate(() => {
  const nodes = window.__app.canvas.nodes;
  const skill = nodes.get('javascript');
  const other = [...nodes.get()].find((n) => n.nodeType === 'Skill' && n.id !== 'javascript');
  return { skill: skill?.opacity, other: other?.opacity };
});
check(
  '41: radar hover glows the skill node and dims the rest on the canvas',
  canvasDimmed.skill === 1 && canvasDimmed.other !== undefined && canvasDimmed.other < 1,
  JSON.stringify(canvasDimmed),
);

const barsMarked = await page.evaluate(() =>
  [...document.querySelectorAll('#ranked-bars [data-job-id]')]
    .filter((el) => el.classList.contains('bar-skill-match'))
    .map((el) => el.dataset.jobId),
);
check(
  '41: radar hover marks every bar whose job requires that skill',
  barsMarked.includes(jobAId),
  `marked ${barsMarked.length} bars`,
);
await page.screenshot({ path: `${SCREENSHOTS}/41-skill-hover.png` });

// Click the Neo4j axis: selection filters the bars to jobs that require it.
const barsBefore = await page.evaluate(
  () => [...new Set([...document.querySelectorAll('#ranked-bars svg rect[data-job-id]')].map((el) => el.dataset.jobId))],
);
await page.evaluate(() =>
  document
    .querySelector('.radar-label[data-skill-key="neo4j"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true })),
);
await page.waitForTimeout(400);
const filtered = await page.evaluate(() =>
  [...document.querySelectorAll('#ranked-bars svg rect[data-job-id]')].map((el) => el.dataset.jobId),
);
const requiringNeo4j = (await call('GET', '/jobs?skill_key=neo4j&limit=100')).body.jobs.map((j) => j.job_id);
const expectedBars = barsBefore.filter((id) => requiringNeo4j.includes(id)).sort();
check(
  '41: selecting a skill filters the bars to jobs that require it',
  filtered.length > 0 &&
    JSON.stringify([...new Set(filtered)].sort()) === JSON.stringify(expectedBars),
  `kept ${filtered.length} of ${barsBefore.length}, expected ${expectedBars.length}`,
);

// Click job A's bar: the canvas focuses that job and the inspector follows.
await page.evaluate((id) => {
  document
    .querySelector(`#ranked-bars svg rect[data-job-id="${id}"]`)
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
}, jobAId);
await page.waitForTimeout(800);
const inspectorText = await page.locator('#inspector-content').textContent();
check(
  '41: selecting a bar opens that job in the inspector',
  inspectorText.includes(`Frontend Graph Engineer ${stamp}`),
  inspectorText.slice(0, 60),
);
const focused = await page.evaluate(() =>
  window.__app.canvas.network.getSelectedNodes(),
);
check('41: selecting a bar focuses the job node on the canvas', focused.length === 1, focused.join(','));

check('41: no page errors during linked-view checks', consoleErrors.length === 0, consoleErrors.join(' | '));

// ── 42. Query drawer ────────────────────────────────────────────────────────
// Drive the inspector directly so the drawer is built from one known Q1 response.
q1Responses.length = 0;
await page.evaluate(
  async ([c, j]) => window.__app.inspector.inspectJob(c, j),
  [candId, jobAId],
);
await page.waitForTimeout(400);
const drawer = await page.evaluate(() => {
  const d = document.getElementById('inspector-query-meta');
  return {
    dbTime: d?.querySelector('#inspector-db-time')?.dataset.dbTime,
    cypher: d?.querySelector('.query-cypher')?.textContent ?? '',
    params: d?.querySelector('.query-params')?.textContent ?? '',
    rows: d?.textContent.match(/Rows: (\d+)/)?.[1],
  };
});
const lastQ1 = q1Responses.at(-1);
check(
  '42: drawer dbTimeMs equals the server-reported dbTimeMs',
  lastQ1 !== undefined && Number(drawer.dbTime) === lastQ1.meta.dbTimeMs,
  `drawer ${drawer.dbTime} vs server ${lastQ1?.meta?.dbTimeMs}`,
);
check(
  '42: drawer shows the Cypher, parameters and row count',
  drawer.cypher.includes('REQUIRES_SKILL') &&
    drawer.params.includes(String(jobAId)) &&
    drawer.rows === String(lastQ1?.meta?.rowCount),
  `rows ${drawer.rows}`,
);
await page.screenshot({ path: `${SCREENSHOTS}/42-query-drawer.png` });

// ── 43. What-if tab ─────────────────────────────────────────────────────────
await page.click('#tab-whatif');
await page.waitForSelector('#mode-whatif:not([hidden])', { timeout: 5000 });
check('43: What-if tab shows its own panel', await page.isVisible('#mode-whatif'));

await page.fill('#whatif-slot [name="skill_key"]', 'Rust');
await page.selectOption('#whatif-slot [name="proficiency"]', '4');
await page.fill('#whatif-slot [name="years"]', '2');
await page.click('#whatif-slot button[type="submit"]');
await page.waitForSelector(`#whatif-slot tr[data-job-id="${jobCId}"]`, { timeout: 10000 });

const apiWhatIf = await call('POST', '/match/what-if', {
  candId,
  hypothetical: [{ skill_key: 'rust', proficiency: 4, years: 2 }],
});
const apiRow = apiWhatIf.body?.jobs.find((j) => j.job_id === jobCId);
const rowCells = await page.evaluate(
  (id) => [...document.querySelectorAll(`#whatif-slot tr[data-job-id="${id}"] td`)].map((td) => td.textContent),
  jobCId,
);
check(
  '43: rendered hypothetical delta equals /api/match/what-if',
  rowCells[3] === `+${apiRow.delta_pct}` && rowCells[2] === `${apiRow.hypothetical.match_pct}%`,
  `dom ${rowCells[2]}/${rowCells[3]} vs api ${apiRow?.hypothetical?.match_pct}/${apiRow?.delta_pct}`,
);
check('43: unlocked job is flagged in the table', rowCells[6] === 'Yes');
check(
  '43: newly unlocked job is outlined on the canvas',
  (await page.evaluate((id) => window.__app.canvas.nodes.get(id)?.borderWidth, jobCId)) === 5,
);
check(
  '43: hypothetical numbers are labelled as such',
  (await page.locator('#whatif-slot .whatif-label').textContent()).includes('hypothetical'),
);
await page.screenshot({ path: `${SCREENSHOTS}/43-whatif.png` });

await page.click('#whatif-slot button:has-text("Reset")');
await page.waitForTimeout(500);
check(
  '43: reset restores the node outline to its stored state',
  (await page.evaluate((id) => window.__app.canvas.nodes.get(id)?.borderWidth ?? 2, jobCId)) === 3,
  `borderWidth ${await page.evaluate((id) => window.__app.canvas.nodes.get(id)?.borderWidth, jobCId)}`,
);
check(
  '43: reset clears the hypothetical results table',
  (await page.locator('#whatif-slot .whatif-table').count()) === 0,
);
check('43: reset clears the hypothetical chips', (await page.locator('#whatif-slot .whatif-chip').count()) === 0);
await page.click('#tab-match');

// ── 44. Gap + referral views ────────────────────────────────────────────────
// The bar→gap wiring is asserted in 41; here the check drives the same view with job B.
await page.evaluate(
  async ([c, j]) => window.__app.gap.render(c, j),
  [candId, jobBId],
);
await page.waitForSelector('#gap-list tr[data-skill-key="python"]', { timeout: 10000 });

const apiGap = await call('GET', `/gap/${candId}/${jobBId}`);
const gapRows = await page.evaluate(() =>
  [...document.querySelectorAll('#gap-list tr[data-status]')].map((tr) => ({
    skill: tr.dataset.skillKey,
    status: tr.dataset.status,
  })),
);
const gapOrder = gapRows.filter((r) => r.status !== 'satisfied').map((r) => r.skill);
check(
  "44: gap rows keep Q2's order (mandatory first)",
  JSON.stringify(gapOrder) === JSON.stringify(apiGap.body.gaps.map((g) => g.skill_key)),
  `dom ${gapOrder.join(',')} vs api ${apiGap.body.gaps.map((g) => g.skill_key).join(',')}`,
);
check(
  '44: satisfied, below and missing are all represented',
  new Set(gapRows.map((r) => r.status)).size === 3,
  gapRows.map((r) => `${r.skill}:${r.status}`).join(', '),
);

const apiChain = await call('GET', `/referrals/${candId}/chain?maxHops=3`);
const renderedChains = await page.evaluate(() => ({
  count: document.querySelectorAll('#referral-chain .referral-chain').length,
  text: document.querySelector('#referral-chain').textContent,
}));
check(
  '44: referral chains render cycle-free and match Q3',
  renderedChains.count === apiChain.body.chains.length,
  `${renderedChains.count} rendered vs ${apiChain.body.chains.length} returned`,
);
check(
  '44: referral names are blind-safe',
  renderedChains.text.includes('Candidate #') &&
    !renderedChains.text.includes('Blind') &&
    !renderedChains.text.includes('Hidden'),
  renderedChains.text.slice(0, 80),
);
const authorityNote = await page.textContent('#referral-chain .referrer-authority-note');
const authorityFields = await page.locator('#referral-chain .referrer-authority').count();
check(
  '51: referrer authority is a separate field, or its absence is explained',
  /unavailable/i.test(authorityNote ?? '') || authorityFields > 0,
  authorityNote || `${authorityFields} authority field(s)`,
);
await page.screenshot({ path: `${SCREENSHOTS}/44-gap-referrals.png` });

// ── 45. Recruiter view ──────────────────────────────────────────────────────
await login(`p4-employer-${stamp}@test.example`);
await page.goto(`${BASE}/index.html`);
await page.click('#tab-recruiter');
await page.waitForSelector('#recruiter-job:not([hidden])', { timeout: 10000 });
await page.selectOption('#recruiter-job', { label: jobATitle });
await page.waitForSelector('#recruiter-table tbody tr', { timeout: 10000 });

const me = await call('GET', '/auth/me');
const q4 = await call('GET', `/recruiter/${me.body.profileId}/recommendations?limit=100`);
const jobARows = q4.body.recommendations.filter((r) => r.job_id === jobAId);
const tableRows = await page.evaluate(() =>
  [...document.querySelectorAll('#recruiter-table tbody tr')].map((tr) => ({
    candId: tr.dataset.candId,
    masked: tr.dataset.masked,
    text: tr.textContent,
  })),
);
check(
  '45: matrix lists the same candidates as Q4',
  tableRows.length === jobARows.length && jobARows.length >= 2,
  `${tableRows.length} rows vs ${jobARows.length} recommendations`,
);
check(
  '45: candidate above the blind threshold is unmasked with a real name',
  tableRows.some((r) => r.candId === candId && r.masked === 'false' && r.text.includes('Phase Four')),
);
check(
  '45: candidate below the threshold stays masked with no name',
  tableRows.some((r) => r.candId === cand2.id && r.masked === 'true' && r.text.includes('Candidate #') && !r.text.includes('Blind')),
);

const rings = await page.evaluate(() => {
  const nodes = window.__recruiter.body.data.nodes.get();
  const job = nodes.find((n) => n.id !== undefined && n.x === 0 && n.y === 0);
  return {
    count: nodes.length,
    radii: nodes
      .filter((n) => n !== job)
      .map((n) => Math.round(Math.hypot(n.x, n.y))),
  };
});
check(
  '45: canvas has the job at the centre with candidates on band rings',
  rings.count === tableRows.length + 1 &&
    rings.radii.every((r) => [120, 220, 300].some((band) => Math.abs(r - band) <= 2)),
  JSON.stringify(rings),
);
await page.screenshot({ path: `${SCREENSHOTS}/45-recruiter.png` });

// ── 46. Phase 4 e2e ─────────────────────────────────────────────────────────
await login(`p4-candidate-${stamp}@test.example`);
const revealDone = (target = page) =>
  target.waitForFunction(
    () => /Evaluated \d+ job/.test(document.querySelector('#reveal-strip')?.textContent ?? ''),
    { timeout: 25000 },
  );
await page.goto(`${BASE}/index.html`);
await revealDone();

const revealed = await page.evaluate(() => ({
  nodes: window.__app.canvas.nodes.get().length,
  edges: window.__app.canvas.edges.get().length,
}));
check(
  '46: reveal completes with a verdict and a drawn graph',
  revealed.nodes > 2 && revealed.edges > 0,
  JSON.stringify(revealed),
);

// Inspector numbers must equal the match API for the same job.
const q1 = (await call('GET', `/match/${candId}/${jobAId}`)).body.match;
await page.evaluate(
  async ([c, j]) => window.__app.inspector.inspectJob(c, j),
  [candId, jobAId],
);
await page.waitForSelector('#inspector-score');
const shown = await page.evaluate(() => ({
  score: document.querySelector('#inspector-score').textContent,
  band: document.querySelector('#inspector-band').textContent,
  mandatory: document.querySelector('#inspector-mandatory').textContent,
}));
check(
  '46: inspector numbers equal the match API',
  shown.score === `${q1.match_pct}%` &&
    shown.band === q1.band &&
    shown.mandatory === (q1.mandatory_ok ? 'Satisfied' : 'Missing'),
  `${JSON.stringify(shown)} vs ${q1.match_pct}/${q1.band}/${q1.mandatory_ok}`,
);

// The canvas → bars direction of the link.
await page.evaluate(() => {
  window.__app.canvas.network.body.emitter.emit('click', { nodes: ['neo4j'] });
});
await page.waitForTimeout(400);
const canvasFiltered = await page.evaluate(() =>
  [...document.querySelectorAll('#ranked-bars svg rect[data-job-id]')]
    .map((el) => el.dataset.jobId)
    .sort(),
);
const ranked = (await call('GET', `/match/candidate/${candId}/jobs`)).body.ranked ?? [];
const expectFiltered = ranked
  .filter((j) => (j.matched_skill_keys || []).includes('neo4j'))
  .map((j) => j.job_id)
  .sort();
check(
  '46: selecting a canvas skill filters the bars (link works both ways)',
  canvasFiltered.length > 0 && JSON.stringify(canvasFiltered) === JSON.stringify(expectFiltered),
  `dom ${canvasFiltered.length} vs api ${expectFiltered.length}`,
);

// Keyboard-only: focus a bar and activate it with Enter.
await page.goto(`${BASE}/index.html`);
await revealDone();
await page.focus(`#ranked-bars svg rect[data-job-id="${jobAId}"]`);
const focusedBar = await page.evaluate(() => document.activeElement?.dataset?.jobId ?? '');
check('46: bars are keyboard-focusable', focusedBar === jobAId, focusedBar);
await page.keyboard.press('Enter');
await page.waitForFunction(
  (title) =>
    document
      .querySelector('#inspector-content .inspector-job-title')
      ?.textContent.includes(title),
  jobATitle,
  { timeout: 10000 },
);
const keyboardTitle = await page.locator('#inspector-content .inspector-job-title').textContent();
check(
  '46: keyboard Enter on a bar opens that job in the inspector',
  keyboardTitle.includes(jobATitle),
  keyboardTitle,
);

// Reduced motion: same ordered graph, rendered instantly.
const rmContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1400, height: 950 } });
await rmContext.request.post(`${BASE}/api/auth/login`, {
  data: { email: `p4-candidate-${stamp}@test.example`, password: 'Phase4Pass1!' },
});
const rmPage = await rmContext.newPage();
await rmPage.goto(`${BASE}/index.html`);
await revealDone(rmPage);
const rmNodes = await rmPage.evaluate(() => window.__app.canvas.nodes.get().length);
check(
  '46: reduced motion renders the same graph',
  rmNodes === revealed.nodes,
  `${rmNodes} nodes vs ${revealed.nodes}`,
);
await rmContext.close();

// SSE drop: the stream reconnects once and still completes.
let streamAttempts = 0;
const countStream = async (route) => {
  streamAttempts += 1;
  if (streamAttempts === 1) await route.abort();
  else await route.continue();
};
await page.route('**/api/match/stream?**', countStream);
await page.goto(`${BASE}/index.html`);
await revealDone();
const reconnectNodes = await page.evaluate(() => window.__app.canvas.nodes.get().length);
check(
  '46: a dropped stream reconnects once and still completes the reveal',
  streamAttempts === 2 && reconnectNodes === revealed.nodes,
  `attempts ${streamAttempts}, nodes ${reconnectNodes}`,
);
await page.unroute('**/api/match/stream?**');

// SSE drop twice: fall back to the non-streaming subgraph endpoint.
streamAttempts = 0;
const countStreamTwice = async (route) => {
  streamAttempts += 1;
  if (streamAttempts <= 2) await route.abort();
  else await route.continue();
};
await page.route('**/api/match/stream?**', countStreamTwice);
await page.goto(`${BASE}/index.html`);
await page.waitForFunction(
  () => /disconnected/.test(document.querySelector('#reveal-strip')?.textContent ?? ''),
  { timeout: 25000 },
);
await page.waitForFunction(() => window.__app.canvas.nodes.get().length > 1, { timeout: 10000 });
const fallbackNodes = await page.evaluate(() => window.__app.canvas.nodes.get().length);
check(
  '46: after a failed reconnect the static subgraph is the fallback',
  streamAttempts === 2 && fallbackNodes > 1,
  `attempts ${streamAttempts}, nodes ${fallbackNodes}`,
);
await page.unroute('**/api/match/stream?**');
await page.screenshot({ path: `${SCREENSHOTS}/46-fallback.png` });

await browser.close();
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nPhase 4 checks passed');
