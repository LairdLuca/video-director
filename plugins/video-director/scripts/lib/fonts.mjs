// Fonts: the text font of the videos (config key "font").
//
// Inter is bundled (from the template's pinned npm package). Setup can also
// propose a few sans-serif fonts found on the machine, or take a font file
// the user names. The chosen files are copied into the video project and
// loaded from there, so the render needs no network and no system font
// lookup. Nothing here goes into the plugin repository.
//
// Font files are read with a small parser of the OpenType tables we need
// (name, OS/2, cmap, post, fvar); no dependency, no code from the font runs.

import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJson, slash } from "./common.mjs";

/** The system and user font folders of this OS. */
export const fontDirs = () => {
  const home = os.homedir();
  if (process.platform === "win32") {
    const win = process.env.WINDIR || process.env.SystemRoot || "C:\\Windows";
    const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return [path.join(win, "Fonts"), path.join(local, "Microsoft", "Windows", "Fonts")];
  }
  if (process.platform === "darwin") return ["/System/Library/Fonts", "/Library/Fonts", path.join(home, "Library", "Fonts")];
  const data = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
  return ["/usr/share/fonts", "/usr/local/share/fonts", path.join(data, "fonts"), path.join(home, ".fonts")];
};

// The full Latin alphabet: printable ASCII, the Latin-1 letters, Latin
// Extended-A (Central and Eastern European letters), typographic quotes,
// the ellipsis and the euro sign. U+0149 and U+017F are left out: deprecated
// or archaic, missing from many good fonts.
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const LATIN = [
  ...range(0x20, 0x7e),
  ...range(0xc0, 0xff).filter((c) => c !== 0xd7 && c !== 0xf7),
  ...range(0x100, 0x17e).filter((c) => c !== 0x149),
  0x2018, 0x2019, 0x201c, 0x201d, 0x2026, 0x20ac,
];

const readAt = (fd, offset, length) => {
  const buf = Buffer.alloc(length);
  const n = readSync(fd, buf, 0, length, offset);
  return n === length ? buf : buf.subarray(0, n);
};

const decodeName = (buf, platform) => {
  if (platform === 3 || platform === 0) {
    let out = "";
    for (let i = 0; i + 1 < buf.length; i += 2) out += String.fromCharCode(buf.readUInt16BE(i));
    return out;
  }
  return buf.toString("latin1");
};

/** name table: family (1), subfamily (2), typographic family (16) and subfamily (17), English first. */
const parseName = (buf) => {
  const count = buf.readUInt16BE(2);
  const strings = buf.readUInt16BE(4);
  const found = {};
  const rank = (p, e, l) => (p === 3 && l === 0x409 ? 0 : p === 3 ? 1 : p === 0 ? 2 : p === 1 && l === 0 ? 3 : 9);
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    if (r + 12 > buf.length) break;
    const [p, e, l, id, len, off] = [0, 2, 4, 6, 8, 10].map((k) => buf.readUInt16BE(r + k));
    if (![1, 2, 16, 17].includes(id)) continue;
    const score = rank(p, e, l);
    if (found[id] && found[id].score <= score) continue;
    const start = strings + off;
    if (start + len > buf.length) continue;
    found[id] = { score, text: decodeName(buf.subarray(start, start + len), p).trim() };
  }
  return { family: found[16]?.text || found[1]?.text || "", subfamily: found[17]?.text || found[2]?.text || "" };
};

/** cmap: the code point ranges the font maps (format 4 and 12 subtables). */
const parseCmap = (buf) => {
  const n = buf.readUInt16BE(2);
  const subs = [];
  for (let i = 0; i < n; i++) {
    const r = 4 + i * 8;
    subs.push({ p: buf.readUInt16BE(r), e: buf.readUInt16BE(r + 2), off: buf.readUInt32BE(r + 4) });
  }
  const pick = (want) => subs.find((s) => want(s) && s.off < buf.length && [4, 12].includes(buf.readUInt16BE(s.off)));
  const sub = pick((s) => s.p === 3 && s.e === 10) ?? pick((s) => s.p === 0) ?? pick((s) => s.p === 3 && s.e === 1);
  if (!sub) return [];
  const o = sub.off;
  const ranges = [];
  if (buf.readUInt16BE(o) === 12) {
    const groups = buf.readUInt32BE(o + 12);
    for (let g = 0; g < groups; g++) {
      const q = o + 16 + g * 12;
      if (q + 12 > buf.length) break;
      ranges.push([buf.readUInt32BE(q), buf.readUInt32BE(q + 4)]);
    }
    return ranges;
  }
  const segs = buf.readUInt16BE(o + 6) / 2;
  for (let k = 0; k < segs; k++) {
    const end = buf.readUInt16BE(o + 14 + k * 2);
    const start = buf.readUInt16BE(o + 16 + segs * 2 + k * 2);
    if (start !== 0xffff) ranges.push([start, end]);
  }
  return ranges;
};

/**
 * What a font file is: family, weight, italic, variable weight range,
 * sans-serif or not (PANOSE), monospaced, embedding restricted, and the
 * Latin code points it lacks. null for a file that is not a single TrueType
 * or OpenType font (a collection, a web font, a broken file).
 */
export const readFontInfo = (file) => {
  let fd;
  try {
    fd = openSync(file, "r");
    const head = readAt(fd, 0, 12);
    if (head.length < 12) return null;
    const version = head.readUInt32BE(0);
    if (![0x00010000, 0x4f54544f, 0x74727565].includes(version)) return null; // TrueType, "OTTO", "true"
    const numTables = head.readUInt16BE(4);
    const dir = readAt(fd, 12, numTables * 16);
    const tables = {};
    for (let i = 0; i < numTables; i++) {
      const r = i * 16;
      tables[dir.toString("latin1", r, r + 4)] = { offset: dir.readUInt32BE(r + 8), length: dir.readUInt32BE(r + 12) };
    }
    const table = (tag) => (tables[tag] ? readAt(fd, tables[tag].offset, tables[tag].length) : null);
    const name = table("name");
    const os2 = table("OS/2");
    const cmap = table("cmap");
    if (!name || !os2 || !cmap || os2.length < 64) return null;
    const { family, subfamily } = parseName(name);
    const panose = [...os2.subarray(32, 42)];
    const post = table("post");
    let wght = null;
    const fvar = table("fvar");
    if (fvar) {
      const axesOff = fvar.readUInt16BE(4);
      const axes = fvar.readUInt16BE(8);
      const size = fvar.readUInt16BE(10);
      for (let a = 0; a < axes; a++) {
        const q = axesOff + a * size;
        if (fvar.toString("latin1", q, q + 4) === "wght") {
          wght = { min: fvar.readInt32BE(q + 4) / 65536, max: fvar.readInt32BE(q + 12) / 65536 };
        }
      }
    }
    const ranges = parseCmap(cmap);
    const has = (cp) => ranges.some(([a, b]) => cp >= a && cp <= b);
    return {
      file: slash(file),
      family,
      subfamily,
      weight: os2.readUInt16BE(4),
      italic: Boolean(os2.readUInt16BE(62) & 1) || /italic|oblique/i.test(subfamily),
      wght,
      sans: panose[0] === 2 && panose[1] >= 11 && panose[1] <= 15,
      monospace: panose[3] === 9 || Boolean(post && post.length >= 16 && post.readUInt32BE(12)),
      // fsType bit 1: "restricted license embedding", the font's maker asks
      // that it not be embedded anywhere; such fonts are never proposed
      restricted: (os2.readUInt16BE(8) & 0x000f) === 0x0002,
      missing: LATIN.filter((cp) => !has(cp)),
    };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};

const listFiles = (dir, depth = 0, out = []) => {
  let names;
  try {
    names = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of names) {
    const p = path.join(dir, d.name);
    if (d.isDirectory() && depth < 4) listFiles(p, depth + 1, out);
    else if (d.isFile() && /\.(ttf|otf)$/i.test(d.name)) out.push(p);
  }
  return out;
};

// Families never proposed: symbols, icons, scripts and display faces, code
// fonts, and very narrow or very heavy cuts that come as families of their own.
const NOT_TEXT = /symbol|emoji|wingding|webding|dings|marlett|icon|mdl2|assets|script|hand|brush|stencil|display|condensed|narrow|compressed|black|heavy|mono|code|console|terminal/i;
// Families made for another writing system that also carry Latin letters.
const OTHER_SCRIPT = /phags|tai le|tai lue|yi baiti|himalaya|uighur|mongolian|javanese|myanmar|ebrima|gadugi|nirmala|leelawadee|malgun|yahei|jhenghei|meiryo|yu gothic|simsun|mingliu|batang|gulim|dotum|devanagari|bengali|tamil|telugu|kannada|malayalam|gujarati|gurmukhi|oriya|sinhala|khmer|lao|thai|arabic|hebrew|naskh|kufi|nastaliq|ethiopic|georgian|armenian|cherokee|(cjk|jp|kr|sc|tc)/i;

/** Every font family found in the font folders, with its upright files by weight. */
export const scanFamilies = () => {
  const families = new Map();
  for (const dir of fontDirs()) {
    for (const file of listFiles(dir)) {
      const info = readFontInfo(file);
      if (!info || !info.family) continue;
      const key = info.family.toLowerCase();
      if (!families.has(key)) families.set(key, { family: info.family, files: [] });
      families.get(key).files.push(info);
    }
  }
  return [...families.values()];
};

/**
 * The files to load for a family: one variable file with a weight axis that
 * spans 400-700, or the upright files nearest to 400, 600 and 700. A family
 * without an upright regular file is not usable.
 */
export const familyFiles = (fam) => {
  const upright = fam.files.filter((f) => !f.italic);
  const variable = upright.find((f) => f.wght && f.wght.min <= 400 && f.wght.max >= 700);
  if (variable) return [{ path: variable.file, weight: `${variable.wght.min} ${variable.wght.max}` }];
  const near = (target, lo, hi) =>
    upright
      .filter((f) => !f.wght && f.weight >= lo && f.weight <= hi)
      .sort((a, b) => Math.abs(a.weight - target) - Math.abs(b.weight - target))[0];
  const regular = near(400, 350, 450);
  if (!regular) return [];
  const out = [{ path: regular.file, weight: "400" }];
  const semibold = near(600, 550, 650);
  const bold = near(700, 651, 800);
  if (semibold) out.push({ path: semibold.file, weight: "600" });
  if (bold) out.push({ path: bold.file, weight: "700" });
  return out;
};

const describe = (fam) => {
  const files = familyFiles(fam);
  const used = fam.files.filter((f) => files.some((u) => u.path === f.file));
  return {
    family: fam.family,
    files,
    weights: files.map((f) => f.weight),
    sans: used.length > 0 && used.every((f) => f.sans),
    monospace: used.some((f) => f.monospace),
    restricted: used.some((f) => f.restricted),
    missing: [...new Set(used.flatMap((f) => f.missing))],
  };
};

/**
 * Fonts to propose at setup, best first: sans-serif, the full Latin
 * alphabet, a regular and a bold (a semibold, or a variable weight axis,
 * ranks higher: captions and labels use 600), not monospaced, embedding not
 * restricted, not a symbol, script or display face, not a family made for
 * another writing system. Inter itself is left out:
 * it is the bundled default.
 */
export const suggestFonts = (families = scanFamilies()) =>
  families
    .map(describe)
    .filter((d) => d.files.length >= 2 || (d.files.length === 1 && d.files[0].weight.includes(" ")))
    .filter((d) => d.sans && !d.monospace && !d.restricted && !d.missing.length)
    .filter((d) => !NOT_TEXT.test(d.family) && !OTHER_SCRIPT.test(d.family) && d.family.toLowerCase() !== "inter")
    .map((d) => ({ ...d, score: (d.weights.includes("600") || d.weights[0].includes(" ") ? 2 : 0) + (d.files.length >= 2 || d.weights[0].includes(" ") ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.family.localeCompare(b.family));

const FILE_EXT = /\.(ttf|otf|woff2?)$/i;
// A text font may lack a few of the LATIN letters (rare accented ones), not more.
export const MAX_MISSING_LATIN = 20;
const looksLikePath = (text) => /[\\/]/.test(text) || FILE_EXT.test(text);

/**
 * Check a value of the "font" key and return it as it is saved: "inter", an
 * absolute font file path, or a family name as the font spells it. Throws
 * with a message the config script prints.
 */
export const checkFontValue = (text) => {
  if (/^inter$/i.test(text)) return "inter";
  if (looksLikePath(text)) {
    const file = path.resolve(text.replace(/^~(?=[\\/])/, os.homedir()));
    if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`font: no file ${slash(file)}`);
    if (!FILE_EXT.test(file)) throw new Error("font: a .ttf, .otf, .woff or .woff2 file (not a collection, .ttc)");
    if (/\.(ttf|otf)$/i.test(file)) {
      const info = readFontInfo(file);
      if (!info) throw new Error(`font: ${slash(file)} is not a font file this plugin can read`);
      if (info.missing.length > MAX_MISSING_LATIN) throw new Error(`font: ${info.family || slash(file)} lacks ${info.missing.length} letters of the Latin alphabet`);
    }
    return slash(file);
  }
  const fam = scanFamilies().find((f) => f.family.toLowerCase() === text.toLowerCase());
  if (!fam) throw new Error(`font: no font family "${text}" in ${fontDirs().map(slash).join(", ")} (see: node fonts.mjs list)`);
  if (!familyFiles(fam).length) throw new Error(`font: "${fam.family}" has no upright regular file`);
  // The same test as for a file: a symbol font would draw the captions as
  // symbols (seen in a review: Wingdings passed as "usable").
  const missing = describe(fam).missing.length;
  if (missing > MAX_MISSING_LATIN) throw new Error(`font: "${fam.family}" lacks ${missing} letters of the Latin alphabet`);
  return fam.family;
};

/**
 * The files of a font value for one video: { name, files: [{ path, weight }],
 * warning }. Inter has no files here (the template's own). A family or a
 * file that is no longer there gives a warning and Inter.
 */
export const resolveFont = (value) => {
  const inter = { name: "Inter", files: [] };
  if (!value || /^inter$/i.test(value)) return inter;
  if (looksLikePath(value)) {
    if (!existsSync(value)) return { ...inter, warning: `font file ${value} not found: using Inter` };
    const info = /\.(ttf|otf)$/i.test(value) ? readFontInfo(value) : null;
    const weight = info?.wght ? `${info.wght.min} ${info.wght.max}` : "400";
    return { name: info?.family || path.basename(value).replace(FILE_EXT, ""), files: [{ path: slash(value), weight }] };
  }
  const fam = scanFamilies().find((f) => f.family.toLowerCase() === String(value).toLowerCase());
  const files = fam ? familyFiles(fam) : [];
  if (!files.length) return { ...inter, warning: `font "${value}" is not on this machine any more: using Inter` };
  return { name: fam.family, files };
};

const INTER_MODULE = [
  { file: "fonts/inter-latin-400-normal.woff2", weight: "400" },
  { file: "fonts/inter-latin-600-normal.woff2", weight: "600" },
  { file: "fonts/inter-latin-700-normal.woff2", weight: "700" },
];

/**
 * Copy the video's text font (video.config.json: fontFiles) into
 * public/fonts/text/ and write src/fonts.generated.ts, which theme.ts loads.
 * Without video.config.json, or with Inter, the module names the bundled
 * Inter files. The module is rewritten only when it changes, so a bundle is
 * not redone for nothing.
 */
export const writeFontModule = (videoDir) => {
  const cfgFile = path.join(videoDir, "video.config.json");
  const cfg = existsSync(cfgFile) ? readJson(cfgFile) : {};
  const wanted = Array.isArray(cfg.fontFiles) ? cfg.fontFiles : [];
  let name = "Inter";
  let files = INTER_MODULE;
  const missing = [];
  if (wanted.length) {
    const dir = path.join(videoDir, "public", "fonts", "text");
    mkdirSync(dir, { recursive: true });
    const copied = [];
    wanted.forEach((f, i) => {
      if (!existsSync(f.path)) return missing.push(f.path);
      const target = path.join(dir, `text-${i + 1}${path.extname(f.path).toLowerCase()}`);
      if (!existsSync(target) || statSync(target).size !== statSync(f.path).size) copyFileSync(f.path, target);
      copied.push({ file: `fonts/text/${path.basename(target)}`, weight: String(f.weight) });
    });
    if (copied.length && !missing.length) {
      name = cfg.fontName || "text font";
      files = copied;
    }
  }
  const body =
    `// Written by the video-director scripts from video.config.json ("font"); do not edit.\n` +
    `// The text font's files in public/, one per weight.\n` +
    `export const textFont = ${JSON.stringify({ name, files }, null, 2)};\n`;
  const out = path.join(videoDir, "src", "fonts.generated.ts");
  if (!existsSync(out) || readFileSync(out, "utf8") !== body) writeFileSync(out, body, "utf8");
  return { name, files, missing };
};
