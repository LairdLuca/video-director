// What a custom scene (src/custom/*.tsx) needs, in one import: `import { ... } from "../kit";`
// useShot() gives the shot, the theme colours (c) and the frame's bands in the
// video's format (L: width, height, stageTop, stageBottom, margins).
export { DiagramNode, Edge } from "./components/diagram";
export { Brackets, Icon, Mark, Slab, WithKeyword, looksLikeCode } from "./components/primitives";
export { Background, Camera, Paper, StageFrame } from "./components/Stage";
export { arrive, ease, exists, follow, lerp, tween } from "./motion";
export { useBeat, useShot, useShotEnd, useShotStart } from "./shot";
export { BAND, mono, sans, tile, tokens, TYPE } from "./theme";
