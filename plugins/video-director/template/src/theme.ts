import { loadFont } from "@remotion/fonts";
import { interpolateColors, staticFile } from "remotion";

// Fonts are local files (copied from @fontsource by new-video into
// public/fonts), so nothing is downloaded at render time. loadFont() holds
// the render until each file is ready.
export const sans = "Inter";
export const mono = "JetBrains Mono";

for (const weight of ["400", "600", "700"]) {
  loadFont({ family: sans, url: staticFile(`fonts/inter-latin-${weight}-normal.woff2`), weight });
}
for (const weight of ["400", "700"]) {
  loadFont({ family: mono, url: staticFile(`fonts/jetbrains-mono-latin-${weight}-normal.woff2`), weight });
}

export type Theme = "light" | "dark";

// Palette tokens (style rule 8). One accent; semantic colours only on status.
export const palettes = {
  light: {
    bg: "#F6F7F9",
    bgAlt: "#ECEEF2",
    ink: "#151821",
    muted: "#5F6675",
    hairline: "#DADDE3",
    accent: "#2563EB",
    negative: "#D92D20",
    positive: "#15803D",
    warning: "#B45309",
    terminal: "#14161C",
    terminalInk: "#E6E8EE",
    terminalDim: "#8B93A3",
    card: "#FFFFFF",
  },
  dark: {
    bg: "#0B1120",
    bgAlt: "#131A2E",
    ink: "#EEF1F6",
    muted: "#9AA3B2",
    hairline: "#2A3247",
    accent: "#60A5FA",
    negative: "#F97066",
    positive: "#4ADE80",
    warning: "#FBBF24",
    terminal: "#14161C",
    terminalInk: "#E6E8EE",
    terminalDim: "#8B93A3",
    card: "#131A2E",
  },
} as const;

export type Tokens = { [K in keyof (typeof palettes)["light"]]: string };

// Colours used inside terminal and code tiles, which are dark on both stages.
export const tile = {
  bg: palettes.dark.terminal,
  bar: "#1C1F27",
  border: "#262A35",
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

// Layout bands at 1080p (style rule 3).
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
  caption: 44,
  captionLong: 38,
  chapter: 25,
  micro: 24,
  min: 28,
};

// JetBrains Mono advance width, as a fraction of the font size.
export const MONO_ADVANCE = 0.6;
