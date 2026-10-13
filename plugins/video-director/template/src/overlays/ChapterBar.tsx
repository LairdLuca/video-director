import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { mixAt, type Timeline } from "../lib/timeline.mjs";
import { ease, tween } from "../motion";
import { mixPalette, sans, TYPE } from "../theme";

const LEFT = 120;
const WIDTH = 1920 - 2 * LEFT;
const GAP = 14;
const WINDOW = 5;

/**
 * Global chapter bar (style rule 6), drawn once above all shots.
 * Past chapters: rail in `muted`. Current: the accent fill grows with the
 * frame across the chapter. Future: `hairline` rail, `muted` label.
 * More than 5 chapters (the 6 of a how-to included): a window of 5. When the
 * current chapter would move past the third slot, the row shifts by one
 * segment over 0.5 s (ease in-out) at that chapter's start, so the current
 * chapter stays in the second or third slot until the last chapters are in
 * view; with 6 chapters it shifts once, at the fourth. The bar takes the stage
 * theme and cross-fades its colours during a light/dark transition; it is
 * hidden on shots with `chapterBar: false`.
 */
export const ChapterBar: React.FC<{ timeline: Timeline }> = ({ timeline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chapters = timeline.chapters;
  if (!chapters.length) return null;

  const visible = mixAt(timeline, frame, (s) => (s.chapterBar ? 1 : 0));
  if (visible <= 0.001) return null;
  const c = mixPalette(mixAt(timeline, frame, (s) => (s.theme === "dark" ? 1 : 0), { handover: true }));

  const n = chapters.length;
  const scrolls = n > WINDOW;
  const slots = scrolls ? WINDOW : n;
  const segW = (WIDTH - GAP * (slots - 1)) / slots;
  let current = chapters.findIndex((ch) => frame >= ch.from && frame < ch.to);
  if (current < 0) current = frame < chapters[0].from ? -1 : n - 1;

  // Scroll offset in segments: the first visible chapter is k - 2 (current in
  // the third slot), clamped to the row; it changes by at most one segment per
  // chapter, eased over 0.5 s from the chapter's start.
  let offset = 0;
  if (scrolls) {
    const target = (k: number) => Math.min(Math.max(k - 2, 0), n - WINDOW);
    offset = target(0);
    for (let k = 1; k < n; k++) {
      const step = target(k) - target(k - 1);
      if (step) offset += step * tween(frame, chapters[k].from, chapters[k].from + Math.round(0.5 * fps), ease.inOut);
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 48,
        left: LEFT,
        width: WIDTH,
        height: 60,
        overflow: "hidden",
        opacity: visible,
        fontFamily: sans,
      }}
    >
      <div style={{ position: "absolute", left: -offset * (segW + GAP), top: 0, display: "flex", gap: GAP }}>
        {chapters.map((ch, i) => {
          const state = i < current ? "past" : i === current ? "current" : "future";
          const fill =
            state === "past"
              ? 1
              : state === "current"
                ? interpolate(frame, [ch.from, ch.to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
                : 0;
          return (
            <div key={`${ch.id}-${i}`} style={{ width: segW, flex: "none" }}>
              <div style={{ position: "relative", height: 6, borderRadius: 3, backgroundColor: c.hairline, overflow: "hidden" }}>
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
                  marginTop: 14,
                  fontSize: TYPE.chapter,
                  letterSpacing: "0.06em",
                  fontWeight: state === "current" ? 700 : 600,
                  color: state === "current" ? c.ink : c.muted,
                  whiteSpace: "nowrap",
                }}
              >
                {ch.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
