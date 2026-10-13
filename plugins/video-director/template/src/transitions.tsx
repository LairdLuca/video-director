import { linearTiming, type TransitionPresentation, type TransitionPresentationComponentProps } from "@remotion/transitions";
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { TRANSITIONS, type TransitionName } from "./lib/timeline.mjs";
import { ease, lerp } from "./motion";
import { palettes } from "./theme";

// Two or three transition types per film (style rule 29). Every cut is
// treated; the overlap is centred on the cut by the timeline.

// One props type for all three presentations; only push reads it.
type PushProps = { blurOut: boolean };

// push hands over in sequence, not as a cross-fade: the outgoing shot is gone
// by 45% of the transition and the incoming one starts at 40%, so the two are
// never on screen together above about 10% opacity. A cross-fade of two full
// layouts (nodes and a slab under a half-transparent terminal) read as one
// confused frame in a test video.
const OUT_END = 0.45;
const IN_START = 0.4;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** push: the outgoing shot pushes in (1 -> 1.06) and fades out, then the incoming settles 1.05 -> 1 and fades in. */
const Push: React.FC<TransitionPresentationComponentProps<PushProps>> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const p = presentationProgress;
  if (presentationDirection === "exiting") {
    return (
      <AbsoluteFill
        style={{
          transform: `scale(${lerp(1, 1.06, p)})`,
          opacity: interpolate(p, [0, OUT_END], [1, 0], clamp),
          filter: passedProps.blurOut ? `blur(${lerp(0, 5, p)}px)` : undefined,
        }}
      >
        {children}
      </AbsoluteFill>
    );
  }
  const q = interpolate(p, [IN_START, 1], [0, 1], clamp);
  return <AbsoluteFill style={{ transform: `scale(${lerp(1.05, 1, ease.out(q))})`, opacity: q }}>{children}</AbsoluteFill>;
};

/** wipe: a vertical cursor bar moves across and reveals the new shot ("same thing, closer look"). */
const Wipe: React.FC<TransitionPresentationComponentProps<PushProps>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  if (presentationDirection === "exiting") return <AbsoluteFill>{children}</AbsoluteFill>;
  const x = presentationProgress * 1920;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `inset(0 ${1920 - x}px 0 0)` }}>{children}</AbsoluteFill>
      {presentationProgress > 0 && presentationProgress < 1 ? (
        <div style={{ position: "absolute", top: 0, bottom: 0, left: x - 6, width: 12, backgroundColor: palettes.light.accent }} />
      ) : null}
    </AbsoluteFill>
  );
};

/** fade-dark: out to the dark stage colour, then in (only into the lesson card). */
const FadeDark: React.FC<TransitionPresentationComponentProps<PushProps>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  const p = presentationProgress;
  if (presentationDirection === "exiting") {
    return (
      <AbsoluteFill style={{ backgroundColor: palettes.dark.bg }}>
        <AbsoluteFill style={{ opacity: Math.max(0, 1 - p * 2) }}>{children}</AbsoluteFill>
      </AbsoluteFill>
    );
  }
  return <AbsoluteFill style={{ opacity: Math.max(0, p * 2 - 1) }}>{children}</AbsoluteFill>;
};

const push = (blurOut: boolean): TransitionPresentation<PushProps> => ({ component: Push, props: { blurOut } });
const wipe = (): TransitionPresentation<PushProps> => ({ component: Wipe, props: { blurOut: false } });
const fadeDark = (): TransitionPresentation<PushProps> => ({ component: FadeDark, props: { blurOut: false } });

/** Presentation and timing for the transition into a shot. */
export const transitionFor = (name: TransitionName, leavingDark: boolean) => {
  const durationInFrames = TRANSITIONS[name] ?? TRANSITIONS.push;
  if (name === "wipe") return { presentation: wipe(), timing: linearTiming({ durationInFrames, easing: ease.inOut }) };
  if (name === "fade-dark") return { presentation: fadeDark(), timing: linearTiming({ durationInFrames }) };
  return { presentation: push(leavingDark), timing: linearTiming({ durationInFrames, easing: ease.sine }) };
};
