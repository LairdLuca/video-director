import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { DiagramNode, Edge } from "../components/diagram";
import { Mark } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { arrive, follow } from "../motion";
import { useBeat, useShot } from "../shot";
import { BAND, mono, MONO_ADVANCE, TYPE } from "../theme";

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

type Pos = { x: number; y: number };

const place = (n: number, layout: string): { pos: Pos[]; size: number; labelSide: "below" | "right"; right: boolean[] } => {
  if (layout === "column") {
    const gap = n > 2 ? 230 : 300;
    return {
      pos: Array.from({ length: n }, (_, i) => ({ x: 760, y: 490 + (i - (n - 1) / 2) * gap })),
      size: 160,
      labelSide: "right",
      right: Array(n).fill(true),
    };
  }
  if (layout === "fork") {
    const rest = n - 1;
    const gap = rest > 2 ? 240 : 300;
    return {
      pos: [{ x: 520, y: 480 }, ...Array.from({ length: rest }, (_, i) => ({ x: 1220, y: 480 + (i - (rest - 1) / 2) * gap }))],
      size: 160,
      labelSide: "below",
      right: [false, ...Array(rest).fill(true)],
    };
  }
  const gap = n <= 2 ? 640 : n === 3 ? 520 : 440;
  return {
    pos: Array.from({ length: n }, (_, i) => ({ x: 960 + (i - (n - 1) / 2) * gap, y: 440 })),
    size: 200,
    labelSide: "below",
    right: Array(n).fill(false),
  };
};

// Average advances as a fraction of the font size (Inter semibold labels,
// JetBrains Mono subs); estimates, used only to size the drawing's box.
const LABEL_ADVANCE = 0.56;
const MAX_SCALE = 1.4;
// 40 px inside the text margins: the label widths are estimates
const FIT = { left: BAND.textMargin + 40, right: 1920 - BAND.textMargin - 40, top: BAND.stageTop + 20, bottom: BAND.stageBottom - 20 };

type Box = { x0: number; y0: number; x1: number; y1: number };

/**
 * The box the whole diagram will cover once every node, label and mark is
 * in: node cards, their labels (wrapped like DiagramNode wraps them), edge
 * labels and slot-missing boxes.
 */
const drawingBox = (
  nodes: FlowNode[],
  edges: FlowEdge[],
  marks: FlowMark[],
  pos: Pos[],
  size: number,
  labelSide: "below" | "right",
  right: boolean[],
): Box => {
  const box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    box.x0 = Math.min(box.x0, x0);
    box.y0 = Math.min(box.y0, y0);
    box.x1 = Math.max(box.x1, x1);
    box.y1 = Math.max(box.y1, y1);
  };
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  nodes.forEach((n, i) => {
    const { x, y } = pos[i];
    add(x - size / 2, y - size / 2, x + size / 2, y + size / 2);
    const labelW = n.label.length * TYPE.label * LABEL_ADVANCE;
    const subW = (n.sub ?? "").length * 30 * MONO_ADVANCE;
    if (right[i] || labelSide === "right") {
      const w = Math.min(560, Math.max(labelW, subW));
      add(x + size / 2 + 32, y - size / 2, x + size / 2 + 32 + w, y + size / 2);
    } else {
      const cap = size + 320;
      const w = Math.min(cap, Math.max(labelW, subW));
      const lines = Math.ceil(labelW / cap) || 1;
      const subLines = n.sub ? Math.ceil(subW / cap) || 1 : 0;
      add(x - w / 2, y, x + w / 2, y + size / 2 + 22 + lines * 44 + (subLines ? 8 + subLines * 36 : 0));
    }
  });
  for (const e of edges) {
    if (!e.label || !index.has(e.from) || !index.has(e.to)) continue;
    const a = pos[index.get(e.from)!];
    const b = pos[index.get(e.to)!];
    const w = Math.min(600, e.label.length * 30 * LABEL_ADVANCE);
    add((a.x + b.x) / 2 - w / 2, (a.y + b.y) / 2 - 62, (a.x + b.x) / 2 + w / 2, (a.y + b.y) / 2 - 24);
  }
  for (const m of marks) {
    if (m.kind !== "slot-missing" || !index.has(m.node)) continue;
    const i = index.get(m.node)!;
    const p = pos[i];
    const below = labelSide === "below" && !right[i];
    if (below) add(p.x - 230, p.y + size / 2 + 96, p.x + 230, p.y + size / 2 + 172);
    else add(p.x + size / 2 + 32, p.y + size / 2 - 8, p.x + size / 2 + 492, p.y + size / 2 + 68);
  }
  return box;
};

/**
 * Scale and offset that put the drawing's box in the middle of the stage, as
 * large as the stage allows up to MAX_SCALE. Two small nodes were drawn at
 * 200 px with most of the frame empty in test videos; the layouts are kept,
 * the whole drawing is scaled. A drawing larger than the stage shrinks.
 */
export const fitDrawing = (box: Box) => {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const k = Math.min(MAX_SCALE, (FIT.right - FIT.left) / w, (FIT.bottom - FIT.top) / h);
  const cx = (FIT.left + FIT.right) / 2;
  const cy = (FIT.top + FIT.bottom) / 2;
  return { k, tx: cx - k * (box.x0 + w / 2), ty: cy - k * (box.y0 + h / 2) };
};

/** A mechanism with 2 to 4 nodes (catalogue 2.4). */
export const FlowDiagram: React.FC = () => {
  const { shot, c } = useShot();
  const beat = useBeat();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const props = shot.props as FlowDiagramProps;
  const nodes = (props.nodes ?? []).slice(0, 4);
  const layout = props.layout ?? "row";
  const { pos, size, labelSide, right } = place(nodes.length, layout);
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const half = Math.round((EDGE_DUR_S * fps) / 2);

  const edges = (props.edges ?? []).filter((e) => index.has(e.from) && index.has(e.to));
  const litAt = new Map<string, number>();
  for (const e of edges) {
    if (!e.broken) litAt.set(e.to, beat(e.at) + half);
  }
  const fit = fitDrawing(drawingBox(nodes, edges, props.marks ?? [], pos, size, labelSide, right));

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
          labelSide={right[i] ? "right" : labelSide}
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
          const p = pos[index.get(m.node)!];
          const at = beat(m.at);
          const o = arrive(frame, at, fps, 0.3);
          if (o <= 0) return null;
          const below = labelSide === "below" && !right[index.get(m.node)!];
          return (
            <div
              key={k}
              style={{
                position: "absolute",
                left: below ? p.x - 230 : p.x + size / 2 + 32,
                top: below ? p.y + size / 2 + 96 : p.y + size / 2 - 8,
                width: 460,
                height: 76,
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
