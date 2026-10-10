import { movableShapes, placeShape, nextStart, groupOf, stringSet, maxStart } from "../web/js/shapes.js";
let fails = 0; const expect = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } };
const STD = [40, 45, 50, 55, 59, 64];
const rel = (s) => s.rel.map((r) => (r < 0 ? "x" : r)).join("");
for (const q of ["", "m", "7", "m7", "maj7", "m7b5", "dim7", "13", "7#9"]) {
  const list = movableShapes(q);
  const groups = [...new Set(list.map((s) => groupOf(s)))];
  console.log((q || "maj").padEnd(5), String(list.length).padStart(3), "shapes |", groups.join(", "), "| first:", list.slice(0, 4).map(rel).join(" "));
}
const maj = movableShapes("").map(rel);
expect(maj.includes("133211"), "E-form barre major");
expect(maj.includes("x13331"), "A-form barre major");
expect(movableShapes("m").map(rel).includes("133111"), "E-form minor");
expect(movableShapes("m7").map(rel).includes("x1312x") || movableShapes("m7").map(rel).includes("x13121"), "A-form m7");
expect(movableShapes("7").map(rel).includes("1x12xx"), "dom7 shell root 6");
expect(movableShapes("").every((s) => s.rel.every((r) => r !== 0)), "no open strings");
// placing the E-form barre at fret 5 makes A major, at fret 3 G, at 8 C
const e = movableShapes("").find((s) => rel(s) === "133211");
expect(placeShape(e, 5, STD).rootName === "A" && placeShape(e, 3, STD).rootName === "G" && placeShape(e, 8, STD).rootName === "C", "E form roots");
expect(placeShape(e, 5, STD).frets.join() === "5,7,7,6,5,5", "E form at 5 frets");
expect(placeShape(e, 5, STD).chord.name === "A", "chord object");
const a = movableShapes("m7").find((s) => s.low === 1 && s.bassLabel === "1");
expect(placeShape(a, 3, STD).rootName === "C", "A-form m7 at 3 = Cm7 " + placeShape(a, 3, STD).rootName);
// cycle of 4ths: A (5) -> D -> G -> C ...
let p = 5; const roots = [];
for (let i = 0; i < 6; i++) { roots.push(placeShape(e, p, STD).rootName); p = nextStart(e, p, "fourths", STD, 15); }
expect(roots.join(" ") === "A D G C F Bb", "fourths " + roots.join(" "));
expect(nextStart(e, maxStart(e, 15), "up", STD, 15) === 1 && nextStart(e, 4, "up", STD, 15) === 5, "chromatic wrap");
const rs = new Set(); for (let i = 0; i < 40; i++) { const n = nextStart(e, 4, "random", STD, 15); rs.add(n); expect(n !== 4 && n >= 1 && n <= maxStart(e, 15), "random range"); }
expect(stringSet(e) === "Strings 6–1" && groupOf(e) === "Root on string 6", "labels");
const inv = movableShapes("", { inversions: true });
expect(inv.some((s) => s.bassLabel === "3") && inv.some((s) => s.bassLabel === "5"), "inversions");
console.log(fails ? fails + " FAILED" : "all passed"); process.exit(fails ? 1 : 0);
