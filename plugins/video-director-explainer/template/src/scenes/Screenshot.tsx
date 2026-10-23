import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Brackets } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { arrive, ease, follow, lerp, tween } from "../motion";
import { useBeat, useShot, useShotStart } from "../shot";
import { shots, type ShotBox } from "../shots.generated";
import { alpha, TYPE } from "../theme";

export type ScreenshotRegion = {
  box?: ShotBox;
  ref?: string;
  kind: "brackets" | "band" | "callout";
  label?: string;
  at: string;
};
export type ScreenshotProps = {
  src: string;
  size?: [number, number];
  regions?: ScreenshotRegion[];
  pan?: Array<{ to: [number, number, number]; at: string }>;
};

/**
 * A still of a UI or a page (catalogue 2.9). `src` is an image in public/
 * that shots.mjs imported or captured; its size and its boxes come from
 * shots.json (src/shots.generated.ts). A region names a box with `ref`
 * (measured on the page or by a test suite) or gives `box` in image pixels,
 * measured, never guessed. The camera pans between `pan` targets (image x,
 * y, scale up to 2). The image fits a 1500 x 690 box on a 16:9 frame, the
 * stage less its margins on the others.
 */
export const Screenshot: React.FC = () => {
  const { shot, c, L } = useShot();
  const beat = useBeat();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shotStart = useShotStart();
  const props = shot.props as ScreenshotProps;
  const known = shots[props.src];
  const [iw, ih] = props.size ?? known?.size ?? [1600, 900];
  const boxOf = (r: ScreenshotRegion): ShotBox => r.box ?? known?.boxes[r.ref ?? ""] ?? [0, 0, 0, 0];
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
    s = lerp(s, Math.min(2, Math.max(1, p.to[2])), t);
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
            const [x, y, rw, rh] = boxOf(r).map((v) => v * fit);
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
            // The label keeps its size under the zoom, sits on a card of its
            // own (on a screenshot, bare text read as part of the UI), goes
            // above the box when there is no room below it, and stays inside
            // the image.
            const k = 1 / s;
            const stem = 48 * k;
            const labelH = (TYPE.label + 16) * k;
            const labelW = 560 * k;
            const below = y + rh + stem + labelH <= h;
            const lx = Math.min(Math.max(x + rw / 2 - labelW / 2, 0), w - labelW);
            return (
              <React.Fragment key={i}>
                <div style={{ position: "absolute", left: x, top: y, width: rw, height: rh, opacity: o, border: `${4 * k}px solid ${c.accent}`, borderRadius: 10 * k }} />
                <div
                  style={{
                    position: "absolute",
                    left: x + rw / 2 - 1.5 * k,
                    top: below ? y + rh : y - stem,
                    width: 3 * k,
                    height: stem,
                    backgroundColor: c.accent,
                    opacity: o,
                  }}
                />
                <div style={{ position: "absolute", left: lx, top: below ? y + rh + stem : y - stem - labelH, width: labelW, textAlign: "center", opacity: lo }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: `${6 * k}px ${16 * k}px`,
                      borderRadius: 10 * k,
                      border: `${2 * k}px solid ${c.accent}`,
                      backgroundColor: c.card,
                      boxShadow: `0 ${6 * k}px ${18 * k}px ${alpha(c.shadow, 0.18)}`,
                      fontSize: (TYPE.label - 4) * k,
                      fontWeight: 600,
                      lineHeight: 1.2,
                      color: c.ink,
                    }}
                  >
                    {r.label ?? ""}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </StageFrame>
  );
};
