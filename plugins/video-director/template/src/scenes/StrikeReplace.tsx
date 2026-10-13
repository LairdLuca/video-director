import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { looksLikeCode } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { arrive, ease, follow, lerp, tween } from "../motion";
import { useBeat, useShot, useShotStart } from "../shot";
import { mono, sans, TYPE } from "../theme";

export type StrikeReplaceProps = {
  prefix?: string;
  before: string;
  after: string;
  atStrike: string;
  atAfter: string;
  note?: string;
  atNote?: string;
  // The statement (prefix and before) appears on this beat instead of at the
  // shot's start, when the narration names it later (style rule 27).
  atBefore?: string;
};

/**
 * Before/after, "not A but B" (catalogue 2.5): one statement line; on
 * `atStrike` a line strikes through `before`, on `atAfter` `after` rises
 * into the same slot (in mono when it is a code token).
 */
export const StrikeReplace: React.FC = () => {
  const { shot, c } = useShot();
  const beat = useBeat();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shotStart = useShotStart();
  const props = shot.props as StrikeReplaceProps;
  const strikeAt = beat(props.atStrike);
  const afterAt = beat(props.atAfter);
  const noteAt = props.atNote ? beat(props.atNote) : afterAt + Math.round(0.8 * fps);

  const beforeAt = props.atBefore ? beat(props.atBefore) - Math.round(0.2 * fps) : shotStart;
  const appear = tween(frame, beforeAt, beforeAt + Math.round(0.4 * fps));
  const strike = tween(frame, strikeAt, strikeAt + Math.round(0.15 * fps), ease.out);
  const rise = arrive(frame, afterAt, fps, 0.25);
  // The struck word leaves the slot before the new one rises into it, so the
  // two never sit on top of each other.
  const lift = tween(frame, afterAt - Math.round(0.5 * fps), afterAt - Math.round(0.15 * fps), ease.inOut);
  const noteIn = props.note ? follow(frame, noteAt, fps, 0, 0.4) : 0;
  const codeBefore = looksLikeCode(props.before);
  const codeAfter = looksLikeCode(props.after);

  return (
    <StageFrame>
      <div
        style={{
          position: "absolute",
          left: 160,
          right: 160,
          top: 360,
          textAlign: "center",
          fontSize: TYPE.statement,
          fontWeight: 600,
          lineHeight: 1.2,
          opacity: appear,
        }}
      >
        {props.prefix ? <span>{props.prefix} </span> : null}
        {/* One grid cell holds both words, so the slot is as wide as the longer one. */}
        <span style={{ display: "inline-grid", verticalAlign: "top", textAlign: "left" }}>
          <span
            style={{
              gridArea: "1 / 1",
              justifySelf: "start",
              position: "relative",
              fontFamily: codeBefore ? mono : sans,
              color: strike > 0 ? c.muted : c.ink,
              opacity: lerp(1, 0.45, lift),
              transform: `translateY(${lerp(0, -96, lift)}px) scale(${lerp(1, 0.8, lift)})`,
              transformOrigin: "left center",
            }}
          >
            {props.before}
            <span
              style={{
                position: "absolute",
                left: -6,
                top: "54%",
                height: 7,
                borderRadius: 4,
                width: `calc(${strike * 100}% + 12px)`,
                backgroundColor: c.negative,
                opacity: strike > 0 ? 1 : 0,
              }}
            />
          </span>
          <span
            style={{
              gridArea: "1 / 1",
              justifySelf: "start",
              whiteSpace: "nowrap",
              fontFamily: codeAfter ? mono : sans,
              color: c.accent,
              fontWeight: 700,
              opacity: rise,
              transform: `translateY(${lerp(56, 0, rise)}px)`,
            }}
          >
            {props.after}
          </span>
        </span>
      </div>
      {props.note ? (
        <div
          style={{
            position: "absolute",
            left: 160,
            right: 160,
            top: 560,
            textAlign: "center",
            fontSize: TYPE.body,
            color: c.muted,
            opacity: noteIn,
            transform: `translateY(${lerp(16, 0, noteIn)}px)`,
          }}
        >
          {props.note}
        </div>
      ) : null}
    </StageFrame>
  );
};
