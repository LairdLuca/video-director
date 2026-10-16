#!/usr/bin/env node
// fonts: the text fonts setup can propose, and checks of a font the user names.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { die, parseArgs, printHelp, slash } from "./lib/common.mjs";
import { checkFontValue, fontDirs, readFontInfo, scanFamilies, suggestFonts } from "./lib/fonts.mjs";

const HELP = `
Usage:
  node fonts.mjs list [--all] [--json]
  node fonts.mjs check <family | file>

  list    the sans-serif fonts of this machine that can be the videos' text
          font, best first: the full Latin alphabet, a regular and a bold
          (a semibold or a variable weight ranks higher), not monospaced,
          embedding not restricted by the font's maker, not a symbol, script
          or display face. Inter is bundled and always available, so it is
          not listed. --all lists every family found, with why it is left out.
  check   check a family name or a font file as the "font" key would, and
          print what would be used

Reads the system and user font folders of this OS (fonts are never
downloaded, and nothing is installed). The chosen font is copied into each
video project and loaded from there.
`;

const main = () => {
  const args = parseArgs(process.argv.slice(2), { flags: ["all", "json"] });
  if (args.help) printHelp(HELP);
  const [cmd, ...rest] = args._;
  if (cmd === "list") {
    const families = scanFamilies();
    const suggested = suggestFonts(families);
    if (args.json) {
      console.log(JSON.stringify({ dirs: fontDirs().map(slash), suggested }, null, 2));
      return;
    }
    console.log(`font folders: ${fontDirs().map(slash).join(", ")}`);
    console.log(`${families.length} families found, ${suggested.length} suitable:`);
    for (const s of suggested) console.log(`  ${s.family.padEnd(28)} weights ${s.weights.join(", ")}`);
    if (args.all) {
      const ok = new Set(suggested.map((s) => s.family));
      for (const f of families.filter((x) => !ok.has(x.family)).sort((a, b) => a.family.localeCompare(b.family))) {
        const files = f.files.filter((x) => !x.italic);
        const why = [];
        if (!files.length) why.push("italic only");
        if (files.length && !files.every((x) => x.sans)) why.push("not sans-serif (or unknown)");
        if (files.some((x) => x.monospace)) why.push("monospaced");
        if (files.some((x) => x.restricted)) why.push("embedding restricted");
        if (files.some((x) => x.missing.length)) why.push(`lacks ${Math.max(...files.map((x) => x.missing.length))} Latin letters`);
        console.log(`  - ${f.family}: ${why.join(", ") || "no regular and bold, or a symbol, script, display or code face"}`);
      }
    }
    return;
  }
  if (cmd === "check") {
    const value = rest.join(" ");
    if (!value) die("usage: node fonts.mjs check <family | file>");
    let saved;
    try {
      saved = checkFontValue(value);
    } catch (e) {
      die(e.message, 1);
    }
    console.log(`font=${saved}`);
    if (/\.(ttf|otf)$/i.test(saved)) {
      const info = readFontInfo(saved);
      console.log(`  family ${info.family}, weight ${info.wght ? `${info.wght.min}-${info.wght.max} (variable)` : info.weight}, ${info.sans ? "sans-serif" : "not marked sans-serif"}`);
      if (!info.wght) console.log("  one file: other weights (600, 700) are drawn by the browser from it");
      if (info.restricted) console.log("  warning: the font's maker restricts embedding it; check its licence before using it in a video");
      if (info.missing.length) console.log(`  warning: lacks ${info.missing.length} Latin letters: ${info.missing.slice(0, 12).map((c) => String.fromCodePoint(c)).join(" ")}`);
    } else if (saved !== "inter" && !/\.(woff2?)$/i.test(saved)) {
      const s = suggestFonts().find((x) => x.family === saved);
      console.log(s ? `  suitable, weights ${s.weights.join(", ")}` : "  usable, but not among the suggested fonts (see: node fonts.mjs list --all)");
    }
    return;
  }
  die("usage: node fonts.mjs list|check (see --help)");
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
