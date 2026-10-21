#!/usr/bin/env node
// shots: real screenshots for the Screenshot scene. Imports images (with the
// boxes a test suite measured), captures a site with Remotion's own headless
// browser, covers sensitive data in the pixels, and keeps shots.json.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { die, parseArgs, printHelp, readJson, resolveVideoDir, slash } from "./lib/common.mjs";
import { isLoopback, readEnvFile, renderGrid, runCapture } from "./lib/capture.mjs";
import { checkName, imageSize, loadShots, nameFromFile, parseBox, saveShots, sha256, writePng } from "./lib/shots.mjs";

const HELP = `
Usage:
  node shots.mjs import  <videoDir> <image>... [--name <n>] [--boxes <file>]
  node shots.mjs capture <videoDir> <capture.json> [--env-file <file>] [--allow-host <h>[,<h>]] [--storage-state <file>]
  node shots.mjs mask    <videoDir> <name> <x,y,w,h>... --why "<what is covered>"
  node shots.mjs box     <videoDir> <name> <box name> <x,y,w,h>
  node shots.mjs grid    <videoDir> <name> [--crop x,y,w,h] [--step 50]
  node shots.mjs review  <videoDir> <name>... [--undo]
  node shots.mjs list    <videoDir>

Screenshots of an application or a site for the Screenshot scene. Every
image lives in <videoDir>/public/shots/<name>.png and has an entry in
<videoDir>/shots.json: size, boxes by name (with where each was measured),
the masks drawn into it, where it came from, its sha256, and "reviewed".
The scene refers to a box by name ("ref"), so a box is measured, not guessed.

  import   copies images (PNG, JPEG, WebP) as PNG and reads their size. A
           <image>.boxes.json next to an image (or --boxes, for one image)
           gives boxes measured by a test suite and masks to draw:
             { "size": [w, h], "boxes": { "search": [x, y, w, h] },
               "mask": [[x, y, w, h]] }
           The original is read only, never changed.
  capture  opens a site with playwright-core on Remotion's headless browser
           (the one the stills use), runs the steps of capture.json, and
           for each shot measures the boxes of its CSS selectors and covers
           its "mask" selectors and every text that looks like personal or
           secret data (emails, IBANs, card and long numbers, IP addresses,
           phones, tax codes, tokens) before the screenshot is taken: the
           uncovered pixels never reach the disk. Only the host of "base"
           and the allowed hosts are reached; other requests are blocked and
           counted. Secrets come only from "env" variable names: from the
           environment or from --env-file (X=Y, set X=Y, export X=Y), read
           by this script and never printed. A site behind SSO or MFA: a
           --storage-state file the user saved, or import their screenshots.
  mask     covers boxes of an image with a solid fill, in its pixels.
  box      records a box measured by eye (source "measured").
  grid     writes qa/grid-<name>.png: the image with a labelled grid (in
           image pixels) and its boxes, enlarged with --crop, to measure.
  review   marks images as looked at by Claude and approved (the lint
           refuses a Screenshot whose image is not reviewed); --undo clears.
  list     prints the images, their boxes, masks and review state.

capture.json:
  { "base": "https://localhost:8443", "viewport": [1600, 900],
    "allowHosts": [], "ignoreHttpsErrors": false,
    "login": [ { "goto": "/login" }, { "fill": "#user", "env": "APP_USER" },
               { "fill": "#password", "env": "APP_PASSWORD" },
               { "click": "button[type=submit]" }, { "waitFor": "nav" } ],
    "shots": [ { "name": "orders", "steps": [ { "goto": "/orders" }, { "click": "#search" },
                 { "waitFor": "table tbody tr" } ],
                 "boxes": { "search": "#search", "grid": "table" },
                 "mask": [ "td.customer" ], "autoMask": true } ] }
  Steps: goto, click, fill (+ text or env), press (+ on), select (+ value),
  hover, scroll, waitFor, wait (ms, at most 10000). Any step takes
  "timeout" (ms, default 15000, at most 300000: a first login after the
  app starts can be slow) and "ifVisible" (a selector: the step runs only
  when it is on the page, as a login form some installs do not show). The
  viewport is the image size: 1600x900 fits a 16:9 frame, 900x1600 a 9:16 one.

Writes only inside <videoDir>. Exit code 0 on success, 1 on a failure, 2 on
bad arguments.
`;

const SUB = ["import", "capture", "mask", "box", "grid", "review", "list"];

const main = async () => {
  const args = parseArgs(process.argv.slice(2), { flags: ["undo"] });
  if (args.help || !args._.length) printHelp(HELP);
  const [cmd, dir, ...rest] = args._;
  if (!SUB.includes(cmd)) die(`unknown command "${cmd}" (${SUB.join(", ")})`);
  const videoDir = resolveVideoDir(dir);
  const data = loadShots(videoDir);
  const shotsDir = path.join(videoDir, "public", "shots");
  mkdirSync(shotsDir, { recursive: true });
  const entry = (name) => data.shots[name] ?? die(`no image "${name}" in shots.json (${Object.keys(data.shots).join(", ") || "none yet"})`);

  if (cmd === "import") {
    if (!rest.length) die("import: give at least one image");
    if (args.name && rest.length > 1) die("--name is for one image");
    if (args.boxes && rest.length > 1) die("--boxes is for one image");
    for (const src of rest) {
      const abs = path.resolve(src);
      if (!existsSync(abs)) die(`${slash(abs)} not found`);
      const name = checkName(args.name ?? nameFromFile(abs));
      const size = imageSize(abs);
      const sidecar = args.boxes ? path.resolve(args.boxes) : [`${abs}.boxes.json`, abs.replace(/\.[^.]+$/, ".boxes.json")].find(existsSync);
      const side = sidecar ? readJson(sidecar) : {};
      if (side.size && (side.size[0] !== size[0] || side.size[1] !== size[1])) die(`${slash(sidecar)} is for a ${side.size.join("x")} image; this one is ${size.join("x")}`);
      const boxes = {};
      for (const [k, b] of Object.entries(side.boxes ?? {})) boxes[checkName(k, "box name")] = { box: parseBox(b.join(","), size, `box "${k}"`), source: "import" };
      const masks = (side.mask ?? []).map((b) => ({ box: parseBox(b.join(","), size, "mask"), by: "import", why: "listed in the boxes file" }));
      const out = path.join(shotsDir, `${name}.png`);
      writePng(abs, out, masks.map((m) => m.box));
      data.shots[name] = { file: `shots/${name}.png`, size, origin: "import", from: slash(abs), sha256: sha256(out), boxes, masks, reviewed: false };
      console.log(`imported ${name}: ${size.join("x")}, ${Object.keys(boxes).length} boxes${sidecar ? ` from ${path.basename(sidecar)}` : ""}, ${masks.length} masks`);
    }
  } else if (cmd === "capture") {
    const cfgFile = rest[0] ? path.resolve(rest[0]) : die("capture: give the capture.json file");
    const cfg = readJson(cfgFile);
    const secrets = args["env-file"] ? readEnvFile(path.resolve(args["env-file"])) : {};
    const allowHosts = String(args["allow-host"] ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    const storageState = args["storage-state"] ?? (cfg.storageState ? path.resolve(path.dirname(cfgFile), cfg.storageState) : undefined);
    if (storageState && !existsSync(storageState)) die(`storage state ${slash(storageState)} not found`);
    const host = new URL(cfg.base).hostname;
    console.log(`capturing ${cfg.shots?.length ?? 0} shots from ${isLoopback(host) ? "a local site" : `the remote site ${host}`}${cfg.ignoreHttpsErrors ? " (certificate errors ignored, as capture.json asks)" : ""}`);
    const res = await runCapture(videoDir, cfg, { secrets, allowHosts, storageState });
    let missing = 0;
    for (const s of res.shots) {
      const out = path.join(shotsDir, `${s.name}.png`);
      writeFileSync(out, s.png);
      const boxes = Object.fromEntries(Object.entries(s.boxes).map(([k, box]) => [k, { box, source: "selector" }]));
      data.shots[s.name] = { file: `shots/${s.name}.png`, size: s.size, origin: "capture", from: `${cfg.base.replace(/\/+$/, "")}${s.url}`, sha256: sha256(out), boxes, masks: s.masks, reviewed: false };
      const auto = s.masks.filter((m) => m.by === "auto");
      const kinds = [...new Set(auto.map((m) => m.why))];
      console.log(`  ${s.name}: ${s.size.join("x")}, ${Object.keys(boxes).length} boxes, ${s.masks.length} masks (${auto.length} automatic${kinds.length ? `: ${kinds.join(", ")}` : ""})`);
      for (const m of s.missing) console.log(`    box not found or not visible: ${m}`);
      missing += s.missing.length;
    }
    const hosts = Object.entries(res.blocked);
    console.log(hosts.length ? `blocked requests: ${hosts.map(([h, n]) => `${h} ${n}`).join(", ")}` : "blocked requests: none");
    if (res.errors.length) console.log(`page script errors: ${res.errors.length} (first: ${res.errors[0]})`);
    if (missing) console.log(`${missing} boxes missing: fix the selectors, or measure them with grid and box`);
  } else if (cmd === "mask") {
    const [name, ...boxes] = rest;
    const s = entry(name);
    if (!boxes.length) die("mask: give at least one x,y,w,h");
    if (!args.why) die('mask: say what is covered with --why ("customer names")');
    const add = boxes.map((b) => ({ box: parseBox(b, s.size, "mask"), by: "claude", why: String(args.why) }));
    const file = path.join(videoDir, "public", s.file);
    writePng(file, file, add.map((m) => m.box));
    s.masks = [...(s.masks ?? []), ...add];
    s.sha256 = sha256(file);
    s.reviewed = false;
    console.log(`${name}: ${add.length} masks drawn (${s.masks.length} in all); review it again`);
  } else if (cmd === "box") {
    const [name, boxName, text] = rest;
    const s = entry(name);
    checkName(boxName, "box name");
    s.boxes = { ...(s.boxes ?? {}), [boxName]: { box: parseBox(text, s.size, `box "${boxName}"`), source: "measured" } };
    console.log(`${name}: box "${boxName}" = ${s.boxes[boxName].box.join(",")} (measured)`);
  } else if (cmd === "grid") {
    const [name] = rest;
    const s = entry(name);
    const crop = args.crop ? parseBox(args.crop, s.size, "crop") : undefined;
    const step = Number(args.step ?? 50);
    if (!(step >= 10 && step <= 500)) die("--step is 10-500 px");
    const { png, scale } = await renderGrid(videoDir, path.join(videoDir, "public", s.file), s.size, { crop, step, boxes: s.boxes });
    const out = path.join(videoDir, "qa", `grid-${name}${crop ? "-crop" : ""}.png`);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, png);
    console.log(`${slash(out)} (grid every ${step} px, labels in image pixels, shown at ${scale.toFixed(2)}x)`);
  } else if (cmd === "review") {
    if (!rest.length) die("review: give the names of the images looked at");
    for (const name of rest) {
      const s = entry(name);
      const file = path.join(videoDir, "public", s.file);
      if (!existsSync(file) || sha256(file) !== s.sha256) die(`${name}: public/${s.file} changed since shots.mjs wrote it; import or capture it again`, 1);
      s.reviewed = !args.undo;
      console.log(`${name}: ${s.reviewed ? "reviewed" : "not reviewed"}`);
    }
  } else if (cmd === "list") {
    const all = Object.entries(data.shots);
    if (!all.length) console.log("no images yet");
    for (const [name, s] of all) {
      const boxes = Object.entries(s.boxes ?? {}).map(([k, b]) => `${k}${b.source === "measured" ? "*" : ""}`);
      console.log(`${name}: ${s.file} ${s.size.join("x")}, ${s.origin}, ${s.reviewed ? "reviewed" : "NOT reviewed"}, masks ${s.masks?.length ?? 0}, boxes ${boxes.join(" ") || "none"}`);
    }
    if (all.some(([, s]) => Object.values(s.boxes ?? {}).some((b) => b.source === "measured"))) console.log("* measured by eye");
    return;
  }
  saveShots(videoDir, data);
};

main().catch((e) => die(e?.stack ?? String(e), 1));
