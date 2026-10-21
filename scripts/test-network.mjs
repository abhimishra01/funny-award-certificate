// Privacy test (spec section 6). Records every request while certificates with a marker name are made.
// Fails if a request carries the marker, has a body, or goes to a host other than the page's own.
import assert from 'node:assert/strict';
import { serve, launch, SECRET, entry } from './e2e-lib.mjs';

const srv = await serve();
const browser = await launch();
const ctx = await browser.newContext({ acceptDownloads: true, locale: 'en-US' });
// window.print would block a headless run; stand in for it and fire afterprint like a real browser.
await ctx.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; setTimeout(() => dispatchEvent(new Event('afterprint')), 50); }; });
const page = await ctx.newPage();
const seen = [];
ctx.on('request', (r) => seen.push({ url: r.url(), headers: r.headers(), body: r.postData() || '' }));
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(srv.url + entry);
await page.waitForSelector('#tool[data-ready="true"]');
await page.fill('#fc-name', SECRET);
await page.fill('#fc-award', SECRET + ' Award');
await page.fill('#fc-sig2', SECRET);
await Promise.all([page.waitForEvent('download'), page.click('#fc-pdf')]);
await Promise.all([page.waitForEvent('download'), page.click('#fc-png')]);
await page.click('#fc-print');
await page.waitForFunction(() => window.__printed === 1);
await page.check('input[name="mode"][value="many"]', { force: true });
await page.fill('#fc-list', `${SECRET}\n"${SECRET}, Jr", Best Hugger Award\n${SECRET} Two`);
await page.check('#fc-each');
await Promise.all([page.waitForEvent('download'), page.click('#fc-pdf')]);
await page.click('#fc-print');
await page.waitForFunction(() => window.__printed === 2);
await page.waitForTimeout(300);

const allowed = new Set([new URL(srv.url).host]);
const problems = [];
const enc = [SECRET, encodeURIComponent(SECRET), SECRET.replace(/ /g, '+'), 'Zebulon', 'zebulon'];
for (const r of seen) {
  if (r.url.startsWith('data:') || r.url.startsWith('blob:')) continue;
  const host = new URL(r.url).host;
  if (!allowed.has(host)) problems.push(`host not allowed: ${r.url}`);
  const text = r.url + JSON.stringify(r.headers) + r.body;
  if (enc.some((m) => text.includes(m))) problems.push(`marker in request: ${r.url}`);
  if (r.body) problems.push(`request has a body: ${r.url}`);
}
await browser.close();
await srv.close();
assert.deepEqual(problems, [], problems.join('\n'));
assert.deepEqual(errors, [], 'console errors: ' + errors.join(' | '));
console.log(`network test: ${seen.length} requests, none carry user data, all to ${[...allowed].join(', ')}`);
