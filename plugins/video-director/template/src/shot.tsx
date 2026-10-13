import React, { createContext, useContext } from "react";
import type { TimelineShot } from "./lib/timeline.mjs";
import { type Theme, type Tokens, tokens } from "./theme";

type ShotContextValue = {
  shot: TimelineShot;
  theme: Theme;
  c: Tokens;
};

const ShotContext = createContext<ShotContextValue | null>(null);

export const ShotProvider: React.FC<{ shot: TimelineShot; children: React.ReactNode }> = ({ shot, children }) => (
  <ShotContext.Provider value={{ shot, theme: shot.theme, c: tokens(shot.theme) }}>{children}</ShotContext.Provider>
);

export const useShot = (): ShotContextValue => {
  const value = useContext(ShotContext);
  if (!value) throw new Error("useShot() outside a shot");
  return value;
};

/**
 * Frame of a named beat, relative to the shot. A missing beat is a storyboard
 * error: the lint reports it first, the render stops here with the shot id.
 */
export const useBeat = () => {
  const { shot } = useShot();
  return (name: string | undefined, fallback?: number): number => {
    if (name !== undefined && name in shot.beats) return shot.beats[name];
    if (fallback !== undefined) return fallback;
    throw new Error(`shot ${shot.id}: beat "${name}" is not defined in storyboard.json`);
  };
};

/** Frame where the shot becomes visible (after the incoming transition's first half). */
export const useShotStart = () => {
  const { shot } = useShot();
  return shot.visibleFrom - shot.from;
};

/** Frame where the shot stops being the visible one. */
export const useShotEnd = () => {
  const { shot } = useShot();
  return shot.visibleTo - shot.from;
};
