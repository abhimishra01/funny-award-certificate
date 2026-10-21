// Browser test of the page (release gate). Run after a build: npm run test:browser
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { serve, launch, entry } from './e2e-lib.mjs';

const srv = await serve();
const browser = await launch();
let checks = 0;
const verbose = !!process.env.FC_VERBOSE;
const ok = (cond, msg) => { checks++; if (verbose) console.log('ok', msg); assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; if (verbose) console.log('eq', msg); assert.deepEqual(a, b, msg); };

async function newPage(opts = {}, ctxIn) {
  const ctx = ctxIn || await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...opts });
  await ctx.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; window.__printPages = document.querySelectorAll('#fc-print-pages img').length; window.__printClass = document.documentElement.classList.contains('fc-printing'); setTimeout(() => dispatchEvent(new Event('afterprint')), 50); }; });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('pageerror', (e) => page.errors.push(String(e)));
  page.on('requestfailed', (r) => page.errors.push('request failed: ' + r.url()));
  await page.goto(srv.url + entry);
  await page.waitForSelector('#tool[data-ready="true"]');
  return page;
}
const label = (page) => page.getAttribute('#fc-canvas', 'aria-label');
const pixels = (page) => page.evaluate(() => { const c = document.getElementById('fc-canvas'); return c.toDataURL().length + ':' + c.width + 'x' + c.height; });
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
async function download(page, sel) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]);
  const file = await d.path();
  return { name: d.suggestedFilename(), bytes: fs.readFileSync(file) };
}
const pdfInfo = (b) => {
  const s = b.toString('latin1');
  return {
    head: s.slice(0, 8),
    pages: (s.match(/\/Type \/Page /g) || []).length,
    box: (/\/MediaBox \[([^\]]+)\]/.exec(s) || [])[1],
    size: (/\/Width (\d+) \/Height (\d+)/.exec(s) || []).slice(1).map(Number),
  };
};
const pngSize = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)];

// ---------- first paint, both themes
for (const scheme of ['light', 'dark']) {
  const page = await newPage({ colorScheme: scheme });
  eq(await page.getAttribute('html', 'data-theme'), scheme, 'theme follows the system');
  ok((await label(page)).includes('The Reply All Survivor Award'), 'preview shows the default award');
  ok((await page.inputValue('#fc-date')).match(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/), 'date is filled in');
  eq(page.errors, [], `console errors (${scheme})`);
  await page.context().close();
}

// ---------- single certificate flow
{
  const page = await newPage();
  const before = await pixels(page);
  await page.fill('#fc-name', 'Ava Brooks');
  await settle(page);
  ok((await label(page)).includes('Ava Brooks'), 'name reaches the preview');
  ok((await pixels(page)) !== before, 'preview pixels change when typing');

  // Random award never repeats the previous one.
  let last = await page.inputValue('#fc-award');
  for (let i = 0; i < 15; i++) {
    await page.click('#fc-random');
    const now = await page.inputValue('#fc-award');
    ok(now && now !== last, `random gave a new award (${now})`);
    eq(await page.$eval('#fc-idea', (s) => s.options[s.selectedIndex].text), now, 'idea list follows the random pick');
    last = now;
  }
  // Audience switch refills the idea list.
  await page.selectOption('#fc-audience', 'students');
  const n = await page.$eval('#fc-idea', (s) => s.options.length);
  ok(n >= 31, `student ideas listed (${n - 1})`);
  await page.selectOption('#fc-idea', { label: 'Super Speller Award' });
  eq(await page.inputValue('#fc-award'), 'Super Speller Award', 'picking an idea sets the title');
  eq(await page.inputValue('#fc-reason'), 'For spelling words that stump the grown-ups.', 'and the reason');
  // Typing a custom title clears the idea pick.
  await page.fill('#fc-award', 'My Own Award');
  eq(await page.inputValue('#fc-idea'), '', 'custom title shows the placeholder');

  // Letter PDF and PNG.
  let pdf = await download(page, '#fc-pdf');
  eq(pdf.name, 'award-certificate-ava-brooks.pdf', 'pdf file name');
  eq(pdfInfo(pdf.bytes), { head: '%PDF-1.4', pages: 1, box: '0 0 792 612', size: [2200, 1700] }, 'letter pdf');
  let png = await download(page, '#fc-png');
  eq(png.name, 'award-certificate-ava-brooks.png', 'png file name');
  eq(pngSize(png.bytes), [2200, 1700], 'letter png size');

  // A4.
  await page.click('input[name="paper"][value="a4"]', { force: true });
  await settle(page);
  const ratio = await page.$eval('#fc-canvas', (c) => c.height / c.width);
  ok(Math.abs(ratio - 595.28 / 841.89) < 0.01, `A4 preview ratio ${ratio}`);
  pdf = await download(page, '#fc-pdf');
  eq(pdfInfo(pdf.bytes), { head: '%PDF-1.4', pages: 1, box: '0 0 841.89 595.28', size: [2339, 1654] }, 'a4 pdf');
  png = await download(page, '#fc-png');
  eq(pngSize(png.bytes), [2339, 1654], 'a4 png size');

  // Every design and color draws without errors and changes the picture.
  const seenPics = new Set();
  for (const d of ['classic', 'ribbon', 'modern', 'confetti', 'trophy', 'ink']) {
    await page.click(`input[name="design"][value="${d}"]`, { force: true });
    await settle(page);
    seenPics.add(await pixels(page));
  }
  eq(seenPics.size, 6, 'six different designs');
  for (const c of ['navy', 'red', 'green', 'purple', 'black']) await page.click(`input[name="color"][value="${c}"]`, { force: true });

  // Print a single page.
  await page.click('#fc-print');
  await page.waitForFunction(() => window.__printed === 1);
  eq(await page.evaluate(() => [window.__printPages, window.__printClass]), [1, true], 'print shows one page only');
  await page.waitForFunction(() => !document.getElementById('fc-print-pages'));
  ok(!(await page.evaluate(() => document.documentElement.classList.contains('fc-printing'))), 'print clean-up');
  eq(page.errors, [], 'console errors (single flow)');

  // Settings persist; names do not.
  await page.reload();
  await page.waitForSelector('#tool[data-ready="true"]');
  eq(await page.$eval('input[name="design"]:checked', (e) => e.value), 'ink', 'design remembered');
  eq(await page.$eval('input[name="paper"]:checked', (e) => e.value), 'a4', 'paper remembered');
  eq(await page.$eval('input[name="color"]:checked', (e) => e.value), 'black', 'color remembered');
  eq(await page.inputValue('#fc-audience'), 'students', 'audience remembered');
  eq(await page.inputValue('#fc-name'), '', 'name not saved');
  await page.click('#fc-reset');
  eq(await page.$eval('input[name="design"]:checked', (e) => e.value), 'classic', 'reset design');
  eq(await page.inputValue('#fc-audience'), 'office', 'reset audience');
  eq(await page.inputValue('#fc-award'), 'The Reply All Survivor Award', 'reset award');
  await page.context().close();
}

// ---------- batch flow
{
  const page = await newPage();
  await page.click('input[name="mode"][value="many"]', { force: true });
  ok(await page.isVisible('#fc-list'), 'list shows in Many names');
  ok(!(await page.isVisible('#fc-name')), 'single name hides');
  eq((await page.innerText('#fc-count')).trim(), 'No names yet.', 'empty list message');
  await page.fill('#fc-list', 'Name, Award\nAva Brooks\n"Lee, Sam", Math Magician Award\n\nLiam Chen\tBest Hugger Award\n');
  eq((await page.innerText('#fc-count')).trim(), '3 certificates.', 'count');
  await settle(page);
  ok(await page.isVisible('#fc-pager'), 'pager shows');
  eq(await page.innerText('#fc-page'), '1 of 3', 'pager 1');
  ok((await label(page)).includes('Ava Brooks') && (await label(page)).includes('The Reply All Survivor Award'), 'row 1 uses the form award');
  await page.click('#fc-next');
  await settle(page);
  eq(await page.innerText('#fc-page'), '2 of 3', 'pager 2');
  ok((await label(page)).includes('Lee, Sam') && (await label(page)).includes('Math Magician Award'), 'row 2 own award');
  await page.click('#fc-next');
  await settle(page);
  ok(await page.isDisabled('#fc-next'), 'next stops at the end');
  eq(await page.innerText('#fc-pdf'), 'Download PDF (3 pages)', 'pdf button counts pages');
  const pdf = await download(page, '#fc-pdf');
  eq(pdf.name, 'award-certificates-3.pdf', 'batch file name');
  eq(pdfInfo(pdf.bytes).pages, 3, 'batch pdf has 3 pages');
  ok(/PDF ready: 3 pages/.test(await page.innerText('#fc-status')), 'status says ready');

  // Random awards per person: different titles, stable until Shuffle.
  await page.fill('#fc-list', 'A\nB\nC\nD');
  await page.check('#fc-each');
  await settle(page);
  ok(await page.isVisible('#fc-shuffle'), 'shuffle shows');
  const titles = async () => {
    const out = [];
    for (let k = 0; k < 10 && !(await page.isDisabled('#fc-prev')); k++) { await page.click('#fc-prev'); await settle(page); }
    await settle(page);
    for (let i = 0; i < 4; i++) { await settle(page); out.push(await label(page)); if (i < 3) await page.click('#fc-next'); }
    return out;
  };
  const t1 = await titles();
  eq(new Set(t1).size, 4, 'four different certificates');
  const t1b = await titles();
  eq(t1b, t1, 'stable while nothing changes');
  await page.click('#fc-shuffle');
  const t2 = await titles();
  ok(JSON.stringify(t2) !== JSON.stringify(t1), 'shuffle changes the mix');

  await page.click('#fc-print');
  await page.waitForFunction(() => window.__printed === 1);
  eq(await page.evaluate(() => window.__printPages), 4, 'print all has 4 pages');
  eq(page.errors, [], 'console errors (batch)');
  await page.context().close();
}

// ---------- "Use this award" buttons in the article
{
  const page = await newPage();
  const btn = page.locator('[data-use-award="sports:0"]');
  await btn.click();
  eq(await page.inputValue('#fc-audience'), 'sports', 'audience from the article button');
  eq(await page.inputValue('#fc-award'), 'The Hustle Award', 'award from the article button');
  ok(await page.evaluate(() => document.activeElement?.id === 'fc-name'), 'focus moves to the name');
  const count = await page.locator('[data-use-award]').count();
  ok(count >= 40, `idea buttons: ${count}`);
  await page.context().close();
}

// ---------- phone layout: no sideways scroll, action bar visible, both themes
for (const scheme of ['light', 'dark']) {
  for (const w of [390, 320]) {
    const page = await newPage({ viewport: { width: w, height: 800 }, colorScheme: scheme, hasTouch: true, isMobile: true });
    const d = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    ok(d.sw <= d.iw, `${w} ${scheme}: scrollWidth ${d.sw} > ${d.iw}`);
    const box = await page.locator('.fc-actions').boundingBox();
    ok(box && box.y + box.height <= 800 + 1 && box.y > 600, `action bar fixed at the bottom (${box?.y})`);
    for (const id of ['#fc-pdf', '#fc-png', '#fc-print']) {
      const b = await page.locator(id).boundingBox();
      ok(b.height >= 44 && b.width >= 44, `${id} target ${b.width}x${b.height}`);
    }
    await page.context().close();
  }
}

// ---------- accessibility (axe): no serious or critical issues
{
  const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
  for (const scheme of ['light', 'dark']) {
    for (const path of ['', 'about/', 'privacy/']) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
      const page = await ctx.newPage();
      await page.goto(srv.url + entry + path);
      await page.addScriptTag({ path: axePath });
      const r = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      eq(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`), [], `axe /${path} ${scheme}`);
      await ctx.close();
    }
  }
}

// ---------- offline after load (the FAQ promises it)
{
  const page = await newPage();
  await page.context().setOffline(true);
  await page.fill('#fc-name', 'Offline Olive');
  const pdf = await download(page, '#fc-pdf');
  eq(pdfInfo(pdf.bytes).pages, 1, 'pdf works offline');
  await page.context().close();
}

await browser.close();
await srv.close();
console.log(`ui test: ${checks} checks passed`);
