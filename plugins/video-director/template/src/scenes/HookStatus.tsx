import React from "react";
import { useVideoConfig } from "remotion";
import { DiagramNode, Edge, NODE_SIZE } from "../components/diagram";
import { Mark, Slab, type SlabProps } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { useBeat, useShot } from "../shot";
import { BAND } from "../theme";

export type HookStatusProps = {
  slab: SlabProps;
  flow?: { nodes: [{ icon: string; label: string }, { icon: string; label: string }]; broken?: boolean };
};

/**
 * The symptom or the result in one frame (catalogue 2.1): node A draws in,
 * an arrow reaches node B, the status slab drops in on the status word, and
 * a cross strokes in on B if the flow is broken (a tick if it is not).
 * Mirrored for the result.
 * Beats: flowIn, slab; optional target (node B lands) and cross (the mark,
 * default 0.3 s after the slab).
 */
export const HookStatus: React.FC = () => {
  const { shot, c } = useShot();
  const beat = useBeat();
  const { fps } = useVideoConfig();
  const props = shot.props as HookStatusProps;
  // "center" is for a slab alone; with a flow it would cover node A (the lint
  // reports it), so it falls back to the right half.
  const side = props.slab?.side === "left" ? "left" : "right";
  const slabAt = beat("slab");
  const flowAt = beat("flowIn", 8);
  const crossAt = beat("cross", slabAt + Math.round(0.3 * fps));
  const cy = 490;

  if (!props.flow) {
    return (
      <StageFrame>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: BAND.stageTop,
            bottom: 1080 - BAND.stageBottom,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Slab {...props.slab} at={slabAt} maxWidth={1920 - 2 * BAND.textMargin} />
        </div>
      </StageFrame>
    );
  }

  // Flow on one half, slab on the other: the slab gets a 620 px slot and its
  // value shrinks to fit it (slabFontSize).
  const flowLeft = side === "right" ? 330 : 1050;
  const ax = flowLeft;
  const bx = flowLeft + 560;
  // Node B lands on its own word (beat "target") or 0.7 s after node A; the
  // arrow reaches B as it lands.
  const bAt = beat("target", flowAt + Math.round(0.7 * fps));
  const edgeAt = bAt - Math.round(0.2 * fps);
  const [a, b] = props.flow.nodes;
  return (
    <StageFrame>
      <DiagramNode x={ax} y={cy} icon={a.icon} label={a.label} at={flowAt} />
      <Edge
        x1={ax + NODE_SIZE / 2 + 24}
        y1={cy}
        x2={bx - NODE_SIZE / 2 - 24}
        y2={cy}
        at={edgeAt}
        broken={props.flow.broken}
      />
      <DiagramNode x={bx} y={cy} icon={b.icon} label={b.label} at={bAt} litAt={props.flow.broken ? undefined : bAt}>
        <div style={{ position: "absolute", right: -30, top: -30 }}>
          {props.flow.broken ? (
            <Mark kind="cross" at={crossAt} size={72} color={c.negative} width={8} />
          ) : (
            <Mark kind="tick" at={crossAt} size={72} color={c.positive} width={8} />
          )}
        </div>
      </DiagramNode>
      <div
        style={{
          position: "absolute",
          top: cy - 300,
          height: 600,
          left: side === "right" ? 1180 : 120,
          width: 620,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Slab {...props.slab} at={slabAt} maxWidth={620} />
      </div>
    </StageFrame>
  );
};
