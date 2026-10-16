// Types for palettes.mjs (the file itself is plain JavaScript, shared with the Node scripts).

export type Tokens = {
  bg: string;
  bgAlt: string;
  ink: string;
  muted: string;
  hairline: string;
  accent: string;
  negative: string;
  positive: string;
  warning: string;
  onAccent: string;
  card: string;
  glow: string;
  shadow: string;
  /** Ruling of the paper: every line, the stronger line every `major` squares, the margin line. */
  grid: string;
  gridMajor: string;
  marginLine: string;
  terminal: string;
  terminalBar: string;
  terminalBorder: string;
  terminalInk: string;
  terminalDim: string;
};

/** Ruling at 1080 px on the short side: square side, a stronger line every `major` squares (0 = none), margin x (null = none). */
export type Ruling = { step: number; major: number; margin: number | null };

export type Palette = { doc: string; tokens: Tokens; ruling: Ruling };

export declare const LIGHT: Record<string, Palette>;
export declare const DARK: Record<string, Palette>;
export declare const DEFAULT_LIGHT: string;
export declare const DEFAULT_DARK: string;
export declare function pickPalettes(storyboard: unknown): {
  light: Palette & { name: string };
  dark: Palette & { name: string };
};
