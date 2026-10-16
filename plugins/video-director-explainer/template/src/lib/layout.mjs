// Layout: the bands of the frame in each format, and the layout arithmetic
// the scenes and the lint share (terminal and code widths, slab and list
// sizes, the chapter bar rows, the flow diagram's places and scale).
//
// Plain JavaScript on purpose, like timeline.mjs: the Remotion bundle imports
// it and so does the lint, so "does it fit" has one answer.
//
// Three formats, all 1080 px on the short side, so one text size reads the
// same in all of them (style rule 12: nothing under 28 px, except terminal and
// code tiles on 9:16 and 1:1, 24 px).

export const FORMATS = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

/** "16:9", "9:16", "1:1", or null for another size. */
export const formatOf = (width, height) =>
  Object.keys(FORMATS).find((k) => FORMATS[k].width === width && FORMATS[k].height === height) ?? null;

// Type sizes the shared arithmetic needs (theme.ts TYPE holds the full scale).
export const MIN_TEXT = 28;
export const LABEL = 38;
export const MONO_ADVANCE = 0.6;
// Inter's average advance on mixed text, as a fraction of the font size (an estimate).
export const SANS_ADVANCE = 0.53;

// Chapter bar: one row is a 6 px rail and a 25 px label 14 px under it.
// Rows are 64 px apart on 16:9, 54 px (one square of the default papers) on
// 9:16 and 1:1, so the parts row sits on a ruling line too: at 64 px it was
// 10 px off the line (seen in a review). On the 12 and 24 px papers the bar
// is not on a line; it follows the 54 px squares of the default papers. Labels are uppercase Inter semibold with 0.06 em of
// letter spacing: about 0.74 of the font size per character (an estimate).
export const BAR = { rail: 6, labelGap: 14, label: 25, rowPitch: 64, rowHeight: 52, gap: 14, labelAdvance: 0.74 };

/**
 * The frame of one format. `barRows`: 1, or 2 when the storyboard groups
 * chapters into parts (the parts row goes under the chapters row and the
 * stage starts lower).
 */
export const layoutFor = (width = 1920, height = 1080, barRows = 1) => {
  const portrait = height > width;
  const narrow = width < 1500;
  const kind = portrait ? "portrait" : width === height ? "square" : "landscape";
  const rows = barRows > 1 ? 2 : 1;
  // The bar's rail sits on a ruling line of the 54 px squares (they run
  // through the frame centre): y 96 on 9:16, y 54 on 1:1. At y 48 the 1:1 bar
  // floated 6 px above the line, where the 9:16 one sat on it. 16:9 keeps 48.
  const barTop = portrait ? 96 : kind === "square" ? 54 : 48;
  // On a 1080 px wide frame text starts at 104 px: clear of the notebook
  // papers' margin line at 72 px, which it touched at 80.
  const barLeft = narrow ? 104 : 120;
  const rowPitch = narrow ? 54 : BAR.rowPitch;
  const barBottom = barTop + (rows - 1) * rowPitch + BAR.rowHeight;
  const stageTop = barBottom + 40;
  const stageBottom = portrait ? 1500 : height - 220;
  return {
    width,
    height,
    kind,
    narrow,
    cx: width / 2,
    // 96 px for any content and 160 px for text that must be read on a wide
    // frame; 64 and 104 on a 1080 px wide one (style rule 2).
    margin: narrow ? 64 : 96,
    textMargin: narrow ? 104 : 160,
    contentMax: narrow ? width - 128 : 1440,
    bar: { top: barTop, left: barLeft, width: width - 2 * barLeft, rows, rowPitch, bottom: barBottom },
    stageTop,
    stageBottom,
    stageH: stageBottom - stageTop,
    stageCy: (stageTop + stageBottom) / 2,
    captionBaseline: portrait ? 1720 : height - 90,
    captionWidth: narrow ? width - 208 : 1270,
    // A phrase is split while it is longer than this, and drawn smaller over `captionLongChars`.
    captionChars: narrow ? 30 : 42,
    captionLongChars: narrow ? 24 : 34,
  };
};

/** Width of a chapter bar label, estimated. */
export const barLabelWidth = (label) => String(label).length * BAR.label * BAR.labelAdvance;

/** Segment width when `n` segments share a row of `rowWidth`. */
export const segmentWidth = (n, rowWidth) => (rowWidth - BAR.gap * (n - 1)) / Math.max(1, n);

/** Labels that do not fit their segment, with 12 px to spare, when they share one row. */
export const labelsTooWide = (labels, rowWidth) => {
  const seg = segmentWidth(labels.length, rowWidth);
  return labels.filter((l) => barLabelWidth(l) + 12 > seg);
};

// Terminal and code tiles may go down to 24 px on 9:16 and 1:1 (style rule
// 12): at 28 px a line held 52 characters there, too few for most real
// output. Everything else keeps the 28 px minimum.
export const MIN_TILE_NARROW = 24;

// Terminal tile (scene Terminal): width, smallest font, characters per line
// at that font, rows before it scrolls.
export const TERMINAL_PAD = 32;
export const terminalWidth = (L, size) =>
  L.narrow ? L.width - 2 * (size === "full" ? 40 : L.margin) : size === "full" ? 1728 : 1500;
export const terminalMinFont = (L) => (L.narrow ? MIN_TILE_NARROW : MIN_TEXT);
export const terminalMaxChars = (L, size) =>
  Math.floor((terminalWidth(L, size) - 2 * TERMINAL_PAD) / (terminalMinFont(L) * MONO_ADVANCE));
export const terminalMaxRows = (L) => (L.kind === "portrait" ? 16 : 10);

// Code tile (scene CodeWalk): drawn at 30-32 px on 16:9, down to 24 px on
// 9:16 and 1:1; the number column takes digits + 1 characters when
// startLine is given.
export const CODE_FONT_MIN = 30;
export const codeMinFont = (L) => (L.narrow ? MIN_TILE_NARROW : CODE_FONT_MIN);
export const codeWidth = (L) => (L.narrow ? L.width - 2 * L.margin : 1500);
export const codeMaxChars = (L, numberChars = 0) =>
  Math.floor((codeWidth(L) - 2 * TERMINAL_PAD - numberChars * codeMinFont(L) * MONO_ADVANCE) / (codeMinFont(L) * MONO_ADVANCE));

// Slab (HookStatus, StatusCard): the value shrinks to fit its slot.
export const SLAB_PAD_X = 128;
export const HERO = 192;
export const slabFontSize = (value, maxWidth, maxFont = HERO) =>
  Math.min(maxFont, Math.floor((maxWidth - SLAB_PAD_X) / (Math.max(1, String(value).length) * MONO_ADVANCE)));
/**
 * Width of the slab's slot and its largest font. Beside a flow on a wide
 * frame it gets half the stage (620 px); on a 1080 px wide frame the flow and
 * the slab are stacked and the slab gets the text width; on the square frame
 * the stack is short, so the value is at most 140 px.
 */
export const hookSlab = (L, withFlow) => ({
  width: withFlow && !L.narrow ? 620 : L.width - 2 * L.textMargin,
  maxFont: withFlow && L.kind === "square" ? 140 : HERO,
});

// StepList: the text shrinks so the longest item stays on one line. At the
// 28 px minimum a longer item wraps to two lines (`wrap`), which the row's
// disc height holds; `lineChars` is what one line holds then. With nowrap an
// item over about 41 characters ran past a 9:16 frame (seen in a review).
export const stepList = (L, items) => {
  const few = items.length <= 3;
  const disc = few ? 104 : 88;
  const gap = few ? 44 : 40;
  const tick = few ? 64 : 56;
  const longest = Math.max(1, ...items.map((it) => String(it.text ?? "").length));
  const room = L.width - 2 * L.textMargin - disc - gap - (items.some((it) => it.done) ? tick + gap : 0);
  const max = L.narrow ? (few ? 56 : 48) : few ? 66 : 54;
  const textSize = Math.max(MIN_TEXT, Math.min(max, Math.floor(room / (longest * SANS_ADVANCE))));
  const lineChars = Math.floor(room / (MIN_TEXT * SANS_ADVANCE));
  return { few, disc, gap, tick, room, textSize, lineChars, wrap: longest > lineChars };
};

// StatusCard: the card, and on a 1080 px wide frame the slab stacked with
// it as one block. On the square frame the card keeps the compact rows and
// the slab value is at most 120 px; when the block is still taller than the
// stage (3 rows, a slab caption and a two-row chapter bar: 688 px for 650,
// seen in a review), the value shrinks to fit, down to 72 px (`slabFont`).
export const statusCard = (L, nRows, slab = null) => {
  const stacked = L.narrow && Boolean(slab);
  const squeezed = stacked && L.kind === "square";
  const few = nRows <= 3 && !squeezed;
  const rowH = few ? 140 : squeezed ? 80 : 96;
  const cardH = 120 + nRows * rowH + 40;
  const space = squeezed ? 32 : 40;
  const caption = slab?.caption ? 52 : 0;
  const fullFont = squeezed ? 120 : HERO;
  const room = L.stageH - cardH - space - 84 - caption;
  const slabFont = stacked ? Math.max(72, Math.min(fullFont, room)) : HERO;
  const slabH = slabFont + 84 + caption;
  const blockH = stacked ? cardH + space + slabH : cardH;
  return { stacked, squeezed, few, rowH, cardH, space, slabFont, fullFont, slabH, blockH, overflow: Math.max(0, blockH - L.stageH) };
};

// HookStatus with a flow on a 1080 px wide frame: the two nodes and their
// label boxes, kept inside the text margin (the label boxes started left of
// the 64 px margin on 9:16 and on the margin line on 1:1, seen in a review).
export const hookStackedFlow = (L) => {
  const size = L.kind === "square" ? 160 : 220;
  const gap = L.kind === "square" ? 480 : 520;
  const ax = L.cx - gap / 2;
  return { size, gap, ax, bx: L.cx + gap / 2, labelWidth: Math.min(gap - 24, 2 * (ax - L.textMargin)) };
};

/** Characters of a node label per line in a label box of `width` px. */
export const labelLineChars = (width) => Math.floor(width / (LABEL * 0.56));

// StrikeReplace: about this many characters fit on one statement line.
export const statementSize = (L) => (L.narrow ? 60 : 68);
export const statementChars = (L) => Math.floor((L.width - 2 * L.textMargin) / (statementSize(L) * 0.56));
/**
 * Size of the replacement (`after`, on one line): the statement size, or
 * smaller so it fits the text width (a mono `after` of more than 24
 * characters ran past a 1080 px wide frame, seen in a review).
 */
export const strikeAfterSize = (L, after, code) =>
  Math.min(statementSize(L), Math.floor((L.width - 2 * L.textMargin) / (Math.max(1, String(after).length) * (code ? MONO_ADVANCE : SANS_ADVANCE))));
/**
 * Whether the prefix and the slot (as wide as the longer of `before` and
 * `after`) share one line. When they do not, the scene puts the prefix on a
 * line of its own with room above the slot: the struck word lifts 96 px, and
 * on the prefix's line it covered it (seen with a long `after` on 9:16).
 */
export const strikeOneLine = (L, { prefix = "", before = "", after = "" }, codeBefore, codeAfter) => {
  const size = statementSize(L);
  const adv = (code) => (code ? MONO_ADVANCE : SANS_ADVANCE);
  const slot = Math.max(String(before).length * size * adv(codeBefore), String(after).length * strikeAfterSize(L, after, codeAfter) * adv(codeAfter));
  const pre = prefix ? (String(prefix).length + 1) * size * SANS_ADVANCE : 0;
  return pre + slot <= L.width - 2 * L.textMargin;
};

// Caption type sizes (theme.ts TYPE takes them from here): the long size
// is for a phrase over `captionLongChars`.
export const CAPTION_SIZE = 44;
export const CAPTION_LONG = 38;
export const captionSize = (L, text) => (String(text).length > L.captionLongChars ? CAPTION_LONG : CAPTION_SIZE);

/** A token that looks like code (identifier, flag, path, version) is set in mono. */
export const looksLikeCode = (s) => /[_./:=-]/.test(s) || /^[A-Z0-9_]{3,}$/.test(s) || /^[a-z]+[A-Z]/.test(s);

/**
 * Size of a code word in the captions: 0.9 of the caption size, or smaller
 * so one long word stays inside the caption box (over about 42 mono
 * characters on a 1080 px wide frame, 62 on 16:9, it ran out of it).
 */
export const captionCodeSize = (L, size, chars) =>
  Math.min(Math.round(size * 0.9), Math.floor(L.captionWidth / (Math.max(1, chars) * MONO_ADVANCE)));

// FlowDiagram -----------------------------------------------------------------

// Average advances as a fraction of the font size (Inter semibold labels,
// JetBrains Mono subs); estimates, used only to size the drawing's box.
const LABEL_ADVANCE = 0.56;
export const FLOW_MAX_SCALE = 1.4;

/**
 * The layout a flow is drawn with on this frame. A row of nodes does not fit
 * a 1080 px wide frame at a readable size beyond 3 nodes (square) or at all
 * (portrait, where it would be a thin strip): it becomes a column there.
 */
export const flowLayout = (L, n, layout = "row") => {
  if (layout === "row" && (L.kind === "portrait" || (L.kind === "square" && n > 3))) return "column";
  return layout;
};

/**
 * Node places, node size, which nodes have their label on the right, and the
 * label widths (`labelWidth` beside a node, `belowWidth` under it). The
 * whole drawing is then centred and scaled by fitDrawing.
 */
export const placeNodes = (L, n, layoutIn = "row") => {
  const layout = flowLayout(L, n, layoutIn);
  if (layout === "column") {
    const gap = n > 2 ? 230 : 300;
    return {
      layout,
      pos: Array.from({ length: n }, (_, i) => ({ x: 760, y: 490 + (i - (n - 1) / 2) * gap })),
      size: 160,
      right: Array(n).fill(true),
      labelWidth: L.narrow ? 480 : 560,
      belowWidth: 480,
    };
  }
  if (layout === "fork") {
    const rest = n - 1;
    const gap = rest > 2 ? 240 : 300;
    const dx = L.narrow ? 420 : 700;
    return {
      layout,
      pos: [{ x: 520, y: 480 }, ...Array.from({ length: rest }, (_, i) => ({ x: 520 + dx, y: 480 + (i - (rest - 1) / 2) * gap }))],
      size: 160,
      right: [false, ...Array(rest).fill(true)],
      labelWidth: L.narrow ? 400 : 560,
      belowWidth: 480,
    };
  }
  if (L.narrow) {
    // A row on the square frame: 2 or 3 smaller nodes, narrower labels.
    const gap = n <= 2 ? 480 : 340;
    return {
      layout,
      pos: Array.from({ length: n }, (_, i) => ({ x: 960 + (i - (n - 1) / 2) * gap, y: 440 })),
      size: 160,
      right: Array(n).fill(false),
      labelWidth: 480,
      belowWidth: gap - 24,
    };
  }
  const gap = n <= 2 ? 640 : n === 3 ? 520 : 440;
  return {
    layout,
    pos: Array.from({ length: n }, (_, i) => ({ x: 960 + (i - (n - 1) / 2) * gap, y: 440 })),
    size: 200,
    right: Array(n).fill(false),
    labelWidth: 560,
    belowWidth: 520,
  };
};

/** Where an edge label goes: above a horizontal edge, right of a vertical one. */
export const edgeLabelBox = (a, b, label) => {
  const w = Math.min(600, String(label).length * 30 * LABEL_ADVANCE);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x)) return { x0: mx + 24, y0: my - 20, x1: mx + 24 + w, y1: my + 20, vertical: true };
  return { x0: mx - w / 2, y0: my - 62, x1: mx + w / 2, y1: my - 24, vertical: false };
};

/** Box of a slot-missing mark under (or right of) its node. */
export const slotBox = (p, size, below) =>
  below
    ? { x0: p.x - 230, y0: p.y + size / 2 + 96, x1: p.x + 230, y1: p.y + size / 2 + 172 }
    : { x0: p.x + size / 2 + 32, y0: p.y + size / 2 - 8, x1: p.x + size / 2 + 492, y1: p.y + size / 2 + 68 };

/**
 * The box the whole diagram will cover once every node, label and mark is
 * in: node cards, their labels (wrapped like DiagramNode wraps them), edge
 * labels and slot-missing boxes.
 */
export const drawingBox = (nodes, edges, marks, place) => {
  const { pos, size, right, labelWidth, belowWidth } = place;
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (b) => {
    box.x0 = Math.min(box.x0, b.x0);
    box.y0 = Math.min(box.y0, b.y0);
    box.x1 = Math.max(box.x1, b.x1);
    box.y1 = Math.max(box.y1, b.y1);
  };
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  nodes.forEach((n, i) => {
    const { x, y } = pos[i];
    add({ x0: x - size / 2, y0: y - size / 2, x1: x + size / 2, y1: y + size / 2 });
    const labelW = String(n.label ?? "").length * LABEL * LABEL_ADVANCE;
    const subW = String(n.sub ?? "").length * 30 * MONO_ADVANCE;
    if (right[i]) {
      const w = Math.min(labelWidth, Math.max(labelW, subW));
      add({ x0: x + size / 2 + 32, y0: y - size / 2, x1: x + size / 2 + 32 + w, y1: y + size / 2 });
    } else {
      const w = Math.min(belowWidth, Math.max(labelW, subW));
      const lines = Math.ceil(labelW / belowWidth) || 1;
      const subLines = n.sub ? Math.ceil(subW / belowWidth) || 1 : 0;
      add({ x0: x - w / 2, y0: y, x1: x + w / 2, y1: y + size / 2 + 22 + lines * 44 + (subLines ? 8 + subLines * 36 : 0) });
    }
  });
  for (const e of edges) {
    if (!e.label || !index.has(e.from) || !index.has(e.to)) continue;
    add(edgeLabelBox(pos[index.get(e.from)], pos[index.get(e.to)], e.label));
  }
  for (const m of marks) {
    if (m.kind !== "slot-missing" || !index.has(m.node)) continue;
    const i = index.get(m.node);
    add(slotBox(pos[i], size, !right[i]));
  }
  return box;
};

/**
 * Scale and offset that put the drawing's box in the middle of the stage, as
 * large as the stage allows up to FLOW_MAX_SCALE. Two small nodes were drawn
 * at 200 px with most of the frame empty in test videos; the layouts are
 * kept, the whole drawing is scaled. A drawing larger than the stage shrinks.
 */
export const fitDrawing = (box, L) => {
  // 40 px inside the text margins: the label widths are estimates
  const fit = { left: L.textMargin + 40, right: L.width - L.textMargin - 40, top: L.stageTop + 20, bottom: L.stageBottom - 20 };
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const k = Math.min(FLOW_MAX_SCALE, (fit.right - fit.left) / w, (fit.bottom - fit.top) / h);
  const cx = (fit.left + fit.right) / 2;
  const cy = (fit.top + fit.bottom) / 2;
  return { k, tx: cx - k * (box.x0 + w / 2), ty: cy - k * (box.y0 + h / 2) };
};
