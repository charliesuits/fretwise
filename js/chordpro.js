// Songs: ChordPro parsing, conversion from "chords over lyrics" text, and chord utilities.
import { parseChord } from "./theory.js";

const META = { t: "title", title: "title", st: "subtitle", subtitle: "subtitle", artist: "artist", composer: "composer",
  key: "key", capo: "capo", tempo: "tempo", time: "time", album: "album", year: "year", duration: "duration" };
const SECTION_SHORT = { soc: "chorus", sov: "verse", sob: "bridge", sot: "tab", sog: "grid" };
const END_SHORT = { eoc: 1, eov: 1, eob: 1, eot: 1, eog: 1 };
const COMMENT = { c: "comment", comment: "comment", ci: "comment", comment_italic: "comment", cb: "comment", comment_box: "comment", highlight: "comment" };

/**
 * Parse ChordPro text.
 * Returns { meta:{title, artist, key, capo, ...}, sections:[{type, label, lines:[line]}] }
 * line: {kind:"lyric", chunks:[{chord, text}]} | {kind:"comment", text} | {kind:"blank"}
 *     | {kind:"grid", bars:[[chord|"."|"%"]]} | {kind:"tab", text} | {kind:"ref", label}
 */
export function parseChordPro(src) {
  const meta = {};
  const sections = [];
  let cur = null;
  const open = (type, label) => {
    cur = { type, label: label || titleCase(type), lines: [] };
    sections.push(cur);
  };
  const ensure = () => { if (!cur) open("verse", ""); return cur; };
  const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (/^#/.test(line)) continue;
    const dm = /^\s*\{\s*([A-Za-z_\-]+)\s*(?:[:\s]\s*(.*?))?\s*\}\s*$/.exec(line);
    if (dm) {
      const name = dm[1].toLowerCase();
      const val = (dm[2] || "").trim();
      if (META[name]) { meta[META[name]] = val; continue; }
      if (name === "meta") { const [k, ...v] = val.split(/\s+/); meta[k.toLowerCase()] = v.join(" "); continue; }
      if (COMMENT[name]) { ensure().lines.push({ kind: "comment", text: val }); continue; }
      const so = /^start_of_(\w+)$/.exec(name);
      if (so || SECTION_SHORT[name]) {
        const type = so ? so[1] : SECTION_SHORT[name];
        open(type, val.replace(/^label=["']?|["']$/g, ""));
        continue;
      }
      if (/^end_of_/.test(name) || END_SHORT[name]) { cur = null; continue; }
      if (name === "chorus") { ensure().lines.push({ kind: "ref", label: val || "Chorus" }); continue; }
      continue; // unknown directives are ignored
    }
    if (cur && (cur.type === "tab")) { cur.lines.push({ kind: "tab", text: raw }); continue; }
    if (cur && cur.type === "grid") {
      if (line.trim()) cur.lines.push({ kind: "grid", bars: parseGridLine(line) });
      continue;
    }
    if (!line.trim()) {
      // a blank line between blocks outside an explicit section starts a new block
      if (cur && !cur.explicit && cur.lines.length) cur.lines.push({ kind: "blank" });
      else if (cur) cur.lines.push({ kind: "blank" });
      continue;
    }
    ensure().lines.push({ kind: "lyric", chunks: parseChunks(line) });
  }
  // trim blank lines at the ends of sections; drop empty sections
  for (const s of sections) {
    while (s.lines.length && s.lines[s.lines.length - 1].kind === "blank") s.lines.pop();
    while (s.lines.length && s.lines[0].kind === "blank") s.lines.shift();
  }
  return { meta, sections: sections.filter((s) => s.lines.length) };
}

function titleCase(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "";
}

function parseChunks(line) {
  const chunks = [];
  const re = /\[([^\]]*)\]/g;
  let last = 0, m, pending = null;
  while ((m = re.exec(line))) {
    const text = line.slice(last, m.index);
    if (pending !== null || text) chunks.push({ chord: pending, text });
    pending = m[1];
    last = re.lastIndex;
  }
  const tail = line.slice(last);
  if (pending !== null || tail) chunks.push({ chord: pending, text: tail });
  return chunks;
}

function parseGridLine(line) {
  return line.split("|").map((b) => b.trim()).filter((b) => b.length).map((b) => b.split(/\s+/));
}

/** Every chord symbol used, in order of first appearance. */
export function chordsUsed(song) {
  const out = [];
  const add = (c) => { if (c && !c.startsWith("*") && parseChord(c) && !out.includes(c)) out.push(c); };
  for (const s of song.sections) for (const l of s.lines) {
    if (l.kind === "lyric") l.chunks.forEach((ch) => add(ch.chord));
    if (l.kind === "grid") l.bars.forEach((b) => b.forEach(add));
  }
  return out;
}

/** Chord sequence per section, consecutive repeats collapsed (for the chart view). */
export function progression(song) {
  return song.sections.map((s) => {
    const seq = [];
    for (const l of s.lines) {
      if (l.kind === "lyric") for (const ch of l.chunks) if (ch.chord && parseChord(ch.chord)) seq.push(ch.chord);
      if (l.kind === "grid") for (const b of l.bars) for (const c of b) if (parseChord(c)) seq.push(c);
    }
    const collapsed = seq.filter((c, i) => c !== seq[i - 1]);
    return { type: s.type, label: s.label, chords: collapsed, grid: s.lines.filter((l) => l.kind === "grid").map((l) => l.bars), ref: s.lines.find((l) => l.kind === "ref") };
  });
}

/** Apply a function to every chord in ChordPro source (e.g. to transpose permanently). */
export function mapChordsInSource(src, fn) {
  return String(src).split("\n").map((line) => {
    if (/^\s*\{/.test(line)) return line;
    if (/^\s*\|/.test(line)) return line.replace(/([A-G][^\s|]*)/g, (c) => (parseChord(c) ? fn(c) : c));
    return line.replace(/\[([^\]]+)\]/g, (m, c) => (parseChord(c) ? "[" + fn(c) + "]" : m));
  }).join("\n");
}

// ---- Conversion from plain "chords over lyrics" text ---------------------
const SECTION_RE = /^\s*[\[(]?\s*((?:pre[\s-]?)?chorus|verse|bridge|intro|outro|interlude|solo|instrumental|tag|coda|refrain|hook|break|ending|turnaround|vamp|post[\s-]?chorus|riff)\b([^\])]*)[\])]?\s*:?\s*$/i;
const FILLER = /^(\||\|\||%|\/|-|–|x\d+|\(x\d+\)|\d+x|n\.?c\.?|\.|\(|\)|:\||\|:|\*)$/i;

function chordToken(t) {
  const core = t.replace(/^[(|]+|[)|,]+$/g, "");
  if (!core) return "filler";
  if (FILLER.test(core) || FILLER.test(t)) return "filler";
  return parseChord(core) ? "chord" : "word";
}

export function isChordLine(line) {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  let chords = 0;
  for (const t of toks) {
    const k = chordToken(t);
    if (k === "word") return false;
    if (k === "chord") chords++;
  }
  return chords > 0;
}

/** True if the text already looks like ChordPro (directives or inline [Chords]). */
export function looksLikeChordPro(text) {
  if (/^\s*\{[a-z_]+[:}\s]/im.test(text)) return true;
  const inline = text.match(/\[([^\]\n]+)\]/g) || [];
  const real = inline.filter((x) => parseChord(x.slice(1, -1)));
  return real.length >= 2 && real.length >= inline.length * 0.6;
}

/** Convert pasted chords-over-lyrics text (Ultimate Guitar style etc.) into ChordPro. */
export function convertToChordPro(text, meta = {}) {
  let src = String(text).replace(/\r\n?/g, "\n")
    .replace(/\[\/?ch\]/g, "")
    .replace(/\[tab\]|\[\/tab\]/g, "")
    .replace(/\t/g, "    ");
  const lines = src.split("\n");
  const out = [];
  if (meta.title) out.push(`{title: ${meta.title}}`);
  if (meta.artist) out.push(`{artist: ${meta.artist}}`);
  if (meta.key) out.push(`{key: ${meta.key}}`);
  if (meta.capo) out.push(`{capo: ${meta.capo}}`);
  let section = null;
  const close = () => { if (section) out.push(`{end_of_${section}}`); section = null; };
  const openSec = (label) => {
    close();
    const l = label.toLowerCase();
    const type = /chorus/.test(l) && !/pre|post/.test(l) ? "chorus" : /verse/.test(l) ? "verse" : /bridge/.test(l) ? "bridge" : "part";
    section = type;
    out.push(`{start_of_${type}: ${label}}`);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");
    const sm = SECTION_RE.exec(line);
    if (sm && !isChordLine(line)) {
      const label = (sm[1] + (sm[2] || "")).replace(/\s+/g, " ").replace(/[:\s]+$/, "").trim();
      openSec(label.charAt(0).toUpperCase() + label.slice(1));
      continue;
    }
    // "Capo 2" lines
    const cm = /^\s*capo\s*(?:on\s*)?(\d+)/i.exec(line);
    if (cm && line.length < 30) { out.push(`{capo: ${cm[1]}}`); continue; }
    if (isChordLine(line)) {
      const next = lines[i + 1];
      if (next != null && next.trim() && !isChordLine(next) && !SECTION_RE.test(next)) {
        out.push(merge(line, next.replace(/\s+$/, "")));
        i++;
      } else {
        out.push(chordsOnly(line));
      }
      continue;
    }
    out.push(line);
  }
  close();
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function chordsOnly(line) {
  return line.trim().split(/\s+/).map((t) => {
    const core = t.replace(/^[(|]+|[)|,]+$/g, "");
    return chordToken(t) === "chord" ? t.replace(core, "[" + core + "]") : t;
  }).join(" ");
}

function merge(chordLine, lyric) {
  // positions of chords in the chord line
  const marks = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(chordLine))) {
    const t = m[0];
    const core = t.replace(/^[(|]+|[)|,]+$/g, "");
    if (chordToken(t) === "chord" || /^n\.?c\.?$/i.test(core)) marks.push({ at: m.index + t.indexOf(core), chord: core });
  }
  let text = lyric;
  const need = marks.length ? marks[marks.length - 1].at : 0;
  if (text.length < need) text = text.padEnd(need, " ");
  let out = "";
  let pos = 0;
  for (const mk of marks) {
    out += text.slice(pos, mk.at) + "[" + mk.chord + "]";
    pos = mk.at;
  }
  out += text.slice(pos);
  return out.replace(/\s+$/, "");
}
