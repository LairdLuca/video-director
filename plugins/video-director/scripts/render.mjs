#!/usr/bin/env node
// render: full render with safety rails, then two-pass loudness normalisation.
import { existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import {
  captionsMismatch,
  die,
  freeMemGb,
  freePort,
  browserPids,
  loadVideo,
  parseArgs,
  printHelp,
  readJson,
  remotionCli,
  requireFfmpeg,
  resolveVideoDir,
  run,
  runNode,
  safeEnv,
  slash,
  slugOf,
  sweepBrowsers,
  writeJson,
  BROWSER_DOWNLOAD_NOTE,
  headlessBrowserReady,
} from "./lib/common.mjs";
import { writeIconModule } from "./lib/icons.mjs";

const HELP = `
Usage: node render.mjs <videoDir> [--concurrency 1|2] [--composition Video] [--force] [--keep-raw]

Renders the whole film and writes out/<slug>.mp4:
  1. checks the storyboard (no timeline errors, captions as in
     video.config.json) and the free memory: it
     refuses under 2.5 GB free (--force overrides), uses concurrency 2 only
     with more than 6 GB free, otherwise 1;
  2. runs "remotion render" with a loopback-only server on a free port from
     3123 (NODE_OPTIONS preloads a shim that forces listen() onto 127.0.0.1),
     Remotion's own headless browser (never a browser of the user) and no
     license key (so no usage event is sent);
  3. when it ends, fails or is interrupted, kills the whole process tree
     (taskkill /T /F on Windows) and any headless browser left running from
     the project's node_modules, scanning again every second until two scans
     in a row find none; a last scan after step 4 waits up to 60 s for
     processes that are still shutting down;
  4. two-pass ffmpeg loudnorm: I -14 LUFS, TP -2.0 dBTP (0.5 dB under the
     -1.5 ceiling), LRA 11, linear when possible, 48 kHz, AAC 192k, video
     stream copied; warns if the result is over -1.5 dBTP;
  5. writes qa/render.json (times, concurrency, memory, port, loudness,
     leftover processes).

  --concurrency <n>   1 or 2 (2 still needs more than 6 GB free)
  --composition <id>  another composition, e.g. Shot-sh03 for a one-shot preview
  --force             render even under 2.5 GB free memory
  --keep-raw          keep the render before loudness normalisation
`;

const MIN_FREE_GB = 2.5;
const TWO_FREE_GB = 6;
// The ceiling is -1.5 dBTP (style rule 31); the filter aims 0.5 dB lower.
// With this narration loudnorm cannot stay linear (the voice is peak-normalized,
// its peak-to-loudness ratio is above the 12.5 dB that -14 LUFS under -1.5
// allows), so it limits dynamically, and the AAC encoder adds a little on top:
// aiming at -1.5 gave -1.49 dBTP on a 23 s and on an 86 s video.
const TP_CEILING = -1.5;
const LOUD = "I=-14:TP=-2.0:LRA=11";

/** The last JSON object printed by loudnorm on stderr. */
const loudnormJson = (stderr) => {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end < start) die(`loudnorm printed no measurement:\n${stderr.slice(-800)}`, 1);
  return JSON.parse(stderr.slice(start, end + 1));
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2), { flags: ["force", "keep-raw"] });
  if (args.help) printHelp(HELP);
  const videoDir = resolveVideoDir(args._[0]);
  const slug = slugOf(videoDir);
  const { ffmpeg } = requireFfmpeg();
  const { timeline } = await loadVideo(videoDir);
  if (timeline.errors.length) die(`the storyboard has errors; run lint-storyboard first:\n${timeline.errors.join("\n")}`, 1);
  const storyboard = readJson(path.join(videoDir, "storyboard.json"));
  const captions = captionsMismatch(videoDir, storyboard);
  if (captions) die(`${captions} (run lint-storyboard)`, 1);
  const icons = writeIconModule(videoDir, storyboard);
  if (icons.missing.length) die(`unknown icons: ${icons.missing.join(", ")} (run lint-storyboard)`, 1);

  const free = freeMemGb();
  if (free < MIN_FREE_GB && !args.force) die(`only ${free.toFixed(1)} GB free memory (needs ${MIN_FREE_GB}); close something or pass --force`, 1);
  const asked = Number(args.concurrency ?? 2);
  if (![1, 2].includes(asked)) die("--concurrency must be 1 or 2");
  const concurrency = asked === 2 && free > TWO_FREE_GB ? 2 : 1;
  const port = await freePort(3123);
  const composition = args.composition ?? "Video";
  const outDir = path.join(videoDir, "out");
  const raw = path.join(outDir, `${slug}.render.mp4`);
  const final = composition === "Video" ? path.join(outDir, `${slug}.mp4`) : path.join(outDir, `${slug}.${composition}.mp4`);
  console.log(`render ${composition}: ${free.toFixed(1)} GB free, concurrency ${concurrency}, server 127.0.0.1:${port}`);

  if (!headlessBrowserReady(videoDir)) console.log(`${BROWSER_DOWNLOAD_NOTE} (the render time below includes it)`);
  const before = browserPids(videoDir);
  const t0 = Date.now();
  const r = await runNode(
    remotionCli(videoDir),
    [
      "render", "src/index.ts", composition, raw,
      `--concurrency=${concurrency}`, `--port=${port}`,
      "--codec=h264", "--audio-codec=aac", "--image-format=jpeg",
      "--chrome-mode=headless-shell", "--enforce-audio-track", "--overwrite", "--log=info",
    ],
    { cwd: videoDir, env: safeEnv() },
  );
  const renderMs = Date.now() - t0;
  // Safety rule: nothing of the render stays running once this script exits.
  // A process already told to terminate can stay listed for tens of seconds
  // (seen: one survived 20 s of taskkill /F and was gone 40 s later), so the
  // last check waits for it after the loudness passes, before exiting.
  const first = await sweepBrowsers(videoDir, before, { timeoutMs: 10000 });
  if (first.killed.length) console.log(`killed ${first.killed.length} leftover headless browser process(es)`);
  if (r.code !== 0 || !existsSync(raw)) {
    await sweepBrowsers(videoDir, before, { timeoutMs: 60000 });
    die(`remotion render failed (exit ${r.code})`, 1);
  }
  console.log(`rendered in ${(renderMs / 1000).toFixed(1)} s`);

  // Two-pass loudnorm (style rule 31).
  const t1 = Date.now();
  const pass1 = await run(ffmpeg, ["-hide_banner", "-nostats", "-i", raw, "-af", `loudnorm=${LOUD}:print_format=json`, "-f", "null", "-"], { capture: true });
  if (pass1.code !== 0) die(`loudnorm pass 1 failed:\n${pass1.stderr.slice(-800)}`, 1);
  const m = loudnormJson(pass1.stderr);
  const filter =
    `loudnorm=${LOUD}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=json`;
  const pass2 = await run(
    ffmpeg,
    ["-hide_banner", "-nostats", "-y", "-i", raw, "-c:v", "copy", "-af", filter, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final],
    { capture: true },
  );
  if (pass2.code !== 0) die(`loudnorm pass 2 failed:\n${pass2.stderr.slice(-800)}`, 1);
  const applied = loudnormJson(pass2.stderr);
  const check = await run(ffmpeg, ["-hide_banner", "-nostats", "-i", final, "-af", `loudnorm=${LOUD}:print_format=json`, "-f", "null", "-"], { capture: true });
  const after = loudnormJson(check.stderr);
  const loudMs = Date.now() - t1;
  if (!args["keep-raw"]) rmSync(raw, { force: true });
  const last = await sweepBrowsers(videoDir, before, { timeoutMs: 60000 });
  const leftover = [...new Map([...first.killed, ...last.killed].map((p) => [p.pid, p])).values()];
  const stillRunning = last.left;
  if (stillRunning.length) console.log(`warning: ${stillRunning.length} headless browser process(es) still running after 60 s of sweeping (see qa/render.json)`);

  // A one-shot composition lasts as long as its shot (see Root.tsx).
  const shot = timeline.shots.find((s) => `Shot-${String(s.id).replace(/[^a-zA-Z0-9-]/g, "-")}` === composition);
  const frames = composition === "Video" ? timeline.durationInFrames : shot?.durationInFrames ?? timeline.durationInFrames;
  const report = {
    composition,
    output: slash(final),
    sizeMb: Number((statSync(final).size / 1024 ** 2).toFixed(1)),
    durationS: Number((frames / timeline.fps).toFixed(2)),
    freeMemoryGb: Number(free.toFixed(1)),
    concurrency,
    server: `127.0.0.1:${port}`,
    renderSeconds: Number((renderMs / 1000).toFixed(1)),
    loudnormSeconds: Number((loudMs / 1000).toFixed(1)),
    loudness: {
      before: { integrated: Number(m.input_i), truePeak: Number(m.input_tp), lra: Number(m.input_lra) },
      normalization: applied.normalization_type,
      after: { integrated: Number(after.input_i), truePeak: Number(after.input_tp), lra: Number(after.input_lra) },
    },
    leftoverBrowsersKilled: leftover,
    leftoverBrowsersStillRunning: stillRunning,
  };
  writeJson(path.join(videoDir, "qa", composition === "Video" ? "render.json" : `render-${composition}.json`), report);
  console.log(`loudness ${m.input_i} -> ${after.input_i} LUFS, true peak ${after.input_tp} dBTP (${applied.normalization_type})`);
  if (Number(after.input_tp) > TP_CEILING) console.log(`warning: true peak ${after.input_tp} dBTP is over the ${TP_CEILING} dBTP ceiling`);
  console.log(`done: ${slash(final)}`);
};

main();
