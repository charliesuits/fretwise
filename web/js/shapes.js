// Movable chord shapes: voicings with the letter name taken out, so they can be practised anywhere on the neck.
import { parseChord, mod12, INTERVALS, pcName } from "./theory.js";
import { findVoicings } from "./voicer.js";

/**
 * Every movable shape (no open strings) for a chord quality, e.g. "m7" or "" for major.
 * Each shape: { key, quality, rel:[-1|1..5], labels, fingers, barre:{fret,from,to}|null, tags, form,
 *   low, high, strings, span, bassLabel, score }
 * rel frets are relative: 1 = the lowest fret the shape uses.
 */
export function movableShapes(quality, opts = {}) {
  const chord = parseChord("C" + quality);
  if (!chord) return [];
  const list = findVoicings(chord, { ...opts, capo: 0, maxFret: 17 });
  const map = new Map();
  for (const v of list) {
    if (v.opens) continue;
    const base = v.pos;
    const rel = v.frets.map((f) => (f < 0 ? -1 : f - base + 1));
    const key = rel.join(",");
    const score = v.score - 0.2 * v.pos; // position doesn't matter once the letter is gone
    const ex = map.get(key);
    if (ex && ex.score <= score) continue;
    map.set(key, {
      key, quality, rel,
      labels: v.labels.slice(),
      fingers: v.fingers.slice(),
      barre: v.barre ? { ...v.barre, fret: v.barre.fret - base + 1 } : null,
      tags: v.tags.filter((t) => t !== "open"),
      form: v.form ? v.form.letter : null,
      low: v.low, high: v.high, strings: v.strings, span: v.span, gaps: v.gaps,
      bassLabel: v.bassLabel, missing: v.missing, score,
    });
  }
  return [...map.values()].sort((a, b) => a.low - b.low || bassRank(a.bassLabel) - bassRank(b.bassLabel) || a.score - b.score);
}

const BASS_ORDER = ["1", "3", "b3", "2", "4", "5", "b5", "#5", "6", "bb7", "b7", "7"];
function bassRank(l) {
  const i = BASS_ORDER.indexOf(l);
  return i < 0 ? 99 : i;
}

/** Name a degree for headings: "Root", "3rd", "♭7th"... */
export function degreeWord(label) {
  if (label === "1") return "Root";
  const m = /^(bb|b|#)?(\d+)$/.exec(label || "");
  if (!m) return label || "";
  const n = +m[2];
  const suf = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  const acc = m[1] === "bb" ? "𝄫" : m[1] === "b" ? "♭" : m[1] === "#" ? "♯" : "";
  return acc + n + suf;
}

/** Group heading for a shape: which string the lowest note is on and what it is. */
export function groupOf(shape, stringCount = 6) {
  const str = stringCount - shape.low;
  return `${degreeWord(shape.bassLabel)} on string ${str}`;
}

/** "Strings 6–1" style string set label. */
export function stringSet(shape, stringCount = 6) {
  return `Strings ${stringCount - shape.low}–${stringCount - shape.high}`;
}

/** Highest relative fret in the shape. */
export const shapeTop = (shape) => Math.max(...shape.rel.filter((r) => r > 0));

/**
 * Put a shape on the neck with its lowest fret at `start`.
 * Returns a voicing-like object for the diagram/neck code plus the chord it makes.
 */
export function placeShape(shape, start, tuning) {
  const frets = shape.rel.map((r) => (r < 0 ? -1 : r + start - 1));
  const notes = frets.map((f, s) => (f < 0 ? null : tuning[s] + f));
  // root = any sounded string minus that string's interval above the root
  let rootPc = 0;
  for (let s = 0; s < frets.length; s++) {
    const l = shape.labels[s];
    if (notes[s] != null && l && INTERVALS[l]) { rootPc = mod12(notes[s] - INTERVALS[l][1]); break; }
  }
  const rootName = pcName(rootPc);
  const chord = parseChord(rootName + shape.quality);
  return {
    frets, notes, labels: shape.labels, fingers: shape.fingers,
    barre: shape.barre ? { ...shape.barre, fret: shape.barre.fret + start - 1 } : null,
    key: frets.join(","), rootPc, rootName, chord,
  };
}

/** Highest start fret that keeps the shape inside maxFret. */
export const maxStart = (shape, maxFret) => Math.max(1, maxFret - shapeTop(shape) + 1);

/** Root pitch class the shape makes at a start fret (cheap version of placeShape). */
export function rootAt(shape, start, tuning) {
  return placeShape(shape, start, tuning).rootPc;
}

/** Next start fret for a practice pattern. */
export function nextStart(shape, start, pattern, tuning, maxFret, rand = Math.random) {
  const hi = maxStart(shape, maxFret);
  if (pattern === "random") {
    if (hi <= 1) return 1;
    let n = start;
    while (n === start) n = 1 + Math.floor(rand() * hi);
    return n;
  }
  if (pattern === "fourths") {
    // root up a perfect 4th: same shape 5 frets higher, or 7 lower; pick whichever fits and stays nearest
    const opts = [start + 5, start - 7, start + 5 - 12, start - 7 + 12].filter((n) => n >= 1 && n <= hi);
    if (!opts.length) return start;
    return opts.sort((a, b) => Math.abs(a - start) - Math.abs(b - start))[0];
  }
  if (pattern === "down") return start <= 1 ? hi : start - 1;
  return start >= hi ? 1 : start + 1; // chromatic up
}
