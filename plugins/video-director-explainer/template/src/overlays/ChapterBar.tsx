import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BAR, type Layout, segmentWidth } from "../lib/layout.mjs";
import { mixAt, type Timeline } from "../lib/timeline.mjs";
import { ease, tween } from "../motion";
import { mixPalette, sans, type Tokens } from "../theme";

type Segment = { key: string; label: string; from: number; to: number };

/**
 * One row of equal segments with a rail on top. Past: rail full in `muted`.
 * Current: the accent fill grows with the frame across its range. Future:
 * `hairline` rail, `muted` label.
 */
const Row: React.FC<{ items: Segment[]; top: number; left: number; width: number; c: Tokens; opacity?: number }> = ({
  items,
  top,
  left,
  width,
  c,
  opacity = 1,
}) => {
  const frame = useCurrentFrame();
  const segW = segmentWidth(items.length, width);
  return (
    <div style={{ position: "absolute", top, left, width, display: "flex", gap: BAR.gap, opacity }}>
      {items.map((it) => {
        const state = frame >= it.to ? "past" : frame >= it.from ? "current" : "future";
        const fill =
          state === "past"
            ? 1
            : state === "current"
              ? interpolate(frame, [it.from, it.to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
              : 0;
        return (
          <div key={it.key} style={{ width: segW, flex: "none" }}>
            <div style={{ position: "relative", height: BAR.rail, borderRadius: 3, backgroundColor: c.hairline, overflow: "hidden" }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${fill * 100}%`,
                  backgroundColor: state === "current" ? c.accent : c.muted,
                }}
              />
            </div>
            <div
              style={{
                marginTop: BAR.labelGap,
                fontSize: BAR.label,
                letterSpacing: "0.06em",
                fontWeight: state === "current" ? 700 : 600,
                color: state === "current" ? c.ink : c.muted,
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {it.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Global chapter bar (style rule 6), drawn once above all shots. Fill only:
 * every chapter is always on screen, nothing scrolls.
 *
 * With parts in the storyboard (chapters grouped for a long film or a narrow
 * frame), two rows: the chapters of the current part above, the parts below.
 * When a part starts, the upper row cross-fades to its chapters over 0.4 s.
 * The bar takes the stage theme and switches its colours with the stage
 * during a light/dark transition; it is hidden on shots with
 * `chapterBar: false`.
 */
export const ChapterBar: React.FC<{ timeline: Timeline; layout: Layout }> = ({ timeline, layout: L }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { chapters, parts } = timeline;
  if (!chapters.length) return null;

  const visible = mixAt(timeline, frame, (s) => (s.chapterBar ? 1 : 0));
  if (visible <= 0.001) return null;
  const c = mixPalette(mixAt(timeline, frame, (s) => (s.theme === "dark" ? 1 : 0), { handover: true }));
  const { top, left, width } = L.bar;
  const segment = (key: string, label: string, from: number, to: number): Segment => ({ key, label, from, to });

  if (!parts.length) {
    return (
      <div style={{ position: "absolute", inset: 0, opacity: visible, fontFamily: sans }}>
        <Row items={chapters.map((ch, i) => segment(`${ch.id}-${i}`, ch.label, ch.from, ch.to))} top={top} left={left} width={width} c={c} />
      </div>
    );
  }

  let k = parts.findIndex((p) => frame >= p.from && frame < p.to);
  if (k < 0) k = frame < parts[0].from ? 0 : parts.length - 1;
  const rowOf = (p: number) => parts[p].chapters.map((i) => segment(`${chapters[i].id}-${i}`, chapters[i].label, chapters[i].from, chapters[i].to));
  const change = k > 0 ? tween(frame, parts[k].from, parts[k].from + Math.round(0.4 * fps), ease.inOut) : 1;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: visible, fontFamily: sans }}>
      {change < 1 ? <Row items={rowOf(k - 1)} top={top} left={left} width={width} c={c} opacity={1 - change} /> : null}
      <Row items={rowOf(k)} top={top} left={left} width={width} c={c} opacity={change} />
      <Row
        items={parts.map((p, i) => segment(`${p.id}-${i}`, p.label, p.from, p.to))}
        top={top + L.bar.rowPitch}
        left={left}
        width={width}
        c={c}
      />
    </div>
  );
};
