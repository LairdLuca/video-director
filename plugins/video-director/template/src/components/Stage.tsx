import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { cameraScale } from "../lib/timeline.mjs";
import { useShot } from "../shot";
import { sans } from "../theme";

/**
 * Camera (style rule 16): one slow scale curve per shot, keys outside the
 * shot so the visible part never accelerates or stops. The background sits
 * inside it (style rule 10), so a push moves every pixel and holds never freeze.
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
 * Light: bg, a faint 100 px grid and a soft accent glow drifting slowly.
 * Dark: flat bg with one large soft accent glow.
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
  if (theme === "dark") {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: c.bg,
          backgroundImage: `radial-gradient(circle at ${gx}% ${gy}%, rgba(96,165,250,0.12), rgba(96,165,250,0) 55%)`,
        }}
      />
    );
  }
  return (
    <AbsoluteFill style={{ backgroundColor: c.bg }}>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(circle at ${gx}% ${gy}%, rgba(37,99,235,0.07), rgba(37,99,235,0) 50%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(21,24,33,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(21,24,33,0.05) 1px, transparent 1px)",
          backgroundSize: "100px 100px",
          backgroundPosition: "-1px -1px",
        }}
      />
    </AbsoluteFill>
  );
};

/** Static grain over the whole frame (outside the camera, so it does not crawl). Avoids banding in H.264. */
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
)}")`;

export const Grain: React.FC = () => (
  <AbsoluteFill style={{ backgroundImage: GRAIN, opacity: 0.05, mixBlendMode: "overlay", pointerEvents: "none" }} />
);

/** Default wrapper for a scene: camera, background inside it, scene content above. */
export const StageFrame: React.FC<{ children: React.ReactNode; zoomTo?: number; origin?: string }> = ({
  children,
  zoomTo,
  origin,
}) => {
  const { shot, c } = useShot();
  return (
    <Camera from={shot.camera.from} to={zoomTo ?? shot.camera.to} origin={origin}>
      <Background />
      <AbsoluteFill style={{ color: c.ink, fontFamily: sans, fontVariantNumeric: "tabular-nums" }}>{children}</AbsoluteFill>
    </Camera>
  );
};
