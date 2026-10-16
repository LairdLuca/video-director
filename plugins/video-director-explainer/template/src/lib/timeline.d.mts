// Types for timeline.mjs (the file itself is plain JavaScript, shared with the Node scripts).

export type Theme = "light" | "dark";
/** The transitions drawn; "crossfade" is the push between a light and a dark shot, which the timeline picks by itself. */
export type TransitionName = "push" | "wipe" | "fade-dark" | "crossfade";
/** What a storyboard may ask for (ASKED_TRANSITIONS). */
export type AskedTransition = "push" | "wipe" | "fade-dark";
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

/** `code`: a command, file name or identifier (captions draw it in mono). */
export type Word = { text: string; startMs: number; endMs: number; code?: boolean };

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
  transitionIn?: AskedTransition;
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
  paletteLight?: string;
  paletteDark?: string;
  chapters?: Array<{ id: string; label: string }>;
  parts?: Array<{ id: string; label: string; chapters: string[] }>;
  targetSeconds?: [number, number];
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
  /** End of the anchor's last word, in ms on the film's clock. */
  wordEndMs: number;
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
  /** The transition the storyboard asked for; `transitionIn` is the one drawn. */
  transitionAsked: TransitionName | null;
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

/** `part`: index in Timeline.parts, when the storyboard groups chapters into parts. */
export type Chapter = { id: string | null; label: string; from: number; to: number; part?: number };
/** `chapters`: indexes in Timeline.chapters. */
export type Part = { id: string; label: string; from: number; to: number; chapters: number[] };
export type Phrase = {
  text: string;
  words: Array<{ text: string; code: boolean }>;
  fromMs: number;
  toMs: number;
  fromFrame: number;
  toFrame: number;
};

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
  parts: Part[];
  phrases: Phrase[];
  errors: string[];
  warnings: string[];
};

export declare const LEAD_IN_MS: number;
export declare const TAIL_MS: number;
export declare const PAUSE_IN_CHAPTER_MS: number;
export declare const PAUSE_AT_CHAPTER_MS: number;
export declare const TRANSITIONS: Record<TransitionName, number>;
export declare const ASKED_TRANSITIONS: AskedTransition[];
export declare const SCENES: SceneName[];
export declare function normalizeWord(text: string): string;
export declare function splitPhrases<W extends { text: string }>(words: W[], language?: string, maxChars?: number): W[][];
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
