// Shared helpers for the video-director scripts. Node only, no dependencies,
// Windows first (no shell, no bash), works on macOS and Linux too.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PLUGIN_DIR = path.resolve(SCRIPTS_DIR, "..");
export const TEMPLATE_DIR = path.join(PLUGIN_DIR, "template");
export const SHIM = path.join(SCRIPTS_DIR, "lib", "force-localhost.cjs");
export const IS_WIN = process.platform === "win32";

/** Forward slashes, for messages and for paths handed to ffmpeg. */
export const slash = (p) => p.replace(/\\/g, "/");

/**
 * Minimal argument parser: positionals plus --flag and --key value.
 * `spec.flags` lists boolean flags, everything else after -- takes a value.
 */
export const parseArgs = (argv, spec = {}) => {
  const flags = new Set(spec.flags ?? []);
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      out.help = true;
    } else if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split("=", 2);
      if (flags.has(k)) out[k] = true;
      else out[k] = inline ?? argv[++i];
    } else {
      out._.push(a);
    }
  }
  return out;
};

export const die = (msg, code = 2) => {
  console.error(`error: ${msg}`);
  process.exit(code);
};

export const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    die(`cannot read ${slash(file)}: ${e.message}`);
  }
};

export const writeJson = (file, data) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
};

/** The video folder must be a copy of the template (made by new-video). */
export const resolveVideoDir = (dir) => {
  if (!dir) die("missing <videoDir>");
  const abs = path.resolve(dir);
  if (!existsSync(path.join(abs, "package.json")) || !existsSync(path.join(abs, "src", "lib", "timeline.mjs"))) {
    die(`${slash(abs)} is not a video project (run new-video first)`);
  }
  return abs;
};

export const slugOf = (videoDir) => path.basename(videoDir);

/**
 * Remotion downloads its headless browser into the video's node_modules on
 * the first still or render (about 280 MB, version pinned by Remotion). It
 * writes VERSION last, so the file means a complete download.
 */
export const headlessBrowserReady = (videoDir) =>
  existsSync(path.join(videoDir, "node_modules", ".remotion", "chrome-headless-shell", "VERSION"));
export const BROWSER_DOWNLOAD_NOTE =
  "downloading Remotion's headless browser (about 280 MB, version pinned by Remotion) into node_modules/.remotion; once per video";

/**
 * The template reads captions from storyboard.json, the user's choice lives in
 * video.config.json. A message when they differ, else null.
 */
export const captionsMismatch = (videoDir, storyboard) => {
  const file = path.join(videoDir, "video.config.json");
  if (!existsSync(file)) return null;
  const want = readJson(file).captions;
  const have = storyboard.captions !== false;
  if (typeof want !== "boolean" || have === want) return null;
  return `storyboard.json captions is ${have}, video.config.json says ${want}: copy it into the storyboard`;
};

/**
 * Load storyboard.json and voiceover.json and build the timeline with the
 * video's own copy of timeline.mjs. The template's placeholder files (the
 * template needs them to compile) are timeline errors, so lint, stills,
 * freeze and render all stop on them: a skipped step must not reach a render.
 */
export const loadVideo = async (videoDir) => {
  const storyboard = readJson(path.join(videoDir, "storyboard.json"));
  const voiceover = readJson(path.join(videoDir, "voiceover.json"));
  const lib = await import(pathToFileURL(path.join(videoDir, "src", "lib", "timeline.mjs")).href);
  const timeline = lib.buildTimeline(storyboard, voiceover);
  if (storyboard.placeholder) timeline.errors.unshift("storyboard.json is still the template placeholder: write the video's storyboard");
  if (voiceover.engine === "placeholder") timeline.errors.unshift("voiceover.json is still the template placeholder: run voice.mjs");
  return { storyboard, voiceover, timeline, lib };
};

/** Node CLI of npm, run with this Node (no .cmd shim, no shell). */
export const npmCli = () => {
  const dir = path.dirname(process.execPath);
  const candidates = [
    process.env.npm_execpath,
    path.join(dir, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(dir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ].filter(Boolean);
  return candidates.find((c) => c.endsWith(".js") && existsSync(c)) ?? null;
};

export const remotionCli = (videoDir) => {
  const cli = path.join(videoDir, "node_modules", "@remotion", "cli", "remotion-cli.js");
  if (!existsSync(cli)) die(`Remotion is not installed in ${slash(videoDir)} (run new-video, or npm ci there)`);
  return cli;
};

/** Environment for every child that may open a server: the loopback shim is preloaded. */
export const safeEnv = (extra = {}) => {
  // Forward slashes: inside NODE_OPTIONS quotes a backslash is an escape.
  const shim = `--require "${slash(SHIM)}"`;
  const prev = process.env.NODE_OPTIONS ?? "";
  return {
    ...process.env,
    NODE_OPTIONS: prev.includes(slash(SHIM)) ? prev : `${prev} ${shim}`.trim(),
    // Tells "open a browser" helpers (Remotion Studio uses one) to do nothing.
    BROWSER: "none",
    ...extra,
  };
};

const children = new Set();

/**
 * Kill a running child and everything it started (headless Chrome included).
 * A child that has already exited is left alone: its PID may be reused, and
 * its orphans are no longer reachable through it (see leftoverBrowsers).
 */
export const killTree = (child) => {
  if (!child || child.exitCode !== null || child.killed) return;
  try {
    if (IS_WIN) {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
};

const cleanup = () => {
  for (const c of children) killTree(c);
  children.clear();
};
let hooked = false;
const hookExit = () => {
  if (hooked) return;
  hooked = true;
  process.on("exit", cleanup);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
    process.on(sig, () => {
      cleanup();
      process.exit(130);
    });
  }
  process.on("uncaughtException", (e) => {
    cleanup();
    console.error(e);
    process.exit(1);
  });
};

/**
 * Run a command without a shell and inherit or capture its output. If this
 * script exits or is interrupted while the child runs, the child's whole tree
 * is killed. A child that ends on its own may leave orphans behind (the
 * Remotion CLI does, on Windows): the scripts that start browsers sweep them
 * afterwards with leftoverBrowsers.
 */
export const run = (cmd, args, { cwd, env, capture = false, quiet = false, shell = false } = {}) =>
  new Promise((resolve) => {
    hookExit();
    const child = spawn(cmd, args, {
      cwd,
      env: env ?? process.env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", quiet ? "ignore" : "inherit", quiet ? "ignore" : "inherit"],
      windowsHide: true,
      detached: !IS_WIN,
      shell,
    });
    children.add(child);
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
    }
    child.on("error", (e) => {
      children.delete(child);
      resolve({ code: 127, stdout, stderr: stderr + String(e) });
    });
    child.on("close", (code) => {
      children.delete(child);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });

export const runNode = (script, args, opts = {}) => run(process.execPath, [script, ...args], opts);

/**
 * Headless browsers still running from this project's node_modules. On
 * Windows the Remotion CLI can exit and leave its browser tree behind (seen
 * after "remotion render" and "remotion still"); the scripts sweep them.
 */
export const leftoverBrowsers = (videoDir) => {
  const root = path.join(videoDir, "node_modules").toLowerCase();
  if (IS_WIN) {
    const ps = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath } | ForEach-Object { \"$($_.ProcessId)`t$($_.ExecutablePath)\" }",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    return (ps.stdout ?? "")
      .split(/\r?\n/)
      .map((l) => l.split("\t"))
      .filter(([pid, exe]) => pid && exe && exe.toLowerCase().startsWith(root))
      .map(([pid, exe]) => ({ pid: Number(pid), exe: slash(exe) }));
  }
  const ps = spawnSync("ps", ["-eo", "pid=,command="], { encoding: "utf8" });
  return (ps.stdout ?? "")
    .split("\n")
    .map((l) => l.trim().match(/^(\d+)\s+(.*)$/))
    .filter((m) => m && m[2].toLowerCase().includes(root) && /chrom/i.test(m[2]))
    .map((m) => ({ pid: Number(m[1]), exe: m[2] }));
};

export const killPid = (pid) => {
  if (IS_WIN) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* gone */
    }
  }
};

/** PIDs of the project's headless browsers running now, to leave alone later. */
export const browserPids = (videoDir) => new Set(leftoverBrowsers(videoDir).map((p) => p.pid));

/**
 * Kill the project's headless browsers that were not running before
 * (`before`), and keep scanning until two scans in a row, 1 s apart, find
 * none, or until `timeoutMs`. One scan is not enough: on Windows, after
 * "remotion render" exits, browser processes of its tree were still alive
 * after the first sweep and closed on their own only about 30 s later.
 * Returns the processes killed and those still running at the timeout.
 */
export const sweepBrowsers = async (videoDir, before = new Set(), { timeoutMs = 20000, pauseMs = 1000 } = {}) => {
  const killed = new Map();
  const end = Date.now() + timeoutMs;
  let clean = 0;
  for (;;) {
    const left = leftoverBrowsers(videoDir).filter((p) => !before.has(p.pid));
    if (!left.length) {
      if (++clean >= 2) return { killed: [...killed.values()], left: [] };
    } else {
      clean = 0;
      for (const p of left) {
        killPid(p.pid);
        killed.set(p.pid, p);
      }
    }
    if (Date.now() > end) break;
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
  return { killed: [...killed.values()], left: leftoverBrowsers(videoDir).filter((p) => !before.has(p.pid)) };
};

export const which = (bin) => {
  const r = spawnSync(IS_WIN ? "where" : "which", [bin], { encoding: "utf8", windowsHide: true });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
};

export const requireFfmpeg = () => {
  const ff = which("ffmpeg");
  const fp = which("ffprobe");
  if (!ff || !fp) die("ffmpeg and ffprobe must be on PATH (user-level install, no admin needed)");
  return { ffmpeg: ff, ffprobe: fp };
};

/** A free TCP port on 127.0.0.1, starting from `start`. */
export const freePort = (start = 3123, tries = 50) =>
  new Promise((resolve, reject) => {
    const attempt = (port, left) => {
      const srv = net.createServer();
      srv.once("error", () => (left > 0 ? attempt(port + 1, left - 1) : reject(new Error("no free port"))));
      srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(port)));
    };
    attempt(start, tries);
  });

export const freeMemGb = () => os.freemem() / 1024 ** 3;

export const printHelp = (text) => {
  console.log(text.trim());
  process.exit(0);
};
