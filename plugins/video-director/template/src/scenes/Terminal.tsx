import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Brackets } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { ease, tween } from "../motion";
import { TERMINAL_PAD, terminalMaxRows, terminalMinFont, terminalWidth } from "../lib/layout.mjs";
import { useBeat, useShot, useShotStart } from "../shot";
import { alpha, DIMMED, MONO_ADVANCE, mono, tile, TYPE } from "../theme";

export type TerminalLine = { kind: "cmd" | "out" | "err" | "ok"; text: string; at?: string };
export type TerminalFocus = { line: number; style: "brackets" | "band" | "tint"; at: string };
export type TerminalProps = {
  title?: string;
  lines: TerminalLine[];
  focus?: TerminalFocus[];
  size?: "tile" | "full";
  typeCps?: number;
  outCps?: number;
};

const ROW = 1.6;
// Brackets around one row sit in the gap between rows: the ink of a mono
// line fills about 1 em of its 1.6 em row, so 0.3 em is free above and
// below. Seen on 9:16 test videos at 24 px: the 10 px default gap put the
// top arms on the line above.
export const bracketPadY = (fontSize: number) => Math.max(0, Math.round(0.3 * fontSize - 4));

/**
 * When each line starts (frame, relative to the shot) and when a command
 * finishes typing. Commands type from their anchor at `typeCps`; output
 * without an anchor follows in chunks of up to 3 lines at about `outCps`.
 */
export const scheduleLines = (
  lines: TerminalLine[],
  beat: (name: string | undefined, fallback?: number) => number,
  fps: number,
  firstFrame: number,
  typeCps: number,
  outCps: number,
  startBy: Map<number, number> = new Map(),
) => {
  const out: Array<{ start: number; typedEnd: number }> = [];
  let cursor = firstFrame;
  let chunkStart = -1;
  let chunkChars = 0;
  let chunkLines = 0;
  lines.forEach((line, i) => {
    let start: number;
    if (line.at) {
      start = beat(line.at);
      chunkStart = start;
      chunkChars = line.text.length;
      chunkLines = 1;
    } else if (line.kind === "cmd") {
      start = cursor + Math.round(0.4 * fps);
      chunkStart = -1;
    } else if (i > 0 && lines[i - 1].kind === "cmd") {
      start = cursor + Math.round(0.2 * fps);
      chunkStart = start;
      chunkChars = line.text.length;
      chunkLines = 1;
    } else if (chunkStart >= 0 && chunkLines < 3) {
      start = chunkStart;
      chunkChars += line.text.length;
      chunkLines += 1;
    } else {
      const prev = chunkStart >= 0 ? chunkStart : cursor;
      start = prev + Math.max(Math.round(0.15 * fps), Math.round((chunkChars / outCps) * fps));
      chunkStart = start;
      chunkChars = line.text.length;
      chunkLines = 1;
    }
    // A line that a focus points at exists by the focus beat (style rule 27).
    const by = startBy.get(i);
    if (by !== undefined && by < start) {
      start = by;
      if (chunkStart >= 0) chunkStart = Math.min(chunkStart, by);
    }
    const typedEnd = line.kind === "cmd" ? start + Math.max(1, Math.round((line.text.length / typeCps) * fps)) : start;
    out.push({ start, typedEnd });
    cursor = Math.max(cursor, typedEnd);
  });
  // Lines appear in order: a line pulled earlier pulls the lines above it.
  for (let i = out.length - 2; i >= 0; i--) {
    if (out[i].start > out[i + 1].start) {
      const typing = out[i].typedEnd - out[i].start;
      out[i] = { start: out[i + 1].start, typedEnd: out[i + 1].start + typing };
    }
  }
  return out;
};

/**
 * A command and its evidence (catalogue 2.2). The tile is 1500 px wide on a
 * 16:9 frame (1728 for `full`) and fills the width less the margins on a
 * 1080 px wide one, where the text may go down to 24 px so about 61
 * characters fit (the lint fails on longer lines; 28 px is the minimum on
 * 16:9). Over 10 rows (16 in 9:16) it scrolls.
 */
export const Terminal: React.FC = () => {
  const { shot, c, L } = useShot();
  const beat = useBeat();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shotStart = useShotStart();
  const props = shot.props as TerminalProps;
  const lines = props.lines ?? [];
  const full = props.size === "full";
  const typeCps = props.typeCps ?? 25;
  const outCps = props.outCps ?? 70;

  const width = terminalWidth(L, props.size);
  const pad = TERMINAL_PAD;
  const MAX_ROWS = terminalMaxRows(L);
  const longest = Math.max(1, ...lines.map((l) => l.text.length + (l.kind === "cmd" ? 2 : 0)));
  const fit = Math.floor((width - 2 * pad) / (longest * MONO_ADVANCE));
  const fontSize = Math.max(terminalMinFont(L), Math.min(full ? 34 : TYPE.code, fit));
  const rowH = Math.round(fontSize * ROW);
  const header = 56;

  const appear = tween(frame, shotStart - 2, shotStart + Math.round(0.3 * fps));
  const startBy = new Map<number, number>();
  for (const f of props.focus ?? []) {
    const by = beat(f.at) - Math.round(0.3 * fps);
    startBy.set(f.line - 1, Math.min(by, startBy.get(f.line - 1) ?? by));
  }
  const schedule = scheduleLines(lines, beat, fps, shotStart + Math.round(0.3 * fps), typeCps, outCps, startBy);
  const started = schedule.filter((s) => frame >= s.start).length;
  const firstRow = Math.max(0, started - MAX_ROWS);
  const visible = lines.map((l, i) => ({ l, i, s: schedule[i] })).slice(firstRow, started);

  const finalRows = Math.min(MAX_ROWS, lines.length);
  const finalHeight = header + 2 * pad + finalRows * rowH;
  const top = full && !L.narrow ? L.stageTop : L.stageTop + Math.max(0, (L.stageH - finalHeight) / 2);
  // The tile grows downward as lines arrive.
  const grow = schedule.reduce((sum, s, i) => (i < firstRow ? sum : sum + tween(frame, s.start, s.start + 4)), 0);
  const height = header + 2 * pad + Math.min(MAX_ROWS, Math.max(1, grow)) * rowH;

  // Focus devices.
  const focus = (props.focus ?? []).map((f) => ({ ...f, frame: beat(f.at) }));
  const active = [...focus].reverse().find((f) => frame >= f.frame);
  const bandFoci = focus.filter((f) => f.style === "band");
  const bandActive = bandFoci.filter((f) => frame >= f.frame);
  let bandY = -1;
  let bandOpacity = 0;
  if (bandActive.length) {
    const cur = bandActive[bandActive.length - 1];
    const prev = bandActive[bandActive.length - 2];
    const p = tween(frame, cur.frame - Math.round(0.25 * fps), cur.frame, ease.inOut);
    const to = (cur.line - 1 - firstRow) * rowH;
    const from = prev ? (prev.line - 1 - firstRow) * rowH : to;
    bandY = from + (to - from) * p;
    bandOpacity = prev ? 1 : tween(frame, cur.frame - Math.round(0.25 * fps), cur.frame);
  }

  const colorOf = (l: TerminalLine) =>
    l.kind === "cmd" ? tile.ink : l.kind === "err" ? tile.negative : l.kind === "ok" ? tile.positive : tile.ink;

  return (
    <StageFrame>
      <div
        style={{
          position: "absolute",
          left: (L.width - width) / 2,
          top,
          width,
          height,
          backgroundColor: tile.bg,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: shot.theme === "light" ? `0 30px 70px ${alpha(c.shadow, 0.22)}` : `0 0 0 2px ${tile.border}`,
          opacity: appear,
        }}
      >
        <div
          style={{
            height: header,
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            backgroundColor: tile.bar,
            color: tile.dim,
            fontFamily: mono,
            fontSize: TYPE.micro,
          }}
        >
          {props.title ?? ""}
        </div>
        <div
          style={{
            position: "relative",
            padding: pad,
            fontFamily: mono,
            fontSize,
            lineHeight: `${rowH}px`,
            whiteSpace: "pre",
          }}
        >
          {bandOpacity > 0 ? (
            <div
              style={{
                position: "absolute",
                left: pad - 14,
                right: pad - 14,
                top: pad + bandY,
                height: rowH,
                borderRadius: 8,
                backgroundColor: alpha(tile.accent, 0.2),
                opacity: bandOpacity,
              }}
            />
          ) : null}
          {started === 0 && lines[0]?.kind === "cmd" ? (
            // The prompt is there from the start, so the tile is never an
            // empty box while the narration reaches the command (seen on a
            // 9:16 test video: 1-1.5 s of an empty tile)
            <div style={{ color: tile.ink, fontWeight: 700 }}>
              <span style={{ color: tile.accent }}>$ </span>
              {Math.floor(frame / (fps / 2)) % 2 === 0 ? (
                <span
                  style={{
                    display: "inline-block",
                    width: fontSize * MONO_ADVANCE,
                    height: fontSize * 1.1,
                    verticalAlign: "middle",
                    backgroundColor: tile.ink,
                    marginLeft: 2,
                  }}
                />
              ) : null}
            </div>
          ) : null}
          {visible.map(({ l, i, s }) => {
            const typed =
              l.kind === "cmd"
                ? Math.floor(l.text.length * tween(frame, s.start, s.typedEnd, (t) => t))
                : l.text.length;
            const typing = l.kind === "cmd" && frame < s.typedEnd;
            const waiting =
              l.kind === "cmd" && !typing && (schedule[i + 1] === undefined || frame < schedule[i + 1].start);
            const showCursor = typing || (waiting && Math.floor((frame - s.typedEnd) / (fps / 2)) % 2 === 0);
            const dimmed = bandOpacity > 0 && active?.style === "band" && active.line - 1 !== i;
            const tint = focus.find((f) => f.style === "tint" && f.line - 1 === i && frame >= f.frame);
            const tintColor =
              l.kind === "err" ? alpha(tile.negative, 0.18) : l.kind === "ok" ? alpha(tile.positive, 0.16) : alpha(tile.accent, 0.18);
            return (
              <div
                key={i}
                style={{
                  position: "relative",
                  color: colorOf(l),
                  opacity: dimmed ? DIMMED : l.kind === "cmd" ? 1 : tween(frame, s.start, s.start + 4),
                  fontWeight: l.kind === "cmd" ? 700 : 400,
                  backgroundColor: tint ? tintColor : "transparent",
                  margin: "0 -14px",
                  padding: "0 14px",
                  borderRadius: 8,
                }}
              >
                {l.kind === "cmd" ? <span style={{ color: tile.accent }}>$ </span> : null}
                {l.text.slice(0, typed)}
                {showCursor ? (
                  <span
                    style={{
                      display: "inline-block",
                      width: fontSize * MONO_ADVANCE,
                      height: fontSize * 1.1,
                      verticalAlign: "middle",
                      backgroundColor: tile.ink,
                      marginLeft: 2,
                    }}
                  />
                ) : null}
              </div>
            );
          })}
          {focus
            .filter((f) => f.style === "brackets")
            .map((f, k, all) => {
              const row = f.line - 1 - firstRow;
              if (row < 0 || row >= MAX_ROWS) return null;
              const text = lines[f.line - 1]?.text ?? "";
              const prefix = lines[f.line - 1]?.kind === "cmd" ? 2 : 0;
              const next = all[k + 1];
              return (
                <Brackets
                  key={k}
                  box={{
                    x: pad - 6,
                    y: pad + row * rowH,
                    w: (text.length + prefix) * fontSize * MONO_ADVANCE + 12,
                    h: rowH,
                  }}
                  at={f.frame - Math.round(0.15 * fps)}
                  until={next ? next.frame - Math.round(0.15 * fps) : undefined}
                  color={tile.accent}
                  padY={bracketPadY(fontSize)}
                />
              );
            })}
        </div>
      </div>
    </StageFrame>
  );
};
