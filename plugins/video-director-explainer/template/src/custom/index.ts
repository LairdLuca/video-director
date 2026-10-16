import type React from "react";

// Escape hatch: `"scene": "Custom", "component": "src/custom/X.tsx"`.
// Every .tsx file in this folder is picked up by the bundler; the file must
// export its component as default or under its file name. A custom scene
// reads its data with useShot() and useBeat() and wraps itself in
// <StageFrame> (all exported from ../kit), like the catalogue scenes.

declare const require: {
  context: (
    dir: string,
    deep: boolean,
    filter: RegExp,
  ) => { keys: () => string[]; (id: string): Record<string, unknown> };
};

const files = require.context("./", false, /\.tsx$/);

export const customScene = (component: string): React.ComponentType => {
  const base = component.replace(/^.*[\/]/, "").replace(/\.tsx$/, "");
  const key = files.keys().find((k) => k.endsWith(`/${base}.tsx`));
  if (!key) throw new Error(`custom component "${component}" not found in src/custom/`);
  const mod = files(key);
  const comp = (mod.default ?? mod[base]) as React.ComponentType | undefined;
  if (!comp) throw new Error(`src/custom/${base}.tsx must export a component as default or as "${base}"`);
  return comp;
};
