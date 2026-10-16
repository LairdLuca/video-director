#!/usr/bin/env node
// config: the install-time choices (config.json in the plugin data folder)
// and the effective choices of one video (video.config.json).
//
// Resolution, per key: override of the single video > config.json > default.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { die, parseArgs, printHelp, readJson, slash, writeJson, PLUGIN_DIR } from "./lib/common.mjs";
import { checkFontValue, resolveFont } from "./lib/fonts.mjs";
import { locateModels } from "./lib/models.mjs";
import { DEFAULT_MUSIC_LEVEL, MUSIC_BELOW_VOICE } from "./lib/audio.mjs";
import { DEFAULT_STYLE, STYLES } from "./lib/music.mjs";
import { FORMATS } from "../template/src/lib/layout.mjs";
import { DARK, DEFAULT_DARK, DEFAULT_LIGHT, LIGHT } from "../template/src/lib/palettes.mjs";

const HELP = `
Usage:
  node config.mjs show  [--data <dir>] [--project <dir>]
  node config.mjs set   [--data <dir>] key=value [key=value ...]
  node config.mjs unset [--data <dir>] key [key ...]
  node config.mjs video <videoDir> [--data <dir>] [--project <dir>] [--chosen <keys>] [key=value ...]
  node config.mjs keys

  show    print the effective install config (config.json plus defaults), as JSON,
          with modelsFound: the folders that really hold the model files
  set     check the values and save them in <data>/config.json (other keys are kept);
          with no key=value it writes config.json as it is ({} on a first setup
          that keeps every default), so the file always exists after setup; a
          key whose value is its default is removed (also one saved earlier)
  unset   remove keys from config.json, so their default applies again
  video   write <videoDir>/video.config.json: config.json plus the overrides
          given here for this video only (for example captions=false voice=if_sara);
          run again on a video that has one, it keeps that video's overrides
          (the keys its "from" marks override) unless they are given again;
          key=default drops one, so the key goes back to config.json;
          videosDir is the folder that holds <videoDir>, so a video made
          in another folder needs no videosDir= here
  keys    list the keys, their values and defaults

  --data <dir>     the plugin data folder; the skills always pass it. Without
                   it the CLAUDE_PLUGIN_DATA environment variable is read, which
                   commands run through Claude Code's Bash tool do not have
  --project <dir>  the project the videos belong to (default: the current folder);
                   a relative videosDir is resolved against it. Given a folder
                   inside the videos folder (the video's own, for example), the
                   project above it is used, with a warning
  --chosen <keys>  (video) the keys among key=value that Claude chose, not the
                   user (format,musicStyle,speed): "from" records them as
                   "claude" instead of "override", so OUTCOME.md can say who
                   chose; a later run keeps them like the user's overrides

Values: true/false for switches, numbers for speed, text otherwise.
speed=auto (or unset) uses the voice's own default speed. language must be one
of the voice table's languages, voice one of its Kokoro voices (see: node
runtime.mjs voices). paletteLight and paletteDark are names from the
template's palettes (see: node config.mjs keys). font is "inter", the family
name of a font found on this machine (see: node fonts.mjs list), or the path
of a font file. format is auto (Claude picks it per video), 16:9, 9:16 or 1:1;
"video" resolves auto to 16:9 with a warning, so pass the format chosen for
the video. audioDir is a folder of the user's own sounds, named music*,
chapter*, error*, success* (wav, mp3, ogg, flac, m4a, aac, opus); a kind
found there replaces the generated one; audioDir=none uses the generated
ones for one video. musicStyle is auto (Claude picks it per video), warm,
pulse or minimal; like format, "video" resolves auto to ${DEFAULT_STYLE} with a
warning, so pass the style chosen for the video.
`;

const VOICES_TABLE = path.join(PLUGIN_DIR, "voice", "data", "voices.json");

export const voicesTable = () => JSON.parse(readFileSync(VOICES_TABLE, "utf8"));

// 1080 px on the short side, in every format.
const RESOLUTIONS = ["1080p"];

/** Every key of config.json: type, allowed values, default, and what it is for. */
export const SCHEMA = {
  language: { type: "string", default: "it", doc: "narration and on-screen language (it, en, en-gb, es, fr, pt; only it is tested)" },
  engine: { type: "enum", values: ["kokoro"], default: "kokoro", doc: "text-to-speech engine, local only" },
  voice: { type: "string", default: null, doc: "Kokoro voice; default: the language's default voice (im_nicola for it)" },
  speed: { type: "number", min: 0.7, max: 1.3, default: null, doc: "Kokoro speed; default: the voice's own (tuned to 2.3-2.7 words/s)" },
  captions: { type: "boolean", default: true, doc: "burned-in captions" },
  page: { type: "boolean", default: true, doc: "HTML page next to the video" },
  openOnDelivery: { type: "boolean", default: true, doc: "open the page (or the MP4) with the default program when the video is delivered" },
  checkpoints: { type: "enum", values: ["none", "narration", "narration+preview"], default: "narration", doc: "where the make skill stops for the user's OK" },
  videosDir: { type: "path", default: "videos", doc: "where video projects are created; relative to the project" },
  format: { type: "enum", values: ["auto", ...Object.keys(FORMATS)], default: "auto", doc: "frame shape; auto: Claude picks it per video from the subject" },
  resolution: { type: "enum", values: RESOLUTIONS, default: "1080p", doc: "1080 px on the short side (the only size)" },
  paletteLight: { type: "enum", values: Object.keys(LIGHT), default: DEFAULT_LIGHT, doc: "paper of the light stage" },
  paletteDark: { type: "enum", values: Object.keys(DARK), default: DEFAULT_DARK, doc: "paper of the dark stage" },
  font: { type: "font", default: "inter", doc: "text font: inter (bundled), a font family found on this machine, or a font file path" },
  music: { type: "boolean", default: true, doc: "background music, ducked under the voice" },
  musicStyle: { type: "enum", values: ["auto", ...Object.keys(STYLES)], default: "auto", doc: "character of the generated music: warm, pulse (more rhythm) or minimal; auto: Claude picks it per video from the subject" },
  musicLevel: { type: "enum", values: Object.keys(MUSIC_BELOW_VOICE), default: DEFAULT_MUSIC_LEVEL, doc: "music under the voice: low, normal or high (24, 20 or 16 LU below it)" },
  sfx: { type: "boolean", default: true, doc: "short sound effects at chapter changes and key moments, only in pauses" },
  audioDir: { type: "path", default: null, doc: "optional folder of the user's own music and effects (music*, chapter*, error*, success*), used instead of the generated ones" },
  flagDashes: { type: "boolean", default: false, doc: 'read command flags as "dash dash name" instead of "name"' },
  modelsDir: { type: "path", default: "<data>/models", doc: "folder with the voice and Whisper models" },
  runtimeDir: { type: "path", default: "<data>/runtime", doc: "Python venv of the voice step" },
};

export const dataDirOf = (given) => {
  const dir = given || process.env.CLAUDE_PLUGIN_DATA;
  if (!dir) die("no plugin data folder: pass --data <dir> (the path the skill shows for the plugin data folder)");
  return path.resolve(dir);
};

const configFile = (dataDir) => path.join(dataDir, "config.json");

export const loadConfig = (dataDir) => {
  const file = configFile(dataDir);
  return existsSync(file) ? readJson(file) : {};
};

const languageOf = (code) => {
  const langs = voicesTable().languages;
  return langs[code] ?? langs[code.split("-")[0]] ?? null;
};

const knownVoices = () => Object.values(voicesTable().languages).flatMap((l) => l.names ?? []);

/** "true" -> true, "1.1" -> 1.1, "auto" -> null, anything else stays text. */
const parseValue = (key, raw) => {
  const spec = SCHEMA[key];
  if (raw === null || raw === undefined) return raw;
  const text = String(raw).trim();
  if (spec.type === "boolean") {
    if (/^(true|on|yes|1)$/i.test(text)) return true;
    if (/^(false|off|no|0)$/i.test(text)) return false;
    throw new Error(`${key}: expected true or false, got "${text}"`);
  }
  if (spec.type === "number") {
    if (/^(auto|default|null)$/i.test(text)) return null;
    const n = Number(text);
    if (!Number.isFinite(n) || n < spec.min || n > spec.max) {
      throw new Error(`${key}: expected a number from ${spec.min} to ${spec.max}, or auto, got "${text}"`);
    }
    return n;
  }
  if (spec.type === "enum" && !spec.values.includes(text)) {
    throw new Error(`${key}: expected one of ${spec.values.join(", ")}, got "${text}"`);
  }
  if (!text) throw new Error(`${key}: empty value`);
  if (key === "language" && !languageOf(text)) {
    throw new Error(`language: "${text}" is not supported (${Object.keys(voicesTable().languages).join(", ")})`);
  }
  if (key === "voice" && !knownVoices().includes(text)) {
    throw new Error(`voice: "${text}" is not a Kokoro voice of a supported language (see: node runtime.mjs voices)`);
  }
  if (spec.type === "font") return checkFontValue(text);
  return text;
};

/** key=value strings to an object; unknown keys and bad values are errors. */
export const parsePairs = (pairs) => {
  const out = {};
  const errors = [];
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    const key = eq > 0 ? pair.slice(0, eq).trim() : pair;
    if (!Object.hasOwn(SCHEMA, key)) {
      errors.push(`unknown key "${key}" (see: node config.mjs keys)`);
      continue;
    }
    if (eq < 0) {
      errors.push(`${key}: missing "=value"`);
      continue;
    }
    try {
      out[key] = parseValue(key, pair.slice(eq + 1));
    } catch (e) {
      errors.push(e.message);
    }
  }
  if (errors.length) die(errors.join("\n       "));
  return out;
};

/** True when `dir` is `root` or inside it. */
const inside = (root, dir) => {
  const rel = path.relative(path.resolve(root), path.resolve(dir));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

// An absolute videosDir saved at setup sends every project's videos to one
// folder: in the tests, videos of a new project were proposed a folder of an
// earlier one. Said when it is saved and whenever it is outside the project.
const absoluteVideosDirNote = (dir) =>
  `videosDir "${dir}" is an absolute path: every project's videos go there. A relative path (default "videos") keeps each project's videos in the project`;

const voiceFits = (voice, lang) => Boolean(voice && lang?.prefix && voice.startsWith(lang.prefix));

/**
 * The effective choices. `config` is config.json, `overrides` the single
 * video's; each value says where it came from (default, config, override).
 */
export const resolveConfig = ({ dataDir, projectDir = process.cwd(), config = {}, overrides = {} }) => {
  const out = {};
  const from = {};
  const warnings = [];
  for (const [key, spec] of Object.entries(SCHEMA)) {
    if (overrides[key] !== undefined && overrides[key] !== null) {
      out[key] = overrides[key];
      from[key] = "override";
    } else if (config[key] !== undefined && config[key] !== null) {
      out[key] = config[key];
      from[key] = "config";
    } else {
      out[key] = spec.default;
      from[key] = "default";
    }
  }

  const lang = languageOf(out.language);
  if (!lang) warnings.push(`language "${out.language}" has no voice table entry: no default voice, untested`);
  else if (!lang.tested) warnings.push(`language "${out.language}" is not tested yet`);

  // A voice belongs to a language: when the language changes for one video and
  // the voice does not, the language's default voice is used instead.
  if (!out.voice || (from.voice !== "override" && lang && !voiceFits(out.voice, lang))) {
    if (out.voice) warnings.push(`voice ${out.voice} does not speak "${out.language}": using ${lang?.default}`);
    out.voice = lang?.default ?? out.voice;
    from.voice = "default";
  } else if (lang && !voiceFits(out.voice, lang)) {
    warnings.push(`voice ${out.voice} is not a "${out.language}" voice (prefix ${lang.prefix}_)`);
  }

  // A speed belongs to a voice: a speed from config.json only applies to the
  // voice it was chosen with.
  const voiceDefault = voicesTable().voices[out.voice]?.speed ?? 1.0;
  const configVoice = config.voice ?? languageOf(config.language ?? SCHEMA.language.default)?.default;
  if (out.speed === null || (from.speed === "config" && out.voice !== configVoice)) {
    out.speed = voiceDefault;
    from.speed = "voice default";
  }

  out.videosDir = slash(path.resolve(projectDir, out.videosDir));
  out.modelsDir = slash(path.resolve(String(out.modelsDir).replace("<data>", dataDir)));
  out.runtimeDir = slash(path.resolve(String(out.runtimeDir).replace("<data>", dataDir)));
  // audioDir=none: the generated sounds for one video, when config.json names a folder
  if (out.audioDir && out.audioDir !== "none") {
    out.audioDir = slash(path.resolve(projectDir, String(out.audioDir)));
    if (!existsSync(out.audioDir)) warnings.push(`audioDir ${out.audioDir} does not exist: the generated music and effects are used`);
  } else out.audioDir = null;
  // width and height only for a chosen format; "auto" is decided per video
  if (FORMATS[out.format]) Object.assign(out, FORMATS[out.format]);
  return { config: { ...out, dataDir: slash(dataDir) }, from, warnings };
};

/**
 * The overrides of an existing video.config.json (the keys its `from` marks
 * "override" or "claude") that are not given again nor dropped with
 * key=default; `chosen` (a Set) receives the kept keys Claude had chosen.
 * videosDir is left out: the video's folder decides it.
 */
export const keptOverrides = (file, given = {}, dropped = [], chosen = null) => {
  if (!existsSync(file)) return {};
  let old;
  try {
    old = readJson(file);
  } catch {
    return {};
  }
  const out = {};
  for (const [key, source] of Object.entries(old.from ?? {})) {
    if (!["override", "claude"].includes(source) || !Object.hasOwn(SCHEMA, key) || key in given || dropped.includes(key)) continue;
    if (source === "claude") chosen?.add(key);
    if (["videosDir", "modelsDir", "runtimeDir"].includes(key)) continue;
    // audioDir=none is saved as null
    if (key === "audioDir" && old.audioDir == null) out.audioDir = "none";
    else if (old[key] !== undefined && old[key] !== null) out[key] = old[key];
  }
  return out;
};

const printKeys = () => {
  for (const [key, spec] of Object.entries(SCHEMA)) {
    const values = spec.type === "enum" ? spec.values.join(" | ") : spec.type === "font" ? "inter | <family> | <file>" : spec.type;
    console.log(`${key.padEnd(12)} ${values.padEnd(34)} default ${JSON.stringify(spec.default)}`);
    console.log(`${"".padEnd(12)} ${spec.doc}`);
  }
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) printHelp(HELP);
  const [cmd, ...rest] = args._;
  if (cmd === "keys") return printKeys();
  if (!["show", "set", "unset", "video"].includes(cmd)) die("usage: node config.mjs show|set|unset|video|keys (see --help)");
  const dataDir = dataDirOf(args.data);
  const config = loadConfig(dataDir);

  if (cmd === "set" || cmd === "unset") {
    // "set" with no pairs still writes the file: setup with every default
    // answer must leave a config.json behind.
    if (!rest.length && cmd === "unset") die("nothing to unset");
    const next = { ...config };
    if (cmd === "set") Object.assign(next, parsePairs(rest));
    else for (const key of rest) {
      if (!Object.hasOwn(SCHEMA, key)) die(`unknown key "${key}"`);
      delete next[key];
    }
    for (const key of Object.keys(next)) if (next[key] === null) delete next[key];
    // The skill saves only what differs from the default; a value that is
    // the default (asked again at a re-run, or saved by an older setup) is
    // removed, so a later change of the default reaches it. Seen in a test:
    // videosDir=videos left from an earlier setup.
    const asDefault = Object.keys(next).filter((key) => Object.hasOwn(SCHEMA, key) && JSON.stringify(next[key]) === JSON.stringify(SCHEMA[key].default));
    for (const key of asDefault) delete next[key];
    // A new voice drops a speed chosen for the old one
    if (cmd === "set" && next.voice !== config.voice && !rest.some((p) => p.startsWith("speed="))) delete next.speed;
    const { warnings } = resolveConfig({ dataDir, config: next });
    if (cmd === "set" && next.videosDir && path.isAbsolute(String(next.videosDir))) warnings.push(absoluteVideosDirNote(next.videosDir));
    writeJson(configFile(dataDir), next);
    for (const w of warnings) console.error(`warning: ${w}`);
    console.log(`saved ${slash(configFile(dataDir))}`);
    if (cmd === "set" && asDefault.length) console.log(`  left out, equal to the default: ${asDefault.join(", ")}`);
    console.log(JSON.stringify(next, null, 2));
    return;
  }

  let projectDir = path.resolve(args.project ?? process.cwd());
  if (cmd === "show") {
    const { config: eff, from, warnings } = resolveConfig({ dataDir, projectDir, config });
    if (!inside(projectDir, eff.videosDir)) {
      warnings.push(`videosDir ${eff.videosDir} is outside this project (${slash(projectDir)})${path.isAbsolute(String(config.videosDir ?? "")) ? ", because config.json saves it as an absolute path" : ""}: check it is where the user wants this video; for another folder, pass it to new-video (step 2 of the make skill)`);
    }
    // The models may live outside modelsDir (found with --from at setup):
    // print the folders that really hold them, as doctor does.
    const models = locateModels(eff.modelsDir);
    const modelsFound = [...new Set(Object.values(models.files).filter(Boolean).map((p) => slash(path.dirname(p))))];
    for (const w of warnings) console.error(`warning: ${w}`);
    console.log(JSON.stringify({ ...eff, modelsFound, modelsMissing: models.missing, from }, null, 2));
    return;
  }

  const [videoDir, ...pairs] = rest;
  if (!videoDir) die("usage: node config.mjs video <videoDir> [key=value ...]");
  // Run from inside the videos folder (the video's own folder, say), a
  // relative videosDir would resolve under it and the video would look made
  // in another folder (seen in a test). The project is then the folder the
  // relative videosDir leads down from.
  const holder = path.dirname(path.resolve(videoDir));
  const relDir = String(config.videosDir ?? SCHEMA.videosDir.default);
  if (!path.isAbsolute(relDir) && inside(holder, projectDir)) {
    const candidate = path.resolve(holder, ...relDir.split(/[\\/]+/).filter(Boolean).map(() => ".."));
    if (slash(path.resolve(candidate, relDir)) === slash(holder) && slash(candidate) !== slash(projectDir)) {
      console.error(`warning: --project ${slash(projectDir)} is inside the videos folder ${slash(holder)}; using the project above it, ${slash(candidate)}`);
      projectDir = candidate;
    }
  }
  const chosenGiven = String(args.chosen ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  for (const key of chosenGiven) {
    if (!Object.hasOwn(SCHEMA, key)) die(`--chosen: unknown key "${key}" (see: node config.mjs keys)`);
    if (!pairs.some((p) => p.split("=")[0].trim() === key && !/=default$/i.test(p.trim()))) die(`--chosen ${key}: give its value too (${key}=...)`);
  }
  // key=default drops an override the video had: the key goes back to
  // config.json (or the default).
  const dropped = pairs.filter((p) => /^[^=]+=default$/i.test(p.trim())).map((p) => p.split("=")[0].trim());
  for (const key of dropped) if (!Object.hasOwn(SCHEMA, key)) die(`unknown key "${key}" (see: node config.mjs keys)`);
  const overrides = parsePairs(pairs.filter((p) => !/^[^=]+=default$/i.test(p.trim())));
  for (const key of ["modelsDir", "runtimeDir"]) {
    if (key in overrides) die(`${key} is an install setting, it cannot change for one video`);
  }
  // A video keeps its own choices: run again for a change after delivery
  // ("music lower"), it must not lose the format or music style it was made
  // with. Seen in a review: a 9:16 video came back as 16:9 this way.
  const keptChosen = new Set();
  const kept = keptOverrides(path.join(path.resolve(videoDir), "video.config.json"), overrides, dropped, keptChosen);
  // A new language or voice for the video drops the old voice or speed with it.
  if ("language" in overrides) delete kept.voice;
  if ("language" in overrides || "voice" in overrides) delete kept.speed;
  Object.assign(overrides, kept);
  // The video's folder decides videosDir: a video made in another folder
  // (an override the user asked for) is recorded as such without a second
  // videosDir= that could disagree with the path given to new-video.
  const parent = slash(path.dirname(path.resolve(videoDir)));
  if (overrides.videosDir !== undefined && slash(path.resolve(projectDir, overrides.videosDir)) !== parent) {
    die(`videosDir=${overrides.videosDir} does not hold ${slash(path.resolve(videoDir))}; leave videosDir= out: it is taken from <videoDir>`);
  }
  const base = resolveConfig({ dataDir, projectDir, config });
  if (base.config.videosDir !== parent) overrides.videosDir = parent;
  const { config: eff, from, warnings } = resolveConfig({ dataDir, projectDir, config, overrides });
  // A value config.json already holds is not a choice of this video: OUTCOME
  // reports it as config, and a later change of config.json reaches it.
  for (const key of Object.keys(overrides)) {
    if (key !== "videosDir" && from[key] === "override" && config[key] !== undefined && config[key] === overrides[key]) from[key] = "config";
  }
  // Claude's choices (--chosen, or kept from a run that had them) are told
  // apart from the user's: OUTCOME.md says who chose
  for (const key of [...chosenGiven, ...keptChosen]) if (from[key] === "override") from[key] = "claude";
  // A video has one format: Claude picks it at step 1 of the make skill and
  // passes it here, unless the user or config.json fixed it.
  if (eff.format === "auto") {
    warnings.push("format is auto and no format= was given: using 16:9; pass the format chosen for this video (format=16:9, 9:16 or 1:1)");
    eff.format = "16:9";
    Object.assign(eff, FORMATS["16:9"]);
    from.format = "default";
  }
  // The music style, like the format: Claude picks it at step 1 of the make
  // skill and passes it here, unless the user or config.json fixed it.
  if (eff.musicStyle === "auto") {
    if (eff.music) warnings.push(`musicStyle is auto and no musicStyle= was given: using ${DEFAULT_STYLE}; pass the style chosen for this video (musicStyle=warm, pulse or minimal)`);
    eff.musicStyle = DEFAULT_STYLE;
    from.musicStyle = "default";
  }
  // The text font: its files, found now, are copied into the video by the
  // scripts. A font no longer on the machine falls back to Inter.
  const font = resolveFont(eff.font);
  if (font.warning) {
    warnings.push(font.warning);
    eff.font = "inter";
    from.font = "default";
  }
  eff.fontFiles = font.files;
  eff.fontName = font.name;
  const file = path.join(path.resolve(videoDir), "video.config.json");
  writeJson(file, { ...eff, from });
  for (const w of warnings) console.error(`warning: ${w}`);
  console.log(`wrote ${slash(file)}`);
  for (const [key, source] of Object.entries(from)) {
    const label = ["override", "claude"].includes(source) && key in kept ? `${source}, kept from the video's last video.config.json` : source;
    if (source !== "default" || key === "voice") console.log(`  ${key.padEnd(12)} ${JSON.stringify(eff[key])}  (${label})`);
  }
  if (dropped.length) console.log(`  back to config.json: ${dropped.join(", ")}`);
  if (Object.keys(kept).length) console.log(`  (key=default drops a kept override)`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
