import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Brackets } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { arrive, ease, follow, lerp, tween } from "../motion";
import { useBeat, useShot, useShotStart } from "../shot";
import { alpha, TYPE } from "../theme";

export type ScreenshotRegion = {
  box: [number, number, number, number];
  kind: "brackets" | "band" | "callout";
  label?: string;
  at: string;
};
export type ScreenshotProps = {
  src: string;
  size: [number, number];
  regions?: ScreenshotRegion[];
  pan?: Array<{ to: [number, number, number]; at: string }>;
};

/**
 * A still of a UI or a page (catalogue 2.9, not yet proven). `src` is a file
 * in public/, `size` its pixel size; region boxes are in image pixels and
 * must be measured, never guessed. The camera pans between `pan` targets
 * (image x, y, scale up to 1.5). The image fits a 1500 x 690 box on a 16:9
 * frame, the stage less its margins on the others.
 */
export const Screenshot: React.FC = () => {
  const { shot, c, L } = useShot();
  const beat = useBeat();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shotStart = useShotStart();
  const props = shot.props as ScreenshotProps;
  const [iw, ih] = props.size ?? [1600, 900];
  const boxW = L.narrow ? L.width - 2 * L.margin : 1500;
  const boxH = L.stageH - 30;
  const fit = Math.min(boxW / iw, boxH / ih);
  const w = iw * fit;
  const h = ih * fit;
  const left = (L.width - w) / 2;
  const top = L.stageTop + (L.stageH - h) / 2;

  // Pan: piecewise eased moves between targets, each arriving on its anchor.
  let fx = iw / 2;
  let fy = ih / 2;
  let s = 1;
  let pz = 0;
  (props.pan ?? []).forEach((p, i) => {
    const at = beat(p.at);
    const t = tween(frame, at - Math.round(0.8 * fps), at, ease.sine);
    fx = lerp(fx, p.to[0], t);
    fy = lerp(fy, p.to[1], t);
    s = lerp(s, Math.min(1.5, Math.max(1, p.to[2])), t);
    if (i === 0) pz = t;
  });
  // Screen = t + s * x (origin 0 0): the focus point F moves to the centre C.
  const Fx = fx * fit;
  const Fy = fy * fit;
  const clampT = (v: number, size: number) => Math.min(0, Math.max(size - size * s, v));
  const tx = clampT(Fx * (1 - s) + (w / 2 - Fx) * pz, w);
  const ty = clampT(Fy * (1 - s) + (h / 2 - Fy) * pz, h);
  const appear = tween(frame, shotStart - 2, shotStart + Math.round(0.3 * fps));

  return (
    <StageFrame>
      <div
        style={{
          position: "absolute",
          left,
          top,
          width: w,
          height: h,
          borderRadius: 16,
          overflow: "hidden",
          border: `2px solid ${c.hairline}`,
          backgroundColor: c.card,
          boxShadow: `0 24px 60px ${alpha(c.shadow, 0.14)}`,
          opacity: appear,
        }}
      >
        <div style={{ position: "absolute", inset: 0, transform: `translate(${tx}px, ${ty}px) scale(${s})`, transformOrigin: "0 0" }}>
          <Img src={staticFile(props.src)} style={{ width: w, height: h, display: "block" }} />
          {(props.regions ?? []).map((r, i) => {
            const at = beat(r.at);
            const [x, y, rw, rh] = r.box.map((v) => v * fit);
            if (r.kind === "brackets") return <Brackets key={i} box={{ x, y, w: rw, h: rh }} at={at - 9} color={c.accent} />;
            if (r.kind === "band") {
              const o = arrive(frame, at, fps, 0.25);
              return (
                <div
                  key={i}
                  style={{ position: "absolute", left: x, top: y, width: rw, height: rh, borderRadius: 8, backgroundColor: alpha(c.accent, 0.18), opacity: o }}
                />
              );
            }
            const o = arrive(frame, at, fps, 0.3);
            const lo = follow(frame, at, fps, 0.1, 0.3);
            return (
              <div key={i} style={{ position: "absolute", left: x, top: y, width: rw, height: rh, opacity: o }}>
                <div style={{ position: "absolute", inset: 0, border: `4px solid ${c.accent}`, borderRadius: 10 }} />
                <div style={{ position: "absolute", left: rw / 2, top: rh, width: 3, height: 60, backgroundColor: c.accent }} />
                <div
                  style={{
                    position: "absolute",
                    left: rw / 2 - 250,
                    top: rh + 64,
                    width: 500,
                    textAlign: "center",
                    fontSize: TYPE.label - 4,
                    fontWeight: 600,
                    color: c.ink,
                    opacity: lo,
                  }}
                >
                  {r.label ?? ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </StageFrame>
  );
};
