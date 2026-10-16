import React from "react";
import { type CalculateMetadataFunction, Composition, Folder } from "remotion";
import storyboard from "../storyboard.json";
import voiceover from "../voiceover.json";
import { buildTimeline } from "./lib/timeline.mjs";
import { ShotPreview, Video, type VideoProps } from "./Video";
import "./theme";

// Durations come from the measured narration (contract B) and the beats from
// the spoken words (contract C), so they are computed here, not typed.
const timelineMetadata: CalculateMetadataFunction<VideoProps> = ({ props }) => {
  const timeline = buildTimeline(storyboard, voiceover);
  return {
    durationInFrames: timeline.durationInFrames,
    fps: timeline.fps,
    width: timeline.width,
    height: timeline.height,
    props: { ...props, timeline },
  };
};

const shotMetadata =
  (shotId: string): CalculateMetadataFunction<VideoProps & { shotId: string }> =>
  ({ props }) => {
    const timeline = buildTimeline(storyboard, voiceover);
    const shot = timeline.shots.find((s) => s.id === shotId);
    return {
      durationInFrames: shot?.durationInFrames ?? 1,
      fps: timeline.fps,
      width: timeline.width,
      height: timeline.height,
      props: { ...props, timeline, shotId },
    };
  };

const shotIds = (storyboard.shots as Array<{ id: string }>).map((s) => String(s.id));

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Video"
      component={Video}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={300}
      defaultProps={{ timeline: null }}
      calculateMetadata={timelineMetadata}
    />
    <Folder name="Shots">
      {shotIds.map((id) => (
        <Composition
          key={id}
          id={`Shot-${id.replace(/[^a-zA-Z0-9-]/g, "-")}`}
          component={ShotPreview}
          width={1920}
          height={1080}
          fps={30}
          durationInFrames={300}
          defaultProps={{ timeline: null, shotId: id }}
          calculateMetadata={shotMetadata(id)}
        />
      ))}
    </Folder>
  </>
);
