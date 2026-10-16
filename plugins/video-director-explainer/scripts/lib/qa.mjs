// QA helpers shared by stills.mjs and freeze.mjs: bundle once, render many
// stills with one browser, tile contact sheets with ffmpeg.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  BROWSER_DOWNLOAD_NOTE,
  die,
  freePort,
  headlessBrowserReady,
  readJson,
  remotionCli,
  run,
  runNode,
  safeEnv,
  SCRIPTS_DIR,
  slash,
  sweepBrowsers,
  browserPids,
} from "./common.mjs";
import { writeFontModule } from "./fonts.mjs";
import { writeIconModule } from "./icons.mjs";

const newest = (dir) => {
  let t = 0;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    t = Math.max(t, st.isDirectory() ? newest(p) : st.mtimeMs);
  }
  return t;
};

/**
 * Bundle the project into qa/bundle (Remotion's own bundler, no server).
 * Reused when nothing in src/, public/ or the JSON data changed since.
 */
export const bundle = async (videoDir, { force = false } = {}) => {
  const icons = writeIconModule(videoDir, readJson(path.join(videoDir, "storyboard.json")));
  if (icons.missing.length) die(`unknown icons: ${icons.missing.join(", ")} (run lint-storyboard)`, 1);
  const font = writeFontModule(videoDir);
  if (font.missing.length) die(`font file ${font.missing.join(", ")} not found (run lint-storyboard)`, 1);
  const out = path.join(videoDir, "qa", "bundle");
  const marker = path.join(out, "index.html");
  const inputs = Math.max(
    newest(path.join(videoDir, "src")),
    newest(path.join(videoDir, "public")),
    ...["storyboard.json", "voiceover.json"].map((f) => statSync(path.join(videoDir, f)).mtimeMs),
  );
  if (!force && existsSync(marker) && statSync(marker).mtimeMs > inputs) return { dir: out, reused: true, ms: 0 };
  rmSync(out, { recursive: true, force: true });
  const t0 = Date.now();
  const r = await runNode(remotionCli(videoDir), ["bundle", "src/index.ts", "--out-dir", out, "--log=warn"], {
    cwd: videoDir,
    env: safeEnv(),
  });
  if (r.code !== 0) die(`remotion bundle failed (exit ${r.code})`, 1);
  return { dir: out, reused: false, ms: Date.now() - t0 };
};

/**
 * Render stills (frame numbers of the given composition) with one headless
 * browser. `stills`: [{ frame, out, label? }]. `cli: true` uses one
 * "remotion still" process per frame instead (slower, same output).
 */
export const renderStills = async (videoDir, serveUrl, stills, { composition = "Video", scale = 0.5, imageFormat = "jpeg", cli = false } = {}) => {
  for (const s of stills) mkdirSync(path.dirname(s.out), { recursive: true });
  const port = await freePort(3123);
  const t0 = Date.now();
  const before = browserPids(videoDir);
  const sweep = async () => {
    // Up to 60 s: a browser already terminating can stay listed for a while
    const { killed, left } = await sweepBrowsers(videoDir, before, { timeoutMs: 60000 });
    if (left.length) console.log(`warning: ${left.length} headless browser process(es) still running after the sweep`);
    return killed.length;
  };
  if (cli) {
    if (!headlessBrowserReady(videoDir)) console.log(`${BROWSER_DOWNLOAD_NOTE} (on the first still)`);
    for (const s of stills) {
      const props = s.label ? ["--props", JSON.stringify({ qaLabel: s.label })] : [];
      const r = await runNode(
        remotionCli(videoDir),
        ["still", serveUrl, composition, s.out, `--frame=${s.frame}`, `--scale=${scale}`, `--image-format=${imageFormat}`, `--port=${port}`, "--chrome-mode=headless-shell", "--log=warn", ...props],
        { cwd: videoDir, env: safeEnv() },
      );
      const left = await sweep();
      if (left) console.log(`killed ${left} leftover headless browser process(es)`);
      if (r.code !== 0) die(`remotion still failed on frame ${s.frame}`, 1);
    }
    return { ms: Date.now() - t0 };
  }
  const job = path.join(videoDir, "qa", ".still-job.json");
  writeFileSync(job, JSON.stringify({ videoDir, serveUrl, composition, port, scale, imageFormat, stills }), "utf8");
  const r = await runNode(path.join(SCRIPTS_DIR, "lib", "still-worker.mjs"), [job], { cwd: videoDir, env: safeEnv() });
  rmSync(job, { force: true });
  const left = await sweep();
  if (left) console.log(`killed ${left} leftover headless browser process(es)`);
  if (r.code !== 0) die(`rendering stills failed (exit ${r.code})`, 1);
  return { ms: Date.now() - t0 };
};

/**
 * Tile numbered stills (dir/0001.jpg ...) into contact sheets of cols x rows
 * tiles with ffmpeg's tile filter. Returns the sheet paths.
 */
export const contactSheets = async (ffmpeg, dir, count, outBase, { cols = 6, rows = 5, tileW = 480 } = {}) => {
  const per = cols * rows;
  const sheets = [];
  for (let start = 1, k = 1; start <= count; start += per, k++) {
    const n = Math.min(per, count - start + 1);
    const out = `${outBase}-${String(k).padStart(2, "0")}.jpg`;
    const r = await run(
      ffmpeg,
      [
        "-y", "-hide_banner", "-loglevel", "error",
        "-framerate", "1", "-start_number", String(start), "-i", path.join(dir, "%04d.jpg"),
        "-vf", `trim=end_frame=${n},scale=${tileW}:-2,tile=${cols}x${Math.ceil(n / cols)}:padding=6:margin=6:color=white`,
        "-frames:v", "1", "-update", "1", "-q:v", "3", out,
      ],
      { capture: true },
    );
    if (r.code !== 0) die(`ffmpeg tile failed: ${r.stderr.trim()}`, 1);
    sheets.push(slash(out));
  }
  return sheets;
};

export const fmtTime = (frame, fps) => `${(frame / fps).toFixed(1)}s`;
