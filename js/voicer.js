// Fretwise voicing engine: every playable fingering of a chord on a fretted instrument.
import { mod12, INTERVALS } from "./theory.js";

export const DEFAULT_OPTS = {
  tuning: [40, 45, 50, 55, 59, 64], // low -> high, MIDI
  capo: 0,
  maxFret: 15, // highest fret (relative to capo) to search
  span: 4, // frets the hand covers (4 = normal, 5 = stretch)
  minStrings: 3,
  inversions: false, // allow a chord tone other than the root in the bass
  rootless: false, // allow voicings without the root (jazz style)
  maxGaps: 1, // muted strings in the middle of a shape
};

// Shapes the CAGED system is built from (open position, low E -> high e, -1 = muted).
// Each is matched at any fret by sliding it up the neck.
const FORMS = {
  maj: { C: [[-1, 3, 2, 0, 1, 0], 0], A: [[-1, 0, 2, 2, 2, 0], 9], G: [[3, 2, 0, 0, 0, 3], 7], E: [[0, 2, 2, 1, 0, 0], 4], D: [[-1, -1, 0, 2, 3, 2], 2] },
  m: { C: [[-1, 3, 1, 0, 1, 3], 0], A: [[-1, 0, 2, 2, 1, 0], 9], G: [[3, 1, 0, 0, 3, 3], 7], E: [[0, 2, 2, 0, 0, 0], 4], D: [[-1, -1, 0, 2, 3, 1], 2] },
  "7": { C: [[-1, 3, 2, 3, 1, 0], 0], A: [[-1, 0, 2, 0, 2, 0], 9], G: [[3, 2, 0, 0, 0, 1], 7], E: [[0, 2, 0, 1, 0, 0], 4], D: [[-1, -1, 0, 2, 1, 2], 2] },
  m7: { A: [[-1, 0, 2, 0, 1, 0], 9], E: [[0, 2, 0, 0, 0, 0], 4], D: [[-1, -1, 0, 2, 1, 1], 2] },
  maj7: { C: [[-1, 3, 2, 0, 0, 0], 0], A: [[-1, 0, 2, 1, 2, 0], 9], E: [[0, 2, 1, 1, 0, 0], 4], D: [[-1, -1, 0, 2, 2, 2], 2] },
};

/**
 * Find voicings. Returns an array of voicing objects sorted best-first:
 * { frets:[-1|0..], notes:[midi|null], labels:[degree|null], fingers:[0..4|null], barre:{fret,from,to}|null,
 *   pos, span, strings, gaps, score, tags:[], form, bassLabel, missing:[], key }
 */
export function findVoicings(chord, userOpts = {}) {
  const o = { ...DEFAULT_OPTS, ...userOpts };
  const open = o.tuning.map((n) => n + o.capo);
  const S = open.length;
  const pcLabel = new Map();
  for (const t of chord.tones) pcLabel.set(t.pc, t.label);
  if (chord.bass && !pcLabel.has(chord.bass.pc)) pcLabel.set(chord.bass.pc, "bass");
  const required = chord.tones.filter((t) => t.required && !(o.rootless && t.label === "1")).map((t) => t.pc);
  const bassPc = chord.bass ? chord.bass.pc : chord.root.pc;
  const found = new Map();

  // Candidate frets per string within a window [lo, hi]; open strings are always candidates.
  const cand = (s, lo, hi) => {
    const out = [-1];
    if (pcLabel.has(mod12(open[s]))) out.push(0);
    for (let f = Math.max(1, lo); f <= hi; f++) if (pcLabel.has(mod12(open[s] + f))) out.push(f);
    return out;
  };

  const lastLo = Math.max(1, o.maxFret - o.span + 1);
  for (let lo = 1; lo <= lastLo; lo++) {
    const hi = Math.min(o.maxFret, lo + o.span - 1);
    const options = open.map((_, s) => cand(s, lo, hi));
    const frets = new Array(S);
    const walk = (s) => {
      if (s === S) { consider(frets.slice()); return; }
      for (const f of options[s]) { frets[s] = f; walk(s + 1); }
    };
    walk(0);
  }

  function consider(frets) {
    const key = frets.join(",");
    if (found.has(key)) return;
    const sounded = [];
    for (let s = 0; s < S; s++) if (frets[s] >= 0) sounded.push(s);
    if (sounded.length < o.minStrings) return;
    const low = sounded[0], high = sounded[sounded.length - 1];
    // bass note
    const bass = mod12(open[low] + frets[low]);
    if (chord.bass) { if (bass !== bassPc) return; }
    else if (bass !== bassPc && !o.inversions) {
      const hasRoot = sounded.some((s) => mod12(open[s] + frets[s]) === chord.root.pc);
      if (!(o.rootless && !hasRoot)) return; // rootless shapes may have any tone in the bass
    }
    // the added bass note of a slash chord should only appear in the bass
    if (chord.bass && pcLabel.get(chord.bass.pc) === "bass") {
      for (const s of sounded.slice(1)) if (mod12(open[s] + frets[s]) === chord.bass.pc) return;
    }
    // gaps (muted strings inside the shape)
    let gaps = 0;
    for (let s = low; s <= high; s++) if (frets[s] < 0) gaps++;
    if (gaps > o.maxGaps) return;
    // all required tones
    const pcs = new Set(sounded.map((s) => mod12(open[s] + frets[s])));
    for (const pc of required) if (!pcs.has(pc)) return;
    for (const g of chord.groups) {
      const n = g.labels.filter((l) => chord.tones.some((t) => t.label === l && pcs.has(t.pc))).length;
      if (n < g.min) return;
    }
    // stretch
    const fretted = sounded.filter((s) => frets[s] > 0);
    const fv = fretted.map((s) => frets[s]);
    const minF = fv.length ? Math.min(...fv) : 0;
    const maxF = fv.length ? Math.max(...fv) : 0;
    if (maxF - minF > o.span - 1) return;
    // fingering
    const fing = fingering(frets, sounded);
    if (!fing) return;
    found.set(key, build(frets, sounded, low, high, gaps, minF, maxF, fing, pcs));
  }

  function build(frets, sounded, low, high, gaps, minF, maxF, fing, pcs) {
    const notes = frets.map((f, s) => (f >= 0 ? open[s] + f : null));
    const labels = notes.map((n) => (n == null ? null : pcLabel.get(mod12(n))));
    const missing = chord.tones.filter((t) => !pcs.has(t.pc)).map((t) => t.label);
    const bassLabel = labels[low];
    const opens = sounded.filter((s) => frets[s] === 0).length;
    const interiorOpen = sounded.some((s) => frets[s] === 0 && sounded.some((a) => a < s && frets[a] > 0) && sounded.some((b) => b > s && frets[b] > 0));
    const n = sounded.length;
    const tags = [];
    const v = {
      frets, notes, labels, fingers: fing.fingers, barre: fing.barre,
      pos: minF, top: maxF, span: maxF - minF, strings: n, gaps, low, high,
      missing, bassLabel, opens, interiorOpen, fingerCount: fing.count, tags, key: frets.join(","),
    };
    // --- tags
    if (opens && maxF <= 4) tags.push("open");
    if (fing.barre && fing.barre.to - fing.barre.from >= 3) tags.push("barre");
    const adjacent = gaps === 0;
    const toneCount = chord.tones.length + (chord.bass && chord.bassLabel == null ? 1 : 0);
    if (n === 3 && adjacent && toneCount === 3 && new Set(labels.filter(Boolean)).size === 3) tags.push("triad");
    const shape = voicingShape(notes.filter((x) => x != null));
    if (shape && n === 4) tags.push(shape);
    const ls = labels.filter(Boolean);
    if (n === 3 && ls.includes("1") && ls.some((l) => l === "3" || l === "b3") && ls.some((l) => /^(b?b?7|6)$/.test(l))) tags.push("shell");
    if (bassLabel !== "1" && !chord.bass) tags.push("inversion");
    if (!labels.includes("1")) tags.push("rootless");
    v.form = cagedForm(chord, frets, o);
    v.score = scoreOf(v, open, chord);
    return v;
  }

  const list = [...found.values()].sort((a, b) => a.score - b.score || a.pos - b.pos);
  return list;
}

/** Decide fingers for a shape. Returns {fingers, barre, count} or null if it needs more than 4 fingers. */
export function fingering(frets, sounded) {
  const fretted = sounded.filter((s) => frets[s] > 0);
  const fingers = frets.map((f) => (f > 0 ? 0 : null));
  if (!fretted.length) return { fingers, barre: null, count: 0 };
  const minF = Math.min(...fretted.map((s) => frets[s]));
  const order = fretted.slice().sort((a, b) => frets[a] - frets[b] || a - b);
  if (fretted.length <= 4) {
    // one finger per note, in fret order then low string first (how charts are usually fingered)
    order.forEach((s, i) => (fingers[s] = i + 1));
    return { fingers, barre: null, count: fretted.length };
  }
  // Need a barre. Index finger across the lowest fret.
  const atMin = fretted.filter((s) => frets[s] === minF);
  let barre = null;
  let units = []; // each unit = list of strings pressed by one finger
  if (atMin.length >= 2) {
    const from = atMin[0], to = atMin[atMin.length - 1];
    let ok = true;
    for (let s = from; s <= to; s++) if (!(frets[s] >= minF)) { ok = false; break; }
    if (ok) { barre = { fret: minF, from, to }; units.push(atMin); }
  }
  const rest = order.filter((s) => !(barre && frets[s] === minF));
  if (!barre) {
    // no index barre possible: try mini-barres at the lowest fret only between adjacent strings
    units.push(...groupAdjacent(rest.filter((s) => frets[s] === minF), frets));
    rest.splice(0, rest.length, ...rest.filter((s) => frets[s] !== minF));
  }
  const singles = rest.map((s) => [s]);
  if (units.length + singles.length <= 4) {
    units = units.concat(singles);
  } else {
    // merge notes on the same fret on neighbouring strings (ring-finger barre, e.g. A-shape)
    const byFret = new Map();
    for (const s of rest) { if (!byFret.has(frets[s])) byFret.set(frets[s], []); byFret.get(frets[s]).push(s); }
    const merged = [];
    for (const [, ss] of [...byFret.entries()].sort((a, b) => a[0] - b[0])) merged.push(...groupAdjacent(ss, frets));
    if (units.length + merged.length > 4) return null;
    // split merged groups back into single fingers where fingers are spare (higher frets first stay merged)
    let spare = 4 - units.length - merged.length;
    const final = [];
    for (const g of merged) {
      if (g.length > 1 && spare >= g.length - 1) { spare -= g.length - 1; final.push(...g.map((s) => [s])); }
      else final.push(g);
    }
    units = units.concat(final);
  }
  if (units.length > 4) return null;
  // number fingers in fret order, low string first
  units.sort((a, b) => frets[a[0]] - frets[b[0]] || a[0] - b[0]);
  units.forEach((u, i) => u.forEach((s) => (fingers[s] = i + 1)));
  return { fingers, barre, count: units.length };
}

function groupAdjacent(strings, frets) {
  const out = [];
  const ss = strings.slice().sort((a, b) => a - b);
  for (const s of ss) {
    const last = out[out.length - 1];
    if (last && s === last[last.length - 1] + 1 && frets[s] === frets[last[0]]) last.push(s);
    else out.push([s]);
  }
  return out;
}

/** Close / drop 2 / drop 3 / drop 2&4 classification of a 4-note voicing. */
export function voicingShape(notes) {
  if (notes.length !== 4) return null;
  const n = notes.slice().sort((a, b) => a - b);
  if (new Set(n.map(mod12)).size !== 4) return null;
  const close = (a) => a[3] - a[0] < 12;
  if (close(n)) return "close";
  // Undo the drop: raise the bass an octave. Where it lands in the close voicing tells us which voice was dropped.
  const raised = n[0] + 12;
  const one = [n[1], n[2], n[3], raised].sort((a, b) => a - b);
  if (close(one)) {
    const idx = one.indexOf(raised);
    if (idx === 2) return "drop2";
    if (idx === 1) return "drop3";
  }
  const two = [n[2], n[3], n[0] + 12, n[1] + 12].sort((a, b) => a - b);
  if (close(two)) return "drop24";
  return null;
}

function cagedForm(chord, frets, o) {
  const fam = FORMS[chord.family];
  if (!fam || chord.bass) return null;
  // Forms only make sense in standard tuning
  const std = [40, 45, 50, 55, 59, 64];
  if (o.tuning.some((n, i) => n !== std[i])) return null;
  for (const [letter, [shape, rootPc]] of Object.entries(fam)) {
    const shift = mod12(chord.root.pc - rootPc);
    for (const sh of [shift, shift + 12]) {
      let match = 0, extra = false, need = 0;
      for (let s = 0; s < 6; s++) {
        const t = shape[s];
        if (t >= 0) need++;
        if (frets[s] < 0) continue;
        if (t < 0) { extra = true; break; }
        if (frets[s] === t + sh) match++;
        else { extra = true; break; }
      }
      if (!extra && match >= 3) return { letter, full: match === need, at: sh };
    }
  }
  return null;
}

function scoreOf(v, open, chord) {
  let sc = 0;
  sc += 2.5 * v.gaps;
  sc += 0.9 * Math.max(0, v.span - 1) + 0.2 * v.span; // a one-fret spread is nothing; real stretches cost
  sc += 0.55 * v.fingerCount;
  if (v.barre) sc += 0.6;
  sc += 0.2 * v.pos;
  sc -= 0.95 * v.strings;
  sc += 0.8 * v.missing.length;
  if (!v.labels.includes("1")) sc += 2;
  if (v.bassLabel !== "1" && !chord.bass) sc += 2.5;
  // classic open ("cowboy") chords
  if (v.form && v.form.at === 0 && v.form.full) sc -= 2.2; // the classic open chords everyone learns
  else if (v.opens && v.top <= 3 && v.gaps === 0 && v.strings >= 4) sc -= chord.family ? 0.8 : 0.5;
  if (v.opens && v.fingerCount === 4 && v.interiorOpen) sc += 1.2;
  if (v.opens && v.top === 4) sc += 0.6;
  if (v.opens && v.top > 4) sc += 1.6; // open strings far up the neck: lovely but specialist
  if (v.fingerCount === 4 && v.span === 3) sc += 0.6;
  // muddy close intervals in the low register
  const ns = v.notes.filter((n) => n != null).sort((a, b) => a - b);
  for (let i = 1; i < ns.length; i++) {
    const d = ns[i] - ns[i - 1];
    if (d === 0) continue;
    if (ns[i] < 52 && d <= 2) sc += 1.2;
    else if (ns[i] < 48 && d <= 3) sc += 0.6;
  }
  // doubled 3rds sound heavier; extended chords want variety rather than doubling
  const count = {};
  for (const l of v.labels) if (l) count[l] = (count[l] || 0) + 1;
  if ((count["3"] || 0) + (count["b3"] || 0) > 1) sc += 0.4;
  if (chord.tones.length >= 4) for (const [l, n] of Object.entries(count)) if (l !== "1" && n > 1) sc += 0.45 * (n - 1);
  if (v.form && v.form.full && v.form.at > 0) sc -= 1.0;
  // three or more separate fingers squeezed onto one fret is cramped
  const perFret = {};
  v.fingers.forEach((fg, s) => { if (fg) { const f = v.frets[s]; (perFret[f] = perFret[f] || new Set()).add(fg); } });
  if (v.opens) for (const set of Object.values(perFret)) if (set.size > 2) sc += 0.5 * (set.size - 2);
  return Math.round(sc * 100) / 100;
}

/** Pick a varied "best" set: good shapes spread across the neck and across string groups. */
export function bestPicks(list, max = 24) {
  const out = [];
  const seen = new Set();
  const region = (v) => (v.opens && v.top <= 4 ? 0 : Math.floor(Math.max(v.pos - 1, 0) / 3) + 1);
  // a shape that is just part of one already picked adds nothing
  const isPart = (v, w) => v.frets.every((f, s) => f < 0 || w.frets[s] === f);
  for (const v of list) {
    if (v.opens && v.top > 4) continue; // open strings ringing against notes high up: kept for the All view
    const bucket = region(v) + ":" + v.low + ":" + (v.strings >= 5 ? "f" : v.strings);
    if (seen.has(bucket)) continue;
    if (out.some((w) => isPart(v, w))) continue;
    seen.add(bucket);
    out.push(v);
    if (out.length >= max) break;
  }
  const top = out[0];
  return [top, ...out.slice(1).sort((a, b) => region(a) - region(b) || a.score - b.score)].filter(Boolean);
}

/** Shapes grouped for the "By position" view. */
export function regionOf(v) {
  if (v.opens && v.top <= 4) return "Open position";
  const lo = Math.floor(Math.max(v.pos - 1, 0) / 3) * 3 + 1;
  return `Frets ${lo}–${lo + 2}`;
}

/** Every chord tone on the neck for the neck map. */
export function neckMap(chord, opts = {}) {
  const o = { ...DEFAULT_OPTS, ...opts };
  const open = o.tuning.map((n) => n + o.capo);
  const pcLabel = new Map(chord.tones.map((t) => [t.pc, t.label]));
  if (chord.bass && !pcLabel.has(chord.bass.pc)) pcLabel.set(chord.bass.pc, "bass");
  const cells = [];
  open.forEach((base, s) => {
    for (let f = 0; f <= o.maxFret; f++) {
      const l = pcLabel.get(mod12(base + f));
      if (l) cells.push({ s, f, label: l, midi: base + f });
    }
  });
  return cells;
}

export const DEGREE_ORDER = Object.keys(INTERVALS);
