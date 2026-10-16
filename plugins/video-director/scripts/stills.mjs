#!/usr/bin/env node
// stills: QA stills and contact sheets, without a full render.
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { die, loadVideo, parseArgs, printHelp, requireFfmpeg, resolveVideoDir, slash, writeJson } from "./lib/common.mjs";
import { bundle, contactSheets, fmtTime, renderStills } from "./lib/qa.mjs";

const HELP = `
Usage: node stills.mjs <videoDir> [--shot <id>[,<id>...]] [--scale 0.5] [--cli] [--rebundle]

Renders QA stills of the film and tiles them into contact sheets, so the
frames can be read as images before any full render:
  - 2 stills per shot (at 25% and 75% of its visible time);
  - 1 still in the middle of every transition;
  - 1 still on every beat + 0.3 s (where the beat's element has landed);
  - 1 still per shot 1.0 s after its last beat ("settled"), when the
    follow-ons (a tick or cross after a slab, a label after a node) have
    landed too; skipped when the 75% still already comes later.
Stills never fall in the outgoing transition or the end fade: they move
back to the last frame the shot is fully on screen.
Each still carries a small label (shot, beat, time) in the bottom-right
corner. Stills: qa/stills/NNNN.jpg; sheets: qa/contact-sheet-NN.jpg (6x5
tiles of 480 px for 16:9, 6x5 of 400 px for 1:1, 8x3 of 300 px for 9:16);
index: qa/stills.json. A full run deletes the old sheets and every
qa/shot-<id>/ folder first, so the sheets always show the current film.

  --shot <ids>  only these shots, comma-separated (--shot sh01,sh06), with one
                bundle and one browser for all; each shot goes into
                qa/shot-<id>/ (stills/, contact-sheet-NN.jpg, stills.json);
                the full set in qa/ is left as it is
  --scale <n>   still scale (default 0.5, i.e. 960x540)
  --cli         one "remotion still" process per frame (slower; default is one
                browser for all stills through Remotion's renderStill, the
                function behind "remotion still")
  --rebundle    bundle again even if nothing changed

Never uses "remotion render --frames" with non-contiguous frames (it breaks
the audio mixer). The server listens on 127.0.0.1 only; Remotion's own
headless browser is used, never the user's browser.
`;

const main = async () => {
  const args = parseArgs(process.argv.slice(2), { flags: ["cli", "rebundle"] });
  if (args.help) printHelp(HELP);
  const videoDir = resolveVideoDir(args._[0]);
  const { ffmpeg } = requireFfmpeg();
  const { timeline } = await loadVideo(videoDir);
  if (timeline.errors.length) die(`the storyboard has errors; run lint-storyboard first:\n${timeline.errors.join("\n")}`, 1);
  const fps = timeline.fps;
  // Several shots in one run share one bundle and one browser: a test video
  // fixed four shots with four runs of about 55 s each, mostly the bundle.
  const ids = args.shot ? [...new Set(String(args.shot).split(",").map((x) => x.trim()).filter(Boolean))] : null;
  const unknown = (ids ?? []).filter((id) => !timeline.shots.some((s) => s.id === id));
  if (unknown.length) die(`no shot ${unknown.map((id) => `"${id}"`).join(", ")}`);
  const shots = ids ? timeline.shots.filter((s) => ids.includes(s.id)) : timeline.shots;
  if (!shots.length) die("no shot to render");

  const wanted = [];
  const endFade = Math.round(0.6 * fps);
  for (const s of shots) {
    const span = s.visibleTo - s.visibleFrom;
    // Last frame where the shot is alone on screen: before the next shot's
    // transition starts, or before the film's end fade.
    const next = timeline.shots[s.index + 1];
    const hold = next ? next.from - 1 : timeline.durationInFrames - endFade - 1;
    const inShot = (f) => Math.max(s.visibleFrom, Math.min(hold, f));
    const late = s.visibleFrom + Math.round(span * 0.75);
    for (const [k, f] of [["25%", s.visibleFrom + Math.round(span * 0.25)], ["75%", late]]) {
      wanted.push({ frame: inShot(f), shot: s.id, what: k });
    }
    if (s.transitionIn) {
      wanted.push({ frame: s.from + Math.floor(s.transitionFrames / 2), shot: s.id, what: `${s.transitionIn} in` });
    }
    for (const b of s.beatInfo) {
      wanted.push({ frame: inShot(b.globalFrame + Math.round(0.3 * fps)), shot: s.id, what: `beat ${b.name}` });
    }
    // Follow-ons land up to about 1 s after their beat (style rule 26); the
    // beat stills come too early to show them.
    const lastBeat = Math.max(...s.beatInfo.map((b) => b.globalFrame));
    if (Number.isFinite(lastBeat)) {
      const settled = inShot(lastBeat + Math.round(1.0 * fps));
      if (settled > late) wanted.push({ frame: settled, shot: s.id, what: "settled" });
    }
  }
  wanted.sort((a, b) => a.frame - b.frame);
  const stills = [];
  for (const w of wanted) {
    if (stills.length && stills[stills.length - 1].frame === w.frame) {
      stills[stills.length - 1].what += `, ${w.what}`;
      continue;
    }
    stills.push({ ...w });
  }
  // Each chosen shot goes to its own folder, so the full set (which the final
  // review reads) never mixes current and stale stills. A full run starts clean.
  const qaDir = path.join(videoDir, "qa");
  const groups = ids
    ? shots.map((s) => ({ outDir: path.join(qaDir, `shot-${s.id}`), stills: stills.filter((x) => x.shot === s.id) }))
    : [{ outDir: qaDir, stills }];
  for (const g of groups) {
    g.stillsDir = path.join(g.outDir, "stills");
    rmSync(g.stillsDir, { recursive: true, force: true });
    for (const name of existsSync(g.outDir) ? readdirSync(g.outDir) : []) {
      const stale = /^contact-sheet-\d+\.jpg$/.test(name) || (!ids && /^shot-/.test(name));
      if (stale) rmSync(path.join(g.outDir, name), { recursive: true, force: true });
    }
    g.stills.forEach((s, i) => {
      s.index = i + 1;
      s.out = path.join(g.stillsDir, `${String(i + 1).padStart(4, "0")}.jpg`);
      s.label = `${String(i + 1).padStart(2, "0")} ${s.shot} ${fmtTime(s.frame, fps)} ${s.what}`;
    });
  }

  const t0 = Date.now();
  const b = await bundle(videoDir, { force: Boolean(args.rebundle) });
  console.log(b.reused ? "bundle reused" : `bundled in ${(b.ms / 1000).toFixed(1)} s`);
  const scale = Number(args.scale ?? 0.5);
  const r = await renderStills(videoDir, b.dir, stills, { scale, cli: Boolean(args.cli) });
  console.log(`${stills.length} stills in ${(r.ms / 1000).toFixed(1)} s`);
  for (const g of groups) {
    // A sheet stays about 2400-2900 px wide whatever the frame's shape.
    const tiles = timeline.height > timeline.width ? { cols: 8, rows: 3, tileW: 300 } : timeline.height === timeline.width ? { cols: 6, rows: 5, tileW: 400 } : {};
    const sheets = await contactSheets(ffmpeg, g.stillsDir, g.stills.length, path.join(g.outDir, "contact-sheet"), tiles);
    for (const s of sheets) console.log(`contact sheet: ${s}`);
    writeJson(path.join(g.outDir, "stills.json"), {
      fps,
      scale,
      seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
      sheets,
      stills: g.stills.map((s) => ({ index: s.index, frame: s.frame, time: fmtTime(s.frame, fps), shot: s.shot, what: s.what, file: slash(s.out) })),
    });
  }
};

main();
