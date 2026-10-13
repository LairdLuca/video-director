import React from "react";
import { useCurrentFrame } from "remotion";
import { mixAt, type Timeline } from "../lib/timeline.mjs";
import { mixPalette, sans, TYPE } from "../theme";

/**
 * Captions (style rule 7): short phrases, no box, no fade, the shown text
 * (exact spelling). A phrase appears on its first spoken word and holds
 * 0.3 s after its last word, or until the next phrase. Baseline near y 980,
 * max width 66% of the frame. When captions are off nothing is drawn and the
 * band stays empty, so the layout does not shift.
 */
export const Captions: React.FC<{ timeline: Timeline }> = ({ timeline }) => {
  const frame = useCurrentFrame();
  if (!timeline.captions) return null;
  const phrase = timeline.phrases.find((p) => frame >= p.fromFrame && frame < p.toFrame);
  if (!phrase) return null;
  const c = mixPalette(mixAt(timeline, frame, (s) => (s.theme === "dark" ? 1 : 0), { handover: true }));
  const long = phrase.text.length > 34;
  return (
    <div
      style={{
        position: "absolute",
        left: (1920 - 1270) / 2,
        width: 1270,
        bottom: 1080 - 990,
        textAlign: "center",
        fontFamily: sans,
        fontWeight: 600,
        fontSize: long ? TYPE.captionLong : TYPE.caption,
        lineHeight: 1.2,
        color: c.ink,
        textShadow: `0 0 18px ${c.bg}, 0 0 4px ${c.bg}`,
      }}
    >
      {phrase.text}
    </div>
  );
};
