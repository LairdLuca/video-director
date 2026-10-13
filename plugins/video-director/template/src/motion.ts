import { Easing, interpolate } from "remotion";

// Tweens with easing, not springs (style rule 14): durations are exact, so
// an entrance can be placed to land on a spoken word.
export const ease = {
  out: Easing.bezier(0.25, 1, 0.5, 1),
  in: Easing.bezier(0.5, 0, 0.75, 0),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  sine: Easing.inOut(Easing.sin),
  backOut: Easing.out(Easing.back(1.7)),
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0 -> 1 between two frames, eased. */
export const tween = (frame: number, start: number, end: number, easing = ease.out) =>
  end <= start ? (frame >= start ? 1 : 0) : interpolate(frame, [start, end], [0, 1], { ...clamp, easing });

/**
 * Entrance that *arrives* on frame `at` (style rule 26): it starts `durS`
 * before the anchor and completes on it.
 */
export const arrive = (frame: number, at: number, fps: number, durS = 0.4, easing = ease.out) =>
  tween(frame, at - Math.round(durS * fps), at, easing);

/** Follow-on that starts `delayS` after the anchor and lasts `durS`. */
export const follow = (frame: number, at: number, fps: number, delayS = 0.3, durS = 0.3, easing = ease.out) => {
  const start = at + Math.round(delayS * fps);
  return tween(frame, start, start + Math.round(durS * fps), easing);
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Opacity for something that does not exist before it starts (style rule 27). */
export const exists = (progress: number) => (progress <= 0 ? 0 : progress);
