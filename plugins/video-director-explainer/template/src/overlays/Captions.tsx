import React from "react";
import { useCurrentFrame } from "remotion";
import { captionCodeSize, captionSize, type Layout } from "../lib/layout.mjs";
import { mixAt, type Timeline } from "../lib/timeline.mjs";
import { mixPalette, mono, sans } from "../theme";

// Punctuation around a code word stays in the text font: "DATABASE_URL," is
// the identifier in mono and the comma in the caption's font. Only quotes,
// a final ".", "," or ";" and a bracket the code does not open or close are
// peeled: "main()", "arr[0]", "$?" and "env:" stay whole (seen in a review:
// "main(" in mono and ")" in the text font; the colon is the code's, by the
// user's choice).
const QUOTES_OPEN = "\"'«“‘";
const QUOTES_CLOSE = "\"'»”’";
const PAIRS: Record<string, string> = { ")": "(", "]": "[" };
const count = (s: string, ch: string) => s.split(ch).length - 1;

export const codeEdges = (text: string): [string, string, string] => {
  let a = 0;
  let b = text.length;
  for (;;) {
    const c = text[a];
    if (a < b && QUOTES_OPEN.includes(c)) a++;
    // an opening bracket whose closer is not in the word
    else if (a < b && (c === "(" || c === "[") && count(text.slice(a, b), c) > count(text.slice(a, b), c === "(" ? ")" : "]")) a++;
    else break;
  }
  for (;;) {
    const c = text[b - 1];
    if (b > a && (QUOTES_CLOSE.includes(c) || ".,;".includes(c))) b--;
    // a closing bracket whose opener is not in the word
    else if (b > a && PAIRS[c] && count(text.slice(a, b), c) > count(text.slice(a, b), PAIRS[c])) b--;
    else break;
  }
  return [text.slice(0, a), text.slice(a, b), text.slice(b)];
};

// JetBrains Mono looks larger than the text font at the same size (a taller
// x-height and wider letters), so code words are drawn a little smaller
// (0.9 of the caption size, lib/layout.mjs captionCodeSize), and smaller
// still when one word is wider than the caption box.

/**
 * Captions (style rule 7): short phrases, no box, no fade, the shown text
 * (exact spelling). A phrase appears on its first spoken word and holds
 * 0.3 s after its last word, or until the next phrase. Commands, file names
 * and identifiers (words the voice step marked as code) are drawn in
 * JetBrains Mono. Centred on the caption baseline of the format, within its
 * caption width. When captions are off nothing is drawn and the band stays
 * empty, so the layout does not shift.
 */
export const Captions: React.FC<{ timeline: Timeline; layout: Layout }> = ({ timeline, layout: L }) => {
  const frame = useCurrentFrame();
  if (!timeline.captions) return null;
  const phrase = timeline.phrases.find((p) => frame >= p.fromFrame && frame < p.toFrame);
  if (!phrase) return null;
  const c = mixPalette(mixAt(timeline, frame, (s) => (s.theme === "dark" ? 1 : 0), { handover: true }));
  const size = captionSize(L, phrase.text);
  return (
    <div
      style={{
        position: "absolute",
        left: (L.width - L.captionWidth) / 2,
        width: L.captionWidth,
        bottom: L.height - L.captionBaseline,
        textAlign: "center",
        fontFamily: sans,
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1.2,
        color: c.ink,
        textShadow: `0 0 18px ${c.bg}, 0 0 4px ${c.bg}`,
      }}
    >
      {phrase.words.map((w, i) => {
        const space = i < phrase.words.length - 1 ? " " : "";
        if (!w.code) return <React.Fragment key={i}>{w.text + space}</React.Fragment>;
        const [open, core, close] = codeEdges(w.text);
        return (
          <React.Fragment key={i}>
            {open}
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: captionCodeSize(L, size, core.length) }}>{core}</span>
            {close + space}
          </React.Fragment>
        );
      })}
    </div>
  );
};
