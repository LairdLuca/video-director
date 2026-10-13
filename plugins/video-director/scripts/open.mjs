#!/usr/bin/env node
// open: at delivery, open the finished page (or the MP4 when there is no page) with the
// system's default program, so the user sees the result without looking for the file.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { die, IS_WIN, parseArgs, printHelp, readJson, resolveVideoDir, slash, slugOf } from "./lib/common.mjs";

const HELP = `
Usage: node open.mjs <videoDir> [--force] [--dry-run]

Opens the delivered result with the system's default program: out/<slug>.html
when the video has a page, otherwise out/<slug>.mp4. Run it once, as the last
step of a video, after the final review and OUTCOME.md.

It reads openOnDelivery from <videoDir>/video.config.json (default true) and
does nothing when it is false, unless --force is given (the user asked to open
it now). --dry-run prints what it would open and opens nothing.

It opens only a local file inside <videoDir>/out, never a URL and never a
server. It does not wait for the program it starts.
Exit code 0 when the file was opened or skipped, 1 if there is nothing
delivered to open, 2 on bad arguments.
`;

const args = parseArgs(process.argv.slice(2), { flags: ["force", "dry-run"] });
if (args.help) printHelp(HELP);
const videoDir = resolveVideoDir(args._[0]);
const slug = slugOf(videoDir);

const cfgFile = path.join(videoDir, "video.config.json");
const cfg = existsSync(cfgFile) ? readJson(cfgFile) : {};
if (cfg.openOnDelivery === false && !args.force) {
  console.log("openOnDelivery is false for this video: nothing opened (use --force if the user asks)");
  process.exit(0);
}

const outDir = path.join(videoDir, "out");
const page = path.join(outDir, `${slug}.html`);
const mp4 = path.join(outDir, `${slug}.mp4`);
const target = cfg.page !== false && existsSync(page) ? page : existsSync(mp4) ? mp4 : null;
if (!target) die(`nothing delivered to open in ${slash(outDir)} (render and page first)`, 1);

if (args["dry-run"]) {
  console.log(`would open ${slash(target)}`);
  process.exit(0);
}

// The default program for the file type; explorer.exe avoids cmd's own parsing of the path.
const [cmd, cmdArgs] = IS_WIN
  ? ["explorer.exe", [target]]
  : process.platform === "darwin"
    ? ["open", [target]]
    : ["xdg-open", [target]];

const child = spawn(cmd, cmdArgs, { detached: true, stdio: "ignore", windowsHide: false });
child.on("error", (e) => die(`could not open ${slash(target)}: ${e.message}; give the user the path`, 1));
child.on("spawn", () => {
  child.unref();
  console.log(`opened ${slash(target)}`);
});
