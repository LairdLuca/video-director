#!/usr/bin/env node
// audio: build the music and effects bed of a video without rendering, to
// check it (render.mjs builds it again by itself).
import path from "node:path";
import { buildBed, writeWav } from "./lib/audio.mjs";
import { die, loadVideo, parseArgs, printHelp, readJson, requireFfmpeg, resolveVideoDir, slash, slugOf, writeJson } from "./lib/common.mjs";

const HELP = `
Usage: node audio.mjs <videoDir> [--out <file.wav>]

Builds the bed render.mjs mixes under the narration (style rule 32), from
storyboard.json, voiceover.json, the narration WAVs and video.config.json
(music, musicStyle, musicLevel, sfx, audioDir):
  - the music, generated (seeded by the video's slug, so the same every
    time) or the user's from audioDir, ducked under the voice: musicLevel
    LU below it while it speaks, 8 dB up in pauses of 0.7 s or more; its
    sharpest note is measured (the rise above 500 Hz in 20 ms, before the
    ducking) and over 8 dB is a warning: such a note stands out in the
    pauses like a sound effect;
  - the effects, each in a pause of the narration: the chapter effect at
    every chapter change, the shots' "sfx" (error, success) within 0.3 s of
    their beat's word (after it, or before it), else left out.
Writes <videoDir>/audio/bed.wav (or --out) and qa/audio.json: the music
source and its level under the voice, every effect with its time, the
effects left out and why. A file of audioDir that ffmpeg cannot decode is
a warning, and the generated sound of its kind is used. Nothing is played
or opened.
`;

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) printHelp(HELP);
  const videoDir = resolveVideoDir(args._[0]);
  const { timeline } = await loadVideo(videoDir);
  if (timeline.errors.length) die(`the storyboard has errors; run lint-storyboard first:\n${timeline.errors.join("\n")}`, 1);
  const { ffmpeg } = requireFfmpeg();
  const storyboard = readJson(path.join(videoDir, "storyboard.json"));
  const cfg = readJson(path.join(videoDir, "video.config.json"));
  const { bed, report } = buildBed({ videoDir, timeline, storyboard, cfg, ffmpeg, slug: slugOf(videoDir) });
  const out = path.resolve(args.out ?? path.join(videoDir, "audio", "bed.wav"));
  writeWav(out, bed);
  writeJson(path.join(videoDir, "qa", "audio.json"), report);
  for (const w of report.warnings ?? []) console.log(`warning: ${w}`);
  const m = report.music;
  console.log(`music: ${m ? `${m.source}; ${m.voiceOverMusicLu} LU under the voice while it speaks, ${m.inLongPausesLufs ?? "-"} LUFS in long pauses; sharpest note ${m.transientDb} dB (limit ${m.transientLimitDb})` : "off"}`);
  if (report.effects) {
    for (const e of report.effects) console.log(`  ${e.kind.padEnd(8)} ${(e.startMs / 1000).toFixed(2)}-${(e.endMs / 1000).toFixed(2)} s  ${e.from}${e.fromWordMs === undefined ? "" : e.fromWordMs >= 0 ? ` (${(e.fromWordMs / 1000).toFixed(2)} s after its word)` : ` (ends ${(-e.fromWordMs / 1000).toFixed(2)} s before its word)`}${e.cut ? " (cut to fit the pause)" : ""}  ${e.source}`);
    for (const d of report.dropped) console.log(`  left out: ${d.kind} (${d.from}): ${d.reason ?? "no pause near its word"}`);
    for (const y of report.yielded) console.log(`  no chapter effect at ${y.from}: its pause holds the ${y.to}`);
    console.log(`effects: ${report.effects.length}, over speech: ${report.effectsOverSpeech}`);
  } else console.log("effects: off");
  console.log(`wrote ${slash(out)} in ${report.buildSeconds} s`);
};

main();
