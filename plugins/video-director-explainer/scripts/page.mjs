#!/usr/bin/env node
// page: build the self-contained HTML page that goes next to the video, from page.json.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { die, parseArgs, printHelp, readJson, resolveVideoDir, slash, slugOf } from "./lib/common.mjs";

const HELP = `
Usage: node page.mjs <videoDir> [--out <file.html>]

Builds out/<slug>.html from <videoDir>/page.json (contract D, see
skills/make/references/page.md): title and short explanation, the video
(linked with a relative path, not embedded), one section per chapter with
the commands and values shown in the video and their sources, the
decisions to take (only if page.json has any) and the transcript in a
collapsed block.

Before writing, every "facts.md:N" source is checked against facts.md (the
line must exist and not be blank), and commands, values and numbers of 3 or
more digits on the page are looked up in facts.md; misses are warnings. A
number of a section's text that facts.md has, but that no command, value
or "source" of the section backs, is a warning too.

The page is one file: inline CSS, no script, no CDN, no web font, no
network; light and dark theme with the video palette; readable at phone
width; works from file://.
Exit code 0 on success, 1 if page.json is invalid, 2 on bad arguments.
`;

const LABELS = {
  it: { video: "Video", description: "Descrizione", decisions: "Decisioni da prendere", transcript: "Trascrizione", source: "fonte", owner: "decide", options: "Opzioni", proposal: "Proposta, da confermare", noOptions: "Le fonti non danno opzioni.", noVideo: "Il tuo browser non riproduce questo video:" },
  en: { video: "Video", description: "Description", decisions: "Decisions to take", transcript: "Transcript", source: "source", owner: "decides", options: "Options", proposal: "Proposal, to be confirmed", noOptions: "The sources give no options.", noVideo: "Your browser cannot play this video:" },
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Escaped text where `code` spans become <code>. */
const inline = (s) =>
  esc(s).replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);

const paragraphs = (body) => (Array.isArray(body) ? body : String(body ?? "").split(/\n{2,}/)).filter((p) => String(p).trim());

/** Check contract D; returns a list of problems. */
export const validatePage = (page) => {
  const errors = [];
  const str = (v) => typeof v === "string" && v.trim().length > 0;
  if (!str(page.title)) errors.push("title is required");
  if (!str(page.language)) errors.push("language is required (e.g. it, en)");
  if (!str(page.summary)) errors.push("summary is required (one paragraph)");
  if (!str(page.video)) errors.push("video is required (relative path, e.g. my-video.mp4)");
  else if (/^[a-z]+:\/\//i.test(page.video) || /^[a-z]:/i.test(page.video) || /^[\\/]/.test(page.video)) {
    errors.push("video must be a relative path (no URL, no drive letter, no leading slash)");
  }
  if (!Array.isArray(page.sections) || !page.sections.length) errors.push("sections must list the chapters");
  (page.sections ?? []).forEach((s, i) => {
    if (!str(s.heading)) errors.push(`sections[${i}].heading is required`);
    if (!paragraphs(s.body).length) errors.push(`sections[${i}].body is required`);
    (s.commands ?? []).forEach((c, k) => {
      if (!str(c.text)) errors.push(`sections[${i}].commands[${k}].text is required`);
      if (!str(c.source)) errors.push(`sections[${i}].commands[${k}].source is required (e.g. facts.md:14)`);
    });
    if (s.source !== undefined && !str(s.source)) errors.push(`sections[${i}].source must be text (e.g. facts.md:74-75), or left out`);
    if (s.values !== undefined && !Array.isArray(s.values)) errors.push(`sections[${i}].values must be a list`);
    (Array.isArray(s.values) ? s.values : []).forEach((v, k) => {
      if (!str(v.text)) errors.push(`sections[${i}].values[${k}].text is required`);
      if (!str(v.source)) errors.push(`sections[${i}].values[${k}].source is required (e.g. facts.md:14)`);
    });
  });
  if (page.decisions !== undefined) {
    if (!Array.isArray(page.decisions)) errors.push("decisions must be a list (omit it when there are none)");
    (page.decisions ?? []).forEach((d, i) => {
      if (!str(d.question)) errors.push(`decisions[${i}].question is required`);
      // 0 options: the sources name the decision but no choices; 1: a
      // proposal waiting for confirmation. Asking for 2 pushed test runs to
      // invent an alternative or to move the decision into prose.
      if (d.options !== undefined && !Array.isArray(d.options)) errors.push(`decisions[${i}].options must be a list (empty when the sources give none)`);
      const opts = Array.isArray(d.options) ? d.options : [];
      opts.forEach((o, k) => {
        if (!str(o.label)) errors.push(`decisions[${i}].options[${k}].label is required`);
        if (opts.length > 1 && !str(o.tradeoff)) errors.push(`decisions[${i}].options[${k}].tradeoff is required when there are 2 or more options`);
      });
      if (!str(d.owner)) errors.push(`decisions[${i}].owner is required (who decides)`);
      if (!str(d.source)) errors.push(`decisions[${i}].source is required`);
    });
  }
  const t = page.transcript;
  const tOk = str(t) || (Array.isArray(t) && t.length && t.every((x) => str(x) || (x && str(x.text))));
  if (!tOk) errors.push("transcript is required (string, list of strings, or list of { chapter, text })");
  return errors;
};

const CSS = `
:root{--bg:#F6F7F9;--bg-alt:#ECEEF2;--card:#FFFFFF;--ink:#151821;--muted:#5F6675;--hairline:#DADDE3;--accent:#2563EB;--positive:#15803D;--warning:#B45309;--code-bg:#14161C;--code-ink:#E6E8EE;--code-dim:#8B93A3}
@media (prefers-color-scheme: dark){:root{--bg:#0B1120;--bg-alt:#131A2E;--card:#131A2E;--ink:#EEF1F6;--muted:#9AA3B2;--hairline:#2A3247;--accent:#60A5FA;--positive:#4ADE80;--warning:#FBBF24}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-variant-numeric:tabular-nums}
main{max-width:860px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:clamp(1.6rem,4.5vw,2.3rem);line-height:1.2;margin:0 0 12px}
h2{font-size:1.35rem;margin:48px 0 12px}
h3{font-size:1.1rem;margin:28px 0 6px}
p{margin:0 0 12px}
.summary{font-size:1.1rem;color:var(--ink)}
.eyebrow{display:block;font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-top:28px}
.eyebrow+h3{margin-top:2px}
video{display:block;width:auto;max-width:100%;max-height:80vh;height:auto;border-radius:12px;background:#000;margin:20px auto 4px}
code{font-family:ui-monospace,"Cascadia Mono",Consolas,"JetBrains Mono",Menlo,monospace;font-size:.92em;background:var(--bg-alt);padding:.1em .35em;border-radius:5px}
pre{margin:10px 0 2px;padding:14px 16px;background:var(--code-bg);color:var(--code-ink);border-radius:10px;overflow-x:auto;line-height:1.5}
pre code{background:none;padding:0;color:inherit;font-size:.9rem;white-space:pre}
.src{font-size:.8rem;color:var(--muted);margin:2px 0 12px}
.decision{background:var(--card);border:1px solid var(--hairline);border-radius:12px;padding:16px 18px;margin:14px 0}
.decision h3{margin-top:0}
.decision ul{margin:8px 0;padding-left:20px}
.decision li{margin:6px 0}
.meta{font-size:.85rem;color:var(--muted)}
dl.values{margin:10px 0 12px;display:grid;grid-template-columns:max-content 1fr;gap:4px 14px}
dl.values dt{font-weight:700}
dl.values dd{margin:0}
dl.values .src{margin:0 0 0 6px}
details{background:var(--card);border:1px solid var(--hairline);border-radius:12px;padding:12px 16px;margin-top:48px}
summary{cursor:pointer;font-weight:700}
details p{margin:10px 0}
a{color:var(--accent)}
`;

export const renderPage = (page, { chapterLabels = new Map() } = {}) => {
  const L = LABELS[String(page.language).slice(0, 2)] ?? LABELS.en;
  const out = [];
  out.push("<!doctype html>", `<html lang="${esc(page.language)}">`, "<head>", '<meta charset="utf-8">');
  out.push('<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="color-scheme" content="light dark">');
  out.push(`<title>${esc(page.title)}</title>`, `<style>${CSS.trim()}</style>`, "</head>", "<body>", "<main>");
  out.push(`<h1>${esc(page.title)}</h1>`);
  for (const p of paragraphs(page.summary)) out.push(`<p class="summary">${inline(p)}</p>`);
  out.push(
    `<video src="${esc(page.video)}" controls preload="metadata" playsinline>${esc(L.noVideo)} <a href="${esc(page.video)}">${esc(page.video)}</a></video>`,
  );
  out.push(`<h2>${esc(L.description)}</h2>`);
  for (const s of page.sections) {
    if (s.chapter) out.push(`<span class="eyebrow">${esc(chapterLabels.get(s.chapter) ?? s.chapter)}</span>`);
    out.push(`<h3>${esc(s.heading)}</h3>`);
    for (const p of paragraphs(s.body)) out.push(`<p>${inline(p)}</p>`);
    // A section of prose only (a lesson) has its own source line
    if (typeof s.source === "string" && s.source.trim()) out.push(`<p class="src">${esc(L.source)}: ${esc(s.source)}</p>`);
    for (const c of s.commands ?? []) {
      out.push(`<pre><code>${esc(c.text)}</code></pre>`, `<p class="src">${esc(L.source)}: ${esc(c.source)}</p>`);
    }
    if (Array.isArray(s.values) && s.values.length) {
      out.push('<dl class="values">');
      for (const v of s.values) {
        out.push(`<dt>${v.label ? inline(v.label) : ""}</dt>`, `<dd>${inline(v.text)} <span class="src">${esc(L.source)}: ${esc(v.source)}</span></dd>`);
      }
      out.push("</dl>");
    }
  }
  if (Array.isArray(page.decisions) && page.decisions.length) {
    out.push(`<h2>${esc(L.decisions)}</h2>`);
    for (const d of page.decisions) {
      const opts = Array.isArray(d.options) ? d.options : [];
      out.push('<div class="decision">', `<h3>${inline(d.question)}</h3>`);
      if (!opts.length) out.push(`<p class="meta">${esc(L.noOptions)}</p>`);
      else {
        out.push(`<p class="meta">${esc(opts.length === 1 ? L.proposal : L.options)}</p>`, "<ul>");
        for (const o of opts) out.push(`<li><strong>${inline(o.label)}</strong>${o.tradeoff ? `: ${inline(o.tradeoff)}` : ""}</li>`);
        out.push("</ul>");
      }
      if (d.note) out.push(`<p>${inline(d.note)}</p>`);
      out.push(`<p class="meta">${esc(L.owner)}: ${esc(d.owner)} · ${esc(L.source)}: ${esc(d.source)}</p>`, "</div>");
    }
  }
  out.push("<details>", `<summary>${esc(L.transcript)}</summary>`);
  const t = typeof page.transcript === "string" ? paragraphs(page.transcript) : page.transcript;
  for (const x of t) out.push(typeof x === "string" ? `<p>${esc(x)}</p>` : `<p>${x.chapter ? `<strong>${esc(chapterLabels.get(x.chapter) ?? x.chapter)}</strong> ` : ""}${esc(x.text)}</p>`);
  out.push("</details>", "</main>", "</body>", "</html>", "");
  return out.join("\n");
};

/**
 * Page text against facts.md, as warnings: "facts.md:N" sources that point
 * at no line or a blank one, commands and values not found in facts.md, and
 * numbers of 3 or more digits that facts.md never writes. A final review
 * found four page statements with no fact behind them that no check saw.
 */
export const checkAgainstFacts = (page, videoDir) => {
  const file = path.join(videoDir, "facts.md");
  if (!existsSync(file)) return ["facts.md not found: sources and values not checked"];
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const flat = (s) => String(s ?? "").replace(/`|\*\*|__/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const all = flat(lines.join("\n"));
  const allDigits = all.replace(/[.,]/g, "");
  const out = [];
  const sources = [];
  const texts = [page.title, ...paragraphs(page.summary)];
  for (const s of page.sections ?? []) {
    texts.push(s.heading, ...paragraphs(s.body));
    if (typeof s.source === "string") sources.push(s.source);
    // A number the section states with no source of its own: facts.md has
    // it, but the reader cannot see where from (seen in a review: 503 and
    // 200 in a section body, with no values)
    if (typeof s.source !== "string" || !s.source.trim()) {
      // Backed: in a command or value of the section, or on a facts.md line
      // one of them cites
      const items = [...(s.commands ?? []), ...(Array.isArray(s.values) ? s.values : [])];
      const cited = items.flatMap((x) => [...String(x.source ?? "").matchAll(/facts\.md:(\d+)(?:-(\d+))?/g)])
        .flatMap((m) => lines.slice(Number(m[1]) - 1, Number(m[2] ?? m[1])));
      const backed = flat([...items.map((x) => x.text), ...cited].join(" "));
      for (const t of [s.heading, ...paragraphs(s.body)]) {
        for (const m of String(t ?? "").matchAll(/\d(?:[\d.,]*\d)?/g)) {
          const num = m[0];
          if (num.replace(/\D/g, "").length >= 3 && all.includes(num.toLowerCase()) && !backed.includes(num.toLowerCase())) {
            out.push(`number ${num} in section "${s.heading}" has no source there: add it to the section's values with its source, or give the section a source`);
          }
        }
      }
    }
    for (const c of s.commands ?? []) {
      sources.push(c.source);
      const shown = String(c.text ?? "").split(/\r?\n/).map((l) => l.replace(/^\$\s+/, "")).filter((l) => l.trim());
      for (const l of shown) if (!all.includes(flat(l))) out.push(`command line not in facts.md: "${l.trim()}"`);
    }
    for (const v of Array.isArray(s.values) ? s.values : []) {
      sources.push(v.source);
      if (!all.includes(flat(v.text))) out.push(`value not in facts.md: "${v.text}"`);
    }
  }
  for (const d of page.decisions ?? []) {
    sources.push(d.source);
    texts.push(d.question, d.note, ...(Array.isArray(d.options) ? d.options : []).flatMap((o) => [o.label, o.tradeoff]));
  }
  for (const src of sources) {
    for (const m of String(src ?? "").matchAll(/facts\.md:(\d+)(?:-(\d+))?/g)) {
      const [a, b] = [Number(m[1]), Number(m[2] ?? m[1])];
      if (a < 1 || b > lines.length) out.push(`source ${m[0]}: facts.md has ${lines.length} lines`);
      else if (a === b && !lines[a - 1].trim()) out.push(`source ${m[0]}: that line of facts.md is blank`);
    }
  }
  for (const t of texts.filter(Boolean)) {
    for (const m of String(t).matchAll(/\d(?:[\d.,]*\d)?/g)) {
      const num = m[0];
      if (num.replace(/\D/g, "").length >= 3 && !all.includes(num.toLowerCase()) && !allDigits.includes(num.replace(/[.,]/g, ""))) {
        out.push(`number ${num} is not in facts.md`);
      }
    }
  }
  return [...new Set(out)];
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) printHelp(HELP);
  const videoDir = resolveVideoDir(args._[0]);
  const file = path.join(videoDir, "page.json");
  if (!existsSync(file)) die(`${slash(file)} not found`, 1);
  const page = readJson(file);
  const errors = validatePage(page);
  if (errors.length) {
    for (const e of errors) console.log(`ERROR: page.json: ${e}`);
    process.exit(1);
  }
  for (const w of checkAgainstFacts(page, videoDir)) console.log(`warning: page.json: ${w}`);
  const labels = new Map();
  const scriptFile = path.join(videoDir, "script.json");
  if (existsSync(scriptFile)) {
    try {
      for (const c of JSON.parse(readFileSync(scriptFile, "utf8")).chapters ?? []) labels.set(c.id, c.label);
    } catch {
      /* labels are optional */
    }
  }
  const out = path.resolve(args.out ?? path.join(videoDir, "out", `${slugOf(videoDir)}.html`));
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, renderPage(page, { chapterLabels: labels }), "utf8");
  if (!existsSync(path.join(path.dirname(out), page.video))) console.log(`warning: ${page.video} is not next to the page yet`);
  console.log(`page: ${slash(out)}`);
};

// Run only as a script, so validatePage and renderPage can be imported.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
