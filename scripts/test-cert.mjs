// Known-answer tests for the certificate maker core (spec section 5). Run: npm test
import assert from 'node:assert/strict';
import { AUDIENCES, ALL_AWARDS, findAward } from '../src/lib/cert/awards.js';
import { PAPERS, pixelSize, fitSize, wrapLines, formatDate, slug, fileName, seeded, pickRandom, assignAwards, parseBatch, resolveBatch } from '../src/lib/cert/core.js';
import { buildPdf } from '../src/lib/cert/pdf.js';
import { drawCertificate, describe, DESIGNS, COLORS } from '../src/lib/cert/draw.js';

let passed = 0;
const t = (name, fn) => {
  try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}\n  ${e.message}`); process.exitCode = 1; }
};
const latin1 = (u8) => Buffer.from(u8).toString('latin1');

// ---------- pages and pixels ----------
t('paper sizes in points', () => {
  assert.deepEqual([PAPERS.letter.w, PAPERS.letter.h], [792, 612]);
  assert.deepEqual([PAPERS.a4.w, PAPERS.a4.h], [841.89, 595.28]);
});
t('pixels at 200 DPI', () => {
  assert.deepEqual(pixelSize('letter', 200), { w: 2200, h: 1700 });
  assert.deepEqual(pixelSize('a4', 200), { w: 2339, h: 1654 });
  assert.deepEqual(pixelSize('nope', 72), { w: 792, h: 612 });
});

// ---------- PDF ----------
const fakeJpeg = (n) => { const b = new Uint8Array(n); b[0] = 0xff; b[1] = 0xd8; b[n - 2] = 0xff; b[n - 1] = 0xd9; for (let i = 2; i < n - 2; i++) b[i] = (i * 7) & 0xff; return b; };
const checkXref = (s) => {
  const at = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(s)[1]);
  assert.equal(s.slice(at, at + 4), 'xref');
  const m = /xref\n0 (\d+)\n/.exec(s.slice(at));
  const size = Number(m[1]);
  const rows = s.slice(at).split('\n').slice(2, 2 + size);
  assert.equal(rows[0], '0000000000 65535 f ');
  for (let id = 1; id < size; id++) {
    const off = Number(rows[id].slice(0, 10));
    assert.equal(s.slice(off, off + `${id} 0 obj`.length), `${id} 0 obj`, `object ${id} offset`);
  }
  assert.match(s, new RegExp(`/Size ${size} `));
  return size;
};
t('PDF: one Letter page', () => {
  const s = latin1(buildPdf([{ jpeg: fakeJpeg(1000), w: 2200, h: 1700 }], PAPERS.letter));
  assert.ok(s.startsWith('%PDF-1.4\n'));
  assert.equal((s.match(/\/MediaBox \[0 0 792 612\]/g) || []).length, 1);
  assert.equal((s.match(/\/Type \/Page /g) || []).length, 1);
  assert.match(s, /\/Width 2200 \/Height 1700 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode \/Length 1000 >>/);
  assert.equal(checkXref(s), 7);
});
t('PDF: three A4 pages, offsets right after binary data', () => {
  const pages = [500, 1234, 77].map((n) => ({ jpeg: fakeJpeg(n), w: 2339, h: 1654 }));
  const s = latin1(buildPdf(pages, PAPERS.a4, 'Café (test)'));
  assert.equal((s.match(/\/MediaBox \[0 0 841.89 595.28\]/g) || []).length, 3);
  assert.match(s, /\/Count 3 /);
  assert.match(s, /\/Title \(Caf \\\(test\\\)\)/);
  assert.equal(checkXref(s), 13);
  // The JPEG bytes sit unchanged between "stream\n" and "\nendstream".
  const i = s.indexOf('/Length 1234 >>\nstream\n') + '/Length 1234 >>\nstream\n'.length;
  assert.equal(s.slice(i + 1234, i + 1234 + 10), '\nendstream');
});

// ---------- text fitting ----------
const mono = (t, size) => t.length * size * 0.5; // each character is half the font size wide
t('fit: text that fits keeps the base size', () => assert.equal(fitSize(mono, 'Ava', 1000, 70, 20), 70));
t('fit: text twice too wide gets half size', () => assert.equal(fitSize(mono, 'x'.repeat(40), 700, 70, 20), 35));
t('fit: never below the minimum', () => assert.equal(fitSize(mono, 'x'.repeat(400), 700, 70, 20), 20));
t('wrap: one line when it fits', () => assert.deepEqual(wrapLines(mono, 'Best Helper Award', 1000, 40, 20, 2), { lines: ['Best Helper Award'], size: 40 }));
t('wrap: two lines, words never split', () => {
  const r = wrapLines(mono, 'The Could Have Been an Email Award', 400, 40, 20, 2);
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines.join(' '), 'The Could Have Been an Email Award');
  for (const l of r.lines) assert.ok(mono(l, r.size) <= 400);
  assert.equal(r.size, 40);
});
t('wrap: shrinks when two lines are not enough', () => {
  const text = 'one two three four five six seven eight nine ten';
  const r = wrapLines(mono, text, 200, 40, 10, 2);
  assert.ok(r.size < 40 && r.size >= 10);
  assert.ok(r.lines.length <= 2);
  assert.equal(r.lines.join(' '), text);
});
t('wrap: at the minimum, the overflow joins the last line (never cut)', () => {
  const text = 'aaaa bbbb cccc dddd eeee ffff';
  const r = wrapLines(mono, text, 20, 40, 10, 2);
  assert.equal(r.size, 10);
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines.join(' '), text);
});
t('wrap: empty text', () => assert.deepEqual(wrapLines(mono, '  ', 100, 40, 10, 2), { lines: [], size: 40 }));

// ---------- dates and file names ----------
t('date en-US', () => assert.equal(formatDate(new Date(2026, 9, 21), 'en-US'), 'October 21, 2026'));
t('slug', () => {
  assert.equal(slug("Zoë O'Brien"), 'zoe-obrien');
  assert.equal(slug('  ** '), '');
  assert.equal(slug('A'.repeat(60)).length, 40);
});
t('file names', () => {
  assert.equal(fileName("Zoë O'Brien", 'pdf'), 'award-certificate-zoe-obrien.pdf');
  assert.equal(fileName('', 'pdf'), 'award-certificate.pdf');
  assert.equal(fileName('Ava', 'pdf', 24), 'award-certificates-24.pdf');
  assert.equal(fileName('李雷', 'png'), 'award-certificate.png');
});

// ---------- batch parsing ----------
t('batch: name only and name with award', () => {
  const { rows, ignored } = parseBatch('Ana\nBen, Best Helper');
  assert.equal(ignored, 0);
  assert.deepEqual(rows, [{ name: 'Ana', award: '', reason: '' }, { name: 'Ben', award: 'Best Helper', reason: '' }]);
});
t('batch: tab separated from a spreadsheet', () => {
  const { rows } = parseBatch('Ana Ruiz\tSuper Speller Award\nBen\t\t');
  assert.deepEqual(rows[0], { name: 'Ana Ruiz', award: 'Super Speller Award', reason: 'For spelling words that stump the grown-ups.' });
  assert.deepEqual(rows[1], { name: 'Ben', award: '', reason: '' });
});
t('batch: quoted name with a comma', () => {
  const { rows } = parseBatch('"Lee, Sam", Math Magician Award\n"O""Neil, Pat"');
  assert.equal(rows[0].name, 'Lee, Sam');
  assert.equal(rows[0].award, 'Math Magician Award');
  assert.equal(rows[1].name, 'O"Neil, Pat');
});
t('batch: an award with a comma stays whole', () => assert.equal(parseBatch('Ana, Fast, Faster, Fastest').rows[0].award, 'Fast, Faster, Fastest'));
t('batch: header line and blank lines are skipped', () => {
  const { rows } = parseBatch('Name, Award\n\n  \nAna\r\n\r\nBen\r\n');
  assert.deepEqual(rows.map((r) => r.name), ['Ana', 'Ben']);
});
t('batch: pool award matched without case, gets its reason', () => {
  const { rows } = parseBatch('Ana, the coffee hero award');
  assert.equal(rows[0].award, 'The Coffee Hero Award');
  assert.equal(rows[0].reason, 'For making a fresh pot after taking the last cup.');
});
t('batch: 305 lines gives 300 rows and 5 ignored', () => {
  const text = Array.from({ length: 305 }, (_, i) => `Person ${i + 1}`).join('\n');
  const { rows, ignored } = parseBatch(text);
  assert.equal(rows.length, 300);
  assert.equal(ignored, 5);
});
t('batch: long name and award are cut to the field limits', () => {
  const { rows } = parseBatch('N'.repeat(80) + ', ' + 'A'.repeat(90));
  assert.equal(rows[0].name.length, 60);
  assert.equal(rows[0].award.length, 70);
});
t('batch: resolve uses the form award or distinct random awards', () => {
  const form = { heading: 'H', award: 'Form Award', reason: 'R', name: '' };
  const rows = parseBatch('Ana\nBen, Own Award\nCy').rows;
  const plain = resolveBatch(rows, form);
  assert.deepEqual(plain.map((r) => [r.name, r.award, r.reason]), [['Ana', 'Form Award', 'R'], ['Ben', 'Own Award', ''], ['Cy', 'Form Award', 'R']]);
  assert.equal(plain[0].heading, 'H');
  const pool = AUDIENCES[0].awards;
  const rnd = resolveBatch(rows, form, { random: true, pool, rng: seeded(3) });
  assert.equal(rnd[1].award, 'Own Award');
  assert.notEqual(rnd[0].award, rnd[2].award);
  assert.ok(pool.some(([t2, r]) => t2 === rnd[0].award && r === rnd[0].reason));
  // Same seed, same result.
  assert.deepEqual(resolveBatch(rows, form, { random: true, pool, rng: seeded(3) }), rnd);
});

// ---------- random ----------
t('random: never the same as the last pick', () => {
  const pool = AUDIENCES[1].awards;
  const rng = seeded(42);
  let last = pool[0];
  for (let i = 0; i < 500; i++) { const p = pickRandom(pool, rng, last); assert.notEqual(p[0], last[0]); last = p; }
});
t('random: a pool of one still returns it', () => assert.deepEqual(pickRandom([['A', 'a']], seeded(1), ['A', 'a']), ['A', 'a']));
t('random: n people get n different awards within the pool size', () => {
  const pool = AUDIENCES[2].awards;
  const got = assignAwards(pool.length, pool, seeded(9));
  assert.equal(new Set(got.map((a) => a[0])).size, pool.length);
  const more = assignAwards(pool.length + 5, pool, seeded(9));
  assert.equal(more.length, pool.length + 5);
});
t('random: seeded generator is repeatable and in [0, 1)', () => {
  const a = seeded(5), b = seeded(5);
  for (let i = 0; i < 100; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});

// ---------- award pools ----------
const BLOCK = /\b(fat|fatty|skinny|weight|diet|ugly|stupid|dumb|idiot|lazy|loser|worst|drunk|beer|wine|booze|hangover|cocktail|shots?|bald|wrinkl\w*|old|elderly|smelly|stinky|broke|poor|crazy|insane|psycho|nerd|failure|hate|kill|dead|die|sick|ill|disease|grades?|fail\w*|demon|sexy|hot)\b/i;
t('pools: counts', () => {
  assert.equal(AUDIENCES.length, 5);
  for (const a of AUDIENCES) assert.ok(a.awards.length >= 30, `${a.id} has ${a.awards.length}`);
  assert.ok(ALL_AWARDS.length >= 180, `total ${ALL_AWARDS.length}`);
});
t('pools: unique titles across all audiences', () => {
  const seen = new Map();
  for (const a of ALL_AWARDS) {
    const k = a.title.toLowerCase();
    assert.ok(!seen.has(k), `duplicate: ${a.title} (${seen.get(k)} and ${a.audience})`);
    seen.set(k, a.audience);
  }
});
t('pools: lengths, punctuation and kindness', () => {
  for (const a of ALL_AWARDS) {
    assert.ok(a.title.length <= 48, `title too long: ${a.title}`);
    assert.ok(a.reason.length <= 110, `reason too long: ${a.reason}`);
    assert.ok(/Award$/.test(a.title), `title should end with Award: ${a.title}`);
    assert.ok(/^For /.test(a.reason) && /[.!]$/.test(a.reason), `reason form: ${a.reason}`);
    assert.ok(!/[–—]/.test(a.title + a.reason), `dash in: ${a.title}`);
    assert.ok(!BLOCK.test(a.title) && !BLOCK.test(a.reason), `blocked word in: ${a.title} / ${a.reason}`);
  }
});
t('pools: findAward', () => {
  assert.equal(findAward('  best hugger award ').title, 'Best Hugger Award');
  assert.equal(findAward('Nope'), null);
  assert.equal(findAward(''), null);
});

// ---------- drawing (fake canvas) ----------
function fakeCtx() {
  const texts = [];
  const ctx = new Proxy({ font: '10px serif', texts }, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * (parseFloat(/(\d+(\.\d+)?)px/.exec(o.font)[1]) * 0.5) });
      if (k === 'fillText') return (s, x, y) => { if (![x, y].every(Number.isFinite)) throw new Error('bad text position'); texts.push(String(s)); };
      return (...args) => { if (args.some((a) => typeof a === 'number' && !Number.isFinite(a))) throw new Error(`${String(k)} got ${args}`); };
    },
    set(o, k, v) { o[k] = v; return true; },
  });
  return ctx;
}
t('draw: every design and color draws the text, no NaN', () => {
  const cert = { heading: 'Certificate of Achievement', presented: 'Presented to', name: 'Ava Brooks', award: 'The Coffee Hero Award', reason: 'For making a fresh pot.', date: 'October 21, 2026', sig1: 'Team Lead', sig2: 'Principal' };
  for (const d of DESIGNS) for (const c of COLORS) for (const [w, h] of [[2200, 1700], [2339, 1654], [300, 232]]) {
    const ctx = fakeCtx();
    drawCertificate(ctx, w, h, cert, { design: d.id, color: c.id });
    const all = ctx.texts.join('');
    for (const s of ['Ava Brooks', 'The Coffee Hero Award', 'Principal', 'Team Lead', 'October 21, 2026']) assert.ok(all.includes(s), `${d.id} misses ${s}`);
  }
});
t('draw: empty name shows a hint only in the preview', () => {
  const a = fakeCtx();
  drawCertificate(a, 1100, 850, { name: '' }, { preview: true });
  assert.ok(a.texts.includes('Name goes here'));
  const b = fakeCtx();
  drawCertificate(b, 1100, 850, { name: '' }, {});
  assert.ok(!b.texts.includes('Name goes here'));
});
t('draw: never draws a credit or URL on the certificate', () => {
  const ctx = fakeCtx();
  drawCertificate(ctx, 1100, 850, { name: 'A', award: 'B' }, { design: 'classic' });
  assert.ok(!/bingemind|http|www\.|\.com/i.test(ctx.texts.join(' ')));
});
t('draw: very long text is still drawn whole', () => {
  const ctx = fakeCtx();
  const long = 'W'.repeat(60);
  drawCertificate(ctx, 1100, 850, { name: long, award: 'Award '.repeat(12).trim(), reason: 'reason '.repeat(20).trim() }, { design: 'modern' });
  assert.ok(ctx.texts.includes(long));
});
t('describe', () => assert.equal(describe({ name: 'Ava', award: 'Best Hugger Award', date: 'May 1, 2026', sig2: ' ' }), 'Ava. Best Hugger Award. Date: May 1, 2026'));

console.log(`${passed} tests passed${process.exitCode ? ', some failed' : ''}`);
