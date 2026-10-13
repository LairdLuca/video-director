// Types for timeline.mjs (the file itself is plain JavaScript, shared with the Node scripts).

export type Theme = "light" | "dark";
export type TransitionName = "push" | "wipe" | "fade-dark";
export type SceneName =
  | "HookStatus"
  | "Terminal"
  | "CodeWalk"
  | "FlowDiagram"
  | "StrikeReplace"
  | "StatusCard"
  | "StepList"
  | "Lesson"
  | "Screenshot"
  | "Custom";

export type Word = { text: string; startMs: number; endMs: number };

export type VoiceSentence = {
  id: string;
  chapter?: string;
  file: string | null;
  durationMs: number;
  pauseAfterMs?: number;
  shown?: string;
  words: Word[];
  timing?: "whisper" | "engine" | "estimated";
  probe?: unknown;
};

export type Voiceover = {
  language?: string;
  voice?: string;
  engine?: string;
  sampleRate?: number;
  sentences: VoiceSentence[];
};

export type BeatSpec = { name: string; word: string; sentence?: string; occurrence?: number };

export type ShotSpec = {
  id: string;
  chapter?: string;
  scene: SceneName;
  component?: string;
  theme?: Theme;
  sentences: string[];
  transitionIn?: TransitionName;
  chapterBar?: boolean;
  camera?: { from?: number; to?: number };
  props?: Record<string, unknown>;
  beats?: BeatSpec[];
  learns?: string;
  sources?: string[];
};

export type Storyboard = {
  fps?: number;
  width?: number;
  height?: number;
  captions?: boolean;
  chapters?: Array<{ id: string; label: string }>;
  shots: ShotSpec[];
};

export type TimelineSentence = {
  id: string;
  chapter?: string;
  file: string | null;
  shown: string;
  timing: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  pauseAfterMs: number;
  startFrame: number;
  words: Word[];
};

export type BeatInfo = {
  name: string;
  word: string;
  sentence: string;
  occurrence: number;
  frame: number;
  globalFrame: number;
  wordStartMs: number;
  errorMs: number;
  timing: string;
};

export type TimelineShot = {
  index: number;
  id: string;
  chapter: string | null;
  scene: SceneName;
  component: string | null;
  theme: Theme;
  transitionIn: TransitionName | null;
  transitionFrames: number;
  chapterBar: boolean;
  camera: { from: number; to: number };
  props: Record<string, unknown>;
  sentences: string[];
  from: number;
  durationInFrames: number;
  visibleFrom: number;
  visibleTo: number;
  durationS: number;
  beats: Record<string, number>;
  beatInfo: BeatInfo[];
};

export type Chapter = { id: string | null; label: string; from: number; to: number };
export type Phrase = { text: string; fromMs: number; toMs: number; fromFrame: number; toFrame: number };

export type Timeline = {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  totalMs: number;
  captions: boolean;
  sentences: TimelineSentence[];
  shots: TimelineShot[];
  chapters: Chapter[];
  phrases: Phrase[];
  errors: string[];
  warnings: string[];
};

export declare const LEAD_IN_MS: number;
export declare const TAIL_MS: number;
export declare const PAUSE_IN_CHAPTER_MS: number;
export declare const PAUSE_AT_CHAPTER_MS: number;
export declare const TRANSITIONS: Record<TransitionName, number>;
export declare const SCENES: SceneName[];
export declare function normalizeWord(text: string): string;
export declare function splitPhrases<W extends { text: string }>(words: W[], language?: string): W[][];
export declare function cameraScale(
  frame: number,
  durationInFrames: number,
  fps: number,
  from?: number,
  to?: number,
  outsideS?: number,
): number;
export declare function buildTimeline(storyboard: unknown, voiceover: unknown): Timeline;
export declare function shotAt(timeline: Timeline, frame: number): TimelineShot;
export declare const PUSH_HANDOVER: number;
export declare function mixAt(
  timeline: Timeline,
  frame: number,
  valueOf: (shot: TimelineShot) => number,
  options?: { handover?: boolean },
): number;
