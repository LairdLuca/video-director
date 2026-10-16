import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Icon, Mark, WithKeyword } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { arrive, lerp } from "../motion";
import { useBeat, useShot, useShotStart } from "../shot";
import { TYPE } from "../theme";

export type LessonProps = {
  lines: Array<string | { text: string; at?: string }>;
  keyword?: string;
  reminders?: Array<{ icon: string; text: string; at: string }>;
};

/**
 * The takeaway (catalogue 2.8), on a dark stage. Lines rise in on their
 * anchors (beat `line1`, `line2`... or the line's own `at`); a line without
 * an anchor follows the previous one after 0.15 s. Reminders get ticks. The
 * block is centred in the stage; on a 1080 px wide frame the lines are a
 * little smaller and may wrap.
 */
export const Lesson: React.FC = () => {
  const { shot, c, L } = useShot();
  const beat = useBeat();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shotStart = useShotStart();
  const props = shot.props as LessonProps;
  const lines = (props.lines ?? []).slice(0, 3).map((l) => (typeof l === "string" ? { text: l, at: undefined } : l));
  const reminders = props.reminders ?? [];

  const ats: number[] = [];
  lines.forEach((l, i) => {
    const prev = i === 0 ? shotStart + Math.round(0.3 * fps) : ats[i - 1] + Math.round(0.15 * fps);
    ats.push(beat(l.at ?? `line${i + 1}`, prev));
  });

  const side = L.narrow ? L.textMargin : 200;

  return (
    <StageFrame>
      <div
        style={{
          position: "absolute",
          left: side,
          right: side,
          top: L.stageTop,
          bottom: L.height - L.stageBottom,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {lines.map((l, i) => {
          const p = arrive(frame, ats[i], fps, 0.4);
          return (
            <div
              key={i}
              style={{
                fontSize: L.narrow ? 60 : TYPE.statement + 4,
                fontWeight: 600,
                lineHeight: 1.25,
                opacity: p,
                transform: `translateY(${lerp(36, 0, p)}px)`,
              }}
            >
              <WithKeyword text={l.text} keyword={props.keyword} color={c.accent} />
            </div>
          );
        })}
        {reminders.length ? <div style={{ height: 60 }} /> : null}
        {reminders.map((r, i) => {
          const at = beat(r.at);
          const p = arrive(frame, at, fps, 0.3);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                height: 80,
                fontSize: TYPE.body,
                color: c.ink,
                opacity: p,
                transform: `translateY(${lerp(20, 0, p)}px)`,
              }}
            >
              <Icon name={r.icon} size={44} color={c.muted} />
              <span>{r.text}</span>
              <Mark kind="tick" at={at + Math.round(0.3 * fps)} size={46} color={c.positive} />
            </div>
          );
        })}
      </div>
    </StageFrame>
  );
};
