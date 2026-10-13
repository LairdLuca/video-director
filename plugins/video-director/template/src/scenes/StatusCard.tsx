import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Mark, Slab, type SlabProps } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { arrive, lerp, tween } from "../motion";
import { useBeat, useShot } from "../shot";
import { BAND, mono, MONO_ADVANCE, TYPE } from "../theme";

// ok: true is a tick, false a cross; without ok the row has no mark (a state
// or an option, not a check). A missing ok drew a red cross in a test video,
// so three neutral rows read as three failures.
// Inter advance for uppercase labels, as a fraction of the font size (an estimate).
const LABEL_CAPS_ADVANCE = 0.68;

export type StatusRow = { label: string; value: string; ok?: boolean; at: string };
export type StatusCardProps = {
  title: string;
  rows: StatusRow[];
  slab?: SlabProps & { at?: string };
};

/**
 * The verification (catalogue 2.6): rows arrive on their anchors, each mark
 * strokes in 0.1 s later. With 1-3 rows the card and its type are larger, so
 * a short card still fills the stage (style rule 1, one subject, large).
 */
export const StatusCard: React.FC = () => {
  const { shot, c } = useShot();
  const beat = useBeat();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const props = shot.props as StatusCardProps;
  const rows = props.rows ?? [];
  const few = rows.length <= 3;
  const slabSide = props.slab?.side === "left" ? "left" : "right";
  const cardWidth = props.slab ? 940 : few ? 1400 : 1200;
  const cardLeft = props.slab ? (slabSide === "right" ? 140 : 1920 - 140 - 940) : (1920 - cardWidth) / 2;
  const rowH = few ? 140 : 96;
  const titleSize = few ? 52 : 38;
  const markSize = few ? 72 : 56;
  const padX = 48;
  const inner = cardWidth - 2 * padX;
  const cardH = 120 + rows.length * rowH + 40;
  const cardTop = BAND.stageTop + Math.max(0, (BAND.stageBottom - BAND.stageTop - cardH) / 2);
  // The label column fits the longest label (30-45% of the card); labels
  // too long for 45% get smaller type. A fixed 30% let "RESTARTS" touch its
  // value on a card beside a slab.
  const baseLabel = few ? 48 : TYPE.body - 2;
  const longestLabel = Math.max(1, ...rows.map((r) => r.label.length));
  const labelNeed = (size: number) => longestLabel * size * LABEL_CAPS_ADVANCE + 32;
  const labelCol = Math.min(Math.max(labelNeed(baseLabel), inner * 0.3), inner * 0.45);
  const labelSize = Math.max(TYPE.min, Math.min(baseLabel, Math.floor((labelCol - 32) / (longestLabel * LABEL_CAPS_ADVANCE))));
  // The value column: what is left after the label and the mark.
  const valueWidth = inner - labelCol - markSize - 16;
  const valueSize = (value: string) =>
    Math.max(TYPE.min, Math.min(few ? 60 : 42, Math.floor(valueWidth / (Math.max(1, value.length) * MONO_ADVANCE))));
  // The empty card is on screen from the first frame, so the incoming
  // transition shows the card, not a blank stage.
  const appear = tween(frame, 0, Math.round(0.3 * fps));

  return (
    <StageFrame>
      <div
        style={{
          position: "absolute",
          left: cardLeft,
          top: cardTop,
          width: cardWidth,
          minHeight: cardH,
          backgroundColor: c.card,
          border: `2px solid ${c.hairline}`,
          borderRadius: 24,
          padding: `36px ${padX}px`,
          boxSizing: "border-box",
          opacity: appear,
          boxShadow: "0 18px 50px rgba(15,23,42,0.08)",
        }}
      >
        <div style={{ fontFamily: mono, fontSize: titleSize, fontWeight: 700, marginBottom: 24 }}>{props.title}</div>
        {rows.map((r, i) => {
          const at = beat(r.at);
          const p = arrive(frame, at, fps, 0.3);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                height: rowH,
                borderTop: `2px solid ${c.hairline}`,
                opacity: p,
                transform: `translateX(${lerp(-24, 0, p)}px)`,
              }}
            >
              <div style={{ width: labelCol, flexShrink: 0, fontSize: labelSize, color: c.muted, whiteSpace: "nowrap" }}>{r.label}</div>
              <div style={{ flex: 1, fontFamily: mono, fontSize: valueSize(r.value), color: c.ink, whiteSpace: "nowrap" }}>{r.value}</div>
              <div style={{ width: markSize, height: markSize }}>
                {r.ok === undefined ? null : (
                  <Mark
                    kind={r.ok ? "tick" : "cross"}
                    at={at + Math.round(0.1 * fps)}
                    size={markSize}
                    color={r.ok ? c.positive : c.negative}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {props.slab ? (
        <div
          style={{
            position: "absolute",
            top: BAND.stageTop,
            bottom: 1080 - BAND.stageBottom,
            left: slabSide === "right" ? 1120 : 140,
            width: 660,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Slab {...props.slab} at={beat(props.slab.at ?? "slab")} maxWidth={660} />
        </div>
      ) : null}
    </StageFrame>
  );
};
