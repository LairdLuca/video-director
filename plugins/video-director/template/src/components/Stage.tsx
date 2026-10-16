import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { cameraScale } from "../lib/timeline.mjs";
import { useShot } from "../shot";
import { alpha, ruling, sans } from "../theme";

/**
 * Camera (style rule 16): one slow scale curve per shot, keys outside the
 * shot so the visible part never accelerates or stops. The glow and the
 * content sit inside it (style rule 10), so holds never freeze; the paper
 * stays under it (see Paper).
 */
export const Camera: React.FC<{
  children: React.ReactNode;
  from?: number;
  to?: number;
  origin?: string;
}> = ({ children, from = 1, to = 1.04, origin = "50% 48%" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { shot } = useShot();
  const scale = cameraScale(frame, shot.durationInFrames, fps, from, to);
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: origin }}>{children}</AbsoluteFill>
  );
};

/**
 * Stage background (style rules 8 and 11), CSS only, no WebGL.
 * A soft glow drifting slowly over the paper (see Paper): light on the light
 * stage, faint on the dark one.
 */
export const Background: React.FC = () => {
  const { shot, theme, c } = useShot();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // The glow orbits on the global clock, so it does not jump at a cut.
  const t = (shot.from + frame) / fps;
  const orbit = (2 * Math.PI * t) / 40;
  const gx = 50 + 18 * Math.cos(orbit);
  const gy = 40 + 12 * Math.sin(orbit);
  const [strength, reach] = theme === "dark" ? [0.05, 55] : [0.45, 50];
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `radial-gradient(circle at ${gx}% ${gy}%, ${alpha(c.glow, strength)}, ${alpha(c.glow, 0)} ${reach}%)`,
      }}
    />
  );
};

/** Static grain over the whole frame (outside the camera, so it does not crawl). Avoids banding in H.264. */
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
)}")`;

export const Grain: React.FC = () => (
  <AbsoluteFill style={{ backgroundImage: GRAIN, opacity: 0.05, mixBlendMode: "overlay", pointerEvents: "none" }} />
);

/** One family of ruled lines: horizontal and vertical, `width` px thick, every `step` px, one line through the frame centre. */
const lines = (color: string, step: number, width: number, w: number, h: number) => ({
  backgroundImage: `linear-gradient(${color} ${width}px, transparent ${width}px), linear-gradient(90deg, ${color} ${width}px, transparent ${width}px)`,
  backgroundSize: `${step}px ${step}px`,
  backgroundPosition: `${(w / 2) % step}px ${(h / 2) % step}px`,
});

/**
 * Paper of the stage: its colour and its squared ruling (style rule 10),
 * under the camera rather than inside it, so the push does not rescale the
 * lines (a rescaled pattern changes every pixel of every frame and the file
 * grows several times, measured with a paper texture). The glow and the
 * content still move with the camera, so holds do not read as frozen.
 */
export const Paper: React.FC = () => {
  const { c, theme } = useShot();
  const { width, height } = useVideoConfig();
  const r = ruling[theme];
  return (
    <AbsoluteFill style={{ backgroundColor: c.bg }}>
      <AbsoluteFill style={lines(c.grid, r.step, 1, width, height)} />
      {r.major > 0 ? <AbsoluteFill style={lines(c.gridMajor, r.step * r.major, 2, width, height)} /> : null}
      {r.margin !== null ? (
        <div style={{ position: "absolute", top: 0, bottom: 0, left: r.margin, width: 2, backgroundColor: c.marginLine }} />
      ) : null}
    </AbsoluteFill>
  );
};

/** Default wrapper for a scene: paper under the camera, background inside it, scene content above. */
export const StageFrame: React.FC<{ children: React.ReactNode; zoomTo?: number; origin?: string }> = ({
  children,
  zoomTo,
  origin,
}) => {
  const { shot, c } = useShot();
  return (
    <>
      <Paper />
      <Camera from={shot.camera.from} to={zoomTo ?? shot.camera.to} origin={origin}>
        <Background />
        <AbsoluteFill style={{ color: c.ink, fontFamily: sans, fontVariantNumeric: "tabular-nums" }}>{children}</AbsoluteFill>
      </Camera>
    </>
  );
};
