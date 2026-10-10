// Fretwise app: routing, chord finder, songs, editor, settings.
import { parseChord, describeChord, transposeSymbol, romanNumeral, guessKey, pcName, mod12, TUNINGS, KEY_NAMES, degreeFamily, parseNote } from "./theory.js";
import { findVoicings, bestPicks, neckMap, regionOf } from "./voicer.js";
import { chordBox, neckSvg, shapeText } from "./diagram.js";
import { strum, pluck, unlock } from "./audio.js";
import { parseChordPro, chordsUsed, progression, convertToChordPro, looksLikeChordPro, isChordLine } from "./chordpro.js";
import { songs, uid, loadPrefs, savePrefs, saveText, openTextFiles, keepAwake, persistStorage, isAndroid } from "./store.js";
import { SAMPLES } from "./samples.js";

const VERSION = "1.0.0";
const $view = document.getElementById("view");
let prefs = loadPrefs();
const setPref = (patch) => { prefs = { ...prefs, ...patch }; savePrefs(prefs); };

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const qs = (sel, el = $view) => el.querySelector(sel);
const qsa = (sel, el = $view) => [...el.querySelectorAll(sel)];
let toastTimer = 0;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2400);
}
const ICON = {
  play: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/></svg>`,
  clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1L3.2 9.6l6.1-.8z"/></svg>`,
  starO: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1L3.2 9.6l6.1-.8z"/></svg>`,
  sliders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 14v6h14v-6"/></svg>`,
  import: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 14v6h14v-6"/></svg>`,
};

function applyTheme() {
  const r = document.documentElement;
  if (prefs.theme === "auto") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", prefs.theme);
  const dark = prefs.theme === "stage" || (prefs.theme === "auto" && !matchMedia("(prefers-color-scheme: light)").matches);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", dark ? "#1d1511" : "#ecebe6");
  if (window.FretwiseAndroid && window.FretwiseAndroid.setDark) window.FretwiseAndroid.setDark(dark);
}

function tuningNotes() { return (TUNINGS[prefs.tuning] || TUNINGS.standard).notes; }
function voicerOpts(extra = {}) {
  return {
    tuning: tuningNotes(), capo: prefs.capo || 0, maxFret: prefs.maxFret, span: prefs.stretch ? 5 : 4,
    inversions: prefs.inversions, rootless: prefs.rootless, maxGaps: 1, ...extra,
  };
}
const vCache = new Map();
function voicingsFor(chord, extra = {}) {
  const o = voicerOpts(extra);
  const k = chord.symbol + "|" + JSON.stringify(o);
  if (!vCache.has(k)) { if (vCache.size > 200) vCache.clear(); vCache.set(k, findVoicings(chord, o)); }
  return vCache.get(k);
}

const FAMILY_NAME = { root: "Root", third: "3rd", fifth: "5th", seventh: "6th/7th", ext: "Extensions", bass: "Added bass" };
function legend() {
  return `<div class="legend">${["root", "third", "fifth", "seventh", "ext"].map((f) => `<span><i style="background:var(--deg-${f})"></i>${FAMILY_NAME[f]}</span>`).join("")}</div>`;
}
function tagText(v) {
  const t = [];
  if (v.form) t.push(v.form.letter + " form");
  const map = { open: "open", barre: "barre", triad: "triad", shell: "shell", close: "close", drop2: "drop 2", drop3: "drop 3", drop24: "drop 2&4", inversion: "inversion", rootless: "rootless" };
  for (const x of v.tags) if (map[x] && !(x === "barre" && v.form)) t.push(map[x]);
  if (v.bassLabel && v.bassLabel !== "1" && !t.includes("inversion")) t.push((v.bassLabel === "bass" ? "added" : v.bassLabel) + " in bass");
  return t.join(" · ") || (v.pos ? "fret " + v.pos : "");
}
function card(v, { selected = false, fav = false, starable = true, idx = 0 } = {}) {
  return `<div class="vcard" aria-selected="${selected}" data-key="${v.key}">
    <button class="hit" data-act="pick" data-key="${v.key}" aria-label="Play shape ${esc(shapeText(v.frets))}"></button>
    ${starable ? `<button class="star" data-act="fav" data-key="${v.key}" aria-pressed="${fav}" aria-label="${fav ? "Remove favourite" : "Make this my usual shape"}">${fav ? ICON.star : ICON.starO}</button>` : ""}
    ${chordBox(v, { mode: prefs.labels, lefty: prefs.lefty })}
    <div class="cap">${esc(shapeText(v.frets))}</div>
    <div class="tags">${esc(tagText(v))}</div>
  </div>`;
}
const favKey = (chord) => chord.name;
function preferredVoicing(chord, list, songShapes) {
  const want = (songShapes && songShapes[chord.name]) || prefs.favs[favKey(chord)];
  return (want && list.find((v) => v.key === want)) || list[0] || null;
}

// ---------- sheet ----------
function openSheet(html, onClick) {
  closeSheet();
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  const sh = document.createElement("div");
  sh.className = "sheet";
  sh.setAttribute("role", "dialog");
  sh.setAttribute("aria-modal", "true");
  sh.innerHTML = `<div class="grab"></div>` + html;
  scrim.onclick = closeSheet;
  document.body.append(scrim, sh);
  sh.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); else onClick && onClick(e, sh); });
  const f = sh.querySelector("button, input, select");
  if (f) f.focus({ preventScroll: true });
  history.pushState({ sheet: 1 }, "");
  sheetOpen = true;
  return sh;
}
let sheetOpen = false;
function closeSheet(fromPop) {
  const had = document.querySelector(".sheet");
  document.querySelectorAll(".scrim,.sheet").forEach((n) => n.remove());
  if (had && sheetOpen && !fromPop) { sheetOpen = false; history.back(); }
  sheetOpen = false;
}
window.addEventListener("popstate", () => { if (document.querySelector(".sheet")) closeSheet(true); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.querySelector(".sheet")) closeSheet(); });

// ---------- routing ----------
let cleanup = null;
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  closeSheet(true);
  $view.onclick = null;
  $view.onchange = null;
  const h = location.hash || "#/chords";
  const [, page, arg] = h.match(/^#\/([^/]*)\/?(.*)$/) || [];
  qsa("nav.tabs button", document).forEach((b) => b.setAttribute("aria-current", h.startsWith(b.dataset.go) || (page === "song" || page === "edit") && b.dataset.go === "#/songs" ? "page" : "false"));
  $view.scrollTop = 0;
  if (page === "songs") return viewSongs();
  if (page === "song") return viewSong(decodeURIComponent(arg));
  if (page === "edit") return viewEditor(decodeURIComponent(arg));
  if (page === "settings") return viewSettings();
  return viewChords(decodeURIComponent(arg || ""));
}
window.addEventListener("hashchange", route);
document.querySelector("nav.tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-go]");
  if (!b) return;
  if (b.dataset.go === "#/chords" && chordState.input) location.hash = "#/chords/" + encodeURIComponent(chordState.input);
  else location.hash = b.dataset.go;
});
document.addEventListener("pointerdown", () => unlock(), { once: true });

// ======================================================================
// Chord finder
// ======================================================================
const ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const QUALS = [["", "maj"], ["m", "m"], ["7", "7"], ["maj7", "maj7"], ["m7", "m7"], ["6", "6"], ["m6", "m6"], ["9", "9"], ["maj9", "maj9"], ["m9", "m9"], ["add9", "add9"],
  ["sus2", "sus2"], ["sus4", "sus4"], ["7sus4", "7sus4"], ["11", "11"], ["m11", "m11"], ["13", "13"], ["maj13", "maj13"], ["6/9", "6/9"],
  ["dim", "dim"], ["dim7", "dim7"], ["m7b5", "m7♭5"], ["aug", "aug"], ["7#5", "7♯5"], ["7b9", "7♭9"], ["7#9", "7♯9"], ["7#11", "7♯11"], ["maj7#11", "maj7♯11"], ["7alt", "7alt"], ["mMaj7", "m(maj7)"], ["5", "5"]];
const FILTERS = [["best", "Best"], ["open", "Open"], ["barre", "Barre"], ["triad", "Triads"], ["jazz", "Jazz"], ["all", "All"]];
const chordState = { input: "", filter: "best", selected: null, limit: 60 };

function viewChords(initial) {
  if (initial) chordState.input = initial;
  $view.innerHTML = `<div class="page finder">
    <div class="left">
      <div class="symbol-bar">
        <input class="symbol-input" id="sym" value="${esc(chordState.input)}" placeholder="Type a chord" aria-label="Chord symbol" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="search">
        <button class="btn" data-act="clear" aria-label="Clear">${ICON.clear}</button>
      </div>
      <div class="keypad">
        <div class="roots" role="group" aria-label="Root">${ROOTS.map((r) => `<button data-root="${r}" aria-pressed="false">${r}</button>`).join("")}</div>
        <div class="quals" role="group" aria-label="Chord type">${QUALS.map(([q, l]) => `<button data-qual="${esc(q)}" aria-pressed="false">${esc(l)}</button>`).join("")}</div>
      </div>
      <div class="recent" id="recent"></div>
      <div id="info"></div>
      <div id="opts-inline" class="opts-inline">${optionsHtml()}</div>
    </div>
    <div class="right">
      <div class="neck-wrap" id="neck"></div>
      <div class="shape-tools">
        <div class="seg" id="filters" role="group" aria-label="Which shapes"></div>
        <div class="row"><span class="count" id="count"></span><button class="btn sm opts-btn" data-act="options">${ICON.sliders}<span>Options</span></button></div>
      </div>
      <div id="shapes"></div>
    </div>
  </div>`;
  const inp = qs("#sym");
  let t = 0;
  inp.addEventListener("input", () => {
    // capitalise the root as you type: "c#m7" -> "C#m7"
    const v = inp.value;
    if (/^[a-g]/.test(v)) { const p = inp.selectionStart; inp.value = v[0].toUpperCase() + v.slice(1); inp.setSelectionRange(p, p); }
    clearTimeout(t);
    t = setTimeout(() => setChordInput(inp.value, false), 140);
  });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { inp.blur(); setChordInput(inp.value, true); } });
  $view.onclick = (e) => { if (!handleOption(e.target, false)) onChordClick(e); };
  $view.onchange = (e) => handleOption(e.target, true);
  if (!chordState.input && !initial) chordState.input = prefs.recent[0] || "C";
  setChordInput(chordState.input, false, true);
  if (!initial && !chordState.input) inp.focus();
}

function setChordInput(val, remember, keepUrl) {
  chordState.input = (val || "").trim();
  chordState.selected = null;
  chordState.limit = 60;
  const inp = qs("#sym");
  if (inp && inp.value !== chordState.input && document.activeElement !== inp) inp.value = chordState.input;
  if (!keepUrl) history.replaceState(null, "", "#/chords/" + encodeURIComponent(chordState.input));
  renderChord(remember);
}

function renderChord(remember) {
  const c = parseChord(chordState.input);
  // keypad state
  const root = c ? c.root : null;
  qsa(".roots button").forEach((b) => b.setAttribute("aria-pressed", String(!!root && parseNote(b.dataset.root).pc === root.pc)));
  qsa(".quals button").forEach((b) => b.setAttribute("aria-pressed", String(!!c && normQual(c.quality) === normQual(b.dataset.qual))));
  renderRecent();
  const info = qs("#info");
  if (!chordState.input) {
    info.innerHTML = `<p class="hint">Type a chord like <b>Cmaj7</b>, <b>F#m7b5</b> or <b>D/F#</b>, or tap a root and a type.</p>`;
    qs("#neck").innerHTML = ""; qs("#shapes").innerHTML = ""; qs("#filters").innerHTML = ""; qs("#count").textContent = "";
    return;
  }
  if (!c) {
    info.innerHTML = `<p class="err">Can't read “${esc(chordState.input)}” as a chord.</p><p class="hint">Start with a root note (A–G, with # or b), then the type: m, 7, maj7, m7b5, sus4, add9, 13, 7#9, and a /bass note if needed.</p>`;
    qs("#shapes").innerHTML = "";
    return;
  }
  if (remember) addRecent(c.name);
  const list = voicingsFor(c);
  const optional = c.tones.filter((t) => !t.required).map((t) => t.label);
  info.innerHTML = `<div class="chord-head"><h2>${esc(c.name)}</h2><span class="desc">${esc(describeChord(c))}${c.bass ? (c.bassLabel ? ", " + c.bassLabel + " in the bass" : ", " + c.bass.name + " added in the bass") : ""}</span></div>
    <div class="tones">${c.tones.map((t) => `<span class="tone ${t.required ? "" : "opt"}"><i style="background:var(--deg-${degreeFamily(t.label)})">${t.label === "1" ? "R" : esc(t.label)}</i><b>${esc(t.name)}</b></span>`).join("")}
    ${c.bass && !c.bassLabel ? `<span class="tone"><i style="background:var(--deg-bass)">B</i><b>${esc(c.bass.name)}</b></span>` : ""}</div>
    ${optional.length ? `<p class="hint">Dashed notes are optional: shapes may leave them out.</p>` : ""}
    ${legend()}`;
  renderShapes(c, list);
}
function normQual(q) {
  return (q || "").replace(/^maj$|^M$/, "").replace("6/9", "69").replace(/^mMaj7$|^m\(maj7\)$|^mmaj7$/i, "mmaj7").replace(/^°7$/, "dim7").replace(/^ø7?$/, "m7b5").replace(/^\+$/, "aug").replace(/^sus$/, "sus4");
}

function filtered(c, list) {
  const favK = prefs.favs[favKey(c)];
  const by = {
    best: () => {
      const b = bestPicks(list, 24);
      const fav = favK && list.find((v) => v.key === favK);
      return fav ? [fav, ...b.filter((v) => v.key !== favK)] : b;
    },
    open: () => list.filter((v) => v.tags.includes("open")),
    barre: () => list.filter((v) => v.tags.includes("barre")),
    triad: () => list.filter((v) => v.tags.includes("triad")),
    jazz: () => list.filter((v) => v.tags.some((t) => ["drop2", "drop3", "drop24", "shell", "close"].includes(t))),
    all: () => list.slice().sort((a, b) => (a.opens && a.top <= 4 ? 0 : a.pos) - (b.opens && b.top <= 4 ? 0 : b.pos) || a.score - b.score),
  };
  return by;
}

function renderShapes(c, list) {
  const by = filtered(c, list);
  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, by[k]().length]));
  if (!counts[chordState.filter]) chordState.filter = "best";
  qs("#filters").innerHTML = FILTERS.filter(([k]) => counts[k] || k === "best").map(([k, l]) => `<button data-filter="${k}" aria-pressed="${chordState.filter === k}">${l}</button>`).join("");
  const shown = by[chordState.filter]();
  qs("#count").textContent = `${list.length} shapes found`;
  const favK = prefs.favs[favKey(c)];
  let sel = chordState.selected && list.find((v) => v.key === chordState.selected);
  if (!sel) sel = null;
  let html = "";
  if (!shown.length) {
    html = `<div class="empty"><b>No playable shapes with these settings</b>Try turning on wider stretches or inversions in Options.</div>`;
  } else if (chordState.filter === "all") {
    const lim = shown.slice(0, chordState.limit);
    let region = "";
    let open = false;
    for (const v of lim) {
      const r = regionOf(v);
      if (r !== region) { if (open) html += `</div>`; html += `<h3 class="group-title">${r}</h3><div class="vgrid">`; region = r; open = true; }
      html += card(v, { selected: sel && sel.key === v.key, fav: favK === v.key });
    }
    if (open) html += `</div>`;
    if (shown.length > lim.length) html += `<div class="more"><button class="btn" data-act="more">Show ${Math.min(60, shown.length - lim.length)} more</button></div>`;
  } else {
    html = `<div class="vgrid">${shown.map((v) => card(v, { selected: sel && sel.key === v.key, fav: favK === v.key })).join("")}</div>`;
  }
  qs("#shapes").innerHTML = html;
  renderNeck(c, sel || null);
}

function renderNeck(c, v) {
  const cells = neckMap(c, { tuning: tuningNotes(), capo: prefs.capo, maxFret: Math.max(prefs.maxFret, 15) });
  const tun = tuningNotes().map((n) => n + (prefs.capo || 0));
  const wrap = qs("#neck");
  const keep = wrap.scrollLeft;
  wrap.innerHTML = neckSvg(cells, v, { tuning: tun, maxFret: Math.max(prefs.maxFret, 15), lefty: prefs.lefty, mode: prefs.labels });
  // start at the nut end (the right-hand side when left-handed); keep the place when a shape is tapped
  if (v) wrap.scrollLeft = keep;
  else wrap.scrollLeft = prefs.lefty ? wrap.scrollWidth : 0;
  if (v) {
    // bring the tapped shape into view
    const xs = [...wrap.querySelectorAll(".nd.on circle")].map((c) => +c.getAttribute("cx"));
    const svg = wrap.querySelector("svg");
    if (xs.length && svg) {
      const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      const mid = ((Math.min(...xs) + Math.max(...xs)) / 2) * scale;
      wrap.scrollTo({ left: Math.max(0, mid - wrap.clientWidth / 2), behavior: "smooth" });
    }
  }
}

function onChordClick(e) {
  const t = e.target.closest("[data-act],[data-root],[data-qual],[data-filter],[data-recent],.nd");
  if (!t) return;
  const c = parseChord(chordState.input);
  if (t.dataset.root) {
    const q = c ? c.quality + (c.bass ? "/" + c.bass.name : "") : "";
    return setChordInput(t.dataset.root + q, true);
  }
  if (t.dataset.qual !== undefined) {
    const r = c ? c.root.name : "C";
    return setChordInput(r + t.dataset.qual + (c && c.bass ? "/" + c.bass.name : ""), true);
  }
  if (t.dataset.recent) return setChordInput(t.dataset.recent, true);
  if (t.dataset.filter) { chordState.filter = t.dataset.filter; chordState.limit = 60; return renderChord(false); }
  if (t.classList.contains("nd")) { if (prefs.sound) { const s = +t.dataset.s, f = +t.dataset.f; pluck(tuningNotes()[s] + (prefs.capo || 0) + f); } return; }
  const act = t.dataset.act;
  if (act === "clear") { chordState.input = ""; qs("#sym").value = ""; qs("#sym").focus(); return renderChord(false); }
  if (act === "more") { chordState.limit += 60; return renderChord(false); }
  if (act === "options") return openOptions();
  if (!c) return;
  const list = voicingsFor(c);
  const v = list.find((x) => x.key === t.dataset.key);
  if (act === "pick" && v) {
    chordState.selected = v.key;
    addRecent(c.name);
    qsa(".vcard").forEach((n) => n.setAttribute("aria-selected", String(n.dataset.key === v.key)));
    renderNeck(c, v);
    if (prefs.sound) strum(v.notes);
  }
  if (act === "fav" && v) {
    const favs = { ...prefs.favs };
    if (favs[favKey(c)] === v.key) { delete favs[favKey(c)]; toast("Favourite removed"); }
    else { favs[favKey(c)] = v.key; toast(`Saved as your usual ${c.name}`); }
    setPref({ favs });
    renderChord(false);
  }
}

function addRecent(name) {
  const r = [name, ...prefs.recent.filter((x) => x !== name)].slice(0, 12);
  setPref({ recent: r });
  renderRecent();
}
function renderRecent() {
  const el = qs("#recent");
  if (!el) return;
  const r = prefs.recent.filter((x) => x !== chordState.input).slice(0, 10);
  el.innerHTML = r.length ? `<span class="lbl">Recent</span>` + r.map((x) => `<button data-recent="${esc(x)}">${esc(x)}</button>`).join("") : "";
}

function capoLabel(n) { return n ? `Capo ${n}` : "No capo"; }
function optionsHtml() {
  return `<div class="options-panel">
      <div class="toggle"><span class="t"><b>Capo</b><small>Shapes are shown relative to the capo</small></span>
        <span class="stepper"><button data-o="capo-" aria-label="Capo down">−</button><output>${capoLabel(prefs.capo)}</output><button data-o="capo+" aria-label="Capo up">+</button></span></div>
      <label class="toggle"><span class="t"><b>Wider stretches</b><small>Allow shapes spanning five frets</small></span><input type="checkbox" data-o="stretch" ${prefs.stretch ? "checked" : ""}></label>
      <label class="toggle"><span class="t"><b>Inversions</b><small>Let the 3rd, 5th or 7th be the lowest note</small></span><input type="checkbox" data-o="inversions" ${prefs.inversions ? "checked" : ""}></label>
      <label class="toggle"><span class="t"><b>Rootless shapes</b><small>Jazz voicings that leave the root to the bass player</small></span><input type="checkbox" data-o="rootless" ${prefs.rootless ? "checked" : ""}></label>
      <div class="toggle"><span class="t"><b>Dot labels</b></span>
        <span class="seg">${[["degrees", "Degrees"], ["notes", "Notes"], ["fingers", "Fingers"]].map(([k, l]) => `<button data-o="labels:${k}" aria-pressed="${prefs.labels === k}">${l}</button>`).join("")}</span></div>
      <div class="toggle"><span class="t"><b>Tuning</b></span>
        <select class="sel" data-o="tuning" style="max-width:220px">${Object.entries(TUNINGS).map(([k, t]) => `<option value="${k}" ${prefs.tuning === k ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>
    </div>`;
}
function refreshOptions() {
  const inl = qs("#opts-inline");
  if (inl) inl.innerHTML = optionsHtml();
  const sh = document.querySelector(".sheet .opts-host");
  if (sh) sh.innerHTML = optionsHtml();
}
/** Handles clicks/changes inside an options panel. Returns true if handled. */
function handleOption(target, isChange) {
  const o = target.closest("[data-o]");
  if (!o) return false;
  const k = o.dataset.o;
  if (isChange) {
    if (o.type === "checkbox") setPref({ [k]: o.checked });
    else if (o.tagName === "SELECT") setPref({ tuning: o.value });
    else return false;
  } else {
    if (o.tagName === "SELECT" || o.tagName === "INPUT") return true;
    if (k === "capo-") setPref({ capo: Math.max(0, prefs.capo - 1) });
    else if (k === "capo+") setPref({ capo: Math.min(12, prefs.capo + 1) });
    else if (k.startsWith("labels:")) setPref({ labels: k.split(":")[1] });
    else return false;
  }
  refreshOptions();
  renderChord(false);
  return true;
}
function openOptions() {
  const sh = openSheet(`<div class="sheet-head"><h2>Shape options</h2><button class="btn sm" data-close>Done</button></div><div class="opts-host">${optionsHtml()}</div>`,
    (e) => handleOption(e.target, false));
  sh.addEventListener("change", (e) => handleOption(e.target, true));
}

// ======================================================================
// Songs list
// ======================================================================
let seeding = null;
function ensureSeeded() { return (seeding = seeding || seedOnce()); }
async function seedOnce() {
  if (prefs.seeded) return;
  const existing = await songs.all();
  if (!existing.length) {
    await songs.putMany(SAMPLES.map((s) => ({ id: uid(), title: s.title, artist: s.artist, source: s.source, created: Date.now(), transpose: 0, capo: null, shapes: {} })));
  }
  setPref({ seeded: 1 });
}

let songQuery = "";
async function viewSongs() {
  await ensureSeeded();
  const all = (await songs.all()).sort((a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }));
  $view.innerHTML = `<div class="page">
    <div class="row" style="justify-content:space-between"><h1>Songs</h1>
      <div class="row"><button class="btn" data-act="import">${ICON.import}<span>Import</span></button><button class="btn pri" data-act="new">${ICON.plus}<span>New song</span></button></div></div>
    <input class="inp" id="q" type="search" placeholder="Search titles, artists or chords" value="${esc(songQuery)}" aria-label="Search songs" style="margin-bottom:12px">
    <div class="song-list" id="list"></div>
  </div>`;
  const draw = () => {
    const q = songQuery.trim().toLowerCase();
    const list = all.filter((s) => !q || (s.title + " " + (s.artist || "") + " " + s.source).toLowerCase().includes(q));
    qs("#list").innerHTML = list.length ? list.map((s) => {
      const p = parseChordPro(s.source);
      const used = chordsUsed(p);
      const key = songKeyName(s, p);
      return `<button class="song-item" data-id="${s.id}"><span class="t">${esc(s.title || p.meta.title || "Untitled")}</span><span class="k">${esc(key)}</span><span class="a">${esc(s.artist || p.meta.artist || "")}</span><span class="ch">${esc(used.slice(0, 10).join("  "))}</span></button>`;
    }).join("") : all.length ? `<div class="empty"><b>No songs match “${esc(songQuery)}”</b></div>`
      : `<div class="empty"><b>No songs yet</b>Add one with New song, or import ChordPro / text files.</div>`;
  };
  draw();
  qs("#q").addEventListener("input", (e) => { songQuery = e.target.value; draw(); });
  $view.onclick = async (e) => {
    const it = e.target.closest(".song-item");
    if (it) { location.hash = "#/song/" + it.dataset.id; return; }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    if (a.dataset.act === "new") location.hash = "#/edit/new";
    if (a.dataset.act === "import") importFiles();
  };
}

async function importFiles() {
  const files = await openTextFiles(true);
  if (files.length) await importFileList(files);
}
// Files handed over by the Android app (opened from Files or shared from another app)
window.__fretwiseImport = (files) => { importFileList(files || []).then((n) => { if (n === 1 && lastImportedId) location.hash = "#/song/" + lastImportedId; }); };
let lastImportedId = null;
async function importFileList(files) {
  let added = 0;
  for (const f of files) {
    if (/\.json$/i.test(f.name) || /^\s*[\[{]\s*"/.test(f.text)) {
      added += await restoreBackup(f.text);
      continue;
    }
    let src = f.text;
    if (!looksLikeChordPro(src)) src = convertToChordPro(src, { title: f.name.replace(/\.[^.]+$/, "") });
    const p = parseChordPro(src);
    lastImportedId = uid();
    await songs.put({ id: lastImportedId, title: p.meta.title || f.name.replace(/\.[^.]+$/, ""), artist: p.meta.artist || "", source: src, created: Date.now(), transpose: 0, capo: null, shapes: {} });
    added++;
  }
  toast(added === 1 ? "1 song added" : `${added} songs added`);
  if (location.hash.startsWith("#/songs")) viewSongs();
  return added;
}

async function restoreBackup(text) {
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data.songs || [];
    const ok = list.filter((s) => s && s.id && typeof s.source === "string");
    await songs.putMany(ok);
    if (data.favs) setPref({ favs: { ...prefs.favs, ...data.favs } });
    return ok.length;
  } catch { toast("That file isn't a Fretwise backup"); return 0; }
}

// ======================================================================
// Song view
// ======================================================================
function writtenKeyPc(song, parsed) {
  const k = parseChord(parsed.meta.key || song.key || "");
  if (k) return k.kind.third === "min" ? mod12(k.root.pc + 3) : k.root.pc; // minor keys spelled like their relative major
  return guessKey(chordsUsed(parsed));
}
function songKeyName(song, parsed) {
  const k = parseChord(parsed.meta.key || "");
  const shift = (song.transpose || 0);
  const base = parseInt(parsed.meta.capo || 0, 10) || 0;
  if (k) return transposeSymbol(k.root.name + (k.kind.third === "min" ? "m" : ""), shift + base, null);
  return KEY_NAMES[mod12(writtenKeyPc(song, parsed) + shift + base)];
}

let scrollTimer = 0;
async function viewSong(id) {
  const song = await songs.get(id);
  if (!song) { $view.innerHTML = `<div class="page"><div class="empty"><b>That song isn't here any more</b><a href="#/songs">Back to songs</a></div></div>`; return; }
  const parsed = parseChordPro(song.source);
  const C0 = parseInt(parsed.meta.capo || 0, 10) || 0; // capo the chart was written for
  if (song.capo == null) song.capo = C0;
  song.transpose = song.transpose || 0;
  song.shapes = song.shapes || {};
  const wk = writtenKeyPc(song, parsed);
  const st = { mode: song.view || "lyrics", scrolling: false, speed: song.speed || 3 };
  window.__fretwiseWantAwake = true;
  keepAwake(true);

  const shift = () => C0 + song.transpose - song.capo; // written -> shapes you play
  const shapeKeyPc = () => mod12(wk + shift());
  const concertKeyPc = () => mod12(wk + C0 + song.transpose);
  const show = (sym) => (parseChord(sym) ? transposeSymbol(sym, shift(), shapeKeyPc()) : sym);
  const save = () => songs.put(song);

  function head() {
    const keyMeta = parseChord(parsed.meta.key || "");
    const minor = keyMeta && keyMeta.kind.third === "min";
    const concert = pcName(minor ? concertKeyPc() - 3 : concertKeyPc(), concertKeyPc()) + (minor ? "m" : "");
    const shapesK = pcName(minor ? shapeKeyPc() - 3 : shapeKeyPc(), shapeKeyPc()) + (minor ? "m" : "");
    return `<div class="title"><a class="btn ghost icon" href="#/songs" aria-label="Back to songs">${ICON.back}</a>
        <div class="grow"><h1>${esc(song.title || parsed.meta.title || "Untitled")}</h1><div class="by">${esc(song.artist || parsed.meta.artist || "")}</div></div>
        <a class="btn icon" href="#/edit/${song.id}" aria-label="Edit song">${ICON.edit}</a></div>
      <div class="song-tools">
        <span class="stepper" title="Change key"><button data-s="tr-" aria-label="Key down">−</button><output>Key ${esc(concert)}<small>${song.transpose ? (song.transpose > 0 ? "+" : "") + song.transpose : "original"}</small></output><button data-s="tr+" aria-label="Key up">+</button></span>
        <span class="stepper" title="Capo"><button data-s="capo-" aria-label="Capo down">−</button><output>${capoLabel(song.capo)}<small>${song.capo ? esc(shapesK) + " shapes" : "&nbsp;"}</small></output><button data-s="capo+" aria-label="Capo up">+</button></span>
        <button class="btn sm" data-s="easy">Easiest capo</button>
        <span class="seg"><button data-s="mode:lyrics" aria-pressed="${st.mode === "lyrics"}">Lyrics</button><button data-s="mode:chart" aria-pressed="${st.mode === "chart"}">Chart</button></span>
        <span class="stepper"><button data-s="font-" aria-label="Smaller text">A−</button><button data-s="font+" aria-label="Larger text">A+</button></span>
        <span class="stepper"><button data-s="scroll" aria-label="${st.scrolling ? "Stop scrolling" : "Auto-scroll"}">${st.scrolling ? ICON.pause : ICON.play}</button><output>Scroll ${st.speed}</output><button data-s="speed-" aria-label="Slower">−</button><button data-s="speed+" aria-label="Faster">+</button></span>
        <button class="btn sm icon" data-s="export" aria-label="Share song file">${ICON.share}</button>
      </div>`;
  }

  function diagramFor(sym) {
    const c = parseChord(sym);
    if (!c) return "";
    const list = voicingsFor(c, { capo: 0 });
    const v = preferredVoicing(c, list, song.shapes);
    if (!v) return "";
    return `<div class="vcard" data-sym="${esc(sym)}"><button class="hit" data-s="chord" data-sym="${esc(sym)}" aria-label="Shapes for ${esc(sym)}"></button>${chordBox(v, { mode: prefs.labels, lefty: prefs.lefty })}<div class="cap">${esc(sym)}</div><div class="tags">${esc(shapeText(v.frets))}</div></div>`;
  }

  function lyricsHtml() {
    let o = "";
    for (const s of parsed.sections) {
      o += `<div class="sec ${esc(s.type)}">${s.label ? `<div class="sec-label">${esc(s.label)}</div>` : ""}`;
      for (const l of s.lines) {
        if (l.kind === "blank") o += `<div class="blank"></div>`;
        else if (l.kind === "comment") o += `<div class="cmt">${esc(l.text)}</div>`;
        else if (l.kind === "ref") o += `<div class="ref">${esc(l.label)}</div>`;
        else if (l.kind === "tab") o += `<pre class="tab">${esc(l.text)}</pre>`;
        else if (l.kind === "grid") o += gridHtml([l.bars]);
        else if (l.kind === "lyric") o += lineHtml(l);
      }
      o += `</div>`;
    }
    return o || `<div class="empty"><b>This song is empty</b><a href="#/edit/${song.id}">Add chords and lyrics</a></div>`;
  }
  function lineHtml(l) {
    const hasChord = l.chunks.some((c) => c.chord);
    const hasText = l.chunks.some((c) => c.text.trim());
    const cls = !hasChord ? "nochords" : !hasText ? "chords-only" : "";
    let o = `<div class="line ${cls}">`;
    for (const ch of l.chunks) {
      // split long text so lines can wrap between words; the first word stays under the chord
      const parts = ch.text.match(/^\S*\s*|\S+\s*/g) || [""];
      parts.forEach((p, i) => {
        const c = i === 0 && ch.chord != null ? ch.chord : "";
        const disp = c && parseChord(c) ? show(c) : c.replace(/^\*/, "");
        o += `<span class="chunk"><span class="c"${c && parseChord(c) ? ` data-s="chord" data-sym="${esc(disp)}"` : ""}>${esc(disp)}</span><span class="l">${esc(p) || (c ? " " : "")}</span></span>`;
      });
    }
    return o + `</div>`;
  }
  function gridHtml(rows) {
    return rows.map((bars) => `<div class="grid-bars">${bars.map((b) => `<div class="bar">${b.filter((x) => x !== ".").map((c) => {
      if (!parseChord(c)) return `<span>${esc(c)}</span>`;
      const d = show(c);
      return `<span data-s="chord" data-sym="${esc(d)}">${esc(d)}<span class="rn">${esc(romanNumeral(d, shapeKeyPc()))}</span></span>`;
    }).join("")}</div>`).join("")}</div>`).join("");
  }
  function chartHtml() {
    const prog = progression(parsed);
    return `<div class="chart">${prog.map((p) => `<div class="sec-chart"><div class="sec-label">${esc(p.label || p.type)}</div>
      ${p.grid.length ? p.grid.map((g) => gridHtml(g)).join("") : `<div class="chips">${p.chords.map((c) => { const d = show(c); return `<span class="chip" data-s="chord" data-sym="${esc(d)}"><b>${esc(d)}</b><small>${esc(romanNumeral(d, shapeKeyPc()))}</small></span>`; }).join("") || (p.ref ? `<span class="ref">${esc(p.ref.label)}</span>` : "")}</div>`}</div>`).join("")}</div>`;
  }

  function render() {
    const used = chordsUsed(parsed).map(show);
    const uniq = [...new Set(used)];
    const meta = [parsed.meta.time && "Time " + parsed.meta.time, parsed.meta.tempo && parsed.meta.tempo + " bpm"].filter(Boolean).join(" · ");
    $view.innerHTML = `<div class="song-top">${head()}</div>
      <div class="song-strip">${uniq.map(diagramFor).join("")}</div>
      <div class="song-body-wrap">
        <div class="song-body" style="--song-font:${prefs.songFont}px">${meta ? `<div class="meta">${esc(meta)}</div>` : ""}${st.mode === "chart" ? chartHtml() : lyricsHtml()}</div>
        <aside class="side" aria-label="Chord shapes"><div class="vgrid">${uniq.map(diagramFor).join("")}</div></aside>
      </div>`;
  }
  render();

  function stopScroll() { st.scrolling = false; cancelAnimationFrame(scrollTimer); }
  function startScroll() {
    st.scrolling = true;
    let last = performance.now(), acc = 0;
    const step = (now) => {
      if (!st.scrolling) return;
      acc += ((now - last) / 1000) * (st.speed * 9);
      last = now;
      if (acc >= 1) { const px = Math.floor(acc); acc -= px; $view.scrollTop += px; }
      if ($view.scrollTop + $view.clientHeight >= $view.scrollHeight - 2) { stopScroll(); qs(".song-top").innerHTML = head(); return; }
      scrollTimer = requestAnimationFrame(step);
    };
    scrollTimer = requestAnimationFrame(step);
  }
  const stopOnTouch = () => { if (st.scrolling) { stopScroll(); qs(".song-top").innerHTML = head(); } };
  $view.addEventListener("touchstart", stopOnTouch, { passive: true });
  $view.addEventListener("wheel", stopOnTouch, { passive: true });

  $view.onclick = async (e) => {
    const b = e.target.closest("[data-s]");
    if (!b) return;
    const k = b.dataset.s;
    if (k === "chord") return chordSheet(b.dataset.sym);
    if (k === "tr-" || k === "tr+") { song.transpose += k === "tr+" ? 1 : -1; if (song.transpose > 11 || song.transpose < -11) song.transpose = 0; save(); return render(); }
    if (k === "capo-" || k === "capo+") { song.capo = Math.max(0, Math.min(11, song.capo + (k === "capo+" ? 1 : -1))); save(); return render(); }
    if (k === "easy") {
      const best = easiestCapo();
      song.capo = best; save(); render();
      return toast(best ? `Capo ${best}: ${pcName(shapeKeyPc(), shapeKeyPc())} shapes` : "No capo needed");
    }
    if (k.startsWith("mode:")) { st.mode = song.view = k.slice(5); save(); return render(); }
    if (k === "font-" || k === "font+") { setPref({ songFont: Math.max(13, Math.min(40, prefs.songFont + (k === "font+" ? 2 : -2))) }); qs(".song-body").style.setProperty("--song-font", prefs.songFont + "px"); return; }
    if (k === "speed-" || k === "speed+") { st.speed = song.speed = Math.max(1, Math.min(10, st.speed + (k === "speed+" ? 1 : -1))); save(); qs(".song-top").innerHTML = head(); return; }
    if (k === "scroll") { if (st.scrolling) stopScroll(); else startScroll(); qs(".song-top").innerHTML = head(); return; }
    if (k === "export") {
      const name = (song.title || "song").replace(/[^\w\- ]+/g, "").trim() + ".cho";
      const r = await saveText(name, song.source, "text/plain");
      if (r === "downloaded") toast("Song file saved");
    }
  };

  function easiestCapo() {
    const written = chordsUsed(parsed);
    let best = 0, bestScore = Infinity;
    for (let cp = 0; cp <= 7; cp++) {
      let sc = cp * 0.4;
      for (const w of written) {
        const c = parseChord(transposeSymbol(w, C0 + song.transpose - cp, null));
        if (!c) continue;
        const list = voicingsFor(c, { capo: 0 });
        const easy = list.filter((v) => v.pos <= 3 && v.strings >= 4);
        const top = easy.length ? Math.min(...easy.map((v) => v.score + (v.barre ? 2.5 : 0) + v.fingerCount * 0.3)) : 6;
        sc += top;
      }
      if (sc < bestScore - 0.01) { bestScore = sc; best = cp; }
    }
    return best;
  }

  function chordSheet(sym) {
    const c = parseChord(sym);
    if (!c) return;
    const list = voicingsFor(c, { capo: 0 });
    const cur = preferredVoicing(c, list, song.shapes);
    const picks = bestPicks(list, 18);
    if (cur && !picks.some((v) => v.key === cur.key)) picks.unshift(cur);
    if (prefs.sound && cur) strum(cur.notes);
    openSheet(`<div class="sheet-head"><div><h2 style="font:700 34px/1 var(--font-chord)">${esc(c.name)}</h2><span class="hint">Tap a shape to use it in this song</span></div>
      <div class="row"><a class="btn sm" href="#/chords/${encodeURIComponent(c.name)}">All shapes</a><button class="btn sm" data-close>Done</button></div></div>
      <div class="vgrid">${picks.map((v) => card(v, { selected: cur && v.key === cur.key, starable: false })).join("")}</div>`, (e, sh) => {
      const p = e.target.closest("[data-act='pick']");
      if (!p) return;
      const v = list.find((x) => x.key === p.dataset.key);
      if (!v) return;
      song.shapes[c.name] = v.key;
      save();
      if (prefs.sound) strum(v.notes);
      sh.querySelectorAll(".vcard").forEach((n) => n.setAttribute("aria-selected", String(n.dataset.key === v.key)));
      qsa(`.vcard[data-sym="${CSS.escape(sym)}"]`).forEach((n) => (n.outerHTML = diagramFor(sym)));
    });
  }

  cleanup = () => {
    stopScroll();
    window.__fretwiseWantAwake = false;
    keepAwake(false);
    $view.removeEventListener("touchstart", stopOnTouch);
    $view.removeEventListener("wheel", stopOnTouch);
  };
}

// ======================================================================
// Editor
// ======================================================================
const META_RE = /^\s*\{\s*(t|title|st|subtitle|artist|key|capo|tempo|time)\s*[:\s][^}]*\}\s*$/i;
async function viewEditor(id) {
  const isNew = id === "new";
  const song = isNew ? { id: uid(), title: "", artist: "", source: "", created: Date.now(), transpose: 0, capo: null, shapes: {} } : await songs.get(id);
  if (!song) { location.hash = "#/songs"; return; }
  const p = parseChordPro(song.source);
  const body = song.source.split("\n").filter((l) => !META_RE.test(l)).join("\n").replace(/^\n+/, "");
  const m = { title: song.title || p.meta.title || "", artist: song.artist || p.meta.artist || "", key: p.meta.key || "", capo: p.meta.capo || "", tempo: p.meta.tempo || "", time: p.meta.time || "" };
  $view.innerHTML = `<div class="page editor">
    <div class="row" style="justify-content:space-between">
      <div class="row"><a class="btn ghost icon" href="${isNew ? "#/songs" : "#/song/" + song.id}" aria-label="Cancel">${ICON.back}</a><h1 style="margin:0">${isNew ? "New song" : "Edit song"}</h1></div>
      <div class="row">${isNew ? "" : `<button class="btn danger" data-e="delete">Delete</button>`}<button class="btn pri" data-e="save">Save</button></div>
    </div>
    <div class="meta-fields">
      <label class="f"><span>Title</span><input class="inp" id="e-title" value="${esc(m.title)}" autocomplete="off"></label>
      <label class="f"><span>Artist</span><input class="inp" id="e-artist" value="${esc(m.artist)}" autocomplete="off"></label>
      <label class="f"><span>Key</span><input class="inp" id="e-key" value="${esc(m.key)}" placeholder="Worked out from the chords if left empty" autocomplete="off"></label>
      <label class="f"><span>Capo the chords are written for</span><input class="inp" id="e-capo" inputmode="numeric" value="${esc(m.capo)}" placeholder="None" autocomplete="off"></label>
      <label class="f"><span>Tempo (bpm)</span><input class="inp" id="e-tempo" inputmode="numeric" value="${esc(m.tempo)}" autocomplete="off"></label>
      <label class="f"><span>Time signature</span><input class="inp" id="e-time" value="${esc(m.time)}" placeholder="4/4" autocomplete="off"></label>
    </div>
    <label class="f"><span>Chords and lyrics</span>
      <textarea class="inp" id="e-src" spellcheck="false" autocapitalize="off" placeholder="Paste a song with chords above the lyrics, or write it like:&#10;&#10;{start_of_verse: Verse 1}&#10;[G]Amazing [C]grace, how [G]sweet the sound&#10;{end_of_verse}">${esc(body)}</textarea></label>
    <div class="row"><button class="btn" data-e="convert">Convert chords above lyrics</button><span class="hint" id="e-status"></span></div>
    <div class="help">Pasting chords written above the lyrics converts them automatically. Chords go in square brackets right before the syllable they land on: <code>[G]Amazing [C]grace</code>. Mark sections with <code>{start_of_chorus}</code> … <code>{end_of_chorus}</code> (also verse and bridge). A chart with no lyrics can use bars: <code>{start_of_grid}</code> then <code>| G | C D | G |</code>.</div>
  </div>`;
  const ta = qs("#e-src");
  const status = qs("#e-status");
  ta.addEventListener("paste", (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!text || looksLikeChordPro(text)) return;
    const lines = text.split(/\r?\n/);
    if (!lines.some((l) => isChordLine(l))) return;
    e.preventDefault();
    const conv = convertToChordPro(text);
    const s = ta.selectionStart, en = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + conv + ta.value.slice(en);
    status.textContent = "Converted the pasted chords into place.";
    const cm = /\{capo:\s*(\d+)\}/.exec(conv);
    if (cm && !qs("#e-capo").value) qs("#e-capo").value = cm[1];
  });
  $view.onclick = async (e) => {
    const b = e.target.closest("[data-e]");
    if (!b) return;
    if (b.dataset.e === "convert") {
      if (looksLikeChordPro(ta.value)) { status.textContent = "This already has chords in brackets."; return; }
      ta.value = convertToChordPro(ta.value);
      status.textContent = "Converted.";
    }
    if (b.dataset.e === "delete") {
      if (!confirm(`Delete “${song.title || "this song"}”?`)) return;
      await songs.del(song.id);
      toast("Song deleted");
      location.hash = "#/songs";
    }
    if (b.dataset.e === "save") {
      const f = (id) => qs(id).value.trim();
      const head = [["title", f("#e-title")], ["artist", f("#e-artist")], ["key", f("#e-key")], ["capo", f("#e-capo")], ["tempo", f("#e-tempo")], ["time", f("#e-time")]]
        .filter(([, v]) => v).map(([k, v]) => `{${k}: ${v}}`).join("\n");
      // the converter may have put {capo:} inside the body; the field wins
      const bodyNow = ta.value.split("\n").filter((l) => !META_RE.test(l)).join("\n").replace(/^\n+/, "");
      const oldCapo = parseInt(p.meta.capo || 0, 10) || 0;
      song.title = f("#e-title") || "Untitled";
      song.artist = f("#e-artist");
      song.source = (head ? head + "\n\n" : "") + bodyNow;
      if ((parseInt(f("#e-capo") || 0, 10) || 0) !== oldCapo) song.capo = null;
      await songs.put(song);
      toast("Song saved");
      location.hash = "#/song/" + song.id;
    }
  };
  if (isNew) qs("#e-title").focus();
}

// ======================================================================
// Settings
// ======================================================================
function viewSettings() {
  const seg = (key, opts) => `<span class="seg">${opts.map(([k, l]) => `<button data-p="${key}:${k}" aria-pressed="${String(prefs[key]) === String(k)}">${l}</button>`).join("")}</span>`;
  $view.innerHTML = `<div class="page"><h1>Settings</h1><div class="settings">
    <section><h2>Display</h2>
      <div class="toggle"><span class="t"><b>Theme</b><small>Stage is dark for gigs; Day is light</small></span>${seg("theme", [["auto", "Match device"], ["stage", "Stage"], ["day", "Day"]])}</div>
      <div class="toggle"><span class="t"><b>Dot labels</b><small>What the dots in chord shapes show</small></span>${seg("labels", [["degrees", "Degrees"], ["notes", "Notes"], ["fingers", "Fingers"]])}</div>
      <label class="toggle"><span class="t"><b>Left-handed</b><small>Mirror every chord shape and the neck</small></span><input type="checkbox" data-p="lefty" ${prefs.lefty ? "checked" : ""}></label>
    </section>
    <section><h2>Guitar</h2>
      <label class="f"><span>Tuning</span><select class="sel" data-p="tuning">${Object.entries(TUNINGS).map(([k, t]) => `<option value="${k}" ${prefs.tuning === k ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
      <div class="toggle"><span class="t"><b>Highest fret to search</b></span>${seg("maxFret", [[12, "12"], [15, "15"], [19, "19"], [22, "22"]])}</div>
      <label class="toggle"><span class="t"><b>Play shapes when tapped</b></span><input type="checkbox" data-p="sound" ${prefs.sound ? "checked" : ""}></label>
    </section>
    <section><h2>Your songs</h2>
      <p>Save a backup file of every song and your favourite shapes. Restore it on another device to copy everything across, like from the phone to the iPad.</p>
      <div class="row" style="margin-bottom:8px"><button class="btn" data-p="backup">${ICON.share}<span>Save backup</span></button><button class="btn" data-p="restore">${ICON.import}<span>Restore backup</span></button></div>
    </section>
    <p class="muted" style="font-size:13px">Fretwise ${VERSION}${isAndroid() ? " for Android" : ""}</p>
  </div></div>`;
  $view.onclick = async (e) => {
    const b = e.target.closest("[data-p]");
    if (!b || b.tagName === "INPUT" || b.tagName === "SELECT") return;
    const [k, v] = b.dataset.p.split(":");
    if (k === "backup") {
      const all = await songs.all();
      const d = new Date();
      const name = `fretwise-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.json`;
      const r = await saveText(name, JSON.stringify({ app: "fretwise", version: 1, songs: all, favs: prefs.favs }, null, 1), "application/json");
      if (r === "downloaded") toast("Backup saved");
      return;
    }
    if (k === "restore") return importFiles();
    if (v !== undefined) {
      setPref({ [k]: k === "maxFret" ? +v : v });
      if (k === "theme") applyTheme();
      vCache.clear();
      viewSettings();
    }
  };
  $view.onchange = (e) => {
    const t = e.target.closest("[data-p]");
    if (!t) return;
    if (t.type === "checkbox") setPref({ [t.dataset.p]: t.checked });
    else setPref({ [t.dataset.p]: t.value });
    vCache.clear();
  };
}

// ---------- start ----------
matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", applyTheme);
applyTheme();
persistStorage();
ensureSeeded().catch(() => {});
route();
if ("serviceWorker" in navigator && !isAndroid() && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
