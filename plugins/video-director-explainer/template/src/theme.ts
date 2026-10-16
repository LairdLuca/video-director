import { loadFont } from "@remotion/fonts";
import { interpolateColors, staticFile } from "remotion";
import storyboard from "../storyboard.json";
import { textFont } from "./fonts.generated";
import { CAPTION_LONG, CAPTION_SIZE } from "./lib/layout.mjs";
import { pickPalettes } from "./lib/palettes.mjs";
import type { Ruling, Tokens } from "./lib/palettes.mjs";

export type { Ruling, Tokens };

// Fonts are local files in public/fonts, so nothing is downloaded at render
// time. loadFont() holds the render until each file is ready. The text font
// is the install choice "font" (Inter by default, or a font of the machine,
// or the user's file), written into fonts.generated.ts by the scripts; it is
// registered under its own name so a font of the same name installed on the
// machine is never picked instead. Code is always JetBrains Mono.
export const sans = "video-text";
export const mono = "JetBrains Mono";

for (const f of textFont.files) {
  loadFont({ family: sans, url: staticFile(f.file), weight: f.weight });
}
for (const weight of ["400", "700"]) {
  loadFont({ family: mono, url: staticFile(`fonts/jetbrains-mono-latin-${weight}-normal.woff2`), weight });
}

export type Theme = "light" | "dark";

// Palette tokens (style rule 8). One accent; semantic colours only on status.
// The light and the dark paper are install choices (paletteLight,
// paletteDark), copied into storyboard.json; the sets are in lib/palettes.mjs.
const chosen = pickPalettes(storyboard);
export const paletteNames = { light: chosen.light.name, dark: chosen.dark.name };
export const palettes: Record<Theme, Tokens> = { light: chosen.light.tokens, dark: chosen.dark.tokens };
export const ruling: Record<Theme, Ruling> = { light: chosen.light.ruling, dark: chosen.dark.ruling };

/** A token colour with an alpha, for glows, shadows and highlight bands. */
export const alpha = (hex: string, a: number): string => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
};

// Opacity of the lines a band does not point at (Terminal with a band focus,
// CodeWalk). Seen in test reviews: at 0.3 the dimmed lines fell to 2.4:1
// (ink) and 1.7:1 (status colours) on the tile; at 0.5 the ink is 4.5:1 and
// the colours 2.6-3.3:1, still well under the line the band points at.
export const DIMMED = 0.5;

// Colours used inside terminal and code tiles, which are dark on both stages.
export const tile = {
  bg: palettes.dark.terminal,
  bar: palettes.dark.terminalBar,
  border: palettes.dark.terminalBorder,
  ink: palettes.dark.terminalInk,
  dim: palettes.dark.terminalDim,
  accent: palettes.dark.accent,
  negative: palettes.dark.negative,
  positive: palettes.dark.positive,
  warning: palettes.dark.warning,
};

/** Palette for a light/dark mix (0 = light, 1 = dark), used by the global overlays during transitions. */
export const mixPalette = (m: number): Tokens => {
  const out = {} as Record<string, string>;
  for (const key of Object.keys(palettes.light) as Array<keyof Tokens>) {
    out[key] = interpolateColors(m, [0, 1], [palettes.light[key], palettes.dark[key]]);
  }
  return out as Tokens;
};

export const tokens = (theme: Theme): Tokens => palettes[theme];

// Layout bands of the 16:9 frame with a one-row chapter bar (style rule 3).
// The scenes take the bands of the video's format from useShot().L (see
// lib/layout.mjs); this is kept for custom scenes written for 16:9.
export const BAND = {
  chapterTop: 40,
  chapterBottom: 110,
  stageTop: 140,
  stageBottom: 860,
  captionTop: 900,
  captionBottom: 1000,
  margin: 96,
  textMargin: 160,
  contentMax: 1440,
};

// Type scale (style rule 12).
export const TYPE = {
  hero: 192,
  statement: 68,
  label: 38,
  body: 42,
  code: 32,
  caption: CAPTION_SIZE,
  captionLong: CAPTION_LONG,
  chapter: 25,
  micro: 24,
  min: 28,
};

// JetBrains Mono advance width, as a fraction of the font size.
export const MONO_ADVANCE = 0.6;
