import { TransitionSeries } from "@remotion/transitions";
import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Grain } from "./components/Stage";
import { customScene } from "./custom";
import { mixAt, type Timeline, type TimelineShot } from "./lib/timeline.mjs";
import { Captions } from "./overlays/Captions";
import { ChapterBar } from "./overlays/ChapterBar";
import { scenes } from "./scenes";
import { ShotProvider } from "./shot";
import { mixPalette, mono } from "./theme";
import { transitionFor } from "./transitions";

// qaLabel is set only by the QA scripts (stills.mjs): a small tag in the
// bottom-right corner, outside the caption band, to read a contact sheet.
export type VideoProps = { timeline: Timeline | null; qaLabel?: string };

const ShotView: React.FC<{ shot: TimelineShot }> = ({ shot }) => {
  const Scene = shot.scene === "Custom" ? customScene(shot.component ?? "") : scenes[shot.scene];
  return (
    <ShotProvider shot={shot}>
      <Scene />
    </ShotProvider>
  );
};

/** End of the film: 0.6 s fade to black (style rule 29). */
const EndFade: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const len = Math.round(0.6 * fps);
  const o = interpolate(frame, [durationInFrames - len, durationInFrames - 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return o > 0 ? <AbsoluteFill style={{ backgroundColor: "#000", opacity: o }} /> : null;
};

/**
 * The whole film: shots in a TransitionSeries (lengths from the measured
 * audio), then the static grain, the chapter bar and the captions drawn once
 * above everything, and one audio track per sentence at its own frame.
 */
export const Video: React.FC<VideoProps> = ({ timeline, qaLabel }) => {
  const frame = useCurrentFrame();
  if (!timeline) throw new Error("no timeline: calculateMetadata did not run");
  if (timeline.errors.length) {
    throw new Error(`storyboard.json / voiceover.json have errors (run the lint):\n${timeline.errors.join("\n")}`);
  }
  const bg = mixPalette(mixAt(timeline, frame, (s) => (s.theme === "dark" ? 1 : 0), { handover: true })).bg;

  const series: React.ReactNode[] = [];
  timeline.shots.forEach((shot, i) => {
    if (i > 0 && shot.transitionIn) {
      const { presentation, timing } = transitionFor(shot.transitionIn, timeline.shots[i - 1].theme === "dark");
      series.push(<TransitionSeries.Transition key={`t-${shot.id}`} presentation={presentation} timing={timing} />);
    }
    series.push(
      <TransitionSeries.Sequence key={`s-${shot.id}`} name={`${shot.id} ${shot.scene}`} durationInFrames={shot.durationInFrames}>
        <ShotView shot={shot} />
      </TransitionSeries.Sequence>,
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <TransitionSeries name="Shots">{series}</TransitionSeries>
      <Grain />
      <ChapterBar timeline={timeline} />
      <Captions timeline={timeline} />
      {timeline.sentences
        .filter((s) => s.file)
        .map((s) => (
          <Sequence key={s.id} name={`voice ${s.id}`} from={s.startFrame} layout="none">
            <Audio src={staticFile(s.file as string)} />
          </Sequence>
        ))}
      <EndFade durationInFrames={timeline.durationInFrames} />
      {qaLabel ? (
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            padding: "6px 12px",
            borderRadius: 6,
            backgroundColor: "rgba(0,0,0,0.72)",
            color: "#FFFFFF",
            fontFamily: mono,
            fontSize: 26,
          }}
        >
          {qaLabel}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** One shot of the film, cut out of the whole (for previews and per-shot renders). */
export const ShotPreview: React.FC<VideoProps & { shotId: string }> = ({ timeline, shotId, qaLabel }) => {
  const shot = timeline?.shots.find((s) => s.id === shotId);
  if (!timeline || !shot) throw new Error(`shot ${shotId} not found`);
  return (
    <Sequence from={-shot.from} layout="none">
      <Video timeline={timeline} qaLabel={qaLabel} />
    </Sequence>
  );
};
