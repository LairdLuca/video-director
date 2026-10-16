import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { DiagramNode, Edge } from "../components/diagram";
import { Mark } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { arrive, follow } from "../motion";
import { drawingBox, fitDrawing, placeNodes, slotBox } from "../lib/layout.mjs";
import { useBeat, useShot } from "../shot";
import { mono } from "../theme";

export type FlowNode = { id: string; icon: string; label: string; sub?: string; at: string };
export type FlowEdge = { from: string; to: string; label?: string; at: string; broken?: boolean };
export type FlowMark = { node: string; kind: "cross" | "tick" | "slot-missing"; at: string; label?: string };
export type FlowDiagramProps = {
  nodes: FlowNode[];
  edges?: FlowEdge[];
  layout?: "row" | "column" | "fork";
  marks?: FlowMark[];
};

const EDGE_DUR_S = 0.4;

/**
 * A mechanism with 2 to 4 nodes (catalogue 2.4). The places come from
 * lib/layout.mjs (placeNodes): on a 1080 px wide frame a row becomes a column
 * (9:16, and 1:1 with 4 nodes) and the fork is narrower. The whole drawing
 * (nodes, labels, edge labels, slot boxes) is then centred in the stage and
 * scaled to fill it, up to 1.4 times (fitDrawing): two small nodes were drawn
 * at 200 px with most of the frame empty in test videos.
 */
export const FlowDiagram: React.FC = () => {
  const { shot, c, L } = useShot();
  const beat = useBeat();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const props = shot.props as FlowDiagramProps;
  const nodes = (props.nodes ?? []).slice(0, 4);
  const place = placeNodes(L, nodes.length, props.layout ?? "row");
  const { pos, size, right } = place;
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const half = Math.round((EDGE_DUR_S * fps) / 2);

  const edges = (props.edges ?? []).filter((e) => index.has(e.from) && index.has(e.to));
  const litAt = new Map<string, number>();
  for (const e of edges) {
    if (!e.broken) litAt.set(e.to, beat(e.at) + half);
  }
  const fit = fitDrawing(drawingBox(nodes, edges, props.marks ?? [], place), L);

  return (
    <StageFrame>
      <div style={{ position: "absolute", inset: 0, transformOrigin: "0 0", transform: `translate(${fit.tx}px, ${fit.ty}px) scale(${fit.k})` }}>
      {edges.map((e, k) => {
        const a = pos[index.get(e.from)!];
        const b = pos[index.get(e.to)!];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const off = size / 2 + 24;
        return (
          <Edge
            key={k}
            x1={a.x + (dx / len) * off}
            y1={a.y + (dy / len) * off}
            x2={b.x - (dx / len) * off}
            y2={b.y - (dy / len) * off}
            at={beat(e.at)}
            durS={EDGE_DUR_S}
            broken={e.broken}
            label={e.label}
          />
        );
      })}
      {nodes.map((n, i) => (
        <DiagramNode
          key={n.id}
          x={pos[i].x}
          y={pos[i].y}
          icon={n.icon}
          label={n.label}
          sub={n.sub}
          at={beat(n.at)}
          litAt={litAt.get(n.id)}
          size={size}
          labelSide={right[i] ? "right" : "below"}
          labelWidth={right[i] ? place.labelWidth : place.belowWidth}
        >
          {(props.marks ?? [])
            .filter((m) => m.node === n.id && m.kind !== "slot-missing")
            .map((m, k) => (
              <div key={k} style={{ position: "absolute", right: -28, top: -28 }}>
                <Mark
                  kind={m.kind === "tick" ? "tick" : "cross"}
                  at={beat(m.at)}
                  size={size * 0.34}
                  color={m.kind === "tick" ? c.positive : c.negative}
                  width={8}
                />
              </div>
            ))}
        </DiagramNode>
      ))}
      {(props.marks ?? [])
        .filter((m) => m.kind === "slot-missing" && index.has(m.node))
        .map((m, k) => {
          const i = index.get(m.node)!;
          const at = beat(m.at);
          const o = arrive(frame, at, fps, 0.3);
          if (o <= 0) return null;
          const box = slotBox(pos[i], size, !right[i]);
          return (
            <div
              key={k}
              style={{
                position: "absolute",
                left: box.x0,
                top: box.y0,
                width: box.x1 - box.x0,
                height: box.y1 - box.y0,
                borderRadius: 16,
                border: `3px dashed ${c.negative}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: mono,
                fontSize: 32,
                color: c.muted,
                opacity: o,
              }}
            >
              <span style={{ opacity: follow(frame, at, fps, 0.1, 0.3) }}>{m.label ?? ""}</span>
            </div>
          );
        })}
      </div>
    </StageFrame>
  );
};
