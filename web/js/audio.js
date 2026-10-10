// Plucked-string sound (Karplus–Strong) so a shape can be heard before it's played.
let ctx = null;
const cache = new Map();

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function pluckBuffer(c, midi) {
  const key = midi;
  if (cache.has(key)) return cache.get(key);
  const sr = c.sampleRate;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const len = Math.floor(sr * 2.6);
  const buf = c.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const N = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(N);
  // slightly filtered noise burst = a pick, not a click
  let last = 0;
  for (let i = 0; i < N; i++) { const r = Math.random() * 2 - 1; last = last * 0.55 + r * 0.45; ring[i] = last; }
  const decay = 0.996 - Math.max(0, (midi - 40)) * 0.00012;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const nxt = (idx + 1) % N;
    const v = ring[idx];
    ring[idx] = decay * 0.5 * (v + ring[nxt]);
    d[i] = v;
    idx = nxt;
  }
  // soften the very start
  for (let i = 0; i < 64 && i < len; i++) d[i] *= i / 64;
  cache.set(key, buf);
  return buf;
}

/** Strum MIDI notes low to high. dir: "down" | "up" | "pluck" (all at once) */
export function strum(notes, dir = "down") {
  const c = ac();
  if (!c) return;
  const list = notes.filter((n) => n != null);
  if (dir === "up") list.reverse();
  const t0 = c.currentTime + 0.02;
  const master = c.createGain();
  master.gain.value = 0.55 / Math.sqrt(Math.max(1, list.length));
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3800;
  master.connect(lp).connect(c.destination);
  list.forEach((m, i) => {
    const src = c.createBufferSource();
    src.buffer = pluckBuffer(c, m);
    const g = c.createGain();
    const t = t0 + (dir === "pluck" ? 0 : i * 0.032);
    g.gain.setValueAtTime(1, t);
    g.gain.setTargetAtTime(0, t + 1.6, 0.35);
    src.connect(g).connect(master);
    src.start(t);
    src.stop(t + 2.6);
  });
}

/** One note (for tapping the neck map). */
export function pluck(midi) {
  strum([midi], "pluck");
}

/** Call from the first user gesture so iOS lets audio play. */
export function unlock() {
  ac();
}
