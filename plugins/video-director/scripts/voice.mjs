#!/usr/bin/env node
// voice: script.json (contract A) -> public/voice/<id>.wav + voiceover.json (contract B).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { die, parseArgs, PLUGIN_DIR, printHelp, readJson, run, slash } from "./lib/common.mjs";
import { dataDirOf, loadConfig, resolveConfig } from "./config.mjs";
import { locateModels, venvPython, voiceEnv } from "./lib/models.mjs";

const HELP = `
Usage:
  node voice.mjs <videoDir> [--force] [--no-check] [--strict] [--data <dir>]
  node voice.mjs <videoDir> --try <sentenceId> "<marked text>" ["<marked text>" ...]

Reads <videoDir>/script.json and <videoDir>/video.config.json (voice, speed,
language, modelsDir, runtimeDir, flagDashes; written by "config.mjs video"),
synthesizes one WAV per sentence into <videoDir>/public/voice/, checks with
Whisper every English term and every part marked in the narration language
({SSO|...}, {503|...}, {commit|it:commit}: heard as its shown or its spoken
form), and writes <videoDir>/voiceover.json plus the
detailed <videoDir>/qa/voice-report.json. Sentences whose text, voice and
speed did not change since the last run are not synthesized again.

Terms the check did not hear are printed with fixes to try: markup, a lexicon
entry (<videoDir>/lexicon.json), or rephrasing. Extra glossary terms go in
<videoDir>/glossary.txt.

  --force      synthesize every sentence again
  --no-check   no Whisper: word times estimated from word length (faster)
  --strict     exit with code 3 when a term was not heard
  --try <id>   synthesize the current sentence and each alternative into
               <videoDir>/qa/voice-try/ and print what Whisper heard;
               voiceover.json is not changed
  --data <dir> plugin data folder, only used when video.config.json is missing
               (without it: the CLAUDE_PLUGIN_DATA environment variable, which
               commands run through Claude Code's Bash tool do not have)

Exit codes: 0 done, 1 runtime or synthesis error, 2 bad input, 3 (with --strict) terms not heard.
`;

const VOICE_DIR = path.join(PLUGIN_DIR, "voice");

const loadVideoConfig = (videoDir, args) => {
  const file = path.join(videoDir, "video.config.json");
  if (existsSync(file)) return readJson(file);
  const dataDir = dataDirOf(args.data);
  console.error(`warning: no video.config.json in ${slash(videoDir)}; using config.json (run "config.mjs video" to fix the choices)`);
  return resolveConfig({ dataDir, config: loadConfig(dataDir) }).config;
};

const printFixes = (videoDir, voiceover) => {
  const missing = voiceover.summary?.notHeard ?? [];
  if (!missing.length) return;
  let fixes = {};
  try {
    const report = JSON.parse(readFileSync(path.join(videoDir, "qa", "voice-report.json"), "utf8"));
    fixes = Object.fromEntries(report.sentences.map((s) => [s.id, s.fix ?? {}]));
  } catch {
    /* the summary alone still says what was missed */
  }
  console.log(`\nNOT HEARD (${missing.length}): Whisper did not recognise these terms. Fix, then run voice.mjs again:`);
  for (const m of missing) {
    const kind = m.kind === "marked" ? "  (marked part)" : "";
    console.log(`  ${m.sentence}  "${m.term}"  heard as "${m.heard}"${kind}`);
    for (const f of fixes[m.sentence]?.[m.term] ?? []) console.log(`      - ${f}`);
  }
  console.log(`  Try variants without touching voiceover.json: node voice.mjs <videoDir> --try <id> "<marked text>"`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2), { flags: ["force", "no-check", "strict"] });
  if (args.help) printHelp(HELP);
  const [dir, ...alternatives] = args._;
  if (!dir) die("missing <videoDir> (see --help)");
  const videoDir = path.resolve(dir);
  const script = path.join(videoDir, "script.json");
  if (!existsSync(script)) die(`no script.json in ${slash(videoDir)}`);
  const cfg = loadVideoConfig(videoDir, args);
  const scriptLang = readJson(script).language;
  if (scriptLang && cfg.language && scriptLang !== cfg.language) {
    console.error(`warning: script.json is in "${scriptLang}", the config says "${cfg.language}"; the script wins`);
  }

  const vpy = venvPython(cfg.runtimeDir);
  if (!existsSync(vpy)) die(`no voice runtime at ${cfg.runtimeDir}: run setup (node runtime.mjs install)`, 1);
  const models = locateModels(cfg.modelsDir);
  if (models.missing.length) die(`models missing in ${cfg.modelsDir}: ${models.missing.join(", ")} (node runtime.mjs models)`, 1);

  const common = ["--model", models.kokoroModel, "--voices", models.kokoroVoices, "--voice", cfg.voice, "--speed", String(cfg.speed)];
  if (args["no-check"]) common.push("--no-whisper");
  else common.push("--whisper-model", models.whisperDir);
  if (cfg.flagDashes) common.push("--flag-dashes");
  if (existsSync(path.join(videoDir, "lexicon.json"))) common.push("--lexicon-extra", path.join(videoDir, "lexicon.json"));
  if (existsSync(path.join(videoDir, "glossary.txt"))) common.push("--glossary-extra", path.join(videoDir, "glossary.txt"));

  const runPy = (pyArgs) => run(vpy, ["-I", "-B", "-X", "utf8", path.join(VOICE_DIR, "run.py"), ...pyArgs], { env: voiceEnv() });
  const t0 = Date.now();

  if (args.try) {
    if (!alternatives.length) die('--try needs at least one alternative text: --try s04 "Con {kubelet|en:cube let} ..."');
    const pyArgs = ["try", script, "--sentence", String(args.try), "--out-dir", path.join(videoDir, "qa", "voice-try")];
    for (const t of alternatives) pyArgs.push("--text", t);
    const r = await runPy([...pyArgs, ...common]);
    console.log(`try took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    process.exitCode = r.code === 0 ? 0 : r.code === 2 ? 2 : 1;
    return;
  }

  const pyArgs = ["script", script,
    "--out-dir", path.join(videoDir, "public", "voice"),
    "--voiceover", path.join(videoDir, "voiceover.json"),
    "--report", path.join(videoDir, "qa", "voice-report.json")];
  if (args.force) pyArgs.push("--force");
  const r = await runPy([...pyArgs, ...common]);
  if (r.code !== 0) die(`voice step failed (exit ${r.code})`, r.code === 2 ? 2 : 1);

  const voiceover = readJson(path.join(videoDir, "voiceover.json"));
  const s = voiceover.summary;
  console.log(`\nvoiceover.json: ${s.sentences} sentences, speech ${(s.speechMs / 1000).toFixed(1)} s, video about ${(s.videoMs / 1000).toFixed(1)} s`);
  // The target is for the spoken words; versions and codes say more words than they show
  const pace = s.spokenWordsPerSecond ?? s.wordsPerSecond;
  console.log(`  voice ${voiceover.voice}, speed ${voiceover.speed}, ${pace} words/s spoken (target 2.3-2.7; ${s.wordsPerSecond} on the shown words), timing ${s.timing}`);
  if (pace > 2.7) {
    console.log(`  pace over 2.7: cutting words does not lower it; see "Pace" in voice.md (a lower speed for this video, or sentences with more pauses)`);
  }
  console.log(`  English terms heard: ${s.termsHeard}/${s.terms}; marked parts heard: ${s.markedHeard ?? 0}/${s.marked ?? 0}`);
  // English terms marked to be said in the narration language are checked
  // as marked parts, not counted among the English terms
  if (s.saidInNarrationLanguage?.length) {
    console.log(`  said in the narration language (counted as marked parts): ${s.saidInNarrationLanguage.join(", ")}`);
  }
  printFixes(videoDir, voiceover);
  console.log(`voice step took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (args.strict && s.notHeard.length) process.exitCode = 3;
};

main();
