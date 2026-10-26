/**
 * DEV CHECK — scripts/check-layout-shell.mjs (Ticket 32).
 *
 * Asserts the layout shell done-when on a running server (default
 * http://localhost:3100): no horizontal overflow at desktop and 360 px,
 * light/dark both render, reduced motion zeroes transitions, and the ARIA tab
 * list is keyboard usable. Uses the system Chrome — no Playwright download.
 *
 *   NEO4J_URI=... NEO4J_PASSWORD=... node server.js &   # then:
 *   node scripts/check-layout-shell.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3100';
const failures = [];
const check = (label, ok, extra = '') => {
  if (!ok) failures.push(`${label}${extra ? ` — ${extra}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });

// ── Desktop, light ──────────────────────────────────────────────────────────
const light = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await light.goto(`${BASE}/index.html`);
const desk = await light.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  innerW: window.innerWidth,
  cols: getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns.split(' ').length,
}));
check('desktop: no horizontal overflow', desk.scrollW <= desk.innerW, `${desk.scrollW}px vs ${desk.innerW}px`);
check('desktop: three columns', desk.cols === 3, `${desk.cols} tracks`);
await light.screenshot({ path: 'scripts/out-shell-light.png' });

// Keyboard: tab order and arrow keys on the ARIA tab list.
await light.keyboard.press('Tab'); // first tab
const firstTab = await light.evaluate(() => document.activeElement?.dataset.mode ?? null);
check('keyboard: first tab stop is the active tab', firstTab === 'match', `got ${firstTab}`);
await light.keyboard.press('ArrowRight');
check('keyboard: ArrowRight selects Gap', await light.evaluate(() => document.body.dataset.mode === 'gap'));
await light.keyboard.press('End');
check('keyboard: End selects Report', await light.evaluate(() => document.body.dataset.mode === 'report'));
await light.keyboard.press('Home');
check('keyboard: Home selects My match', await light.evaluate(() => document.body.dataset.mode === 'match'));

// ── Dark mode ───────────────────────────────────────────────────────────────
const dark = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
await dark.goto(`${BASE}/index.html`);
const darkBg = await dark.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('dark: page background flips to a dark token', darkBg === 'rgb(39, 39, 41)', darkBg); // --color-page → tile-1
await dark.screenshot({ path: 'scripts/out-shell-dark.png' });

// ── 360 px ──────────────────────────────────────────────────────────────────
const small = await browser.newPage({ viewport: { width: 360, height: 740 } });
await small.goto(`${BASE}/index.html`);
const narrow = await small.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  innerW: window.innerWidth,
  cols: getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns.split(' ').length,
}));
check('360px: no horizontal overflow', narrow.scrollW <= narrow.innerW, `${narrow.scrollW}px vs ${narrow.innerW}px`);
check('360px: single column', narrow.cols === 1, `${narrow.cols} columns`);
await small.screenshot({ path: 'scripts/out-shell-360.png' });

// Inspector drawer opens at narrow widths (wait out the 250 ms transition).
await small.click('#inspector-toggle');
await small.waitForTimeout(400);
const drawerOpen = await small.evaluate(() => {
  const box = document.getElementById('inspector').getBoundingClientRect();
  return document.body.classList.contains('inspector-open') && box.left < window.innerWidth;
});
check('360px: inspector drawer opens', drawerOpen);
await small.screenshot({ path: 'scripts/out-shell-360-drawer.png' });

// ── Reduced motion ──────────────────────────────────────────────────────────
const still = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
await still.goto(`${BASE}/index.html`);
const t = await still.evaluate(() => getComputedStyle(document.querySelector('.inspector')).transitionDuration);
check('reduced motion: inspector transition is instant', parseFloat(t) <= 0.0001, t);

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nlayout shell checks passed');
