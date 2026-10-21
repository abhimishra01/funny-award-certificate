// Wires the form, the live preview and the exports. Everything runs in the browser; nothing is sent anywhere.
import { AUDIENCES } from './awards.js';
import { PAPERS, DPI, pixelSize, formatDate, fileName, pickRandom, parseBatch, resolveBatch, seeded, MAX_BATCH } from './core.js';
import { drawCertificate, describe } from './draw.js';
import { buildPdf } from './pdf.js';

const KEY = 'fac-settings-v1';
const SAVED = ['design', 'color', 'paper', 'audience', 'heading', 'presented', 'sig1', 'sig2'];
const DEFAULTS = {
  design: 'classic', color: 'navy', paper: 'letter', audience: 'office',
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
    name: $('fc-name'), list: $('fc-list'), each: $('fc-each'), heading: $('fc-heading'),
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
    const s = { design: radio('design'), color: radio('color'), paper: radio('paper'), audience: f.audience.value,
      heading: f.heading.value, presented: f.presented.value, sig1: f.sig1.value, sig2: f.sig2.value };
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  };
  const apply = (s) => {
    for (const k of SAVED) {
      if (typeof s[k] !== 'string') continue;
      if (k === 'design' || k === 'color' || k === 'paper') setRadio(k, s[k]);
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
    const { rows, ignored } = parseBatch(f.list.value);
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
    drawCertificate(canvas.getContext('2d'), W, H, c, { design: radio('design'), color: radio('color'), preview: true });
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
  const renderPage = (c) => {
    const paper = radio('paper') || 'letter';
    const { w, h } = pixelSize(paper, DPI);
    work.width = w; work.height = h;
    drawCertificate(work.getContext('2d'), w, h, c, { design: radio('design'), color: radio('color') });
    return { w, h };
  };
  const blobOf = (type, q) => new Promise((res, rej) => work.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the image.'))), type, q));
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
  const jpegPages = async (list) => {
    const pages = [];
    for (let i = 0; i < list.length; i++) {
      if (list.length > 1) say(`Making page ${i + 1} of ${list.length}...`);
      const { w, h } = renderPage(list[i]);
      const blob = await blobOf('image/jpeg', 0.92);
      pages.push({ w, h, blob, jpeg: new Uint8Array(await blob.arrayBuffer()) });
      await nextFrame();
    }
    return pages;
  };

  $('fc-pdf').addEventListener('click', () => guard($('fc-pdf'), async () => {
    const list = certs();
    const pages = await jpegPages(list);
    const pdf = buildPdf(pages, PAPERS[radio('paper')] || PAPERS.letter, 'Award certificate');
    download(new Blob([pdf], { type: 'application/pdf' }), fileName(list[0].name, 'pdf', list.length));
    say(list.length > 1 ? `PDF ready: ${list.length} pages.` : 'PDF ready. Check your downloads.');
  }));

  $('fc-png').addEventListener('click', () => guard($('fc-png'), async () => {
    const list = certs();
    const c = list[Math.min(page, list.length - 1)];
    renderPage(c);
    download(await blobOf('image/png'), fileName(c.name, 'png'));
    say(many() && list.length > 1 ? `PNG ready for certificate ${page + 1}.` : 'PNG ready. Check your downloads.');
  }));

  $('fc-print').addEventListener('click', () => guard($('fc-print'), async () => {
    const list = certs();
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
    say(list.length > 1 ? `Printing ${list.length} pages. In the print window, choose landscape and no margins if asked.` : 'Opening the print window.');
    window.print();
    // Some browsers do not fire afterprint; clean up after a while anyway.
    setTimeout(() => { if (document.documentElement.classList.contains('fc-printing')) done(); }, 60000);
  }));

  // ---------- events ----------
  const onText = () => { refreshBatch(); schedule(); };
  for (const k of ['name', 'heading', 'presented', 'date', 'sig1', 'sig2', 'reason']) f[k].addEventListener('input', onText);
  f.award.addEventListener('input', () => { syncIdea(); onText(); });
  for (const k of ['heading', 'presented', 'sig1', 'sig2']) f[k].addEventListener('change', save);
  f.audience.addEventListener('change', () => { fillIdeas(); lastPick = null; refreshBatch(); save(); schedule(); });
  f.idea.addEventListener('change', () => { if (f.idea.value !== '') useAward(pool()[Number(f.idea.value)]); });
  $('fc-random').addEventListener('click', () => useAward(pickRandom(pool(), Math.random, lastPick || pool().find(([t]) => t === f.award.value.trim()))));
  for (const el of document.querySelectorAll('input[name="design"], input[name="color"], input[name="paper"]')) {
    el.addEventListener('change', () => { save(); if (el.name !== 'design') renderThumbs(); schedule(); });
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
  apply(load());
  f.date.value = formatDate(new Date());
  if (f.audience.value !== 'office') { fillIdeas(); useAward(pool()[0]); } else syncIdea();
  renderThumbs();
  refreshBatch();
  render();
  tool.dataset.ready = 'true';
}

