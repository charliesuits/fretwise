// Fretwise music theory: note names, chord-symbol parsing, spelling, transposition.
// Pure ES module, no DOM; runs in the app and in Node tests.

export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
// What guitarists usually call each pitch when there's no key to go by.
const COMMON_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const FLAT_KEYS = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb (major keys spelled with flats)

export const mod12 = (n) => ((n % 12) + 12) % 12;

export function parseNote(s) {
  const m = /^([A-Ga-g])([#b♯♭]{0,2})/.exec(s || "");
  if (!m) return null;
  const letter = LETTERS.indexOf(m[1].toUpperCase());
  let acc = 0;
  for (const ch of m[2]) acc += ch === "#" || ch === "♯" ? 1 : -1;
  return { letter, acc, pc: mod12(LETTER_PC[letter] + acc), name: LETTERS[letter] + accStr(acc), len: m[0].length };
}

export function accStr(acc) {
  return acc > 0 ? "#".repeat(acc) : acc < 0 ? "b".repeat(-acc) : "";
}

/** Name a pitch class. pref: "sharp" | "flat" | "common" | key pc (number, major key) */
export function pcName(pc, pref = "common") {
  pc = mod12(pc);
  if (typeof pref === "number") return (FLAT_KEYS.has(mod12(pref)) ? FLAT_NAMES : SHARP_NAMES)[pc];
  if (pref === "flat") return FLAT_NAMES[pc];
  if (pref === "sharp") return SHARP_NAMES[pc];
  return COMMON_NAMES[pc];
}

/** Spell the note that is `degree` (1..13) and `semis` above a root given as {letter, pc}. */
export function spell(root, degree, semis) {
  const letter = (root.letter + degree - 1) % 7;
  const target = mod12(root.pc + semis);
  let acc = mod12(target - LETTER_PC[letter]);
  if (acc > 6) acc -= 12;
  if (Math.abs(acc) > 2) return pcName(target); // fall back for odd cases
  return LETTERS[letter] + accStr(acc);
}

// ---- Interval vocabulary -------------------------------------------------
// label -> [degree number for spelling, semitones above root]
export const INTERVALS = {
  "1": [1, 0], b2: [2, 1], "2": [2, 2], b3: [3, 3], "3": [3, 4], "4": [4, 5],
  b5: [5, 6], "5": [5, 7], "#5": [5, 8], "6": [6, 9], bb7: [7, 9], b7: [7, 10], "7": [7, 11],
  b9: [9, 13], "9": [9, 14], "#9": [9, 15], "11": [11, 17], "#11": [11, 18], b13: [13, 20], "13": [13, 21],
};

// Colour family for degree labels (matches the app's legend)
export function degreeFamily(label) {
  if (label === "1") return "root";
  if (/^b?3$|^[24]$/.test(label)) return "third"; // 3rds and sus tones
  if (/5$/.test(label) && !/1/.test(label)) return "fifth";
  if (/7$/.test(label) || label === "6") return "seventh";
  return "ext";
}

// ---- Chord symbol parsing ------------------------------------------------
/**
 * Parse a chord symbol like "C", "F#m7b5", "Bbmaj9(#11)", "D/F#", "G13sus4", "E7alt", "A5", "C6/9".
 * Returns null if it isn't a chord. Otherwise:
 *  { symbol, root:{letter,acc,pc,name}, quality (text after root), bass:{...}|null,
 *    tones:[{label, semis, pc, name, required}], groups:[{labels, min}], kind, family }
 */
export function parseChord(input) {
  if (!input) return null;
  let s = String(input).trim().replace(/♯/g, "#").replace(/♭/g, "b").replace(/[−–]/g, "-");
  if (!s || !/^[A-G]/.test(s)) return null;
  const root = parseNote(s);
  if (!root) return null;
  let rest = s.slice(root.len);
  // Slash bass: last "/X" where X is a note name. ("6/9" is not a bass.)
  let bass = null;
  const sm = /\/([A-Ga-g][#b]?)$/.exec(rest);
  if (sm) {
    bass = parseNote(sm[1]);
    rest = rest.slice(0, sm.index);
  }
  const quality = rest;
  const spec = parseQuality(rest);
  if (!spec) return null;
  const tones = buildTones(spec);
  if (!tones) return null;
  const out = {
    symbol: s,
    root: { letter: root.letter, acc: root.acc, pc: root.pc, name: root.name },
    quality,
    bass: bass ? { letter: bass.letter, acc: bass.acc, pc: bass.pc, name: bass.name } : null,
    tones: tones.list.map((t) => ({
      ...t,
      pc: mod12(root.pc + t.semis),
      name: spell(root, INTERVALS[t.label][0], t.semis),
    })),
    groups: tones.groups,
    kind: spec,
    family: familyOf(spec),
  };
  if (out.bass) {
    const inChord = out.tones.find((t) => t.pc === out.bass.pc);
    out.bassLabel = inChord ? inChord.label : null; // null = added bass note
  }
  out.name = chordDisplayName(out);
  return out;
}

function parseQuality(q0) {
  let q = q0
    .replace(/[\s,]/g, "")
    .replace(/[()]/g, "")
    .replace(/6\/9/g, "69")
    .replace(/°/g, "dim")
    .replace(/ø7?/g, "m7b5")
    .replace(/Δ(?=\d)/g, "maj")
    .replace(/Δ/g, "maj7");
  const k = {
    third: "maj", // maj | min | sus2 | sus4 | sus24 | none
    fifth: 0, // 0 = perfect, -1 = b5, +1 = #5
    seventh: null, // null | "b7" | "7" | "bb7"
    sixth: false,
    ext: 0, // 9, 11, 13
    adds: [],
    alts: [],
    omit: [],
    alt: false,
    power: false,
    dimTriad: false,
  };
  let majFlag = false;
  let m;
  const take = (re) => {
    const r = re.exec(q);
    if (r) q = q.slice(r[0].length);
    return r;
  };

  if (q === "5") { k.power = true; k.third = "none"; return k; }
  if (q === "" || q === "M" || /^maj$/i.test(q) || q === "ma") return k;

  // Quality prefix
  if (take(/^(mmaj|mMaj|mM|minmaj|minMaj|mimaj|mima|-maj|-M|mΔ|-Δ)/)) { k.third = "min"; majFlag = true; }
  else if (take(/^(maj|Maj|MAJ|Ma|ma|M)(?![a-z])/) || take(/^(maj|Maj|MAJ)/)) majFlag = true;
  else if (take(/^(min|mi|m|-)(?!aj)/)) k.third = "min";
  else if (take(/^(dim|o)/)) { k.third = "min"; k.fifth = -1; k.dimTriad = true; }
  else if (take(/^(aug|\+)/)) k.fifth = 1;

  // Main number
  if ((m = take(/^(13|11|9|7|69|6|2|4)/))) {
    const n = m[1];
    if (n === "69") { k.sixth = true; k.adds.push("9"); }
    else if (n === "6") k.sixth = true;
    else if (n === "2") k.adds.push("2");
    else if (n === "4") k.third = "sus4";
    else {
      if (k.dimTriad && !majFlag) k.seventh = "bb7";
      else k.seventh = majFlag ? "7" : "b7";
      k.ext = n === "7" ? 0 : +n;
    }
  } else if (majFlag && /^add|^sus|^\d/.test(q) === false && q === "") {
    // plain "maj" handled above
  }

  // Modifiers
  let guard = 0;
  while (q.length && guard++ < 20) {
    if ((m = take(/^sus(2)?(4)?/))) {
      k.third = m[1] && m[2] ? "sus24" : m[1] ? "sus2" : "sus4";
      continue;
    }
    if ((m = take(/^add([#b]?)(2|4|6|9|11|13)/))) { k.adds.push((m[1] || "") + m[2]); continue; }
    if ((m = take(/^(no|omit)(1|3|5|R)/))) { k.omit.push(m[2] === "R" ? "1" : m[2]); continue; }
    if (take(/^alt(ered)?/)) { k.alt = true; if (!k.seventh) k.seventh = "b7"; continue; }
    if ((m = take(/^(maj7|M7|ma7|maj|Δ)/))) { k.seventh = "7"; continue; }
    if ((m = take(/^([#b+\-])(5|9|11|13)/))) {
      const sgn = m[1] === "#" || m[1] === "+" ? "#" : "b";
      if (m[2] === "5") k.fifth = sgn === "#" ? 1 : -1;
      else k.alts.push(sgn + m[2]);
      continue;
    }
    if (take(/^(aug|\+)/)) { k.fifth = 1; continue; }
    if ((m = take(/^(9|11|13)/))) { k.adds.push(m[1]); continue; } // e.g. "7(9)"
    if ((m = take(/^6/))) { k.sixth = true; continue; }
    return null; // unknown text: not a chord we understand
  }
  if (k.dimTriad && k.seventh === "b7") k.seventh = "bb7";
  return k;
}

function buildTones(k) {
  const list = [];
  const groups = [];
  const add = (label, required = true) => {
    const ex = list.find((t) => t.label === label);
    if (ex) { ex.required = ex.required || required; return; }
    list.push({ label, semis: INTERVALS[label][1], required });
  };
  add("1");
  if (k.power) { add("5"); return { list, groups }; }

  const has7 = !!k.seventh;
  const big = has7 || k.sixth || k.adds.length > 0 || k.ext;
  // third / sus
  if (k.third === "maj") add("3", !(k.ext === 11 && !k.alts.includes("#11")));
  else if (k.third === "min") add("b3");
  else if (k.third === "sus4") add("4");
  else if (k.third === "sus2") add("2");
  else if (k.third === "sus24") { add("2"); add("4"); }
  // fifth
  if (k.fifth === -1) add("b5");
  else if (k.fifth === 1) add("#5");
  else add("5", !big);
  // sixth
  if (k.sixth) add("6");
  // seventh
  if (k.seventh) add(k.seventh);
  // extensions
  const altered = (n) => k.alts.some((a) => a.slice(1) === n);
  if (k.ext >= 9 && !altered("9")) add("9", k.ext === 9);
  if (k.ext >= 11) {
    if (k.ext === 11 && !altered("11")) add("11");
    else if (k.ext === 13 && k.third === "min" && !altered("11")) add("11", false);
  }
  if (k.ext === 13 && !altered("13")) add("13");
  // alterations
  for (const a of k.alts) add(a);
  // adds
  for (const a of k.adds) {
    if (INTERVALS[a]) add(a);
  }
  if (k.alt) {
    for (const a of ["b9", "#9", "#5", "b5"]) if (!list.find((t) => t.label === a)) add(a, false);
    const fifth = list.find((t) => t.label === "5");
    if (fifth) list.splice(list.indexOf(fifth), 1);
    groups.push({ labels: ["b9", "#9", "#5", "b5"], min: 2 });
  }
  // omits
  for (const o of k.omit) {
    const lbls = o === "3" ? ["3", "b3"] : o === "5" ? ["5"] : ["1"];
    for (const l of lbls) {
      const i = list.findIndex((t) => t.label === l);
      if (i >= 0) list.splice(i, 1);
    }
  }
  // sort by semitone
  list.sort((a, b) => a.semis - b.semis);
  return { list, groups };
}

function familyOf(k) {
  if (k.power) return "5";
  if (k.alt || k.alts.length || k.adds.length || k.ext || k.sixth || k.omit.length) return null;
  if (k.third === "maj" && k.fifth === 0 && !k.seventh) return "maj";
  if (k.third === "min" && k.fifth === 0 && !k.seventh) return "m";
  if (k.third === "maj" && k.fifth === 0 && k.seventh === "b7") return "7";
  if (k.third === "min" && k.fifth === 0 && k.seventh === "b7") return "m7";
  if (k.third === "maj" && k.fifth === 0 && k.seventh === "7") return "maj7";
  return null;
}

/** Long-form description, e.g. "C minor 7 flat 5" style but compact. */
export function chordDisplayName(c) {
  return c.root.name + c.quality + (c.bass ? "/" + c.bass.name : "");
}

/** Human description of what the chord is, for the header. */
export function describeChord(c) {
  const k = c.kind;
  if (k.power) return "power chord (root and 5th)";
  if (k.alt) return "altered dominant";
  const sus = k.third === "sus4" ? " suspended 4th" : k.third === "sus2" ? " suspended 2nd" : k.third === "sus24" ? " suspended 2nd and 4th" : "";
  const n = k.ext ? k.ext + "th" : "7th";
  let base;
  if (k.seventh === "b7") {
    if (k.third === "min" && k.fifth === -1) base = k.ext ? "minor " + n + " flat 5" : "half-diminished (minor 7th flat 5)";
    else if (k.third === "min") base = "minor " + n;
    else if (k.fifth === 1) base = "augmented " + n;
    else base = "dominant " + n + sus;
  } else if (k.seventh === "7") {
    base = (k.third === "min" ? "minor-major " : k.fifth === 1 ? "augmented major " : "major ") + n + sus;
  } else if (k.seventh === "bb7") base = "diminished 7th";
  else if (k.sixth) base = (k.third === "min" ? "minor " : "major ") + (k.adds.includes("9") ? "6/9" : "6th");
  else if (k.third === "min") base = k.fifth === -1 ? "diminished" : "minor";
  else if (k.fifth === 1) base = "augmented";
  else if (sus) base = sus.trim();
  else base = "major";
  if (k.fifth === -1 && !/diminished|flat 5/.test(base)) base += " flat 5";
  if (k.fifth === 1 && !/augmented/.test(base)) base += " sharp 5";
  const extras = [...k.alts.map((a) => a.replace("b", "♭").replace("#", "♯")), ...k.adds.filter((a) => !(k.sixth && a === "9")).map((a) => "add " + a)];
  if (extras.length) base += ", " + extras.join(", ");
  if (k.omit.length) base += ", no " + k.omit.map((o) => (o === "1" ? "root" : o + (o === "3" ? "rd" : "th"))).join(" or ");
  return base;
}

// ---- Transposition and keys ---------------------------------------------
/** Transpose a chord symbol by semitones. keyPc (optional) picks sharp/flat spelling. */
export function transposeSymbol(sym, semis, keyPc = null) {
  const c = parseChord(sym);
  if (!c || semis === 0 && keyPc == null) return sym;
  const pref = keyPc == null ? "common" : keyPc;
  const r = pcName(c.root.pc + semis, pref);
  let b = "";
  if (c.bass) {
    // spell the bass relative to the new root so D/F# -> E/G#, not E/Ab
    const nr = parseNote(r);
    const deg = ((c.bass.letter - c.root.letter + 7) % 7) + 1;
    b = "/" + spell(nr, deg, mod12(c.bass.pc - c.root.pc));
  }
  return r + c.quality + b;
}

const NUMERALS = ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"];
/** Roman numeral of a chord in a major key (minor chords lower-case). */
export function romanNumeral(sym, keyPc) {
  const c = parseChord(sym);
  if (!c) return "";
  let n = NUMERALS[mod12(c.root.pc - keyPc)];
  const minorish = c.kind.third === "min";
  if (minorish) n = n.replace(/[IV]+/, (x) => x.toLowerCase());
  let suf = "";
  const k = c.kind;
  if (k.third === "min" && k.fifth === -1) suf = k.seventh === "b7" ? "ø7" : "°" + (k.seventh ? "7" : "");
  else if (k.fifth === 1) suf = "+";
  if (!suf) {
    if (k.seventh === "7") suf = "maj7";
    else if (k.seventh === "b7") suf = k.ext ? String(k.ext) : "7";
    else if (k.sixth) suf = "6";
    if (k.third.startsWith("sus")) suf += "sus";
  }
  let out = n + suf;
  if (c.bass) out += "/" + NUMERALS[mod12(c.bass.pc - keyPc)];
  return out;
}

/** Nashville number (1, 2m, 4, 5/7...) */
export function nashville(sym, keyPc) {
  const c = parseChord(sym);
  if (!c) return "";
  const nums = ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"];
  let q = c.quality.replace(/^(maj|Maj|M)(?=7|9|13)/, "Δ");
  let out = nums[mod12(c.root.pc - keyPc)] + q;
  if (c.bass) out += "/" + nums[mod12(c.bass.pc - keyPc)];
  return out;
}

/** Guess a song's key (major) from a list of chord symbols. Returns pc. */
export function guessKey(symbols) {
  const chords = symbols.map(parseChord).filter(Boolean);
  if (!chords.length) return 0;
  const best = { pc: 0, score: -1e9 };
  const diatonic = [[0, "maj"], [2, "min"], [4, "min"], [5, "maj"], [7, "maj"], [9, "min"], [11, "dim"]];
  for (let k = 0; k < 12; k++) {
    let score = 0;
    chords.forEach((c, i) => {
      const deg = mod12(c.root.pc - k);
      const q = c.kind.third === "min" ? (c.kind.fifth === -1 ? "dim" : "min") : "maj";
      const d = diatonic.find(([s]) => s === deg);
      if (d) score += d[1] === q ? 2 : 0.5;
      else score -= 1;
      if (deg === 0 && (i === 0 || i === chords.length - 1)) score += 1.5;
      if (deg === 7 && c.kind.seventh === "b7") score += 0.5;
    });
    if (score > best.score) { best.score = score; best.pc = k; }
  }
  return best.pc;
}

export const KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// ---- Tunings -------------------------------------------------------------
// MIDI note numbers, low string to high string.
export const TUNINGS = {
  standard: { name: "Standard (EADGBE)", notes: [40, 45, 50, 55, 59, 64] },
  dropD: { name: "Drop D (DADGBE)", notes: [38, 45, 50, 55, 59, 64] },
  halfDown: { name: "Half step down (Eb)", notes: [39, 44, 49, 54, 58, 63] },
  wholeDown: { name: "Whole step down (D)", notes: [38, 43, 48, 53, 57, 62] },
  dadgad: { name: "DADGAD", notes: [38, 45, 50, 55, 57, 62] },
  openG: { name: "Open G (DGDGBD)", notes: [38, 43, 50, 55, 59, 62] },
  openD: { name: "Open D (DADF#AD)", notes: [38, 45, 50, 54, 57, 62] },
  openE: { name: "Open E (EBEG#BE)", notes: [40, 47, 52, 56, 59, 64] },
  openC: { name: "Open C (CGCGCE)", notes: [36, 43, 48, 55, 60, 64] },
  dropC: { name: "Drop C (CGCFAD)", notes: [36, 43, 48, 53, 57, 62] },
};

export function midiName(m) {
  return pcName(m) + (Math.floor(m / 12) - 1);
}
