import React from "react";
import { useVideoConfig } from "remotion";
import { DiagramNode, Edge, NODE_SIZE } from "../components/diagram";
import { Mark, Slab, type SlabProps } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { hookSlab, hookStackedFlow } from "../lib/layout.mjs";
import { useBeat, useShot } from "../shot";

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
 *
 * On a wide frame the flow takes one half and the slab the other. On a
 * 1080 px wide frame (9:16, 1:1) they are stacked: the flow above, the slab
 * below ("left" puts the slab above).
 */
export const HookStatus: React.FC = () => {
  const { shot, c, L } = useShot();
  const beat = useBeat();
  const { fps } = useVideoConfig();
  const props = shot.props as HookStatusProps;
  // "center" is for a slab alone; with a flow it would cover node A (the lint
  // reports it), so it falls back to the right half.
  const side = props.slab?.side === "left" ? "left" : "right";
  const slabAt = beat("slab");
  const flowAt = beat("flowIn", 8);
  const crossAt = beat("cross", slabAt + Math.round(0.3 * fps));
  const slot = hookSlab(L, Boolean(props.flow));

  if (!props.flow) {
    return (
      <StageFrame>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: L.stageTop,
            bottom: L.height - L.stageBottom,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Slab {...props.slab} at={slabAt} maxWidth={slot.width} maxFont={slot.maxFont} />
        </div>
      </StageFrame>
    );
  }

  // Node B lands on its own word (beat "target") or 0.7 s after node A; the
  // arrow reaches B as it lands.
  const bAt = beat("target", flowAt + Math.round(0.7 * fps));
  const edgeAt = bAt - Math.round(0.2 * fps);
  const [a, b] = props.flow.nodes;
  const flow = (ax: number, bx: number, cy: number, size: number, labelWidth?: number) => (
    <>
      <DiagramNode x={ax} y={cy} icon={a.icon} label={a.label} at={flowAt} size={size} labelWidth={labelWidth} />
      <Edge x1={ax + size / 2 + 24} y1={cy} x2={bx - size / 2 - 24} y2={cy} at={edgeAt} broken={props.flow!.broken} />
      <DiagramNode
        x={bx}
        y={cy}
        icon={b.icon}
        label={b.label}
        at={bAt}
        litAt={props.flow!.broken ? undefined : bAt}
        size={size}
        labelWidth={labelWidth}
      >
        <div style={{ position: "absolute", right: -30, top: -30 }}>
          {props.flow!.broken ? (
            <Mark kind="cross" at={crossAt} size={size * 0.36} color={c.negative} width={8} />
          ) : (
            <Mark kind="tick" at={crossAt} size={size * 0.36} color={c.positive} width={8} />
          )}
        </div>
      </DiagramNode>
    </>
  );

  if (L.narrow) {
    // Stacked: the flow (node, label of up to two lines) and the slab, centred
    // in the stage as one block.
    const { size, ax, bx, labelWidth } = hookStackedFlow(L);
    const flowH = size + 22 + 2 * 44;
    const slabH = slot.maxFont + 84 + (props.slab.caption ? 52 : 0);
    const space = L.kind === "square" ? 40 : 140;
    const blockTop = L.stageCy - (flowH + space + slabH) / 2;
    const flowTop = side === "right" ? blockTop : blockTop + slabH + space;
    const slabTop = side === "right" ? blockTop + flowH + space : blockTop;
    return (
      <StageFrame>
        {flow(ax, bx, flowTop + size / 2, size, labelWidth)}
        <div style={{ position: "absolute", top: slabTop, height: slabH, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Slab {...props.slab} at={slabAt} maxWidth={slot.width} maxFont={slot.maxFont} />
        </div>
      </StageFrame>
    );
  }

  // Flow on one half, slab on the other: the slab gets a 620 px slot and its
  // value shrinks to fit it (slabFontSize).
  const cy = L.stageCy - 10;
  const flowLeft = side === "right" ? 330 : 1050;
  return (
    <StageFrame>
      {flow(flowLeft, flowLeft + 560, cy, NODE_SIZE)}
      <div
        style={{
          position: "absolute",
          top: cy - 300,
          height: 600,
          left: side === "right" ? 1180 : 120,
          width: slot.width,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Slab {...props.slab} at={slabAt} maxWidth={slot.width} />
      </div>
    </StageFrame>
  );
};
