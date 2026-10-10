import { parseChord, transposeSymbol, romanNumeral, guessKey } from "../web/js/theory.js";
import { findVoicings, bestPicks } from "../web/js/voicer.js";

const fmt = (f) => f.map((x) => (x < 0 ? "x" : x > 9 ? `(${x})` : x)).join("");
let fails = 0;
const expect = (cond, msg) => { if (!cond) { fails++; console.log("  FAIL:", msg); } };

// --- parser
const parseCases = {
  C: "1 3 5", Cm: "1 b3 5", C7: "1 3 5? b7", Cmaj7: "1 3 5? 7", CM7: "1 3 5? 7", "CΔ": "1 3 5? 7", Cm7: "1 b3 5? b7",
  Cm7b5: "1 b3 b5 b7", "Cø": "1 b3 b5 b7", Cdim: "1 b3 b5", Cdim7: "1 b3 b5 bb7", "C°7": "1 b3 b5 bb7", Caug: "1 3 #5", "C+": "1 3 #5",
  Csus4: "1 4 5", Csus2: "1 2 5", Csus: "1 4 5", C7sus4: "1 4 5? b7", Cadd9: "1 3 5? 9", C2: "1 2 3 5?", C6: "1 3 5? 6", "C6/9": "1 3 5? 6 9", C69: "1 3 5? 6 9",
  Cm6: "1 b3 5? 6", C9: "1 3 5? b7 9", Cmaj9: "1 3 5? 7 9", Cm9: "1 b3 5? b7 9", C11: "1 3? 5? b7 9? 11", Cm11: "1 b3 5? b7 9? 11",
  C13: "1 3 5? b7 9? 13", Cmaj13: "1 3 5? 7 9? 13", Cm13: "1 b3 5? b7 9? 11? 13", "C7#9": "1 3 5? b7 #9", "C7b9": "1 3 5? b7 b9",
  "C7(b9,#11)": "1 3 5? b7 b9 #11", "Cmaj7#11": "1 3 5? 7 #11", "C13#11": "1 3 5? b7 9? #11 13", C7alt: "1 3 b5? #5? b7 b9? #9?", "CmMaj7": "1 b3 5? 7",
  "Cm(maj7)": "1 b3 5? 7", C5: "1 5", "C7#5": "1 3 #5 b7", "C7b5": "1 3 b5 b7", "C9sus4": "1 4 5? b7 9", "Cadd11": "1 3 5? 11",
};
for (const [sym, want] of Object.entries(parseCases)) {
  const c = parseChord(sym);
  const got = c ? c.tones.map((t) => t.label + (t.required ? "" : "?")).join(" ") : "null";
  expect(got === want, `${sym}: got "${got}" want "${want}"`);
}
const spellCases = { Bb7: "Bb D F Ab", "F#m7b5": "F# A C E", Ebmaj7: "Eb G Bb D", "C#7#9": "C# E# G# B D##", Abm: "Ab Cb Eb", Gdim7: "G Bb Db Fb" };
for (const [sym, want] of Object.entries(spellCases)) {
  const got = parseChord(sym).tones.map((t) => t.name).join(" ");
  expect(got === want, `${sym} spelling: got "${got}" want "${want}"`);
}
expect(parseChord("D/F#").bass.name === "F#" && parseChord("D/F#").bassLabel === "3", "D/F# bass");
expect(parseChord("Am/G").bassLabel === null, "Am/G bass is an added note");
expect(parseChord("N.C.") === null && parseChord("the") === null && parseChord("Hello") === null, "non-chords rejected");
expect(transposeSymbol("G", 2) === "A" && transposeSymbol("D/F#", 1) === "Eb/G" && transposeSymbol("F#m7", 2, 8) === "Abm7", "transpose " + transposeSymbol("F#m7", 2, 8));
expect(romanNumeral("Em7", 7) === "vi7" && romanNumeral("D7", 7) === "V7", "roman " + romanNumeral("Em7", 7));
expect(guessKey(["G", "D", "Em", "C"]) === 7, "key guess G");
expect(guessKey(["Am", "F", "C", "G"]) === 0, "key guess C/Am");

// --- voicings
const classics = {
  C: ["x32010", "x35553", "8(10)(10)988"], G: ["320003", "355433"], D: ["xx0232", "x54775"], A: ["x02220", "577655"], E: ["022100"],
  Am: ["x02210", "577555"], Em: ["022000"], Dm: ["xx0231"], F: ["133211"], Bb: ["x13331"], Bm: ["x24432"], B7: ["x21202"],
  G7: ["320001"], Cmaj7: ["x32000", "x35453"], Am7: ["x02010"], Dm7: ["xx0211"], Fmaj7: ["xx3210"], E7: ["020100"],
  "F#m7b5": ["2x221x"], Cdim7: ["x3424x"], C9: ["x3233x"], G13: ["3x3455"], "E7#9": ["x7678x"], "D/F#": ["2x0232"], Csus4: ["x33011"], Dsus2: ["xx0230"],
  Cadd9: ["x32030"], C7: ["x32310"], Cm: ["x35543"], Fm: ["133111"],
};
for (const [sym, shapes] of Object.entries(classics)) {
  const c = parseChord(sym);
  const all = findVoicings(c, { maxGaps: 2 });
  const keys = all.map((v) => fmt(v.frets));
  const best = bestPicks(all).map((v) => fmt(v.frets));
  const line = [];
  for (const s of shapes) {
    const i = keys.indexOf(s);
    line.push(`${s}#${i}`);
    expect(i >= 0, `${sym}: missing ${s}`);
  }
  console.log(sym.padEnd(7), String(all.length).padStart(4), "shapes | top:", keys.slice(0, 5).join(" "), "| known:", line.join(" "));
}
// Default (one-gap) settings must still find the jazz drop-3 / shell shapes
const g7 = findVoicings(parseChord("G7")).map((v) => fmt(v.frets));
expect(g7.includes("3x34xx"), "G7 shell 3x34xx");
expect(g7.includes("3x343x"), "G7 drop3 3x343x");
const cm7 = findVoicings(parseChord("Cm7"));
expect(cm7.some((v) => v.tags.includes("drop2")), "Cm7 has drop2 shapes");
const cf = findVoicings(parseChord("C")).find((v) => fmt(v.frets) === "x32010");
expect(cf && cf.form && cf.form.letter === "C" && cf.fingers.join() === [null, 3, 2, null, 1, null].join(), "C open fingering/form " + JSON.stringify(cf && [cf.fingers, cf.form]));
const fb = findVoicings(parseChord("F")).find((v) => fmt(v.frets) === "133211");
expect(fb && fb.barre && fb.barre.fret === 1 && fb.fingers.join() === [1, 3, 4, 2, 1, 1].join(), "F barre fingering " + JSON.stringify(fb && [fb.fingers, fb.barre]));
const ab = findVoicings(parseChord("A")).find((v) => fmt(v.frets) === "x02220");
expect(ab && ab.fingers.join() === [null, null, 1, 2, 3, null].join(), "A open fingering " + JSON.stringify(ab && ab.fingers));
const capo = findVoicings(parseChord("A"), { capo: 2 }).map((v) => fmt(v.frets));
expect(capo[0] === "320003", "A with capo 2 shows G shape first: " + capo.slice(0, 3));
const dropD = findVoicings(parseChord("D"), { tuning: [38, 45, 50, 55, 59, 64] }).map((v) => fmt(v.frets));
expect(dropD.includes("000232"), "Drop D full D chord");

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
