#!/usr/bin/env node
// lint-storyboard: check storyboard.json against voiceover.json and facts.md before any still or render.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { captionsMismatch, loadVideo, parseArgs, printHelp, resolveVideoDir, slash, writeJson } from "./lib/common.mjs";
import { iconFile, writeIconModule } from "./lib/icons.mjs";

const HELP = `
Usage: node lint-storyboard.mjs <videoDir> [--quiet]

Checks the storyboard of a video project in seconds, without rendering:
  - every beat's anchor word is found in the narration, and its frame is
    within 0.1 s of the word;
  - 3 to 6 beats per shot (1 to 6 for a slab without flow), no beat in
    the last 0.5 s of a shot;
  - every shot lasts 5 to 15 s (the last one 4 to 15 s: its 0.6 s tail
    holds the closing frame); every sentence is in exactly one shot;
  - every beat a scene refers to exists; scene props are complete;
  - layout limits that keep content inside its band (terminal line length,
    node, row, item and line counts, label lengths) and icon names;
  - every command, output line and code line on screen is in facts.md
    (a terminal title, slab and row values not found there are warnings);
  - voice files exist; transitions and light/dark switches stay few;
  - the length is inside storyboard.targetSeconds (the length the user
    asked for) or, without it, 60-90 s (warnings).
Values are looked up in facts.md without backticks, bold or case.
Writes qa/lint.json and refreshes src/icons.generated.ts (the icons the
storyboard uses, the only ones the template bundles). Exit code 0 if there are no errors, 1 otherwise
(warnings do not fail), 2 on bad arguments.
`;

const norm = (s) => String(s).replace(/\s+/g, " ").trim();

const main = async () => {
  const args = parseArgs(process.argv.slice(2), { flags: ["quiet"] });
  if (args.help) printHelp(HELP);
  const videoDir = resolveVideoDir(args._[0]);
  const { storyboard, voiceover, timeline } = await loadVideo(videoDir);
  const errors = [...timeline.errors];
  const warnings = [...timeline.warnings];
  const fps = timeline.fps;
  const err = (shot, msg) => errors.push(shot ? `shot ${shot.id}: ${msg}` : msg);
  const warn = (shot, msg) => warnings.push(shot ? `shot ${shot.id}: ${msg}` : msg);

  // facts.md, normalised line by line.
  const factsFile = path.join(videoDir, "facts.md");
  const factLines = existsSync(factsFile)
    ? readFileSync(factsFile, "utf8").split(/\r?\n/).map(norm).filter(Boolean)
    : null;
  if (!factLines) err(null, "facts.md not found: every command and value on screen must come from it");
  const inFacts = (text, kind) => {
    if (!factLines) return true;
    const t = norm(text);
    return factLines.some((f) => f === t || (kind === "cmd" && (f === `$ ${t}` || f === `# ${t}`)));
  };
  // A value on screen is plain text; in facts.md it may sit in backticks or
  // bold, and start a sentence. "container checkout" must find container
  // `checkout`, and "manca" must find "Manca" (two test videos).
  const plain = (s) => norm(String(s).replace(/`|\*\*|__/g, "")).toLowerCase();
  const factPlain = factLines ? factLines.map(plain) : null;
  const factsMention = (text) => !factPlain || factPlain.some((f) => f.includes(plain(text)));

  // Icons: one file per icon in the video's own lucide-react (the template loads them one by one).
  const iconsDir = path.join(videoDir, "node_modules", "lucide-react", "dist", "esm", "icons");
  const haveIcons = existsSync(iconsDir);
  if (!haveIcons) warn(null, "lucide-react not installed in the video project: icon names not checked");
  const checkIcon = (shot, name) => {
    if (!name) return err(shot, "an icon name is missing");
    if (haveIcons && !existsSync(path.join(iconsDir, `${iconFile(name)}.mjs`))) {
      err(shot, `unknown icon "${name}" (Lucide icon file names, e.g. "server", "file-text")`);
    }
  };

  // The template bundles only the icons listed in src/icons.generated.ts.
  writeIconModule(videoDir, storyboard);

  // Voice files.
  for (const s of timeline.sentences) {
    if (!s.file) err(null, `sentence ${s.id}: no audio file`);
    else if (!existsSync(path.join(videoDir, "public", s.file))) err(null, `sentence ${s.id}: public/${s.file} not found`);
    if (s.timing === "estimated") warn(null, `sentence ${s.id}: word times are estimated; anchor beats to the first or last word of a clause`);
  }

  const MONO = 0.6;
  const words = (s) => norm(s).split(" ").filter(Boolean).length;

  for (const shot of timeline.shots) {
    const p = shot.props ?? {};
    const beats = shot.beats;
    const used = new Set();
    const need = (name, what) => {
      if (name === undefined || name === null || name === "") return err(shot, `${what}: missing beat name`);
      used.add(name);
      if (!(name in beats)) err(shot, `${what} refers to beat "${name}", which is not defined (or did not resolve)`);
    };
    const optional = (name) => {
      if (name in beats) used.add(name);
    };

    // Shot length and beats. The last shot ends on the 0.6 s tail, a held
    // closing frame without speech, so 4 s is enough there (short videos).
    const last = shot.index === timeline.shots.length - 1;
    const minS = last ? 4 : 5;
    if (shot.durationS < minS - 1e-6 || shot.durationS > 15) {
      err(shot, `lasts ${shot.durationS.toFixed(1)} s (must be ${minS}-15 s${last ? " for the last shot, tail included" : ""})`);
    }
    // A slab alone has one thing to land (two with its cross): asking it for 3
    // beats made a test video add beats no scene used.
    const n = shot.beatInfo.length;
    const minBeats = shot.scene === "HookStatus" && !p.flow ? 1 : 3;
    if (n < minBeats || n > 6) err(shot, `${n} beats (must be ${minBeats}-6 for ${shot.scene}${minBeats === 1 ? " without flow" : ""})`);
    for (const b of shot.beatInfo) {
      if (b.errorMs > 100) err(shot, `beat "${b.name}" is ${b.errorMs} ms from its word (max 100)`);
      if (b.globalFrame > shot.visibleTo - Math.round(0.5 * fps)) err(shot, `beat "${b.name}" falls in the last 0.5 s of the shot`);
      if (b.globalFrame < shot.visibleFrom) warn(shot, `beat "${b.name}" falls before the shot is fully visible`);
    }

    // Scene-specific props, beat references and layout limits.
    switch (shot.scene) {
      case "HookStatus": {
        if (!p.slab?.value) err(shot, "props.slab.value is required");
        need("slab", "the slab");
        if (p.flow) {
          need("flowIn", "the flow");
          optional("target");
          if (!Array.isArray(p.flow.nodes) || p.flow.nodes.length !== 2) err(shot, "props.flow.nodes must have 2 nodes");
          for (const node of p.flow.nodes ?? []) {
            checkIcon(shot, node.icon);
            if (words(node.label ?? "") > 3) warn(shot, `node label "${node.label}" is over 3 words`);
          }
        }
        optional("cross");
        if (p.slab?.value && !factsMention(p.slab.value)) warn(shot, `slab value "${p.slab.value}" not found in facts.md`);
        // Same arithmetic as slabFontSize in the template: the value shrinks
        // to fit its slot (620 px beside a flow, the stage without one).
        if (p.slab?.value) {
          if (p.flow && p.slab.side === "center") err(shot, 'slab side "center" covers the flow: use "left" or "right", or drop the flow');
          const slot = p.flow ? 620 : 1600;
          const px = Math.min(192, Math.floor((slot - 128) / (String(p.slab.value).length * MONO)));
          if (px < 120) {
            warn(shot, `slab value "${p.slab.value}" (${String(p.slab.value).length} characters) is drawn at ${px} px to fit${p.flow ? " beside the flow" : ""}; a hero value reads best at 4 characters or fewer${p.flow ? " (or drop the flow: the slab alone gets the whole stage)" : ""}`);
          }
        }
        break;
      }
      case "Terminal": {
        const lines = p.lines ?? [];
        if (!lines.length) err(shot, "props.lines is empty");
        const width = p.size === "full" ? 1728 : 1500;
        const maxChars = Math.floor((width - 64) / (28 * MONO));
        lines.forEach((l, i) => {
          if (!["cmd", "out", "err", "ok"].includes(l.kind)) err(shot, `line ${i + 1}: kind must be cmd, out, err or ok`);
          if (l.at) need(l.at, `line ${i + 1}`);
          else if (l.kind === "cmd") warn(shot, `line ${i + 1}: a command should start typing on the word that names it (set "at")`);
          const len = l.text.length + (l.kind === "cmd" ? 2 : 0);
          if (len > maxChars) err(shot, `line ${i + 1} has ${len} characters; at the 28 px minimum the ${p.size ?? "tile"} fits ${maxChars}`);
          if (!inFacts(l.text, l.kind)) err(shot, `line ${i + 1} is not in facts.md: "${l.text}"`);
        });
        // The title bar is on screen too: a folder nobody gave is an invented fact
        if (p.title && !factsMention(p.title)) warn(shot, `terminal title "${p.title}" not found in facts.md (leave it out unless the facts give the folder or file)`);
        if (lines.length > 10) warn(shot, `${lines.length} lines: the terminal scrolls after 10`);
        const reds = lines.filter((l) => l.kind === "err").length;
        const greens = lines.filter((l) => l.kind === "ok").length;
        if (reds > 1 || greens > 1) warn(shot, "more than one red or one green line (keep one of each at most)");
        for (const f of p.focus ?? []) {
          need(f.at, `focus on line ${f.line}`);
          if (!(f.line >= 1 && f.line <= lines.length)) err(shot, `focus line ${f.line} does not exist`);
          if (!["brackets", "band", "tint"].includes(f.style)) err(shot, `focus style "${f.style}" (brackets, band, tint)`);
        }
        break;
      }
      case "CodeWalk": {
        const code = String(p.code ?? "").replace(/\n$/, "").split("\n");
        if (!p.file) err(shot, "props.file is required");
        else if (!factsMention(p.file)) warn(shot, `file "${p.file}" not found in facts.md`);
        if (code.length < 6 || code.length > 12) warn(shot, `${code.length} code lines (the close-up is made for 6-12)`);
        // Line numbers only with startLine: they claim a place in the file
        if (p.startLine !== undefined && !(Number.isInteger(p.startLine) && p.startLine >= 1)) err(shot, "startLine must be a whole number from 1 (the snippet's first line in the file)");
        if (p.startLine !== undefined && !factsMention(String(p.startLine))) warn(shot, `startLine ${p.startLine} not found in facts.md (leave it out unless the facts give the line)`);
        const numberColumn = p.startLine ? 30 * MONO * (Math.max(2, String(p.startLine + code.length - 1).length) + 1) : 0;
        const maxChars = Math.floor((1500 - 64 - numberColumn) / (30 * MONO));
        code.forEach((l, i) => {
          if (l.length > maxChars) err(shot, `code line ${i + 1} has ${l.length} characters (max ${maxChars})`);
          if (norm(l) && !inFacts(l, "out")) err(shot, `code line ${i + 1} is not in facts.md: "${l.trim()}"`);
        });
        if (!(p.walk ?? []).length) err(shot, "props.walk is empty");
        for (const w of p.walk ?? []) {
          need(w.at, `walk to line ${w.line}`);
          if (!(w.line >= 1 && w.line <= code.length)) err(shot, `walk line ${w.line} does not exist`);
        }
        break;
      }
      case "FlowDiagram": {
        const nodes = p.nodes ?? [];
        if (nodes.length < 2 || nodes.length > 4) err(shot, `${nodes.length} nodes (2-4; more becomes two shots)`);
        const ids = new Set(nodes.map((x) => x.id));
        for (const node of nodes) {
          need(node.at, `node ${node.id}`);
          checkIcon(shot, node.icon);
          if (words(node.label ?? "") > 3) warn(shot, `node label "${node.label}" is over 3 words`);
        }
        for (const e of p.edges ?? []) {
          need(e.at, `edge ${e.from}->${e.to}`);
          if (!ids.has(e.from) || !ids.has(e.to)) err(shot, `edge ${e.from}->${e.to} refers to a missing node`);
        }
        for (const m of p.marks ?? []) {
          need(m.at, `mark on ${m.node}`);
          if (!ids.has(m.node)) err(shot, `mark on missing node ${m.node}`);
        }
        if (p.layout && !["row", "column", "fork"].includes(p.layout)) err(shot, `layout "${p.layout}" (row, column, fork)`);
        break;
      }
      case "StrikeReplace": {
        if (!p.before || !p.after) err(shot, "props.before and props.after are required");
        need(p.atStrike, "the strike");
        need(p.atAfter, "the replacement");
        if (p.atNote) need(p.atNote, "the note");
        if (p.atBefore) need(p.atBefore, "the statement");
        if (p.atStrike in beats && p.atAfter in beats && beats[p.atStrike] > beats[p.atAfter]) {
          warn(shot, "the strike (atStrike) comes after the replacement (atAfter): the old value is struck once the new one is already in its slot");
        }
        const line = `${p.prefix ?? ""} ${p.before ?? ""}`.trim();
        if (line.length > 40) warn(shot, `statement "${line}" is long for one 68 px line (about 40 characters)`);
        break;
      }
      case "StatusCard": {
        const rows = p.rows ?? [];
        if (!rows.length || rows.length > 5) err(shot, `${rows.length} rows (1-5)`);
        for (const r of rows) {
          need(r.at, `row ${r.label}`);
          if (!factsMention(r.value)) warn(shot, `row value "${r.value}" not found in facts.md`);
          if (r.ok !== undefined && typeof r.ok !== "boolean") err(shot, `row ${r.label}: ok must be true, false or left out (no mark)`);
        }
        if (rows.filter((r) => r.ok === false).length > 1) {
          warn(shot, "more than one row with ok: false (red crosses); leave ok out for a state or an option that is not a failed check");
        }
        if (p.slab) {
          need(p.slab.at ?? "slab", "the slab");
          if (!factsMention(p.slab.value)) warn(shot, `slab value "${p.slab.value}" not found in facts.md`);
        }
        break;
      }
      case "StepList": {
        const items = p.items ?? [];
        if (!items.length || items.length > 5) err(shot, `${items.length} items (1-5)`);
        for (const it of items) {
          need(it.at, `item "${it.text}"`);
          if (it.icon) checkIcon(shot, it.icon);
        }
        // Same estimate as the template: the text shrinks so the longest item
        // stays on one line; warn only when that makes it small.
        const few = items.length <= 3;
        const room = 1600 - (few ? 104 + 44 : 88 + 40) - (items.some((it) => it.done) ? (few ? 64 + 44 : 56 + 40) : 0);
        const longest = items.reduce((a, it) => (norm(it.text).length > norm(a.text ?? "").length ? it : a), {});
        const px = Math.min(few ? 66 : 54, Math.floor(room / (Math.max(1, norm(longest.text ?? "").length) * 0.53)));
        if (longest.text && px < 36) warn(shot, `item "${longest.text}" makes the list ${px} px to stay on one line; shorten it`);
        break;
      }
      case "Lesson": {
        const lines = p.lines ?? [];
        if (lines.length < 1 || lines.length > 3) err(shot, `${lines.length} lines (2-3)`);
        lines.forEach((l, i) => {
          const text = typeof l === "string" ? l : l.text;
          const at = typeof l === "string" ? undefined : l.at;
          if (at) need(at, `line ${i + 1}`);
          else optional(`line${i + 1}`);
          if (words(text) > 6) warn(shot, `line "${text}" is over 6 words`);
        });
        for (const r of p.reminders ?? []) {
          need(r.at, `reminder "${r.text}"`);
          checkIcon(shot, r.icon);
        }
        if (p.keyword && !lines.some((l) => (typeof l === "string" ? l : l.text).toLowerCase().includes(p.keyword.toLowerCase()))) {
          warn(shot, `keyword "${p.keyword}" is not in any line`);
        }
        break;
      }
      case "Screenshot": {
        if (!p.src) err(shot, "props.src is required");
        else if (!existsSync(path.join(videoDir, "public", p.src))) err(shot, `public/${p.src} not found`);
        if (!Array.isArray(p.size) || p.size.length !== 2) err(shot, "props.size [width, height] of the image is required");
        for (const r of p.regions ?? []) {
          need(r.at, "a region");
          const [x, y, w, h] = r.box ?? [];
          if (p.size && (x < 0 || y < 0 || x + w > p.size[0] || y + h > p.size[1])) err(shot, `region ${JSON.stringify(r.box)} is outside the image`);
        }
        for (const q of p.pan ?? []) {
          need(q.at, "a pan");
          if (q.to?.[2] > 1.5) warn(shot, "pan scale over 1.5");
        }
        warn(shot, "Screenshot is not yet proven in a real video");
        break;
      }
      case "Custom": {
        const base = String(shot.component ?? "").replace(/^.*[\\/]/, "").replace(/\.tsx$/, "");
        if (!existsSync(path.join(videoDir, "src", "custom", `${base}.tsx`))) err(shot, `src/custom/${base}.tsx not found`);
        for (const name of Object.keys(beats)) used.add(name);
        break;
      }
      default:
        break;
    }
    for (const name of Object.keys(beats)) {
      if (!used.has(name)) warn(shot, `beat "${name}" is not used by the scene`);
    }
  }

  // Film-level rules.
  // The mirror (style rule 35): the first and the last slab pair their tones.
  const slabs = timeline.shots.filter((s) => s.props?.slab?.value);
  if (slabs.length >= 2) {
    const [a, b] = [slabs[0], slabs[slabs.length - 1]];
    const [ta, tb] = [a.props.slab.tone ?? "accent", b.props.slab.tone ?? "accent"];
    if (ta !== tb && !(ta === "negative" && tb === "positive")) {
      warn(null, `slab tones ${ta} (shot ${a.id}) and ${tb} (shot ${b.id}) do not pair: use the same tone, or negative then positive`);
    }
  }
  const types = new Set(timeline.shots.map((s) => s.transitionIn).filter(Boolean));
  if (types.size > 3) warn(null, `${types.size} transition types (two, at most three)`);
  for (const s of timeline.shots) {
    if (s.transitionIn === "fade-dark" && s.scene !== "Lesson") warn(null, `shot ${s.id}: fade-dark is meant only for the lesson card`);
  }
  let switches = 0;
  for (let i = 1; i < timeline.shots.length; i++) {
    if (timeline.shots[i - 1].theme === "light" && timeline.shots[i].theme === "dark") switches++;
  }
  const minutes = timeline.durationInFrames / fps / 60;
  if (switches > Math.max(3, 3 * minutes)) warn(null, `${switches} light-to-dark switches in ${minutes.toFixed(1)} min (at most 3 per minute)`);
  const lengthS = timeline.durationInFrames / fps;
  // storyboard.targetSeconds [min, max] is the length the user asked for;
  // without it the default 60-90 s applies. The fixed "a how-to is 60-90 s"
  // fired on every video a user asked to be 90-150 s (three test videos).
  const target = storyboard.targetSeconds;
  const asked = Array.isArray(target) && target.length === 2 && target.every((x) => Number.isFinite(x)) && target[0] < target[1];
  if (target !== undefined && !asked) err(null, "targetSeconds must be [min, max] in seconds, e.g. [90, 150]");
  if (asked) {
    if (lengthS < target[0] || lengthS > target[1]) warn(null, `the video lasts ${lengthS.toFixed(1)} s, outside the ${target[0]}-${target[1]} s asked for (targetSeconds)`);
  } else if (lengthS < 45) {
    warn(null, `the video lasts ${lengthS.toFixed(1)} s: a short video (see "Short video" in the make skill); if the user asked for this length, set targetSeconds in storyboard.json`);
  } else if (lengthS < 60 || lengthS > 90) {
    warn(null, `the video lasts ${lengthS.toFixed(1)} s, outside the default 60-90 s; if the user asked for another length, set targetSeconds in storyboard.json`);
  }
  if (storyboard.fps && storyboard.fps !== 30) warn(null, "fps is not 30");
  // An error, not a warning: a "no captions" wish must not reach the render unseen.
  const captions = captionsMismatch(videoDir, storyboard);
  if (captions) err(null, captions);
  if (voiceover.sentences?.length && !voiceover.sentences.every((s) => s.words?.length)) warn(null, "some sentences have no word timings");

  const report = {
    ok: errors.length === 0,
    videoDir: slash(videoDir),
    durationS: Number(lengthS.toFixed(2)),
    fps,
    shots: timeline.shots.map((s) => ({
      id: s.id,
      scene: s.scene,
      theme: s.theme,
      transitionIn: s.transitionIn,
      durationS: Number(s.durationS.toFixed(2)),
      beats: s.beatInfo.map((b) => ({ name: b.name, word: b.word, sentence: b.sentence, frame: b.frame, errorMs: b.errorMs })),
    })),
    errors,
    warnings,
  };
  writeJson(path.join(videoDir, "qa", "lint.json"), report);

  if (!args.quiet) {
    console.log(`video ${lengthS.toFixed(1)} s, ${timeline.shots.length} shots, ${timeline.sentences.length} sentences`);
    for (const s of report.shots) {
      console.log(`  ${s.id.padEnd(6)} ${s.scene.padEnd(13)} ${s.theme.padEnd(5)} ${String(s.durationS).padStart(5)} s  ${s.beats.length} beats`);
    }
  }
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.log(`ERROR: ${e}`);
  console.log(errors.length ? `lint failed: ${errors.length} error(s)` : `lint passed (${warnings.length} warning(s))`);
  process.exit(errors.length ? 1 : 0);
};

main();
