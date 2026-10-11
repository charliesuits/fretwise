// Songs in IndexedDB, settings in localStorage, and the small platform bridge (Android wrapper vs iPad/Safari).

const DB_NAME = "fretwise";
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("songs")) d.createObjectStore("songs", { keyPath: "id" });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}
function tx(mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const t = d.transaction("songs", mode);
    const st = t.objectStore("songs");
    let out;
    Promise.resolve(fn(st)).then((v) => (out = v));
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
  }));
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const songs = {
  all: () => db().then((d) => req(d.transaction("songs").objectStore("songs").getAll())),
  get: (id) => db().then((d) => req(d.transaction("songs").objectStore("songs").get(id))),
  put: (s) => { s.updated = Date.now(); return tx("readwrite", (st) => st.put(s)); },
  del: (id) => tx("readwrite", (st) => st.delete(id)),
  putMany: (list) => tx("readwrite", (st) => list.forEach((s) => st.put(s))),
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---- settings -------------------------------------------------------------
export const DEFAULT_PREFS = {
  tuning: "standard",
  lefty: false,
  labels: "degrees", // degrees | notes | fingers
  maxFret: 15,
  stretch: false,
  inversions: false,
  rootless: false,
  capo: 0, // chord finder capo
  sound: true,
  theme: "auto", // auto | stage | day
  uiSize: "auto", // smaller | auto | larger | largest (read by the sizing script in index.html)
  favs: {}, // chord symbol -> fret key
  recent: [],
  songFont: 20,
  seeded: 0,
};
const PKEY = "fretwise.prefs";
export function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PKEY) || "{}") }; }
  catch { return { ...DEFAULT_PREFS }; }
}
export function savePrefs(p) {
  try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch {}
}

// ---- platform --------------------------------------------------------------
const android = () => (typeof window !== "undefined" && window.FretwiseAndroid) || null;
export const isAndroid = () => !!android();

/** Save a text file the user can keep (backup, exported song). */
export async function saveText(filename, text, mime = "text/plain") {
  const a = android();
  if (a) { a.saveFile(filename, mime, text); return "saved"; }
  const file = new File([text], filename, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return "shared"; }
    catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(file);
  const el = document.createElement("a");
  el.href = url; el.download = filename;
  document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

let fileWaiter = null;
if (typeof window !== "undefined") {
  // The Android wrapper calls this with the picked files: [{name, text}]
  window.__fretwiseFiles = (files) => { if (fileWaiter) { fileWaiter(files || []); fileWaiter = null; } };
}

/** Let the user pick text files. Resolves to [{name, text}]. */
export function openTextFiles(multiple = true) {
  const a = android();
  if (a) return new Promise((res) => { fileWaiter = res; a.openFiles(multiple); });
  return new Promise((res) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.multiple = multiple;
    inp.accept = ".cho,.chordpro,.chopro,.crd,.pro,.txt,.json,text/plain,application/json";
    inp.onchange = async () => {
      const out = [];
      for (const f of inp.files) out.push({ name: f.name, text: await f.text() });
      res(out);
    };
    inp.click();
  });
}

let wake = null;
/** Keep the screen on while a song is open. */
export async function keepAwake(on) {
  const a = android();
  if (a) { a.keepAwake(!!on); return; }
  try {
    if (on && "wakeLock" in navigator) {
      if (!wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => (wake = null)); }
    } else if (!on && wake) { await wake.release(); wake = null; }
  } catch {}
}
document.addEventListener?.("visibilitychange", () => {
  if (document.visibilityState === "visible" && window.__fretwiseWantAwake) keepAwake(true);
});

/** Ask the browser not to evict saved songs (iPad home-screen app). */
export function persistStorage() {
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
}
