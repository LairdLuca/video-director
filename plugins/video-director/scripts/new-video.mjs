#!/usr/bin/env node
// new-video: create a video project from the template.
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { die, npmCli, parseArgs, printHelp, run, slash, TEMPLATE_DIR } from "./lib/common.mjs";

const HELP = `
Usage: node new-video.mjs <videosDir> <slug> [--no-install]

Creates <videosDir>/<slug>/ as a copy of the plugin's Remotion template,
installs its pinned dependencies with "npm ci --ignore-scripts" (lockfile,
exact versions, no install scripts run) and copies the bundled fonts
(Inter, JetBrains Mono, SIL OFL 1.1) into public/fonts/.

  <videosDir>    folder that holds the video projects (created if missing)
  <slug>         lowercase letters, digits and dashes, e.g. checkout-crashloop
  --no-install   copy only; run "npm ci --ignore-scripts" and this script again later

<videosDir>/<slug> may already exist when it holds only video.config.json, or
when it is a copy of the template whose npm ci failed or was skipped: then the
copy (if needed) and the install are finished, and nothing else is changed.

Network: npm downloads the pinned packages (or takes them from the npm cache).
Nothing else is downloaded here; Remotion fetches its own headless browser
(about 280 MB) on the first still or render.
`;

const FONTS = [
  ["@fontsource/inter", "inter-latin-400-normal.woff2"],
  ["@fontsource/inter", "inter-latin-600-normal.woff2"],
  ["@fontsource/inter", "inter-latin-700-normal.woff2"],
  ["@fontsource/jetbrains-mono", "jetbrains-mono-latin-400-normal.woff2"],
  ["@fontsource/jetbrains-mono", "jetbrains-mono-latin-700-normal.woff2"],
];

const SKIP = new Set(["node_modules", "out", "build", "qa"]);
// Written into node_modules after a successful npm ci; npm ci itself removes it.
const INSTALLED = ".video-director-npm-ci";

const copyFonts = (dir) => {
  const fontsDir = path.join(dir, "public", "fonts");
  mkdirSync(fontsDir, { recursive: true });
  for (const [pkg, file] of FONTS) {
    const src = path.join(dir, "node_modules", pkg, "files", file);
    if (!existsSync(src)) die(`font not found: ${slash(src)} (did npm ci run?)`);
    cpSync(src, path.join(fontsDir, file));
  }
  cpSync(path.join(dir, "node_modules", "@fontsource/inter", "LICENSE"), path.join(fontsDir, "LICENSE-inter.txt"));
  cpSync(path.join(dir, "node_modules", "@fontsource/jetbrains-mono", "LICENSE"), path.join(fontsDir, "LICENSE-jetbrains-mono.txt"));
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2), { flags: ["no-install"] });
  if (args.help) printHelp(HELP);
  const [videosDir, slug] = args._;
  if (!videosDir || !slug) die("usage: node new-video.mjs <videosDir> <slug> (see --help)");
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) die(`slug "${slug}": use lowercase letters, digits and dashes`);

  const dir = path.resolve(videosDir, slug);
  // A folder that holds only video.config.json (config.mjs video ran first)
  // is still new; a project copy whose npm ci failed is finished, not refused.
  const fresh = !existsSync(dir) || readdirSync(dir).every((name) => name === "video.config.json");
  const installed = existsSync(path.join(dir, "node_modules", INSTALLED));
  if (!fresh && !existsSync(path.join(dir, "package.json"))) die(`${slash(dir)} exists and is not empty`);

  if (fresh) {
    mkdirSync(dir, { recursive: true });
    cpSync(TEMPLATE_DIR, dir, {
      recursive: true,
      filter: (src) => !SKIP.has(path.basename(src)) || path.dirname(src) !== TEMPLATE_DIR,
    });
    for (const sub of ["public/voice", "qa", "out"]) mkdirSync(path.join(dir, sub), { recursive: true });
    writeFileSync(path.join(dir, ".gitignore"), "node_modules/\nout/\nqa/bundle/\nqa/voice-try/\n", "utf8");
    console.log(`created ${slash(dir)}`);
  } else {
    console.log(`${slash(dir)} already exists: finishing the install only`);
  }

  if (args["no-install"]) {
    console.log("skipped npm ci (--no-install)");
    return;
  }
  if (!installed) {
    const cli = npmCli();
    const npmArgs = ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"];
    const t0 = Date.now();
    const r = cli
      ? await run(process.execPath, [cli, ...npmArgs], { cwd: dir })
      : await run("npm", npmArgs, { cwd: dir, shell: true });
    if (r.code !== 0) die(`npm ci failed in ${slash(dir)} (exit ${r.code}); run this script again to retry`, 1);
    writeFileSync(path.join(dir, "node_modules", INSTALLED), `${new Date().toISOString()}\n`, "utf8");
    console.log(`npm ci done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  copyFonts(dir);
  console.log("fonts copied to public/fonts");
  console.log(`next: write facts.md and script.json in ${slash(dir)}, run voice.mjs (it writes voiceover.json), then write storyboard.json`);
};

main();
