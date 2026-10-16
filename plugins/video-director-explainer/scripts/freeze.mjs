#!/usr/bin/env node
// freeze: probe for frozen stretches on stills (style rule 17), without a full render.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { die, loadVideo, parseArgs, printHelp, requireFfmpeg, resolveVideoDir, slash, writeJson } from "./lib/common.mjs";
import { bundle, fmtTime, renderStills } from "./lib/qa.mjs";

const HELP = `
Usage: node freeze.mjs <videoDir> [--shot <id>] [--min-change 0.3] [--cli] [--rebundle]

Freeze probe: at 3 points of every shot (25%, 50%, 75% of its visible
time) it renders two stills 0.8 s apart and measures, with ffmpeg, the share
of pixels whose luma changed by more than 2/255. A pair under --min-change
percent (default 0.3) is a freeze: something on screen should move (camera,
typing, a beat) at least every 0.8 s.

Writes qa/freeze.json and the PNG pairs in qa/freeze/. Exit code 0 if no
freeze is found, 1 otherwise, 2 on bad arguments.

  --shot <id>        only this shot, into qa/shot-<id>/ (freeze/, freeze.json);
                     the full-film report in qa/ is left as it is
  --min-change <p>   threshold in percent (default 0.3)
  --cli              one "remotion still" process per frame (slower)
  --rebundle         bundle again even if nothing changed
`;

const THRESHOLD = 2;
const SCALE = 0.5;

/** Share (0-1) of pixels whose luma differs by more than THRESHOLD, and the mean difference. */
const diff = async (ffmpeg, a, b) => {
  // The difference image comes back as raw 8-bit luma on stdout (binary, so
  // it is read here rather than through the text helper in common.mjs).
  const r = await new Promise((resolve) => {
    const p = spawn(
      ffmpeg,
      [
        "-hide_banner", "-loglevel", "error", "-i", a, "-i", b,
        "-filter_complex", "[0:v]format=gray[x];[1:v]format=gray[y];[x][y]blend=all_mode=difference",
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-",
      ],
      { windowsHide: true },
    );
    const chunks = [];
    let err = "";
    p.stdout.on("data", (d) => chunks.push(d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, buf: Buffer.concat(chunks), err }));
  });
  if (r.code !== 0 || !r.buf.length) die(`ffmpeg diff failed: ${r.err.trim()}`, 1);
  let changed = 0;
  let sum = 0;
  for (const v of r.buf) {
    sum += v;
    if (v > THRESHOLD) changed++;
  }
  return { share: changed / r.buf.length, mean: sum / r.buf.length };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2), { flags: ["cli", "rebundle"] });
  if (args.help) printHelp(HELP);
  const videoDir = resolveVideoDir(args._[0]);
  const { ffmpeg } = requireFfmpeg();
  const { timeline } = await loadVideo(videoDir);
  if (timeline.errors.length) die(`the storyboard has errors; run lint-storyboard first:\n${timeline.errors.join("\n")}`, 1);
  const fps = timeline.fps;
  const gap = Math.round(0.8 * fps);
  const minChange = Number(args["min-change"] ?? 0.3) / 100;
  const shots = args.shot ? timeline.shots.filter((s) => s.id === args.shot) : timeline.shots;
  if (!shots.length) die(`no shot "${args.shot}"`);

  // One shot reports in its own folder, so qa/freeze.json (read by the final
  // review) always covers the whole film.
  const outDir = path.join(videoDir, "qa", ...(args.shot ? [`shot-${args.shot}`] : []));
  const dir = path.join(outDir, "freeze");
  rmSync(dir, { recursive: true, force: true });
  const pairs = [];
  for (const s of shots) {
    const span = s.visibleTo - s.visibleFrom;
    for (const f of [0.25, 0.5, 0.75]) {
      const a = Math.min(s.visibleFrom + Math.round(span * f), s.visibleTo - gap - 1);
      pairs.push({ shot: s.id, point: `${Math.round(f * 100)}%`, a, b: a + gap });
    }
  }
  const stills = pairs.flatMap((p, i) => [
    { frame: p.a, out: path.join(dir, `${String(i + 1).padStart(3, "0")}-a.png`) },
    { frame: p.b, out: path.join(dir, `${String(i + 1).padStart(3, "0")}-b.png`) },
  ]);

  const t0 = Date.now();
  const bnd = await bundle(videoDir, { force: Boolean(args.rebundle) });
  console.log(bnd.reused ? "bundle reused" : `bundled in ${(bnd.ms / 1000).toFixed(1)} s`);
  await renderStills(videoDir, bnd.dir, stills, { scale: SCALE, imageFormat: "png", cli: Boolean(args.cli) });

  const results = [];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    const d = await diff(ffmpeg, stills[2 * i].out, stills[2 * i + 1].out);
    const frozen = d.share < minChange;
    results.push({
      ...p,
      from: fmtTime(p.a, fps),
      to: fmtTime(p.b, fps),
      changedPercent: Number((d.share * 100).toFixed(3)),
      meanDiff: Number(d.mean.toFixed(3)),
      frozen,
    });
    console.log(`${p.shot.padEnd(6)} ${p.point.padStart(4)} ${fmtTime(p.a, fps).padStart(6)}-${fmtTime(p.b, fps).padEnd(6)} changed ${(d.share * 100).toFixed(2)}%${frozen ? "  FROZEN" : ""}`);
  }
  const frozen = results.filter((r) => r.frozen);
  writeJson(path.join(outDir, "freeze.json"), {
    ok: frozen.length === 0,
    rule: `under ${minChange * 100}% of pixels changing over 0.8 s`,
    pixelThreshold: THRESHOLD,
    scale: SCALE,
    seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
    pairs: results,
    folder: slash(dir),
  });
  console.log(frozen.length ? `freeze probe failed: ${frozen.length} frozen pair(s)` : `freeze probe passed (${results.length} pairs)`);
  process.exit(frozen.length ? 1 : 0);
};

main();
