import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { arrive, ease, lerp, tween } from "../motion";
import { useShot } from "../shot";
import { mono, TYPE } from "../theme";
import { Icon } from "./primitives";

export const NODE_SIZE = 200;

/**
 * A diagram node: line-art icon in a card, label under it. It appears on
 * `at`; it lights (accent border) on `litAt`, e.g. when an edge arrives.
 */
export const DiagramNode: React.FC<{
  x: number;
  y: number;
  icon: string;
  label: string;
  sub?: string;
  at: number;
  litAt?: number;
  dashed?: boolean;
  size?: number;
  labelSide?: "below" | "right";
  children?: React.ReactNode;
}> = ({ x, y, icon, label, sub, at, litAt, dashed, size = NODE_SIZE, labelSide = "below", children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { c } = useShot();
  const p = arrive(frame, at, fps, 0.4);
  if (p <= 0) return null;
  const lit = litAt !== undefined ? tween(frame, litAt, litAt + Math.round(0.25 * fps)) : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        opacity: p,
        transform: `translateY(${lerp(24, 0, p)}px)`,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 32,
          backgroundColor: c.card,
          border: `3px ${dashed ? "dashed" : "solid"} ${lit > 0.5 ? c.accent : c.hairline}`,
          boxShadow: lit > 0.5 ? `0 0 0 ${lerp(0, 8, lit)}px rgba(37,99,235,0.12)` : "0 10px 30px rgba(15,23,42,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <Icon name={icon} size={Math.round(size * 0.52)} color={lit > 0.5 ? c.accent : c.ink} />
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          ...(labelSide === "right"
            ? { left: size + 32, top: 0, height: size, width: 560, display: "flex", flexDirection: "column" as const, justifyContent: "center", textAlign: "left" as const }
            : { top: size + 22, left: -160, width: size + 320, textAlign: "center" as const }),
          fontSize: TYPE.label,
          fontWeight: 600,
          lineHeight: 1.15,
        }}
      >
        {label}
        {sub ? (
          <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 400, color: c.muted, marginTop: 8 }}>{sub}</div>
        ) : null}
      </div>
    </div>
  );
};

/**
 * An edge drawn as a stroke from (x1,y1) to (x2,y2) over `durS`, centred on
 * `at`. Returns nothing before it starts. A broken edge is dashed, in the
 * negative colour.
 */
export const Edge: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  at: number;
  durS?: number;
  broken?: boolean;
  label?: string;
}> = ({ x1, y1, x2, y2, at, durS = 0.4, broken, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { c } = useShot();
  const half = Math.round((durS * fps) / 2);
  const p = tween(frame, at - half, at + half, ease.inOut);
  if (p <= 0) return null;
  const color = broken ? c.negative : c.muted;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const hx = x1 + (x2 - x1) * p;
  const hy = y1 + (y2 - y1) * p;
  const head = 22;
  const labelOpacity = tween(frame, at + half, at + half + Math.round(0.3 * fps));
  return (
    <>
      <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={1} height={1}>
        <line
          x1={x1}
          y1={y1}
          x2={hx}
          y2={hy}
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={broken ? "16 14" : undefined}
        />
        {p > 0.9 ? (
          <polyline
            points={`${hx - ux * head - uy * head * 0.6},${hy - uy * head + ux * head * 0.6} ${hx},${hy} ${
              hx - ux * head + uy * head * 0.6
            },${hy - uy * head - ux * head * 0.6}`}
            fill="none"
            stroke={color}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
      {label ? (
        <div
          style={{
            position: "absolute",
            left: (x1 + x2) / 2 - 300,
            top: (y1 + y2) / 2 - 62,
            width: 600,
            textAlign: "center",
            fontSize: 30,
            fontWeight: 600,
            color: c.muted,
            opacity: labelOpacity,
          }}
        >
          {label}
        </div>
      ) : null}
    </>
  );
};
