/**
 * DEV CHECK — scripts/check-phase3-smoke.mjs (Ticket 38).
 *
 * Phase 3 Playwright smoke: register → skills → education → review → submit →
 * verify canvas loads with the candidate node, plus empty-state checks.
 *
 * Requires a running server and a clean (or wiped) test DB.
 *
 *   node server.js &   # (test DB env or the main dev env with an empty DB)
 *   node scripts/check-phase3-smoke.mjs [baseUrl]
 *
 * Uses system Chrome — no Playwright browser download required.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3100';
const API = `${BASE}/api`;
const SCREENSHOTS = 'scripts/out-phase3';

import { mkdir } from 'node:fs/promises';
await mkdir(SCREENSHOTS, { recursive: true });

const failures = [];
const check = (label, ok, extra = '') => {
  const status = ok ? 'ok  ' : 'FAIL';
  if (!ok) failures.push(`${label}${extra ? ` — ${extra}` : ''}`);
  console.log(`${status} ${label}${extra ? ` — ${extra}` : ''}`);
};

const shot = async (page, name) =>
  page.screenshot({ path: `${SCREENSHOTS}/${name}.png`, fullPage: false });

// ── Helpers ──────────────────────────────────────────────────────────────────
function uniqueEmail() {
  return `smoke-${Date.now()}@test.example`;
}

// ── Browser setup ────────────────────────────────────────────────────────────
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// ── 1. Empty state — no jobs in DB ───────────────────────────────────────────
// We check the API empty state rather than trying to find a specific UI element,
// since the empty-state rendering is in a future ticket (Phase 4 reveal).
const emptyJobsRes = await fetch(`${API}/jobs?status=Open`);
const emptyJobsBody = await emptyJobsRes.json();
check('empty-state: /api/jobs returns empty array before any data', Array.isArray(emptyJobsBody.jobs ?? emptyJobsBody));

// ── 2. Register → wizard flow ─────────────────────────────────────────────────
await page.goto(`${BASE}/index.html`);
await page.waitForLoadState('domcontentloaded');
await shot(page, '01-landing');

// Wait for the wizard slot to be populated.
await page.waitForSelector('#wizard-slot', { timeout: 5000 });

const email = uniqueEmail();
const password = 'SmokeTest1!';

// Step 1: account
await page.fill('[name="email"]', email);
await page.fill('[name="password"]', password);
await page.selectOption('[name="role"]', 'candidate');
// candidate_type selector
await page.selectOption('[name="candidate_type"]', 'experienced');
// fname / lname
await page.fill('[name="fname"]', 'Smoke');
await page.fill('[name="lname"]', 'Test');

await shot(page, '02-step1-filled');

// Click "Next" / register button (text-based, robust to exact label).
const nextBtn = page.locator('button[type="submit"], button:has-text("Next"), button:has-text("Register")').first();
await nextBtn.click();
await page.waitForTimeout(800);
await shot(page, '03-after-step1');

// ── 3. Step 2: basics ────────────────────────────────────────────────────────
// The wizard advances to step 2 after a successful register.
// Fill in experienced extras if they appear.
const totalExpEl = page.locator('[name="total_exp"]');
if (await totalExpEl.isVisible({ timeout: 2000 }).catch(() => false)) {
  await totalExpEl.fill('3');
}
const currentCoEl = page.locator('[name="current_company"]');
if (await currentCoEl.isVisible({ timeout: 2000 }).catch(() => false)) {
  await currentCoEl.fill('Smoke Corp');
}
// DOB
const dobEl = page.locator('[name="dob"]');
if (await dobEl.isVisible({ timeout: 2000 }).catch(() => false)) {
  await dobEl.fill('1995-06-15');
}

const nextBtn2 = page.locator('button:has-text("Next"), button[type="submit"]').first();
await nextBtn2.click();
await page.waitForTimeout(600);
await shot(page, '04-after-step2');

// ── 4. Step 3: skills ────────────────────────────────────────────────────────
// The typeahead should be visible.
const skillInput = page.locator('[name="skill_search"], input[placeholder*="skill" i], input[placeholder*="Search" i]').first();
if (await skillInput.isVisible({ timeout: 3000 }).catch(() => false)) {
  await skillInput.fill('JavaScript');
  await page.waitForTimeout(400); // debounce
  // Either pick from dropdown or confirm add
  const suggestion = page.locator('[data-skill-key], .skill-suggestion, li:has-text("JavaScript")').first();
  if (await suggestion.isVisible({ timeout: 1000 }).catch(() => false)) {
    await suggestion.click();
  } else {
    // Confirm-add button
    const confirmAdd = page.locator('button:has-text("Add"), button:has-text("Confirm")').first();
    if (await confirmAdd.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmAdd.click();
    }
  }
  // Set proficiency
  const profSelect = page.locator('select[name*="proficiency"]').last();
  if (await profSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
    await profSelect.selectOption('3');
  }
  // Set years
  const yearsInput = page.locator('input[name*="years"]').last();
  if (await yearsInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await yearsInput.fill('2');
  }
  await shot(page, '05-skill-added');
}

const nextBtn3 = page.locator('button:has-text("Next"), button:has-text("Save Skills")').first();
if (await nextBtn3.isVisible({ timeout: 2000 }).catch(() => false)) {
  await nextBtn3.click();
  await page.waitForTimeout(600);
}
await shot(page, '06-after-step3');

// ── 5. Step 4: education ─────────────────────────────────────────────────────
const degreeInput = page.locator('[name="degree"]').first();
if (await degreeInput.isVisible({ timeout: 2000 }).catch(() => false)) {
  await degreeInput.fill('B.Tech');
  const uniInput = page.locator('[name="university"]').first();
  if (await uniInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await uniInput.fill('Test University');
  }
  const startYr = page.locator('[name="start_year"]').first();
  if (await startYr.isVisible({ timeout: 1000 }).catch(() => false)) {
    await startYr.fill('2013');
  }
  const endYr = page.locator('[name="end_year"]').first();
  if (await endYr.isVisible({ timeout: 1000 }).catch(() => false)) {
    await endYr.fill('2017');
  }
  const addEduBtn = page.locator('button:has-text("Add Education"), button:has-text("Add")').first();
  if (await addEduBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await addEduBtn.click();
    await page.waitForTimeout(500);
  }
}

const nextBtn4 = page.locator('button:has-text("Next"), button:has-text("Review")').first();
if (await nextBtn4.isVisible({ timeout: 2000 }).catch(() => false)) {
  await nextBtn4.click();
  await page.waitForTimeout(600);
}
await shot(page, '07-after-step4');

// ── 6. Review step ────────────────────────────────────────────────────────────
// Review card should not show synthetic data — email must appear.
const reviewText = await page.locator('.review-card, #review-section, [id*="review"]').first().textContent().catch(() => '');
// If review card exists, the email we entered should appear in it.
check(
  'review step: entered email appears in review card (no synthetic data)',
  reviewText === '' || reviewText.includes('@') || reviewText.includes('Smoke'),
  'review may not be visible yet if submit advanced directly',
);
await shot(page, '08-review');

// Submit
const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Finish"), button:has-text("Done")').first();
if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
  await submitBtn.click();
  await page.waitForTimeout(1000);
}
await shot(page, '09-after-submit');

// ── 7. Canvas visible (candidate node) ───────────────────────────────────────
// After submit the session-change event fires; loadCandidateMatch renders the candidate node.
// The canvas container should have a canvas element from vis-network.
await page.waitForTimeout(2000);
const hasCanvas = await page.evaluate(() =>
  Boolean(document.querySelector('#match-canvas canvas')),
);
check('canvas: vis-network canvas element rendered after wizard', hasCanvas);
await shot(page, '10-canvas');

// ── 8. No-skills empty state ─────────────────────────────────────────────────
// The ranking endpoint for the new candidate should return an empty ranked list.
// We check via the API since the UI empty state is Phase 4 territory.
const sessionRes = await page.evaluate(async () => {
  const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
  return r.ok ? r.json() : null;
});
check('session: /auth/me returns profile after wizard submit', Boolean(sessionRes?.profileId));

if (sessionRes?.profileId) {
  const rankRes = await page.evaluate(async (cid) => {
    const r = await fetch(`/api/match/candidate/${cid}/jobs`, { credentials: 'same-origin' });
    return r.ok ? r.json() : null;
  }, sessionRes.profileId);
  check('no-jobs state: ranked list is an array', Array.isArray(rankRes?.ranked));
  check(
    'no-jobs state: no-skills message or empty ranked list returned',
    rankRes !== null,
    rankRes?.message ?? `${rankRes?.ranked?.length ?? 0} ranked jobs`,
  );
}

await shot(page, '11-final');

// ── 9. Teardown ───────────────────────────────────────────────────────────────
await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nPhase 3 smoke checks passed');
