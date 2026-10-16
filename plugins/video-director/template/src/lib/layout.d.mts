// Types for layout.mjs (the file itself is plain JavaScript, shared with the Node scripts).

export type FormatName = "16:9" | "9:16" | "1:1";

export type Layout = {
  width: number;
  height: number;
  kind: "landscape" | "portrait" | "square";
  narrow: boolean;
  cx: number;
  margin: number;
  textMargin: number;
  contentMax: number;
  bar: { top: number; left: number; width: number; rows: number; rowPitch: number; bottom: number };
  stageTop: number;
  stageBottom: number;
  stageH: number;
  stageCy: number;
  captionBaseline: number;
  captionWidth: number;
  captionChars: number;
  captionLongChars: number;
};

export type Pos = { x: number; y: number };
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type NodePlace = {
  layout: "row" | "column" | "fork";
  pos: Pos[];
  size: number;
  right: boolean[];
  labelWidth: number;
  belowWidth: number;
};

export declare const FORMATS: Record<FormatName, { width: number; height: number }>;
export declare function formatOf(width: number, height: number): FormatName | null;
export declare const MIN_TEXT: number;
export declare const LABEL: number;
export declare const MONO_ADVANCE: number;
export declare const SANS_ADVANCE: number;
export declare const BAR: {
  rail: number;
  labelGap: number;
  label: number;
  rowPitch: number;
  rowHeight: number;
  gap: number;
  labelAdvance: number;
};
export declare function layoutFor(width?: number, height?: number, barRows?: number): Layout;
export declare function barLabelWidth(label: string): number;
export declare function segmentWidth(n: number, rowWidth: number): number;
export declare function labelsTooWide(labels: string[], rowWidth: number): string[];
export declare const MIN_TILE_NARROW: number;
export declare const TERMINAL_PAD: number;
export declare function terminalWidth(L: Layout, size?: string): number;
export declare function terminalMinFont(L: Layout): number;
export declare function terminalMaxChars(L: Layout, size?: string): number;
export declare function terminalMaxRows(L: Layout): number;
export declare const CODE_FONT_MIN: number;
export declare function codeMinFont(L: Layout): number;
export declare function codeWidth(L: Layout): number;
export declare function codeMaxChars(L: Layout, numberChars?: number): number;
export declare const SLAB_PAD_X: number;
export declare const HERO: number;
export declare function slabFontSize(value: string, maxWidth: number, maxFont?: number): number;
export declare function hookSlab(L: Layout, withFlow: boolean): { width: number; maxFont: number };
export declare function stepList(
  L: Layout,
  items: Array<{ text?: string; done?: boolean }>,
): { few: boolean; disc: number; gap: number; tick: number; room: number; textSize: number; lineChars: number; wrap: boolean };
export declare function statusCard(
  L: Layout,
  nRows: number,
  slab?: { caption?: string } | null,
): {
  stacked: boolean;
  squeezed: boolean;
  few: boolean;
  rowH: number;
  cardH: number;
  space: number;
  slabFont: number;
  fullFont: number;
  slabH: number;
  blockH: number;
  overflow: number;
};
export declare function hookStackedFlow(L: Layout): { size: number; gap: number; ax: number; bx: number; labelWidth: number };
export declare function labelLineChars(width: number): number;
export declare function statementSize(L: Layout): number;
export declare function statementChars(L: Layout): number;
export declare function strikeAfterSize(L: Layout, after: string, code: boolean): number;
export declare function strikeOneLine(
  L: Layout,
  props: { prefix?: string; before?: string; after?: string },
  codeBefore: boolean,
  codeAfter: boolean,
): boolean;
export declare const CAPTION_SIZE: number;
export declare const CAPTION_LONG: number;
export declare function captionSize(L: Layout, text: string): number;
export declare function looksLikeCode(s: string): boolean;
export declare function captionCodeSize(L: Layout, size: number, chars: number): number;
export declare const FLOW_MAX_SCALE: number;
export declare function flowLayout(L: Layout, n: number, layout?: string): "row" | "column" | "fork";
export declare function placeNodes(L: Layout, n: number, layout?: string): NodePlace;
export declare function edgeLabelBox(a: Pos, b: Pos, label: string): Box & { vertical: boolean };
export declare function slotBox(p: Pos, size: number, below: boolean): Box;
export declare function drawingBox(
  nodes: Array<{ id: string; label?: string; sub?: string }>,
  edges: Array<{ from: string; to: string; label?: string }>,
  marks: Array<{ node: string; kind: string }>,
  place: NodePlace,
): Box;
export declare function fitDrawing(box: Box, L: Layout): { k: number; tx: number; ty: number };
