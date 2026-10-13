#!/usr/bin/env node
// runtime: the voice step's Python venv and models, used by the setup skill.
// Everything goes into the plugin data folder, at user level: no admin, no
// global install, nothing is installed without the user asking for it.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { die, IS_WIN, parseArgs, PLUGIN_DIR, printHelp, run, slash, which } from "./lib/common.mjs";
import { dataDirOf, loadConfig, resolveConfig, voicesTable } from "./config.mjs";
import { download, fileId, findCandidates, locateModels, MODEL_FILES, sha256File, venvPython, voiceEnv, writeManifest } from "./lib/models.mjs";

const HELP = `
Usage:
  node runtime.mjs doctor  [--data <dir>] [--json]
  node runtime.mjs install [--data <dir>] [--python <exe>] [--no-uv]
  node runtime.mjs models  [--data <dir>] [--from <folder>]... [--copy] [--only <name>] [--no-download]
  node runtime.mjs sample  [--data <dir>] --voice <voice> [--lang <code>] [--speed <n>]
  node runtime.mjs voices  [--data <dir>] [--lang <code>]

  doctor   check Node, Python 3.12-3.13, ffmpeg, free disk and RAM, and what is
           already set up. For each missing piece it prints the user-level
           command that installs it; it never runs one.
  install  create the Python venv in <runtimeDir> (default <data>/runtime) with
           uv if it is on PATH, else "python -m venv" and pip, and install the
           pinned requirements (exact versions, sha256 hashes, wheels only).
  models   put the voice and Whisper models in place, each checked against its
           pinned sha256. --from <folder> (repeatable) reuses files already on
           disk: they are used where they are, or copied with --copy. Files not
           found are downloaded (Kokoro v1.0 from the kokoro-onnx GitHub
           releases, faster-whisper small from Hugging Face) unless
           --no-download. --only <name> handles one file, e.g. config.json.
  sample   write a short sample of a voice to <data>/samples/ and print its path
           (nothing is played or opened)
  voices   list the voices of a language with their default speed

  --data <dir>   the plugin data folder; the skills always pass it. Without it
                 the CLAUDE_PLUGIN_DATA environment variable is read, which
                 commands run through Claude Code's Bash tool do not have

Network: install reaches PyPI (or the package cache); models reaches GitHub
and Hugging Face only for files not found locally. No telemetry: the voice
step runs with HF_HUB_OFFLINE=1 and HF_HUB_DISABLE_TELEMETRY=1.
`;

const VOICE_DIR = path.join(PLUGIN_DIR, "voice");
const REQUIREMENTS = path.join(VOICE_DIR, "requirements.txt");
const STAMP = "video-director-requirements.sha256";
const PY_MIN = [3, 12];
const PY_MAX = [3, 13];
const NEED_DISK_GB = 3;
const NEED_RAM_GB = 8;

const paths = (args) => {
  const dataDir = dataDirOf(args.data);
  const { config } = resolveConfig({ dataDir, config: loadConfig(dataDir) });
  return {
    dataDir,
    runtimeDir: path.resolve(args.runtime ?? config.runtimeDir),
    modelsDir: path.resolve(config.modelsDir),
    config,
  };
};

const PLATFORM = IS_WIN ? "win" : process.platform === "darwin" ? "mac" : "linux";

/** User-level install commands, printed for the user; never run by this script. */
const FIX = {
  node: {
    win: "winget install --id OpenJS.NodeJS.LTS -e --scope user",
    mac: "brew install node",
    linux: "install Node 18 or newer with a user-level version manager (fnm, nvm, volta)",
  },
  python: {
    win: "winget install --id Python.Python.3.12 -e --scope user",
    mac: "brew install python@3.12",
    linux: "uv python install 3.12   (uv installs Python in your home folder)",
  },
  ffmpeg: {
    win: "winget install --id Gyan.FFmpeg -e",
    mac: "brew install ffmpeg",
    linux: "your distribution's ffmpeg package, or a static ffmpeg build unpacked into ~/.local/bin",
  },
  uv: {
    win: "winget install --id astral-sh.uv -e   (optional: install works without it)",
    mac: "brew install uv   (optional: install works without it)",
    linux: "python3 -m pip install --user uv   (optional: install works without it)",
  },
};

const versionOf = (exe, args) => {
  const r = spawnSync(exe, args, { encoding: "utf8", windowsHide: true, timeout: 20000 });
  return r.status === 0 ? `${r.stdout}${r.stderr}`.trim() : null;
};

const cmpVersion = (a, b) => (a[0] - b[0]) || (a[1] - b[1]);

/** Python interpreters on this machine, best first: [{exe, version:[maj,min,patch]}]. */
export const findPythons = () => {
  const seen = new Map();
  const probe = (exe, pre = []) => {
    const out = versionOf(exe, [...pre, "-I", "-c", "import sys;print(sys.executable);print(*sys.version_info[:3])"]);
    if (!out) return;
    const [real, ver] = out.split(/\r?\n/);
    if (!real || /WindowsApps/i.test(real)) return;
    const key = path.resolve(real.trim()).toLowerCase();
    if (!seen.has(key)) seen.set(key, { exe: slash(real.trim()), version: ver.trim().split(" ").map(Number) });
  };
  if (IS_WIN && which("py")) {
    const list = versionOf("py", ["-0p"]) ?? "";
    for (const line of list.split(/\r?\n/)) {
      const m = line.match(/(-V:)?(\d+\.\d+)\S*\s+\*?\s*(.+python\.exe)\s*$/i);
      if (m) probe(m[3].trim());
    }
  }
  for (const name of IS_WIN ? ["python", "python3"] : ["python3.13", "python3.12", "python3", "python"]) {
    if (which(name)) probe(name);
  }
  const ok = (p) => cmpVersion(p.version, PY_MIN) >= 0 && cmpVersion(p.version, PY_MAX) <= 0;
  return [...seen.values()].sort((a, b) => Number(ok(b)) - Number(ok(a)) || cmpVersion(b.version, a.version))
    .map((p) => ({ ...p, ok: ok(p) }));
};

const requirementsHash = () => createHash("sha256").update(readFileSync(REQUIREMENTS)).digest("hex");

const freeDiskGb = (dir) => {
  let d = path.resolve(dir);
  while (!existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
  try {
    const s = statfsSync(d);
    return (s.bavail * s.bsize) / 1024 ** 3;
  } catch {
    return null;
  }
};

const doctor = (args) => {
  const { dataDir, runtimeDir, modelsDir } = paths(args);
  const checks = [];
  const add = (name, ok, detail, fix = null, required = true) => checks.push({ name, ok, detail, fix, required });

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  add("node", nodeMajor >= 18, `Node ${process.versions.node}`, nodeMajor >= 18 ? null : FIX.node[PLATFORM]);

  const pythons = findPythons();
  const py = pythons.find((p) => p.ok);
  const seenPy = pythons.map((p) => `${p.version.join(".")}`).join(", ") || "none";
  add("python", Boolean(py), py ? `Python ${py.version.join(".")} at ${py.exe}` : `Python 3.12 or 3.13 not found (found: ${seenPy})`,
    py ? null : FIX.python[PLATFORM]);

  const uv = which("uv");
  add("uv", Boolean(uv), uv ? versionOf(uv, ["--version"]) ?? uv : "not found (optional)", uv ? null : FIX.uv[PLATFORM], false);

  const ff = which("ffmpeg");
  const fp = which("ffprobe");
  const ffv = ff ? (versionOf(ff, ["-hide_banner", "-version"]) ?? "").split(/\r?\n/)[0] : null;
  add("ffmpeg", Boolean(ff && fp), ff && fp ? ffv : "ffmpeg and ffprobe must be on PATH (render and loudness)", ff && fp ? null : FIX.ffmpeg[PLATFORM]);

  const disk = freeDiskGb(dataDir);
  add("disk", disk === null || disk >= NEED_DISK_GB, disk === null ? "free space unknown" : `${disk.toFixed(1)} GB free at ${slash(dataDir)} (need about ${NEED_DISK_GB} GB: runtime, models, one video)`,
    disk !== null && disk < NEED_DISK_GB ? "free some disk space, or set modelsDir and videosDir on another disk" : null);

  const ram = os.totalmem() / 1024 ** 3;
  add("ram", ram >= NEED_RAM_GB - 0.5, `${ram.toFixed(1)} GB total, ${(os.freemem() / 1024 ** 3).toFixed(1)} GB free now (${NEED_RAM_GB} GB total recommended; the render needs 2.5 GB free to start, and more than 6 GB free for concurrency 2)`,
    ram >= NEED_RAM_GB - 0.5 ? null : "render with concurrency 1 and close other heavy programs", false);

  const vpy = venvPython(runtimeDir);
  const stamp = path.join(runtimeDir, STAMP);
  const runtimeOk = existsSync(vpy) && existsSync(stamp) && readFileSync(stamp, "utf8").trim() === requirementsHash();
  add("runtime", runtimeOk, runtimeOk ? `venv at ${slash(runtimeDir)}` : existsSync(vpy) ? `venv at ${slash(runtimeDir)} is out of date` : `no venv at ${slash(runtimeDir)}`,
    runtimeOk ? null : "node runtime.mjs install", true);

  const models = locateModels(modelsDir);
  // Name the folders that hold the files: models found elsewhere with --from
  // stay where they are, and the data folder only keeps the manifest
  const folders = [...new Set(Object.values(models.files).filter(Boolean).map((f) => slash(path.dirname(f))))];
  add("models", !models.missing.length, models.missing.length ? `missing in ${slash(modelsDir)}: ${models.missing.join(", ")}` : `all ${MODEL_FILES.length} files found in ${folders.join(", ")}`,
    models.missing.length ? "node runtime.mjs models [--from <folder with the models>]" : null, true);

  // Not required: with no config.json every default applies; setup writes it.
  const cfgFile = path.join(dataDir, "config.json");
  add("config", existsSync(cfgFile), existsSync(cfgFile) ? `choices saved in ${slash(cfgFile)}` : `no ${slash(cfgFile)} yet: every default applies (setup writes it)`,
    null, false);

  if (args.json) {
    console.log(JSON.stringify({ platform: PLATFORM, dataDir: slash(dataDir), checks, pythons }, null, 2));
  } else {
    for (const c of checks) {
      const mark = c.ok ? "ok  " : c.required ? "MISS" : "warn";
      console.log(`${mark} ${c.name.padEnd(8)} ${c.detail}`);
      if (c.fix) console.log(`     ${"".padEnd(8)} fix: ${c.fix}`);
    }
    if (checks.some((c) => c.fix)) console.log("Nothing was installed. Run the fix commands yourself, or ask for them to be run.");
    else console.log("Nothing to fix.");
  }
  return checks.every((c) => c.ok || !c.required) ? 0 : 1;
};

const install = async (args) => {
  const { runtimeDir } = paths(args);
  const t0 = Date.now();
  const python = args.python ? { exe: args.python } : findPythons().find((p) => p.ok);
  if (!python) die(`Python 3.12 or 3.13 not found; install it at user level: ${FIX.python[PLATFORM]}`, 1);
  const vpy = venvPython(runtimeDir);
  const stamp = path.join(runtimeDir, STAMP);
  const want = requirementsHash();
  if (existsSync(vpy) && existsSync(stamp) && readFileSync(stamp, "utf8").trim() === want) {
    console.log(`runtime already installed at ${slash(runtimeDir)} (requirements unchanged)`);
    return check(vpy);
  }
  const uv = args["no-uv"] ? null : which("uv");
  // Never let uv download a Python, never prompt, wheels only, hashes required
  const env = { ...process.env, UV_PYTHON_DOWNLOADS: "never", PIP_DISABLE_PIP_VERSION_CHECK: "1", PIP_NO_INPUT: "1" };
  const step = async (label, cmd, cmdArgs) => {
    console.log(`> ${label}`);
    const r = await run(cmd, cmdArgs, { env });
    if (r.code !== 0) die(`${label} failed (exit ${r.code})`, 1);
  };
  mkdirSync(path.dirname(runtimeDir), { recursive: true });
  if (uv) {
    if (!existsSync(vpy)) await step(`uv venv ${slash(runtimeDir)}`, uv, ["venv", "--python", python.exe, runtimeDir]);
    await step("uv pip sync (pinned, hashed, wheels only)", uv,
      ["pip", "sync", "--python", vpy, "--require-hashes", "--only-binary", ":all:", REQUIREMENTS]);
  } else {
    if (!existsSync(vpy)) await step(`python -m venv ${slash(runtimeDir)}`, python.exe, ["-m", "venv", runtimeDir]);
    await step("pip install (pinned, hashed, wheels only)", vpy,
      ["-m", "pip", "install", "--require-hashes", "--only-binary", ":all:", "--no-deps", "-r", REQUIREMENTS]);
  }
  const code = await check(vpy);
  if (code === 0) writeFileSync(stamp, `${want}\n`, "utf8");
  console.log(`install took ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return code;
};

const check = async (vpy) => {
  const r = await run(vpy, ["-I", "-B", "-X", "utf8", path.join(VOICE_DIR, "run.py"), "check"], { env: voiceEnv() });
  if (r.code !== 0) console.error("the runtime check failed: run install again, or see the error above");
  return r.code;
};

const fromFolders = (argv) => {
  const out = [];
  argv.forEach((a, i) => {
    if (a === "--from" && argv[i + 1]) out.push(argv[i + 1]);
    else if (a.startsWith("--from=")) out.push(a.slice(7));
  });
  return out;
};

const models = async (args) => {
  const { modelsDir } = paths(args);
  const t0 = Date.now();
  const sources = fromFolders(process.argv.slice(3));
  const wanted = MODEL_FILES.filter((f) => !args.only || f.name === args.only || fileId(f) === args.only);
  if (!wanted.length) die(`--only ${args.only}: no such model file (${MODEL_FILES.map(fileId).join(", ")})`);
  const current = locateModels(modelsDir).files;
  const files = {};
  for (const f of MODEL_FILES) if (current[fileId(f)]) files[fileId(f)] = current[fileId(f)];

  const candidates = sources.map((s) => {
    if (!existsSync(s)) die(`--from ${s}: no such folder`);
    return findCandidates(s);
  });
  for (const f of wanted) {
    const id = fileId(f);
    const standard = path.join(modelsDir, f.group, f.name);
    const options = [current[id], standard, ...candidates.flatMap((c) => c.get(id) ?? [])].filter(Boolean);
    let chosen = null;
    for (const p of [...new Set(options.map((o) => path.resolve(o)))]) {
      if (!existsSync(p)) continue;
      const t = Date.now();
      const digest = await sha256File(p);
      if (digest === f.sha256) {
        chosen = p;
        console.log(`ok   ${id}  sha256 verified in ${((Date.now() - t) / 1000).toFixed(1)} s  ${slash(p)}`);
        break;
      }
      console.log(`skip ${id}  ${slash(p)}: sha256 does not match`);
    }
    if (chosen && args.copy && path.resolve(chosen) !== path.resolve(standard)) {
      mkdirSync(path.dirname(standard), { recursive: true });
      copyFileSync(chosen, standard);
      if ((await sha256File(standard)) !== f.sha256) die(`${id}: the copy does not match its sha256`, 1);
      console.log(`     copied to ${slash(standard)}`);
      chosen = standard;
    }
    if (!chosen) {
      if (args["no-download"]) {
        console.log(`MISS ${id}  not found, not downloaded (--no-download)`);
        delete files[id];
        continue;
      }
      console.log(`get  ${id}  from ${f.url}`);
      try {
        const r = await download(f, standard);
        console.log(`ok   ${id}  ${(r.bytes / 1e6).toFixed(1)} MB in ${r.seconds.toFixed(1)} s, sha256 verified`);
      } catch (e) {
        die(`download failed: ${e.message}`, 1);
      }
      chosen = standard;
    }
    files[id] = slash(chosen);
  }
  writeManifest(modelsDir, files);
  const result = locateModels(modelsDir);
  if (result.split) console.log("warn the Whisper files are in different folders; use --copy to bring them together");
  console.log(result.missing.length ? `missing: ${result.missing.join(", ")}` : `all models ready (manifest ${slash(path.join(modelsDir, "models.json"))})`);
  console.log(`models took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return result.missing.length || result.split ? 1 : 0;
};

const needRuntime = (runtimeDir, modelsDir) => {
  const vpy = venvPython(runtimeDir);
  if (!existsSync(vpy)) die(`no voice runtime at ${slash(runtimeDir)}: run "node runtime.mjs install" (the setup skill does)`, 1);
  const m = locateModels(modelsDir);
  if (!m.kokoroModel || !m.kokoroVoices) die(`Kokoro model files missing in ${slash(modelsDir)}: run "node runtime.mjs models"`, 1);
  return { vpy, m };
};

const sample = async (args) => {
  const { dataDir, runtimeDir, modelsDir, config } = paths(args);
  if (!args.voice) die("--voice is required (see: node runtime.mjs voices)");
  const lang = args.lang ?? config.language;
  const { vpy, m } = needRuntime(runtimeDir, modelsDir);
  const out = path.join(dataDir, "samples", `${args.voice}-${lang}.wav`);
  const pyArgs = ["-I", "-B", "-X", "utf8", path.join(VOICE_DIR, "run.py"), "sample", out, "--lang", lang, "--voice", args.voice,
    "--model", m.kokoroModel, "--voices", m.kokoroVoices];
  if (args.speed) pyArgs.push("--speed", String(args.speed));
  const t0 = Date.now();
  const r = await run(vpy, pyArgs, { env: voiceEnv() });
  if (r.code !== 0) die("sample failed", 1);
  console.log(`sample took ${((Date.now() - t0) / 1000).toFixed(1)} s; play it with any audio player`);
  return 0;
};

const voices = async (args) => {
  const { runtimeDir, modelsDir, config } = paths(args);
  const m = locateModels(modelsDir);
  const vpy = venvPython(runtimeDir);
  if (existsSync(vpy) && m.kokoroVoices) {
    const pyArgs = ["-I", "-B", "-X", "utf8", path.join(VOICE_DIR, "run.py"), "voices", "--voices", m.kokoroVoices];
    if (args.lang) pyArgs.push("--lang", args.lang);
    return (await run(vpy, pyArgs, { env: voiceEnv() })).code;
  }
  // Before install: the table only
  const table = voicesTable();
  for (const [code, lang] of Object.entries(table.languages)) {
    if (args.lang && args.lang !== code) continue;
    console.log(`${code}${lang.tested ? "" : "  (not tested)"}  default voice ${lang.default}`);
  }
  console.log(`(full list after install and models; current voice ${config.voice})`);
  return 0;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2), { flags: ["json", "copy", "no-download", "no-uv"] });
  if (args.help) printHelp(HELP);
  const cmd = args._[0];
  const commands = { doctor, install, models, sample, voices };
  if (!commands[cmd]) die("usage: node runtime.mjs doctor|install|models|sample|voices (see --help)");
  process.exitCode = await commands[cmd](args);
};

main();
