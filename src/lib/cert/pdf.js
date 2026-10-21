// A small PDF writer: one full-page JPEG per page. No library needed.
// pages: [{ jpeg: Uint8Array, w: pixel width, h: pixel height }], paper: { w, h } in points.

const enc = (s) => {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
};
const num = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));

export function buildPdf(pages, paper, title = 'Award certificate') {
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const push = (b) => { chunks.push(b); pos += b.length; };
  const obj = (id, parts) => {
    offsets[id] = pos;
    push(enc(`${id} 0 obj\n`));
    for (const p of parts) push(typeof p === 'string' ? enc(p) : p);
    push(enc('\nendobj\n'));
  };

  // Header with a binary comment so tools treat the file as binary.
  push(enc('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));

  const n = pages.length;
  const pageId = (i) => 4 + i * 3;
  const W = num(paper.w);
  const H = num(paper.h);
  const safeTitle = String(title).replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '\\$&');

  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, [`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`]);
  obj(3, [`<< /Title (${safeTitle}) /Producer (Award certificate maker) >>`]);
  pages.forEach((p, i) => {
    const id = pageId(i);
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(id, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`]);
    obj(id + 1, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    obj(id + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      p.jpeg,
      '\nendstream',
    ]);
  });

  const size = 4 + n * 3;
  const xrefAt = pos;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  push(enc(xref));
  push(enc(`trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`));

  const out = new Uint8Array(pos);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
