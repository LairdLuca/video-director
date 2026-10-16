// Palettes: the paper of the light stage and of the dark stage.
//
// Plain JavaScript on purpose, like timeline.mjs: the template imports it
// (theme.ts) and so do the Node scripts (config.mjs checks the config keys
// paletteLight and paletteDark, the lint checks the storyboard), so the list
// of names is written once.
//
// The stage is squared paper: a clean sheet with faint coloured rulings
// (light), or a faded neutral black, not blue, with dim rulings (dark). Every
// text pair passes WCAG AA (4.5:1), accent and status marks pass 3:1, on the
// paper and on its strongest ruling line.

const tiles = {
  terminal: "#161616",
  terminalBar: "#212121",
  terminalBorder: "#2D2D2D",
  terminalInk: "#E6E6E6",
  terminalDim: "#9C9C9C",
};

// Base of the light papers: warm white, light blue squares, red margin, black
// ink, blue pen accent. Each light palette changes some of these.
const notebook = {
  bg: "#FBF9F3",
  bgAlt: "#F1EEE4",
  ink: "#1F2328",
  muted: "#4B5566",
  hairline: "#DCD8CC",
  accent: "#1F55C7",
  negative: "#C42B1C",
  positive: "#1E7B3A",
  warning: "#9A5800",
  onAccent: "#FFFFFF",
  card: "#FFFFFF",
  glow: "#FFFFFF",
  shadow: "#1F2328",
  grid: "#C6DAF0",
  gridMajor: "#C6DAF0",
  marginLine: "#E89A9A",
  ...tiles,
};

// Base of the dark papers: faded neutral black, dim blue squares.
const night = {
  bg: "#1E1E1E",
  bgAlt: "#282828",
  ink: "#E8E8E8",
  muted: "#A3A3A3",
  hairline: "#3A3A3A",
  accent: "#6FA3F7",
  negative: "#F47C6B",
  positive: "#6FCF86",
  warning: "#F0B44C",
  onAccent: "#1E1E1E",
  card: "#282828",
  glow: "#FFFFFF",
  shadow: "#000000",
  grid: "#29323C",
  gridMajor: "#29323C",
  marginLine: "#4A3030",
  ...tiles,
};

// Ruling at 1080 px on the short side: square side in px, a stronger line
// every `major` squares (0 = none), the margin line's x (null = none).
// Plain squares are 54 px; graph papers keep their fine squares.
const SQUARES = 54;
const plain = { step: SQUARES, major: 0, margin: null };
const margined = { step: SQUARES, major: 0, margin: 72 };

/** Light papers. The first one is the default. */
export const LIGHT = {
  giallo: {
    doc: "yellow notepad: pale yellow paper, blue squares, red margin, teal accent",
    tokens: {
      ...notebook,
      bg: "#FCF4D2", bgAlt: "#F4EAC0", card: "#FFFCEB", ink: "#1F1E1A", muted: "#524C38", hairline: "#E3D9AE",
      accent: "#0F6E78", shadow: "#3A3420", grid: "#B0CBEA", gridMajor: "#B0CBEA", marginLine: "#E38F8F",
    },
    ruling: margined,
  },
  quaderno: {
    doc: "school notebook: warm white paper, light blue squares, red margin, blue pen accent",
    tokens: { ...notebook },
    ruling: margined,
  },
  milli: {
    doc: "blue graph paper: white, fine blue squares with a stronger line every 5",
    tokens: {
      ...notebook,
      bg: "#FFFFFF", bgAlt: "#F2F6FB", ink: "#16181D", muted: "#434B5B", hairline: "#D6DEEA", shadow: "#16181D",
      grid: "#E3EDF8", gridMajor: "#C8DBF1",
    },
    ruling: { step: 12, major: 5, margin: null },
  },
  arancio: {
    doc: "orange graph paper: warm white, fine orange squares with a stronger line every 5, blue accent",
    tokens: {
      ...notebook,
      bg: "#FFFDF8", bgAlt: "#F7F0E6", ink: "#1E1C1A", muted: "#554E47", hairline: "#E6DCCF", accent: "#2050B8",
      positive: "#1A6E33", shadow: "#1E1C1A", grid: "#FBE9DA", gridMajor: "#F5CFAE",
    },
    ruling: { step: 12, major: 5, margin: null },
  },
  tecnico: {
    doc: "engineering pad: pale green paper, green squares with a stronger line every 5",
    tokens: {
      ...notebook,
      bg: "#EEF5E7", bgAlt: "#E2ECD8", card: "#FAFCF7", ink: "#1B2A20", muted: "#38483C", hairline: "#CADBBE",
      negative: "#B0261A", positive: "#1B6E33", warning: "#874C00", shadow: "#1B2A20", grid: "#CFE2C3", gridMajor: "#B6D3A6",
    },
    ruling: { step: 24, major: 5, margin: null },
  },
  rosso: {
    doc: "red squares: warm white paper, soft red squares, blue pen ink",
    tokens: {
      ...notebook,
      bg: "#FDFAF5", bgAlt: "#F5EFE6", ink: "#1E3A8A", muted: "#47547A", hairline: "#E5DDD2", accent: "#2B5FD0",
      negative: "#B42318", shadow: "#1E3A8A", grid: "#F2C9C5", gridMajor: "#F2C9C5",
    },
    ruling: plain,
  },
  verde: {
    doc: "green squares: white paper, soft green squares, ocean blue accent",
    tokens: {
      ...notebook,
      bg: "#FFFFFF", bgAlt: "#F1F6F2", ink: "#1A1D1B", muted: "#4A564E", hairline: "#D5E0D8", accent: "#0B6BA8",
      shadow: "#1A1D1B", grid: "#B6DFC0", gridMajor: "#B6DFC0",
    },
    ruling: plain,
  },
  grigio: {
    doc: "grey squares: warm white paper, light grey squares, no margin, blue pen accent",
    tokens: { ...notebook, grid: "#DADADA", gridMajor: "#DADADA" },
    ruling: plain,
  },
};

/** Dark papers. The first one is the default. */
export const DARK = {
  notte: {
    doc: "night: faded neutral black, dim blue squares",
    tokens: { ...night },
    ruling: plain,
  },
  ardesia: {
    doc: "slate: faded black, warm white ink, dim green graph paper",
    tokens: {
      ...night,
      bg: "#202020", bgAlt: "#2A2A2A", card: "#2A2A2A", ink: "#ECEAE4", muted: "#B4B0A7", hairline: "#3B3B3B",
      accent: "#8AB4F8", onAccent: "#202020", grid: "#262E28", gridMajor: "#2F3C34",
    },
    ruling: { step: 12, major: 5, margin: null },
  },
};

export const DEFAULT_LIGHT = "giallo";
export const DEFAULT_DARK = "notte";

/** The light and dark palette a storyboard asks for, with the defaults for a missing or unknown name. */
export const pickPalettes = (storyboard) => {
  // Own keys only: "toString" is `in` every object (seen in a review: it passed and crashed the theme)
  const light = typeof storyboard?.paletteLight === "string" && Object.hasOwn(LIGHT, storyboard.paletteLight) ? storyboard.paletteLight : DEFAULT_LIGHT;
  const dark = typeof storyboard?.paletteDark === "string" && Object.hasOwn(DARK, storyboard.paletteDark) ? storyboard.paletteDark : DEFAULT_DARK;
  return { light: { name: light, ...LIGHT[light] }, dark: { name: dark, ...DARK[dark] } };
};
