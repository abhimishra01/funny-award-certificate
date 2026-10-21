// Draws one certificate on a 2D canvas context. All art (borders, seals, ribbons, trophy, confetti)
// is drawn here with our own shapes. Fonts are system fonts only, so every device can render it.
import { fitSize, wrapLines, seeded } from './core.js';

export const DESIGNS = [
  { id: 'classic', label: 'Classic' },
  { id: 'ribbon', label: 'Ribbon' },
  { id: 'modern', label: 'Modern' },
  { id: 'confetti', label: 'Confetti' },
  { id: 'trophy', label: 'Trophy' },
  { id: 'ink', label: 'Ink saver' },
];

export const COLORS = [
  { id: 'navy', label: 'Navy and gold', primary: '#1d2b55', accent: '#b88a2c' },
  { id: 'red', label: 'Red', primary: '#9b1c2e', accent: '#b88a2c' },
  { id: 'green', label: 'Green', primary: '#1e5b3f', accent: '#b88a2c' },
  { id: 'purple', label: 'Purple', primary: '#4a2a72', accent: '#b88a2c' },
  { id: 'black', label: 'Black', primary: '#1b1b1b', accent: '#7a7a7a' },
];

const SERIF = 'Georgia, "Times New Roman", Times, serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const INK = '#16181b';
const GREY = '#4a4d52';
const U = 1100; // page width in drawing units

// Where the emblem sits, the signature row spans, and the text column, per design (fractions of width/height).
// bottom: the seal center stays at least this many units above the page bottom, so its ribbon tails
// never cross the frame on the shorter A4 page.
const LAYOUT = {
  classic: { emblem: [0.125, 0.79], bottom: 170, row: [0.27, 0.92], cx: 0.5, tw: 0.74 },
  ribbon: { emblem: [0.875, 0.79], bottom: 152, row: [0.08, 0.73], cx: 0.5, tw: 0.72 },
  modern: { emblem: [0.11, 0.5], row: [0.28, 0.95], cx: 0.615, tw: 0.64 },
  confetti: { emblem: [0.13, 0.79], row: [0.27, 0.92], cx: 0.5, tw: 0.72 },
  trophy: { emblem: [0.125, 0.78], row: [0.27, 0.92], cx: 0.5, tw: 0.72 },
  ink: { emblem: [0.125, 0.79], row: [0.27, 0.92], cx: 0.5, tw: 0.74 },
};

/**
 * cert: { heading, presented, name, award, reason, date, sig1, sig2 }
 * opts: { design, color, preview } preview = true draws a light hint where an empty name goes.
 */
export function drawCertificate(ctx, W, H, cert, opts = {}) {
  const design = LAYOUT[opts.design] ? opts.design : 'classic';
  const pal = COLORS.find((c) => c.id === opts.color) || COLORS[0];
  const ink = design === 'ink';
  const P = ink ? { primary: '#1b1b1b', accent: '#1b1b1b' } : pal;
  const s = W / U;
  const h = H / s;
  const L = LAYOUT[design];

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.scale(s, s);
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  DECOR[design](ctx, h, P);

  const cx = L.cx * U;
  const tw = L.tw * U;
  const measure = (font) => (t, size) => { ctx.font = font(size); return ctx.measureText(t).width; };
  const headFont = design === 'modern' ? (z) => `700 ${z}px ${SANS}` : (z) => `700 ${z}px ${SERIF}`;
  const bodySerif = (z) => `italic 400 ${z}px ${SERIF}`;

  // Heading: spaced capitals.
  const heading = curly(cert.heading).toUpperCase();
  if (heading) {
    const sp = 0.14;
    const m = (t, z) => measure(headFont)(t, z) + sp * z * Math.max(0, t.length - 1);
    const size = fitSize(m, heading, tw, design === 'modern' ? 44 : 46, 18);
    ctx.fillStyle = P.primary;
    spaced(ctx, heading, cx, h * 0.205, headFont(size), sp * size, tw);
  }
  // Small rule under the heading.
  ctx.strokeStyle = P.accent;
  ctx.lineWidth = 2;
  line(ctx, cx - 60, h * 0.245, cx + 60, h * 0.245);
  if (!ink) { ctx.fillStyle = P.accent; diamond(ctx, cx, h * 0.245, 6); }

  const presented = curly(cert.presented);
  if (presented) {
    const size = fitSize(measure(bodySerif), presented, tw, 24, 12);
    ctx.fillStyle = GREY;
    centered(ctx, presented, cx, h * 0.325, bodySerif(size), tw);
  }

  // Name on a line.
  const nameFont = (z) => `italic 700 ${z}px ${SERIF}`;
  const name = curly(cert.name);
  const nameY = h * 0.45;
  ctx.strokeStyle = P.accent;
  ctx.lineWidth = 1.5;
  line(ctx, cx - tw * 0.42, nameY + 16, cx + tw * 0.42, nameY + 16);
  if (name) {
    const size = fitSize(measure(nameFont), name, tw * 0.94, 70, 22);
    ctx.fillStyle = INK;
    centered(ctx, name, cx, nameY, nameFont(size), tw * 0.94);
  } else if (opts.preview) {
    ctx.fillStyle = '#b4b8be';
    centered(ctx, 'Name goes here', cx, nameY, `italic 400 34px ${SERIF}`, tw);
  }

  // Award title: up to 2 lines.
  const award = curly(cert.award);
  const awardFont = design === 'modern' ? (z) => `800 ${z}px ${SANS}` : (z) => `700 ${z}px ${SERIF}`;
  let y = h * 0.575;
  if (award) {
    const { lines, size } = wrapLines(measure(awardFont), award, tw, 40, 20, 2);
    const lh = size * 1.15;
    const top = lines.length > 1 ? y - lh * 0.45 : y;
    ctx.fillStyle = P.primary;
    lines.forEach((l, i) => centered(ctx, l, cx, top + i * lh, awardFont(size), tw));
    y = top + (lines.length - 1) * lh;
  }

  // Reason: up to 2 lines.
  const reason = curly(cert.reason);
  if (reason) {
    const { lines, size } = wrapLines(measure(bodySerif), reason, tw * 0.92, 23, 12, 2);
    const lh = size * 1.3;
    const top = Math.max(y + 50, h * 0.655);
    ctx.fillStyle = GREY;
    lines.forEach((l, i) => centered(ctx, l, cx, top + i * lh, bodySerif(size), tw * 0.92));
  }

  // Signature row: date, signature 1, signature 2 (empty slots are left out).
  const slots = [];
  const date = curly(cert.date);
  if (date) slots.push({ value: date, label: 'Date' });
  if (curly(cert.sig1)) slots.push({ value: '', label: curly(cert.sig1) });
  if (curly(cert.sig2)) slots.push({ value: '', label: curly(cert.sig2) });
  if (slots.length) {
    const [r0, r1] = L.row.map((f) => f * U);
    const span = (r1 - r0) / slots.length;
    const lw = Math.min(250, span - 30);
    const ly = h * 0.85;
    slots.forEach((sl, i) => {
      const x = r0 + span * (i + 0.5);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      line(ctx, x - lw / 2, ly, x + lw / 2, ly);
      const lf = (z) => `400 ${z}px ${design === 'modern' ? SANS : SERIF}`;
      const ls = fitSize(measure(lf), sl.label, lw, 18, 9);
      ctx.fillStyle = GREY;
      centered(ctx, sl.label, x, ly + 26, lf(ls), lw);
      if (sl.value) {
        const vf = (z) => `italic 400 ${z}px ${SERIF}`;
        const vs = fitSize(measure(vf), sl.value, lw, 22, 10);
        ctx.fillStyle = INK;
        centered(ctx, sl.value, x, ly - 10, vf(vs), lw);
      }
    });
  }

  const [ex, ey] = L.emblem;
  EMBLEM[design](ctx, ex * U, L.bottom ? Math.min(ey * h, h - L.bottom) : ey * h, P);
  ctx.restore();
}

/** Text the canvas shows, for its accessible name. */
export function describe(cert) {
  return [cert.heading, cert.presented, cert.name, cert.award, cert.reason, cert.date && `Date: ${cert.date}`, cert.sig1, cert.sig2]
    .map((x) => String(x || '').trim().replace(/\.+$/, '')).filter(Boolean).join('. ');
}

// ---------- text helpers ----------
/** Trimmed text with typographic quotes: "Why?" -> “Why?”, O'Brien -> O’Brien. */
export function curly(t) {
  return String(t || '').trim()
    .replace(/(^|[\s(\[{\u2014-])"/g, '$1\u201c').replace(/"/g, '\u201d')
    .replace(/(^|[\s(\[{\u2014-])'/g, '$1\u2018').replace(/'/g, '\u2019');
}

function centered(ctx, text, x, y, font, maxW) {
  ctx.font = font;
  ctx.textAlign = 'center';
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(maxW / w, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  } else ctx.fillText(text, x, y);
}

function spaced(ctx, text, x, y, font, sp, maxW) {
  ctx.font = font;
  ctx.textAlign = 'left';
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  const k = total > maxW ? maxW / total : 1;
  ctx.save();
  ctx.translate(x - (total * k) / 2, y);
  ctx.scale(k, 1);
  let at = 0;
  chars.forEach((c, i) => { ctx.fillText(c, at, 0); at += widths[i] + sp; });
  ctx.restore();
}

// ---------- shape helpers ----------
function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function diamond(ctx, x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
}
function star(ctx, x, y, R, r, n = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rr = i % 2 ? r : R;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function rect(ctx, x, y, w, h) { ctx.beginPath(); ctx.rect(x, y, w, h); }

// An engraved corner medallion: 16 fine overlapping petals inside two rings (our own guilloche-style art).
function rosette(ctx, x, y, r) {
  const lw = ctx.lineWidth;
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, r * 0.44, r * 0.15, a, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = lw;
  circle(ctx, x, y, r); ctx.stroke();
  circle(ctx, x, y, r * 0.88); ctx.lineWidth = 0.7; ctx.stroke();
  ctx.lineWidth = lw;
}

// Ribbon tails under a seal.
function tails(ctx, x, y, r, color, dark) {
  const tail = (dir) => {
    ctx.beginPath();
    ctx.moveTo(x + dir * r * 0.15, y);
    ctx.lineTo(x + dir * r * 0.72, y + r * 1.33);
    ctx.lineTo(x + dir * r * 0.49, y + r * 1.16);
    ctx.lineTo(x + dir * r * 0.28, y + r * 1.4);
    ctx.lineTo(x - dir * r * 0.2, y + r * 0.2);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.5; ctx.stroke();
  };
  tail(-1); tail(1);
}

function seal(ctx, x, y, r, P, { outline = false } = {}) {
  if (!outline) tails(ctx, x, y + r * 0.2, r, P.primary, P.primary);
  star(ctx, x, y, r, r * 0.88, 28);
  if (outline) { ctx.strokeStyle = P.primary; ctx.lineWidth = 2; ctx.stroke(); }
  else { ctx.fillStyle = P.accent; ctx.fill(); }
  circle(ctx, x, y, r * 0.74);
  if (outline) { ctx.stroke(); } else { ctx.fillStyle = P.primary; ctx.fill(); }
  circle(ctx, x, y, r * 0.62);
  ctx.strokeStyle = outline ? P.primary : P.accent; ctx.lineWidth = 2; ctx.stroke();
  star(ctx, x, y, r * 0.36, r * 0.15, 5);
  if (outline) ctx.stroke(); else { ctx.fillStyle = P.accent; ctx.fill(); }
  // Small dots around the inner ring.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    circle(ctx, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.025);
    ctx.fillStyle = outline ? P.primary : P.accent; ctx.fill();
  }
}

function trophy(ctx, x, y, P) {
  const g = P.accent, d = P.primary;
  ctx.lineWidth = 2;
  ctx.strokeStyle = d;
  // Handles.
  ctx.beginPath(); ctx.arc(x - 40, y - 34, 18, Math.PI * 0.5, Math.PI * 1.5); ctx.lineWidth = 7; ctx.strokeStyle = g; ctx.stroke();
  ctx.beginPath(); ctx.arc(x + 40, y - 34, 18, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
  // Cup.
  ctx.beginPath();
  ctx.moveTo(x - 46, y - 62);
  ctx.lineTo(x + 46, y - 62);
  ctx.bezierCurveTo(x + 46, y - 10, x + 22, y + 6, x + 8, y + 10);
  ctx.lineTo(x - 8, y + 10);
  ctx.bezierCurveTo(x - 22, y + 6, x - 46, y - 10, x - 46, y - 62);
  ctx.closePath();
  ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = d; ctx.stroke();
  // Soft shine on the left of the cup.
  ctx.beginPath();
  ctx.moveTo(x - 34, y - 56); ctx.bezierCurveTo(x - 34, y - 26, x - 24, y - 8, x - 12, y);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 5; ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = d;
  // Stem and base.
  rect(ctx, x - 7, y + 10, 14, 22); ctx.fillStyle = g; ctx.fill(); ctx.stroke();
  rect(ctx, x - 30, y + 32, 60, 12); ctx.fillStyle = d; ctx.fill();
  rect(ctx, x - 38, y + 44, 76, 14); ctx.fill();
  star(ctx, x, y - 32, 15, 6.5, 5); ctx.fillStyle = '#ffffff'; ctx.fill();
}

function medal(ctx, x, y, P) {
  // Neck ribbon: two crossed straps, each white with a stripe in the accent color.
  const strap = (dir, shade) => {
    const quad = (a, b) => {
      ctx.beginPath();
      // Each strap runs from the top outer corner down to the far side of the medal top (a V).
      ctx.moveTo(x + dir * (40 - a), y - 130); ctx.lineTo(x + dir * (40 - b), y - 130);
      ctx.lineTo(x + dir * (16 - b), y - 30); ctx.lineTo(x + dir * (16 - a), y - 30); ctx.closePath(); ctx.fill();
    };
    ctx.fillStyle = shade; quad(0, 30);
    ctx.fillStyle = P.accent; quad(11, 19);
  };
  strap(-1, '#d9dde6');
  strap(1, '#ffffff');
  circle(ctx, x, y, 52); ctx.fillStyle = P.accent; ctx.fill();
  circle(ctx, x, y, 42); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();
  star(ctx, x, y, 26, 11, 5); ctx.fillStyle = '#ffffff'; ctx.fill();
}

// ---------- designs ----------
const DECOR = {
  classic(ctx, h, P) {
    // Outer ink starts about 0.3 in from the paper edge, inside a home printer's margin.
    ctx.strokeStyle = P.primary; ctx.lineWidth = 9;
    rect(ctx, 34, 34, U - 68, h - 68); ctx.stroke();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
    rect(ctx, 51, 51, U - 102, h - 102); ctx.stroke();
    ctx.lineWidth = 1;
    rect(ctx, 57, 57, U - 114, h - 114); ctx.stroke();
    ctx.lineWidth = 1.2;
    for (const [x, y] of [[57, 57], [U - 57, 57], [57, h - 57], [U - 57, h - 57]]) {
      circle(ctx, x, y, 27); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.strokeStyle = P.accent; rosette(ctx, x, y, 24);
      circle(ctx, x, y, 3.5); ctx.fillStyle = P.primary; ctx.fill();
    }
  },
  ribbon(ctx, h, P) {
    ctx.strokeStyle = P.primary; ctx.lineWidth = 3;
    rect(ctx, 30, 30, U - 60, h - 60); ctx.stroke();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.5;
    rect(ctx, 40, 40, U - 80, h - 80); ctx.stroke();
    // Corner band across the top left.
    ctx.save();
    ctx.beginPath(); ctx.rect(30, 30, U - 60, h - 60); ctx.clip();
    ctx.translate(30, 30); ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = P.primary; ctx.fillRect(-200, 95, 400, 46);
    ctx.fillStyle = P.accent; ctx.fillRect(-200, 101, 400, 4); ctx.fillRect(-200, 131, 400, 4);
    ctx.restore();
  },
  modern(ctx, h, P) {
    const bw = 0.22 * U;
    ctx.fillStyle = P.primary; ctx.fillRect(0, 0, bw, h);
    ctx.fillStyle = P.accent; ctx.fillRect(bw, 0, 8, h);
    // Thin frame on the right part.
    ctx.strokeStyle = P.primary; ctx.lineWidth = 1.5;
    rect(ctx, bw + 30, 30, U - bw - 60, h - 60); ctx.stroke();
    // Fine diagonal lines in the band.
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, bw, h); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 2;
    for (let x = -h; x < bw; x += 18) line(ctx, x, h, x + h, 0);
    ctx.restore();
  },
  confetti(ctx, h, P) {
    ctx.strokeStyle = P.primary; ctx.lineWidth = 3;
    rect(ctx, 34, 34, U - 68, h - 68); ctx.stroke();
    const cols = [P.primary, P.accent, '#d9486b', '#2a9d8f', '#f2a541'];
    const rnd = seeded(7);
    // Pieces stay inside a printer-safe margin and off the frame line, and out of the text area.
    const inSafe = (x, y) => x > 120 && x < U - 120 && y > 120 && y < h - 70;
    const clear = (x, y) => (y > h * 0.76 && x > 0.25 * U && x < 0.94 * U) || Math.hypot(x - 0.13 * U, y - 0.79 * h) < 90;
    const offEdge = (x, y) => x < 24 || x > U - 24 || y < 24 || y > h - 24 || Math.abs(x - 34) < 10 || Math.abs(x - (U - 34)) < 10 || Math.abs(y - 34) < 10 || Math.abs(y - (h - 34)) < 10;
    let placed = 0;
    for (let i = 0; placed < 120 && i < 2000; i++) {
      const x = rnd() * U, y = rnd() * h;
      if (inSafe(x, y) || offEdge(x, y) || clear(x, y)) continue;
      placed++;
      ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
      ctx.strokeStyle = ctx.fillStyle;
      const k = Math.floor(rnd() * 4), z = 5 + rnd() * 7, a = rnd() * Math.PI;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      if (k === 0) { circle(ctx, 0, 0, z * 0.6); ctx.fill(); }
      else if (k === 1) { ctx.fillRect(-z / 2, -z / 4, z, z / 2); }
      else if (k === 2) { ctx.beginPath(); ctx.moveTo(0, -z * 0.6); ctx.lineTo(z * 0.55, z * 0.4); ctx.lineTo(-z * 0.55, z * 0.4); ctx.closePath(); ctx.fill(); }
      else { ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-z, 0); ctx.quadraticCurveTo(-z / 2, -z / 2, 0, 0); ctx.quadraticCurveTo(z / 2, z / 2, z, 0); ctx.stroke(); }
      ctx.restore();
    }
  },
  trophy(ctx, h, P) {
    ctx.strokeStyle = P.primary; ctx.lineWidth = 4;
    rect(ctx, 30, 30, U - 60, h - 60); ctx.stroke();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.5;
    rect(ctx, 42, 42, U - 84, h - 84); ctx.stroke();
    // Bunting along the top edge.
    ctx.strokeStyle = P.primary; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(60, 58); ctx.quadraticCurveTo(U / 2, 92, U - 60, 58); ctx.stroke();
    const n = 15;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = 60 + t * (U - 120);
      const y = 58 + 68 * t * (1 - t);
      ctx.beginPath(); ctx.moveTo(x - 17, y); ctx.lineTo(x + 17, y); ctx.lineTo(x, y + 30); ctx.closePath();
      ctx.fillStyle = i % 2 ? P.accent : P.primary; ctx.fill();
    }
  },
  ink(ctx, h, P) {
    ctx.strokeStyle = P.primary; ctx.lineWidth = 2;
    rect(ctx, 32, 32, U - 64, h - 64); ctx.stroke();
    ctx.lineWidth = 0.8;
    rect(ctx, 42, 42, U - 84, h - 84); ctx.stroke();
    ctx.lineWidth = 2.5;
    for (const [x, y, dx, dy] of [[56, 56, 1, 1], [U - 56, 56, -1, 1], [56, h - 56, 1, -1], [U - 56, h - 56, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x, y + dy * 40); ctx.lineTo(x, y); ctx.lineTo(x + dx * 40, y); ctx.stroke();
    }
  },
};

const EMBLEM = {
  classic: (ctx, x, y, P) => seal(ctx, x, y, 66, P),
  ribbon: (ctx, x, y, P) => seal(ctx, x, y, 66, P),
  modern: (ctx, x, y, P) => medal(ctx, x, y, P),
  confetti: (ctx, x, y, P) => {
    circle(ctx, x, y, 64); ctx.fillStyle = P.accent; ctx.fill();
    star(ctx, x, y, 54, 24, 5); ctx.fillStyle = '#ffffff'; ctx.fill();
    star(ctx, x, y, 40, 17, 5); ctx.fillStyle = P.primary; ctx.fill();
  },
  trophy: (ctx, x, y, P) => trophy(ctx, x, y, P),
  ink: (ctx, x, y, P) => seal(ctx, x, y, 62, P, { outline: true }),
};
