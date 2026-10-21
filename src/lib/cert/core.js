// Pure logic for the certificate maker. No DOM here, so node tests can run it.
import { findAward } from './awards.js';

// Landscape page sizes in PDF points (1 pt = 1/72 inch).
export const PAPERS = {
  letter: { id: 'letter', label: 'US Letter', w: 792, h: 612 },
  a4: { id: 'a4', label: 'A4', w: 841.89, h: 595.28 },
};
export const DPI = 200;
export const MAX_BATCH = 300;

/** Pixel size of one page at a given DPI. */
export function pixelSize(paperId, dpi = DPI) {
  const p = PAPERS[paperId] || PAPERS.letter;
  return { w: Math.round((p.w / 72) * dpi), h: Math.round((p.h / 72) * dpi) };
}

/**
 * Largest font size (at most base, at least min) that makes text fit in maxW.
 * measure(text, size) returns the width of text at that size. Width grows in proportion to size.
 */
export function fitSize(measure, text, maxW, base, min) {
  const w = measure(text, base);
  if (w <= maxW || w === 0) return base;
  return Math.max(min, Math.floor(((base * maxW) / w) * 100) / 100);
}

/**
 * Break text into at most maxLines lines that fit maxW at the given size. Words are never split.
 * Returns { lines, size }. If the text does not fit, the size goes down until it does (not below min).
 * At min size the text may still overflow; the caller then squeezes each line horizontally.
 */
export function wrapLines(measure, text, maxW, base, min, maxLines) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], size: base };
  for (let size = base; ; size = Math.max(min, Math.floor(size * 0.94 * 100) / 100)) {
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (!cur || measure(next, size) <= maxW) cur = next;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    const fits = lines.length <= maxLines && lines.every((l) => measure(l, size) <= maxW);
    if (fits || size <= min) {
      if (lines.length > maxLines) {
        // Join the overflow into the last line; the caller squeezes it to fit.
        const head = lines.slice(0, maxLines - 1);
        head.push(lines.slice(maxLines - 1).join(' '));
        return { lines: head, size };
      }
      return { lines: lines.length === 2 ? balance(measure, words, size, maxW) || lines : lines, size };
    }
  }
}

// Two lines of about equal width read better than a long line and one orphan word.
function balance(measure, words, size, maxW) {
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const wa = measure(a, size), wb = measure(b, size);
    if (wa > maxW || wb > maxW) continue;
    const worst = Math.max(wa, wb);
    if (!best || worst < best.worst) best = { worst, lines: [a, b] };
  }
  return best && best.lines;
}

/** "October 21, 2026" style date in the given locale. */
export function formatDate(d, locale = 'en-US') {
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** File-name safe slug: "Zoë O'Brien" -> "zoe-obrien". */
export function slug(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40).replace(/-+$/, '');
}

export function fileName(name, ext, count = 1) {
  if (count > 1) return `award-certificates-${count}.${ext}`;
  const s = slug(name);
  return s ? `award-certificate-${s}.${ext}` : `award-certificate.${ext}`;
}

/** Small seeded random number generator (mulberry32). Returns numbers in [0, 1). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one item. Never returns the item equal to `last` when there is another choice. */
export function pickRandom(list, rng = Math.random, last = null) {
  if (!list.length) return null;
  const choices = list.length > 1 && last != null ? list.filter((x) => x !== last && x?.[0] !== last?.[0]) : list;
  return choices[Math.floor(rng() * choices.length)];
}

/** n awards from a pool, all different while n <= pool size (shuffled; then it starts a new round). */
export function assignAwards(n, pool, rng = Math.random) {
  const out = [];
  let bag = [];
  while (out.length < n && pool.length) {
    if (!bag.length) {
      bag = pool.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    out.push(bag.pop());
  }
  return out;
}

/** Split one CSV line, with "double quotes" around fields that contain commas. */
function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"' && !cur.trim()) { q = true; cur = ''; }
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Parse the batch list. One person per line: "Name", "Name, Award" or "Name<TAB>Award".
 * Returns { rows: [{ name, award, reason }], ignored } where award is '' when the line has none
 * and reason is the pool reason when the award matches a pool title (else '').
 */
export function parseBatch(text, max = MAX_BATCH) {
  const rows = [];
  let ignored = 0;
  const lines = String(text || '').split(/\r\n|\r|\n/);
  let first = true;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    let name, award;
    if (raw.includes('\t')) {
      const parts = raw.split('\t');
      name = parts[0];
      award = parts.slice(1).filter((s) => s.trim()).join(' ');
    } else {
      const parts = splitCsv(raw);
      name = parts[0];
      award = parts.slice(1).join(',');
    }
    name = name.trim().replace(/\s+/g, ' ');
    award = (award || '').trim().replace(/\s+/g, ' ');
    if (first) {
      first = false;
      if (/^(names?|recipients?|students?|players?)$/i.test(name) && (!award || /^(awards?|titles?)$/i.test(award))) continue;
    }
    if (!name && !award) continue;
    if (rows.length >= max) { ignored++; continue; }
    const hit = findAward(award);
    rows.push({ name: name.slice(0, 60), award: hit ? hit.title : award.slice(0, 70), reason: hit ? hit.reason : '' });
  }
  return { rows, ignored };
}

/**
 * Fill in the award for every batch row.
 * Rows with their own award keep it. Rows without one get the form award, or (random = true)
 * distinct random awards from the pool.
 */
export function resolveBatch(rows, form, { random = false, pool = [], rng = Math.random } = {}) {
  const need = rows.filter((r) => !r.award).length;
  const picks = random ? assignAwards(need, pool, rng) : [];
  let k = 0;
  return rows.map((r) => {
    if (r.award) return { ...form, name: r.name, award: r.award, reason: r.reason };
    if (random && picks[k]) { const [award, reason] = picks[k++]; return { ...form, name: r.name, award, reason }; }
    return { ...form, name: r.name };
  });
}
