import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { icons } from "../icons.generated";
import { HERO, slabFontSize } from "../lib/layout.mjs";
import { arrive, ease, follow, lerp, tween } from "../motion";
import { useShot } from "../shot";
import { alpha, mono, sans } from "../theme";

/** Lucide file name: "server", "file-code"; PascalCase ("ShoppingCart") is accepted too. */
export const iconFile = (name: string) =>
  name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();

/** Line-art icon, 3 px stroke at any size (style catalogue 2.4). */
export const Icon: React.FC<{ name: string; size?: number; color: string; stroke?: number }> = ({
  name,
  size = 96,
  color,
  stroke = 3,
}) => {
  // Only the icons the storyboard uses are bundled: src/icons.generated.ts is
  // written by the scripts (lint, stills, freeze, render) from storyboard.json.
  const Comp = icons[iconFile(name)];
  if (!Comp) throw new Error(`icon "${name}" is not in src/icons.generated.ts (run lint-storyboard; Lucide names, e.g. "server")`);
  return <Comp size={size} color={color} strokeWidth={stroke} absoluteStrokeWidth />;
};

/** A tick or a cross drawn as a stroke over 0.25 s, starting at `at`. */
export const Mark: React.FC<{ kind: "tick" | "cross"; at: number; size?: number; color: string; width?: number }> = ({
  kind,
  at,
  size = 56,
  color,
  width = 7,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = tween(frame, at, at + Math.round(0.25 * fps), ease.out);
  if (p <= 0) return null;
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: width,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    pathLength: 1,
    strokeDasharray: 1,
  };
  if (kind === "tick") {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" style={{ overflow: "visible" }}>
        <path d="M9 25 L20 36 L40 13" {...common} strokeDashoffset={1 - p} />
      </svg>
    );
  }
  const p1 = Math.min(1, p * 2);
  const p2 = Math.max(0, p * 2 - 1);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ overflow: "visible" }}>
      <path d="M12 12 L36 36" {...common} strokeDashoffset={1 - p1} />
      {p2 > 0 ? <path d="M36 12 L12 36" {...common} strokeDashoffset={1 - p2} /> : null}
    </svg>
  );
};

/** Corner brackets closing on a box over 0.3 s (pointing device, style rule 18). */
export const Brackets: React.FC<{
  box: { x: number; y: number; w: number; h: number };
  at: number;
  until?: number;
  color: string;
  arm?: number;
  pad?: number;
  /** Vertical gap to the box, when it differs from `pad` (a row between rows). */
  padY?: number;
}> = ({ box, at, until, color, arm = 26, pad = 10, padY = pad }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = tween(frame, at, at + Math.round(0.3 * fps), ease.out);
  const out = until !== undefined ? tween(frame, until, until + Math.round(0.2 * fps), ease.in) : 0;
  if (p <= 0 || out >= 1) return null;
  const spread = lerp(28, 0, p);
  const x0 = box.x - pad - spread;
  const y0 = box.y - padY - spread;
  const x1 = box.x + box.w + pad + spread;
  const y1 = box.y + box.h + padY + spread;
  const s = { position: "absolute" as const, width: arm, height: arm, borderColor: color, borderStyle: "solid" };
  const w = 5;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, opacity: p * (1 - out) }}>
      <div style={{ ...s, left: x0, top: y0, borderWidth: `${w}px 0 0 ${w}px` }} />
      <div style={{ ...s, left: x1 - arm, top: y0, borderWidth: `${w}px ${w}px 0 0` }} />
      <div style={{ ...s, left: x0, top: y1 - arm, borderWidth: `0 0 ${w}px ${w}px` }} />
      <div style={{ ...s, left: x1 - arm, top: y1 - arm, borderWidth: `0 ${w}px ${w}px 0` }} />
    </div>
  );
};

export type SlabProps = {
  value: string;
  caption?: string;
  side?: "left" | "right" | "center";
  tone?: "accent" | "negative" | "positive";
};

/**
 * Status slab (style rules 8 and 14): a big number on a coloured card. It drops in
 * and arrives on `at`; the number pops with a small overshoot. The value
 * shrinks to fit `maxWidth` (slabFontSize in lib/layout.mjs: the hero size up
 * to 4 characters in a 620 px half-stage slot, smaller beyond; a five-digit
 * task number at 192 px ran out of that slot in a test video) and the caption
 * wraps inside it. `maxFont` caps the value where the stage is short.
 */
export const Slab: React.FC<SlabProps & { at: number; maxWidth?: number; maxFont?: number; style?: React.CSSProperties }> = ({
  value,
  caption,
  tone = "accent",
  at,
  maxWidth = 1600,
  maxFont = HERO,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { c } = useShot();
  const drop = arrive(frame, at, fps, 0.25);
  const pop = tween(frame, at - Math.round(0.1 * fps), at + Math.round(0.2 * fps), ease.backOut);
  if (drop <= 0) return null;
  const bg = tone === "negative" ? c.negative : tone === "positive" ? c.positive : c.accent;
  return (
    <div
      style={{
        backgroundColor: bg,
        borderRadius: 28,
        padding: "40px 64px 44px",
        minWidth: Math.min(420, maxWidth),
        maxWidth,
        boxSizing: "border-box",
        textAlign: "center",
        color: c.onAccent,
        opacity: drop,
        transform: `translateY(${lerp(-48, 0, drop)}px)`,
        boxShadow: `0 24px 60px ${alpha(c.shadow, 0.18)}`,
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: mono,
          fontWeight: 700,
          fontSize: slabFontSize(value, maxWidth, maxFont),
          lineHeight: 1,
          whiteSpace: "nowrap",
          transform: `scale(${lerp(0.6, 1, pop)})`,
        }}
      >
        {value}
      </div>
      {caption ? (
        <div
          style={{
            fontFamily: sans,
            fontWeight: 600,
            fontSize: 34,
            marginTop: 18,
            opacity: follow(frame, at, fps, 0.2, 0.3),
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
};

/** Text where one phrase is drawn in the accent colour. */
export const WithKeyword: React.FC<{ text: string; keyword?: string; color: string }> = ({ text, keyword, color }) => {
  if (!keyword) return <>{text}</>;
  const i = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span style={{ color }}>{text.slice(i, i + keyword.length)}</span>
      {text.slice(i + keyword.length)}
    </>
  );
};

/** A token that looks like code (identifier, flag, path, version) is set in mono (lib/layout.mjs). */
export { looksLikeCode } from "../lib/layout.mjs";
