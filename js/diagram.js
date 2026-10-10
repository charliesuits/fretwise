// SVG chord boxes and the full-neck map. Returns SVG markup strings.
import { degreeFamily, pcName, mod12 } from "./theory.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Dot text for a note depending on the label mode. */
function dotText(mode, label, midi, finger) {
  if (mode === "fingers") return finger ? String(finger) : "";
  if (mode === "notes") return midi == null ? "" : pcName(midi);
  if (label === "bass") return midi == null ? "" : pcName(midi);
  return label === "1" ? "R" : label;
}

/**
 * Chord box. v = voicing from voicer.js.
 * opts: { mode: "degrees"|"notes"|"fingers", lefty, movable }
 * movable: frets are relative (1 = lowest fret of the shape); no nut, no fret number, no inlays.
 */
export function chordBox(v, opts = {}) {
  const S = v.frets.length;
  const mode = opts.mode || "degrees";
  const lefty = !!opts.lefty;
  const fretted = v.frets.filter((f) => f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const movable = !!opts.movable;
  const base = movable ? 1 : maxF <= 4 ? 1 : minF; // first fret shown
  const nRows = movable ? Math.max(4, maxF) : maxF <= 4 ? 4 : Math.max(4, maxF - minF + 1);
  const W = 100, padX = 17, top = 24, fh = 19;
  const gap = (W - padX * 2) / (S - 1);
  const H = top + nRows * fh + 10;
  const sx = (s) => padX + (lefty ? S - 1 - s : s) * gap;
  const fy = (f) => top + (f - base + 0.5) * fh; // centre of fret row

  let o = `<svg class="cbox" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaFor(v))}">`;
  // board
  o += `<rect class="wood" x="${padX - 7}" y="${top}" width="${W - padX * 2 + 14}" height="${nRows * fh}" rx="1.5"/>`;
  // inlays
  for (let r = 0; r < nRows; r++) {
    const f = base + r;
    const y = top + (r + 0.5) * fh;
    if (movable) continue;
    if ([3, 5, 7, 9, 15, 17, 19, 21].includes(f)) o += `<circle class="inlay" cx="${W / 2}" cy="${y}" r="2.1"/>`;
    if (f === 12 || f === 24) o += `<circle class="inlay" cx="${W / 2 - gap}" cy="${y}" r="2.4"/><circle class="inlay" cx="${W / 2 + gap}" cy="${y}" r="2.4"/>`;
  }
  // frets
  for (let r = 0; r <= nRows; r++) {
    const y = top + r * fh;
    o += `<line class="${r === 0 && base === 1 && !movable ? "nut" : "fret"}" x1="${padX - 7}" x2="${W - padX + 7}" y1="${y}" y2="${y}"/>`;
  }
  // strings, heavier toward the bass
  for (let s = 0; s < S; s++) {
    const w = 1.5 - (s / (S - 1)) * 0.85;
    o += `<line class="string" x1="${sx(s)}" x2="${sx(s)}" y1="${top}" y2="${top + nRows * fh}" stroke-width="${w.toFixed(2)}"/>`;
  }
  // fret number
  if (base > 1 && !movable) o += `<text class="fretno" x="${lefty ? W - 2 : 2}" y="${top + fh * 0.5 + 3.5}" text-anchor="${lefty ? "end" : "start"}">${base}</text>`;
  // barre
  if (v.barre) {
    const x1 = Math.min(sx(v.barre.from), sx(v.barre.to)), x2 = Math.max(sx(v.barre.from), sx(v.barre.to));
    o += `<rect class="barre" x="${x1 - 6}" y="${fy(v.barre.fret) - 6}" width="${x2 - x1 + 12}" height="12" rx="6"/>`;
  }
  // markers and dots
  for (let s = 0; s < S; s++) {
    const f = v.frets[s];
    const x = sx(s);
    const label = v.labels[s];
    if (f < 0) {
      o += `<path class="mute" d="M${x - 3.4} ${top - 13.4}l6.8 6.8M${x + 3.4} ${top - 13.4}l-6.8 6.8"/>`;
    } else if (f === 0) {
      o += `<circle class="open deg-${degreeFamily(label === "bass" ? "x" : label)}${label === "bass" ? " deg-bass" : ""}" cx="${x}" cy="${top - 10}" r="4.2"/>`;
    } else {
      const fam = label === "bass" ? "bass" : degreeFamily(label);
      const t = dotText(mode, label, v.notes[s], v.fingers[s]);
      o += `<g class="dot deg-${fam}"><circle cx="${x}" cy="${fy(f)}" r="6.4"/>`;
      if (t) o += `<text x="${x}" y="${fy(f) + 2.6}" text-anchor="middle" class="${t.length > 2 ? "small" : ""}">${esc(t)}</text>`;
      o += `</g>`;
    }
  }
  o += `</svg>`;
  return o;
}

function ariaFor(v) {
  return "Frets " + v.frets.map((f) => (f < 0 ? "x" : f)).join(" ");
}

/** Text form of a shape like x32010 or 8-10-10-9-8-8 */
export function shapeText(frets) {
  const big = frets.some((f) => f > 9);
  return frets.map((f) => (f < 0 ? "x" : f)).join(big ? "-" : "");
}

/**
 * Horizontal neck with every chord tone. cells from neckMap(), v = highlighted voicing (optional).
 * opts: { tuning (midi incl. capo), maxFret, lefty, mode }
 */
export function neckSvg(cells, v, opts = {}) {
  const S = opts.tuning.length;
  const maxF = opts.maxFret || 15;
  const lefty = !!opts.lefty;
  const mode = opts.mode === "notes" ? "notes" : "degrees";
  const scale = 1500; // virtual scale length
  const pos = (n) => scale * (1 - Math.pow(2, -n / 12));
  const nutX = 42;
  const widthAt = pos(maxF + 0.6);
  const W = nutX + widthAt + 8;
  const sg = 24, topY = 16;
  const H = topY + sg * (S - 1) + 34;
  const X = (x) => (lefty ? W - x : x);
  const fretX = (n) => nutX + pos(n);
  const mid = (f) => (f === 0 ? nutX - 14 : (fretX(f - 1) + fretX(f)) / 2);
  const sy = (s) => topY + (S - 1 - s) * sg; // low string at the bottom, like tab

  let o = `<svg class="neck" viewBox="0 0 ${W.toFixed(0)} ${H}" preserveAspectRatio="xMinYMid meet" role="img" aria-label="Chord tones across the neck">`;
  const bx1 = X(nutX), bx2 = X(nutX + widthAt);
  o += `<rect class="wood" x="${Math.min(bx1, bx2)}" y="${topY - 9}" width="${widthAt}" height="${sg * (S - 1) + 18}" rx="2"/>`;
  for (let f = 1; f <= maxF; f++) {
    const cy = topY + (sg * (S - 1)) / 2;
    if ([3, 5, 7, 9, 15, 17, 19, 21].includes(f)) o += `<circle class="inlay" cx="${X(mid(f))}" cy="${cy}" r="3.6"/>`;
    if (f === 12) o += `<circle class="inlay" cx="${X(mid(f))}" cy="${cy - sg}" r="3.3"/><circle class="inlay" cx="${X(mid(f))}" cy="${cy + sg}" r="3.3"/>`;
  }
  o += `<line class="nut" x1="${X(nutX)}" x2="${X(nutX)}" y1="${topY - 9}" y2="${topY + sg * (S - 1) + 9}"/>`;
  for (let f = 1; f <= maxF; f++) {
    const x = X(fretX(f));
    o += `<line class="fret" x1="${x}" x2="${x}" y1="${topY - 9}" y2="${topY + sg * (S - 1) + 9}"/>`;
    if ([1, 3, 5, 7, 9, 12, 15, 17, 19, 21].includes(f)) o += `<text class="fretno" x="${X(mid(f))}" y="${H - 6}" text-anchor="middle">${f}</text>`;
  }
  for (let s = 0; s < S; s++) {
    const w = 1.8 - (s / (S - 1)) * 1.0;
    o += `<line class="string" x1="${bx1}" x2="${bx2}" y1="${sy(s)}" y2="${sy(s)}" stroke-width="${w.toFixed(2)}"/>`;
    o += `<text class="strname" x="${X(7)}" y="${sy(s) + 3.5}" text-anchor="middle">${pcName(opts.tuning[s])}</text>`;
  }
  const inV = (c) => !!(v && v.frets[c.s] === c.f);
  // dim tones first, then the voicing on top
  for (const pass of [0, 1]) {
    for (const c of cells) {
      const on = inV(c);
      if ((pass === 1) !== on) continue;
      const fam = c.label === "bass" ? "bass" : degreeFamily(c.label);
      const t = mode === "notes" || c.label === "bass" ? pcName(c.midi) : c.label === "1" ? "R" : c.label;
      const cls = `nd deg-${fam}${on ? " on" : v ? " dim" : ""}`;
      o += `<g class="${cls}" data-s="${c.s}" data-f="${c.f}"><circle cx="${X(mid(c.f))}" cy="${sy(c.s)}" r="${on ? 10 : 8.6}"/><text x="${X(mid(c.f))}" y="${sy(c.s) + 3.4}" text-anchor="middle">${esc(t)}</text></g>`;
    }
  }
  if (v) {
    for (let s = 0; s < S; s++) if (v.frets[s] < 0) o += `<text class="mutex" x="${X(nutX - 14)}" y="${sy(s) + 3.5}" text-anchor="middle">×</text>`;
  }
  o += `</svg>`;
  return o;
}
