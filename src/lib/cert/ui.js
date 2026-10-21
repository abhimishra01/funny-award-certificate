// Wires the form, the live preview and the exports. Everything runs in the browser; nothing is sent anywhere.
import { AUDIENCES } from './awards.js';
import { PAPERS, DPI, pixelSize, formatDate, fileName, pickRandom, parseBatch, resolveBatch, seeded, MAX_BATCH } from './core.js';
import { drawCertificate, describe, SCRIPT_FAMILY } from './draw.js';
import { buildPdf } from './pdf.js';

const KEY = 'fac-settings-v1';
const SAVED = ['design', 'color', 'paper', 'namestyle', 'audience', 'heading', 'presented', 'sig1', 'sig2'];
// US Letter where people use it; A4 everywhere else.
const LETTER_REGIONS = ['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'PR', 'GT', 'CR', 'PA', 'DO', 'SV', 'NI', 'HN'];
const localPaper = () => {
  try { return LETTER_REGIONS.includes(new Intl.Locale(navigator.language).maximize().region) ? 'letter' : 'a4'; } catch { return 'letter'; }
};
const DEFAULTS = {
  design: 'classic', color: 'navy', paper: localPaper(), namestyle: 'serif', audience: 'office',
  heading: 'Certificate of Achievement', presented: 'This award is proudly presented to', sig1: 'Awards Committee', sig2: '',
};

const $ = (id) => document.getElementById(id);
const radio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;
const setRadio = (name, v) => { const el = document.querySelector(`input[name="${name}"][value="${v}"]`); if (el) el.checked = true; };
const nextFrame = () => new Promise((r) => setTimeout(r, 0));

export function initTool() {
  const tool = $('tool');
  if (!tool) return;
  const canvas = $('fc-canvas');
  const stage = $('fc-stage');
  const f = {
    audience: $('fc-audience'), idea: $('fc-idea'), award: $('fc-award'), reason: $('fc-reason'),
    name: $('fc-name'), list: $('fc-list'), each: $('fc-each'), namesOnly: $('fc-namesonly'), heading: $('fc-heading'),
    presented: $('fc-presented'), date: $('fc-date'), sig1: $('fc-sig1'), sig2: $('fc-sig2'),
  };
  const status = $('fc-status');
  let lastPick = null;
  let batch = [];
  let page = 0;
  let seed = 1;
  let busy = false;

  // ---------- settings ----------
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const save = () => {
    const s = { design: radio('design'), color: radio('color'), paper: radio('paper'), namestyle: radio('namestyle'), audience: f.audience.value,
      heading: f.heading.value, presented: f.presented.value, sig1: f.sig1.value, sig2: f.sig2.value };
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  };
  const apply = (s) => {
    for (const k of SAVED) {
      if (typeof s[k] !== 'string') continue;
      if (k === 'design' || k === 'color' || k === 'paper' || k === 'namestyle') setRadio(k, s[k]);
      else if (k === 'audience') { if (AUDIENCES.some((a) => a.id === s[k])) f.audience.value = s[k]; }
      else f[k].value = s[k];
    }
  };

  // ---------- award ideas ----------
  const pool = () => (AUDIENCES.find((a) => a.id === f.audience.value) || AUDIENCES[0]).awards;
  const fillIdeas = () => {
    const awards = pool();
    f.idea.replaceChildren();
    const ph = new Option(`Pick from ${awards.length} ideas`, '');
    f.idea.add(ph);
    awards.forEach(([t], i) => f.idea.add(new Option(t, String(i))));
    syncIdea();
  };
  const syncIdea = () => {
    const i = pool().findIndex(([t]) => t === f.award.value.trim());
    f.idea.value = i >= 0 ? String(i) : '';
  };
  const useAward = (pair) => {
    if (!pair) return;
    lastPick = pair;
    f.award.value = pair[0];
    f.reason.value = pair[1];
    syncIdea();
    refreshBatch();
    schedule();
  };

  // ---------- current certificates ----------
  const form = () => ({
    heading: f.heading.value, presented: f.presented.value, name: f.name.value, award: f.award.value,
    reason: f.reason.value, date: f.date.value, sig1: f.sig1.value, sig2: f.sig2.value,
  });
  const many = () => radio('mode') === 'many';
  const refreshBatch = () => {
    const { rows, ignored, nameColumns } = parseBatch(f.list.value, MAX_BATCH, { namesOnly: f.namesOnly.checked });
    // "Brooks, Ava" from a school export reads as name Brooks with award Ava. Offer the fix; do not guess.
    $('fc-namesonly-row').hidden = !(nameColumns || f.namesOnly.checked);
    // A fixed seed keeps the random awards stable while you type; Shuffle picks a new seed.
    batch = resolveBatch(rows, form(), { random: f.each.checked, pool: pool(), rng: seeded(seed * 2654435761) });
    if (page >= batch.length) page = Math.max(0, batch.length - 1);
    const n = batch.length;
    $('fc-count').textContent = n
      ? `${n} certificate${n === 1 ? '' : 's'}${ignored ? `. ${ignored} line${ignored === 1 ? '' : 's'} over the limit of ${MAX_BATCH} left out.` : '.'}`
      : 'No names yet.';
    $('fc-shuffle').hidden = !f.each.checked;
  };
  const certs = () => (many() ? (batch.length ? batch : [form()]) : [form()]);

  // ---------- script lettering (loaded from this site only when picked) ----------
  let scriptReady = null;
  const loadScript = () => {
    if (!scriptReady) {
      const faces = [
        ['great-vibes-latin.woff2', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122'],
        ['great-vibes-latin-ext.woff2', 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+1EF2-1EFF'],
      ].map(([file, unicodeRange]) => new FontFace(SCRIPT_FAMILY, `url(${import.meta.env.BASE_URL}fonts/${file})`, { unicodeRange }));
      faces.forEach((ff) => document.fonts.add(ff));
      // Load the faces the text needs. If it fails (offline before first use), the serif stands in.
      scriptReady = document.fonts.load(`40px "${SCRIPT_FAMILY}"`, 'AaŁł').catch(() => {}).then(() => schedule());
    }
    return scriptReady;
  };
  const nameStyle = () => radio('namestyle') || 'serif';
  const fontsFor = async (list) => {
    if (nameStyle() !== 'script') return;
    await loadScript();
    await Promise.all(list.slice(0, 50).map((c) => document.fonts.load(`40px "${SCRIPT_FAMILY}"`, String(c.name || 'A')).catch(() => {})));
  };

  // ---------- preview ----------
  let queued = false;
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(render); } };
  function render() {
    queued = false;
    const paper = radio('paper') || 'letter';
    stage.dataset.paper = paper;
    const list = certs();
    const c = list[Math.min(page, list.length - 1)];
    const { w: pw, h: ph } = pixelSize(paper, 72);
    const cssW = stage.clientWidth || 600;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cssW * dpr);
    const H = Math.round((cssW * ph / pw) * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    drawCertificate(canvas.getContext('2d'), W, H, c, { design: radio('design'), color: radio('color'), nameStyle: nameStyle(), preview: true });
    canvas.setAttribute('aria-label', 'Certificate preview: ' + (describe(c) || 'empty'));
    const pager = $('fc-pager');
    pager.hidden = !(many() && batch.length > 1);
    $('fc-page').textContent = `${Math.min(page, list.length - 1) + 1} of ${list.length}`;
    $('fc-prev').disabled = page <= 0;
    $('fc-next').disabled = page >= list.length - 1;
    $('fc-pdf').textContent = many() && batch.length > 1 ? `Download PDF (${batch.length} pages)` : 'Download PDF';
    $('fc-print').textContent = many() && batch.length > 1 ? 'Print all' : 'Print';
  }
  const thumbs = [...document.querySelectorAll('.fc-thumb')];
  const renderThumbs = () => {
    const paper = radio('paper') || 'letter';
    const { w, h } = pixelSize(paper, 72);
    for (const t of thumbs) {
      const W = 240, H = Math.round(240 * h / w);
      t.width = W; t.height = H;
      drawCertificate(t.getContext('2d'), W, H, { heading: 'Certificate', name: 'Name', award: 'Award title', date: ' ', sig1: ' ' },
        { design: t.dataset.design, color: radio('color') });
    }
  };

  // ---------- exports ----------
  const work = document.createElement('canvas');
  const workCtx = work.getContext('2d', { willReadFrequently: true });
  const band = document.createElement('canvas');
  const renderPage = (c) => {
    const paper = radio('paper') || 'letter';
    const { w, h } = pixelSize(paper, DPI);
    work.width = w; work.height = h;
    drawCertificate(workCtx, w, h, c, { design: radio('design'), color: radio('color'), nameStyle: nameStyle() });
    return { w, h };
  };
  const blobOf = (type, q, cv = work) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the image.'))), type, q));
  const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());
  const download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  };
  const say = (t) => { status.textContent = t; };
  const guard = async (btn, fn) => {
    if (busy) return;
    busy = true;
    tool.setAttribute('aria-busy', 'true');
    for (const b of document.querySelectorAll('.fc-actions button')) b.disabled = true;
    try { await fn(); } catch (e) { say(`Sorry, that did not work: ${e.message}`); }
    finally {
      busy = false;
      tool.removeAttribute('aria-busy');
      for (const b of document.querySelectorAll('.fc-actions button')) b.disabled = false;
    }
  };
  // JPEG quality 0.85 keeps print-sharp text at about half the file size of 0.92.
  const jpegPages = async (list, asBytes) => {
    const pages = [];
    for (let i = 0; i < list.length; i++) {
      if (list.length > 1) say(`Making page ${i + 1} of ${list.length}…`);
      const { w, h } = renderPage(list[i]);
      const blob = await blobOf('image/jpeg', 0.85);
      pages.push(asBytes ? { w, h, jpeg: new Uint8Array(await blob.arrayBuffer()) } : { w, h, blob });
      await nextFrame();
    }
    return pages;
  };

  // Batch PDF: every page shares the same art, heading, date and signature lines. Draw that once as a
  // background, then store per page only the band of pixels that differs from it (name, award, reason).
  // Each band is cut from that page's full render, so the printed page matches the preview exactly.
  // A class of 30 drops from about 7 MB to about 3 MB.
  const sharedPages = async (list) => {
    const { w, h } = renderPage({ ...list[0], name: '', award: '', reason: '' });
    const bg = new Uint32Array(workCtx.getImageData(0, 0, w, h).data.buffer);
    const background = { w, h, jpeg: await bytesOf(await blobOf('image/jpeg', 0.85)) };
    const pages = [];
    const snap = (v) => Math.floor(v / 16) * 16;
    const WHITE = 0xffffffff;
    for (let i = 0; i < list.length; i++) {
      say(`Making page ${i + 1} of ${list.length}…`);
      renderPage(list[i]);
      const cur = new Uint32Array(workCtx.getImageData(0, 0, w, h).data.buffer);
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          if (cur[row + x] !== bg[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
        }
      }
      if (x1 < 0) { x0 = 0; y0 = 0; x1 = 15; y1 = 15; }
      // Pad by one JPEG block and snap to the 16 px grid, so the band edge falls on matching blocks.
      x0 = snap(Math.max(0, x0 - 16)); y0 = snap(Math.max(0, y0 - 16));
      x1 = Math.min(w, snap(x1 + 32)); y1 = Math.min(h, snap(y1 + 32));
      // Keep every band edge on plain white paper, with 3 px of white on both sides of it. PDF viewers
      // blend an image edge into what is under it, so an edge on art (the trophy, a seal) can show a
      // faint line. Grow the band past any art it touches.
      const rowWhite = (y) => { if (y < 0 || y >= h) return true; for (let x = Math.max(0, x0 - 3); x < Math.min(w, x1 + 3); x++) if (cur[y * w + x] !== WHITE) return false; return true; };
      const colWhite = (x) => { if (x < 0 || x >= w) return true; for (let y = Math.max(0, y0 - 3); y < Math.min(h, y1 + 3); y++) if (cur[y * w + x] !== WHITE) return false; return true; };
      const strip = (at, fn) => { for (let d = -3; d < 3; d++) if (!fn(at + d)) return false; return true; };
      for (let grew = true; grew;) {
        grew = false;
        if (y0 > 0 && !strip(y0, rowWhite)) { y0 = Math.max(0, y0 - 16); grew = true; }
        if (y1 < h && !strip(y1, rowWhite)) { y1 = Math.min(h, y1 + 16); grew = true; }
        if (x0 > 0 && !strip(x0, colWhite)) { x0 = Math.max(0, x0 - 16); grew = true; }
        if (x1 < w && !strip(x1, colWhite)) { x1 = Math.min(w, x1 + 16); grew = true; }
      }
      band.width = x1 - x0; band.height = y1 - y0;
      band.getContext('2d').drawImage(work, x0, y0, band.width, band.height, 0, 0, band.width, band.height);
      pages.push({ x: x0, y: y0, w: band.width, h: band.height, jpeg: await bytesOf(await blobOf('image/jpeg', 0.85, band)) });
      await nextFrame();
    }
    return { pages, background };
  };

  $('fc-pdf').addEventListener('click', () => guard($('fc-pdf'), async () => {
    const list = certs();
    await fontsFor(list);
    const paperBox = PAPERS[radio('paper')] || PAPERS.letter;
    let pdf;
    if (list.length > 1) {
      const { pages, background } = await sharedPages(list);
      pdf = buildPdf(pages, paperBox, 'Award certificate', { background });
    } else pdf = buildPdf(await jpegPages(list, true), paperBox, 'Award certificate');
    download(new Blob([pdf], { type: 'application/pdf' }), fileName(list[0].name, 'pdf', list.length));
    say(list.length > 1 ? `PDF ready: ${list.length} pages.` : 'PDF ready. Check your downloads.');
  }));

  $('fc-png').addEventListener('click', () => guard($('fc-png'), async () => {
    const list = certs();
    await fontsFor(list);
    const c = list[Math.min(page, list.length - 1)];
    renderPage(c);
    download(await blobOf('image/png'), fileName(c.name, 'png'));
    say(many() && list.length > 1 ? `PNG ready for certificate ${page + 1}.` : 'PNG ready. Check your downloads.');
  }));

  $('fc-print').addEventListener('click', () => guard($('fc-print'), async () => {
    const list = certs();
    await fontsFor(list);
    const pages = await jpegPages(list);
    const paper = radio('paper') === 'a4' ? 'A4' : 'letter';
    let box = document.getElementById('fc-print-pages');
    box?.remove();
    box = document.createElement('div');
    box.id = 'fc-print-pages';
    const urls = [];
    await Promise.all(pages.map((p) => new Promise((res) => {
      const img = new Image();
      img.alt = '';
      img.onload = img.onerror = res;
      img.src = URL.createObjectURL(p.blob);
      urls.push(img.src);
      box.append(img);
    })));
    document.body.append(box);
    let style = document.getElementById('fc-print-style');
    if (!style) { style = document.createElement('style'); style.id = 'fc-print-style'; document.head.append(style); }
    style.textContent = `@page { size: ${paper} landscape; margin: 0; }`;
    document.documentElement.classList.add('fc-printing');
    const done = () => {
      document.documentElement.classList.remove('fc-printing');
      box.remove();
      urls.forEach((u) => URL.revokeObjectURL(u));
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    say(list.length > 1 ? `Printing ${list.length} pages. In the print window, choose Landscape and no margins if asked.` : 'Opening the print window. Choose Landscape and no margins if asked.');
    window.print();
    // Some browsers do not fire afterprint; clean up after a while anyway.
    setTimeout(() => { if (document.documentElement.classList.contains('fc-printing')) done(); }, 60000);
  }));

  // Ctrl+P, Cmd+P or the browser menu skip the Print button. Print the certificate on screen anyway,
  // not the web page. A canvas paints at once, so it is ready before the print layout is made.
  window.addEventListener('beforeprint', () => {
    if (document.documentElement.classList.contains('fc-printing')) return;
    const list = certs();
    const { w, h } = renderPage(list[Math.min(page, list.length - 1)]);
    const sheet = document.createElement('canvas');
    sheet.width = w; sheet.height = h;
    sheet.getContext('2d').drawImage(work, 0, 0);
    const box = document.createElement('div');
    box.id = 'fc-print-pages';
    box.append(sheet);
    document.getElementById('fc-print-pages')?.remove();
    document.body.append(box);
    let style = document.getElementById('fc-print-style');
    if (!style) { style = document.createElement('style'); style.id = 'fc-print-style'; document.head.append(style); }
    style.textContent = `@page { size: ${radio('paper') === 'a4' ? 'A4' : 'letter'} landscape; margin: 0; }`;
    document.documentElement.classList.add('fc-printing');
    const done = () => {
      document.documentElement.classList.remove('fc-printing');
      box.remove();
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
  });

  // ---------- events ----------
  const onText = () => { refreshBatch(); schedule(); };
  for (const k of ['name', 'heading', 'presented', 'date', 'sig1', 'sig2', 'reason']) f[k].addEventListener('input', onText);
  f.award.addEventListener('input', () => { syncIdea(); onText(); });
  for (const k of ['heading', 'presented', 'sig1', 'sig2']) f[k].addEventListener('change', save);
  f.audience.addEventListener('change', () => { fillIdeas(); lastPick = null; refreshBatch(); save(); schedule(); });
  f.idea.addEventListener('change', () => { if (f.idea.value !== '') useAward(pool()[Number(f.idea.value)]); });
  $('fc-random').addEventListener('click', () => useAward(pickRandom(pool(), Math.random, lastPick || pool().find(([t]) => t === f.award.value.trim()))));
  for (const el of document.querySelectorAll('input[name="design"], input[name="color"], input[name="paper"], input[name="namestyle"]')) {
    el.addEventListener('change', () => {
      save();
      if (el.name === 'namestyle' && el.value === 'script') loadScript();
      if (el.name === 'color' || el.name === 'paper') renderThumbs();
      schedule();
    });
  }
  for (const el of document.querySelectorAll('input[name="mode"]')) {
    el.addEventListener('change', () => {
      $('fc-one').hidden = many();
      $('fc-many').hidden = !many();
      page = 0;
      refreshBatch();
      schedule();
    });
  }
  f.list.addEventListener('input', onText);
  f.each.addEventListener('change', onText);
  f.namesOnly.addEventListener('change', onText);
  $('fc-shuffle').addEventListener('click', () => { seed++; onText(); });
  $('fc-prev').addEventListener('click', () => { if (page > 0) { page--; schedule(); } });
  $('fc-next').addEventListener('click', () => { if (page < certs().length - 1) { page++; schedule(); } });
  $('fc-form').addEventListener('submit', (e) => e.preventDefault());
  $('fc-reset').addEventListener('click', () => {
    try { localStorage.removeItem(KEY); } catch {}
    apply(DEFAULTS);
    f.date.value = formatDate(new Date());
    fillIdeas();
    useAward(pool()[0]);
    renderThumbs();
    say('Text and design are back to the defaults.');
  });

  // "Use this award" buttons in the article below the tool.
  for (const b of document.querySelectorAll('[data-use-award]')) {
    b.addEventListener('click', () => {
      const [aud, idx] = b.dataset.useAward.split(':');
      f.audience.value = aud;
      fillIdeas();
      save();
      useAward(pool()[Number(idx)]);
      tool.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      say(`Award set: ${pool()[Number(idx)][0]}.`);
      (many() ? f.list : f.name).focus({ preventScroll: true });
    });
  }

  new ResizeObserver(() => schedule()).observe(stage);

  // ---------- start ----------
  const saved = load();
  if (typeof saved.paper !== 'string') setRadio('paper', DEFAULTS.paper);
  apply(saved);
  if (nameStyle() === 'script') loadScript();
  f.date.value = formatDate(new Date());
  if (f.audience.value !== 'office') { fillIdeas(); useAward(pool()[0]); } else syncIdea();
  renderThumbs();
  refreshBatch();
  render();
  tool.dataset.ready = 'true';
}

