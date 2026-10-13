import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { StageFrame } from "../components/Stage";
import { ease, lerp, tween } from "../motion";
import { useBeat, useShot, useShotEnd, useShotStart } from "../shot";
import { BAND, mono, MONO_ADVANCE, tile, TYPE } from "../theme";

export type CodeWalkProps = {
  file: string;
  language?: string;
  code: string;
  walk: Array<{ line: number; at: string }>;
  zoom?: number;
  // Line number of the snippet's first line in the file, only when the facts
  // give it. Without it no numbers are drawn: numbers 1-6 above a snippet
  // claimed a place in the file that no fact gave (a P0 of a test review).
  startLine?: number;
};

type Token = { text: string; tone: "ink" | "dim" | "key" };

/**
 * Subdued colouring: two tones plus the accent for keys; the band, not the
 * colour, carries the focus. Tokens that start with a digit are kept whole.
 */
export const tokenize = (line: string, language: string): Token[] => {
  const comment = line.match(/^(.*?)(\s#.*|^#.*)$/);
  const body = comment && language !== "json" ? comment[1] : line;
  const rest: Token[] = comment && language !== "json" ? [{ text: comment[2], tone: "dim" }] : [];
  if (language === "yaml" || language === "yml") {
    const m = body.match(/^(\s*)(-\s+)?([^:\s][^:]*?)(:)(\s.*)?$/);
    if (m) {
      return [
        { text: m[1], tone: "ink" },
        { text: m[2] ?? "", tone: "dim" },
        { text: m[3], tone: "key" },
        { text: m[4], tone: "dim" },
        { text: m[5] ?? "", tone: "ink" },
        ...rest,
      ];
    }
    const item = body.match(/^(\s*)(-\s+)(.*)$/);
    if (item) return [{ text: item[1], tone: "ink" }, { text: item[2], tone: "dim" }, { text: item[3], tone: "ink" }, ...rest];
  }
  if (language === "json") {
    const m = body.match(/^(\s*)("[^"]*")(\s*:)(.*)$/);
    if (m) return [{ text: m[1], tone: "ink" }, { text: m[2], tone: "key" }, { text: m[3], tone: "dim" }, { text: m[4], tone: "ink" }];
  }
  if (language === "shell") {
    const m = body.match(/^(\s*\$?\s*)(\S+)(.*)$/);
    if (m) return [{ text: m[1], tone: "dim" }, { text: m[2], tone: "key" }, { text: m[3], tone: "ink" }, ...rest];
  }
  return [{ text: body, tone: "ink" }, ...rest];
};

/** A close-up on a file or long output (catalogue 2.3): push in, walk a band from line to line, pull back. */
export const CodeWalk: React.FC = () => {
  const { shot } = useShot();
  const beat = useBeat();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shotStart = useShotStart();
  const shotEnd = useShotEnd();
  const props = shot.props as CodeWalkProps;
  const lines = String(props.code ?? "").replace(/\n$/, "").split("\n");
  const language = props.language ?? "text";
  const zoom = Math.min(2, props.zoom ?? 1.6);

  const fontSize = lines.length > 10 ? 30 : TYPE.code;
  const startLine = Number.isInteger(props.startLine) && props.startLine! > 0 ? props.startLine : undefined;
  const digits = startLine ? Math.max(2, String(startLine + lines.length - 1).length) : 0;
  const numberWidth = startLine ? fontSize * MONO_ADVANCE * (digits + 1) : 0;
  const rowH = Math.round(fontSize * 1.6);
  const header = 56;
  const pad = 32;
  const width = 1500;
  const left = (1920 - width) / 2;
  const height = header + 2 * pad + lines.length * rowH;
  const top = BAND.stageTop + Math.max(0, (BAND.stageBottom - BAND.stageTop - height) / 2);

  const walk = (props.walk ?? []).map((w) => ({ ...w, frame: beat(w.at) }));
  const first = walk[0]?.frame ?? shotStart + fps;
  const push = tween(frame, first - Math.round(0.4 * fps), first + Math.round(0.1 * fps), ease.sine);
  const pull = tween(frame, shotEnd - Math.round(1.0 * fps), shotEnd - Math.round(0.2 * fps), ease.sine);
  const pz = push * (1 - pull);
  const z = lerp(1, zoom, pz);

  // Band position (line index, fractional while moving).
  const reached = walk.filter((w) => frame >= w.frame - Math.round(0.25 * fps));
  let bandLine = walk[0] ? walk[0].line - 1 : 0;
  if (reached.length) {
    const cur = reached[reached.length - 1];
    const prev = reached[reached.length - 2];
    const p = tween(frame, cur.frame - Math.round(0.25 * fps), cur.frame, ease.inOut);
    bandLine = prev ? lerp(prev.line - 1, cur.line - 1, p) : cur.line - 1;
  }
  const bandOn = reached.length ? tween(frame, walk[0].frame - Math.round(0.25 * fps), walk[0].frame) : 0;
  const activeLine = reached.length ? reached[reached.length - 1].line - 1 : -1;

  // Camera: focus point F (screen coordinates at zoom 1) moves to the centre C.
  const fy = top + header + pad + bandLine * rowH + rowH / 2;
  const fx = Math.min(960, left + pad + (960 - BAND.textMargin) / zoom);
  const cx = 960;
  const cy = 500;
  const tx = fx * (1 - z) + (cx - fx) * pz;
  let ty = fy * (1 - z) + (cy - fy) * pz;
  // Keep the zoomed tile inside the stage band (style rule 3) when it fits;
  // a taller tile is clipped to the band below.
  const minY = BAND.stageTop + 8 - z * top;
  const maxY = BAND.stageBottom - 8 - z * (top + height);
  if (z * height <= BAND.stageBottom - BAND.stageTop - 16) ty = Math.min(Math.max(ty, minY), maxY);
  else ty = Math.min(Math.max(ty, maxY), minY);

  const appear = tween(frame, shotStart - 2, shotStart + Math.round(0.3 * fps));
  const color = (t: Token["tone"]) => (t === "key" ? tile.accent : t === "dim" ? tile.dim : tile.ink);

  return (
    <StageFrame>
      <div style={{ position: "absolute", inset: 0, clipPath: `inset(${BAND.stageTop - 12}px 0 ${1080 - BAND.stageBottom - 12}px 0)` }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${z})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left,
            top,
            width,
            height,
            backgroundColor: tile.bg,
            borderRadius: 12,
            boxShadow: `0 0 0 2px ${tile.border}`,
            overflow: "hidden",
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
            {props.file}
          </div>
          <div style={{ position: "relative", padding: pad, fontFamily: mono, fontSize, lineHeight: `${rowH}px`, whiteSpace: "pre" }}>
            {bandOn > 0 ? (
              <div
                style={{
                  position: "absolute",
                  left: pad - 14,
                  right: pad - 14,
                  top: pad + bandLine * rowH,
                  height: rowH,
                  borderRadius: 8,
                  backgroundColor: "rgba(96,165,250,0.20)",
                  opacity: bandOn,
                }}
              />
            ) : null}
            {lines.map((line, i) => (
              <div key={i} style={{ position: "relative", opacity: activeLine >= 0 && i !== activeLine ? lerp(1, 0.3, bandOn) : 1 }}>
                {numberWidth ? (
                  <span style={{ color: tile.dim, opacity: 0.6, display: "inline-block", width: numberWidth }}>
                    {String(startLine! + i).padStart(digits, " ")}
                  </span>
                ) : null}
                {tokenize(line, language).map((t, k) => (
                  <span key={k} style={{ color: color(t.tone) }}>
                    {t.text}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </StageFrame>
  );
};
