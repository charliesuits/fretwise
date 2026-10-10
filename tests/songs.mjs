import { convertToChordPro, parseChordPro, chordsUsed, progression, isChordLine, looksLikeChordPro, mapChordsInSource } from "../web/js/chordpro.js";
import { transposeSymbol } from "../web/js/theory.js";
let fails = 0; const expect = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } };
const plain = `Capo 2
[Intro]
G  C  G  D

[Verse 1]
G              G7        C        G
Amazing grace, how sweet the sound,
                         D
That saved a wretch like me
G            G7         C       G
I once was lost, but now am found
       Em      D        G
Was blind, but now I see

Chorus:
[ch]C[/ch]   [ch]D/F#[/ch]  Em
la la la la
| G . . . | D . . . |  (x2)
N.C.     A7
the end
A sentence about a band
`;
const cp = convertToChordPro(plain, { title: "Amazing Grace" });
console.log(cp);
expect(cp.includes("[G]Amazing grace, [G7]how sweet [C]the sound[G],"), "merge positions");
expect(cp.includes("{start_of_verse: Verse 1}") && cp.includes("{start_of_chorus: Chorus}\n"), "sections");
expect(cp.includes("{capo: 2}"), "capo");
expect(cp.includes("[C]la"), "ch tags");
expect(!isChordLine("A sentence about a band") && isChordLine("G  C  G  D") && isChordLine("| G . . . | D . . . |  (x2)") && isChordLine("N.C.     A7"), "chord line detection");
expect(!isChordLine("Am I the one"), "Am I the one is lyrics");
const song = parseChordPro(cp);
console.log(JSON.stringify(song.meta), song.sections.map(s=>s.type+":"+s.label).join(", "));
console.log("chords", chordsUsed(song).join(" "));
console.log(progression(song).map(p=>p.label+": "+p.chords.join(" ")).join("\n"));
expect(chordsUsed(song).join(" ") === "G C D G7 Em D/F# A7", "chords used: "+chordsUsed(song).join(" "));
expect(looksLikeChordPro(cp) && !looksLikeChordPro(plain), "detect chordpro");
expect(mapChordsInSource("[G]hi [D/F#]yo\n{key: G}", c=>transposeSymbol(c,2)) === "[A]hi [E/G#]yo\n{key: G}", "map chords");
console.log(fails ? fails + " FAILED" : "all passed"); process.exit(fails?1:0);
