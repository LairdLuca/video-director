// The browser side of shots.mjs: playwright-core drives Remotion's own headless
// browser (the one the stills and the render use), never the user's browser.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { browserPids, die, headlessBrowserReady, BROWSER_DOWNLOAD_NOTE, IS_WIN, slash, sweepBrowsers } from "./common.mjs";
import { MASK_COLOR } from "./shots.mjs";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
export const isLoopback = (host) => LOOPBACK.has(String(host).toLowerCase());

/** playwright-core from the video's own node_modules (pinned by the template's lockfile). */
const loadPlaywright = (videoDir) => {
  const req = createRequire(path.join(videoDir, "package.json"));
  // It downloads nothing when it launches a given executable; this is the belt.
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
  try {
    return req("playwright-core");
  } catch {
    die(`playwright-core is not installed in ${slash(videoDir)}: the video was made with an older template (make it again with new-video, or run npm ci there)`, 1);
  }
};

const findFile = (dir, name, depth = 4) => {
  if (!existsSync(dir) || depth < 0) return null;
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (e === name && statSync(p).isFile()) return p;
    if (statSync(p).isDirectory()) {
      const f = findFile(p, name, depth - 1);
      if (f) return f;
    }
  }
  return null;
};

/** Remotion's Chrome Headless Shell of this video; downloaded by Remotion when missing. */
const headlessShell = async (videoDir) => {
  const root = path.join(videoDir, "node_modules", ".remotion", "chrome-headless-shell");
  if (!headlessBrowserReady(videoDir)) {
    console.log(BROWSER_DOWNLOAD_NOTE);
    const renderer = path.join(videoDir, "node_modules", "@remotion", "renderer", "dist", "index.js");
    if (!existsSync(renderer)) die(`Remotion is not installed in ${slash(videoDir)} (run new-video, or npm ci there)`, 1);
    const { ensureBrowser } = await import(pathToFileURL(renderer).href);
    // Remotion downloads into the current folder's node_modules/.remotion:
    // run it from the video, or it lands wherever the script was started.
    const cwd = process.cwd();
    process.chdir(videoDir);
    try {
      await ensureBrowser({ chromeMode: "headless-shell", logLevel: "warn" });
    } finally {
      process.chdir(cwd);
    }
  }
  const exe = findFile(root, IS_WIN ? "chrome-headless-shell.exe" : "chrome-headless-shell");
  if (!exe) die(`Remotion's headless browser was not found under ${slash(root)}`, 1);
  return exe;
};

/**
 * Run `fn(browser)` with a fresh headless browser, then close it and sweep
 * every browser process it left under the video's node_modules (rule 7).
 */
export const withBrowser = async (videoDir, fn) => {
  const { chromium } = loadPlaywright(videoDir);
  const executablePath = await headlessShell(videoDir);
  const before = browserPids(videoDir);
  // The sandbox stays on: the pages are the user's site, not ours.
  const browser = await chromium.launch({ executablePath, headless: true, chromiumSandbox: true });
  const stop = () => browser.close().catch(() => {});
  process.once("SIGINT", stop);
  try {
    return await fn(browser);
  } finally {
    await stop();
    await sweepBrowsers(videoDir, before);
  }
};

/**
 * Secrets for `fill` steps: the process environment, then an env file read
 * here and kept in this process only (never printed, never in a child's
 * environment). Lines `X=Y`, `set X=Y`, `set "X=Y"`, `export X=Y`; comments
 * (#, rem, ::) and `@echo off` are skipped.
 */
export const readEnvFile = (file) => {
  if (!existsSync(file)) die(`env file ${slash(file)} not found`);
  const out = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || /^(#|::|rem\b|@echo\b)/i.test(line)) continue;
    line = line.replace(/^(set|export)\s+/i, "");
    if (line.startsWith('"') && line.endsWith('"')) line = line.slice(1, -1);
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
};

/**
 * Text that looks like personal or secret data. Each match is covered on the
 * capture before the screenshot is taken. Over-covering is the safe side;
 * Claude still looks at every image before it is used.
 */
const AUTO_PATTERNS = [
  ["email", "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"],
  ["iban", "\\b[A-Z]{2}\\d{2}(?: ?[A-Z0-9]){11,30}\\b"],
  ["card or account number", "\\b\\d(?:[ -]?\\d){12,18}\\b"],
  ["long number", "\\b\\d{8,}\\b"],
  ["ip address", "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b"],
  ["phone", "\\+\\d[\\d ().-]{7,}\\d"],
  ["tax code", "\\b[A-Za-z]{6}\\d{2}[A-Za-z]\\d{2}[A-Za-z]\\d{3}[A-Za-z]\\b"],
  ["token", "\\beyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+|\\b[A-Za-z0-9_-]{32,}\\b"],
];

/** In the page: the viewport rectangles of every text and input value matching a pattern. */
const findSensitive = (patterns) => {
  const res = patterns.map(([kind, src]) => [kind, new RegExp(src, "g")]);
  const out = [];
  const add = (kind, r) => {
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return;
    out.push({ kind, box: [r.left - 2, r.top - 2, r.width + 4, r.height + 4] });
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue;
    if (!text || !text.trim()) continue;
    for (const [kind, re] of res) {
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const range = document.createRange();
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        for (const r of range.getClientRects()) add(kind, r);
      }
    }
  }
  // Form values are not text nodes; a closed select's text has no rectangle
  // of its own, so the whole control is covered.
  for (const el of document.querySelectorAll("input, textarea, select")) {
    const v = el.type === "password" ? "x" : el.tagName === "SELECT" ? [...el.selectedOptions].map((o) => o.text).join(" ") : el.value;
    if (!v) continue;
    const hit = el.type === "password" ? "password" : res.find(([, re]) => ((re.lastIndex = 0), re.test(v)))?.[0];
    if (hit) add(hit, el.getBoundingClientRect());
  }
  return out;
};

/** In the page: solid boxes over the viewport rectangles, or remove them (null). */
const coverBoxes = ([boxes, color]) => {
  document.getElementById("__vde_masks")?.remove();
  if (!boxes) return;
  const root = document.createElement("div");
  root.id = "__vde_masks";
  root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  for (const [x, y, w, h] of boxes) {
    const d = document.createElement("div");
    d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${color}`;
    root.appendChild(d);
  }
  document.documentElement.appendChild(root);
};

const STEP_KEYS = ["goto", "click", "fill", "press", "select", "hover", "scroll", "waitFor", "wait"];
const STEP_TIMEOUT = 15000;

/** Check capture.json before the browser starts: a bad step fails in a second, not after the login. */
export const checkCapture = (cfg) => {
  if (!cfg || typeof cfg !== "object") die("capture.json must be an object");
  let base;
  try {
    base = new URL(cfg.base);
  } catch {
    die('capture.json: "base" must be a full http(s) URL ("https://localhost:8443")');
  }
  if (!/^https?:$/.test(base.protocol)) die('capture.json: "base" must be http or https');
  const vp = cfg.viewport ?? [1600, 900];
  if (!Array.isArray(vp) || vp.length !== 2 || vp.some((v) => !Number.isInteger(v) || v < 320 || v > 3840)) die('capture.json: "viewport" is [width, height], 320-3840 px');
  const steps = (list, where) => {
    if (list === undefined) return;
    if (!Array.isArray(list)) die(`capture.json: ${where} must be a list of steps`);
    list.forEach((s, i) => {
      const keys = Object.keys(s ?? {}).filter((k) => STEP_KEYS.includes(k));
      if (keys.length !== 1) die(`capture.json: ${where}[${i}] needs exactly one of ${STEP_KEYS.join(", ")}`);
      if (s.fill !== undefined && (s.text === undefined) === (s.env === undefined)) die(`capture.json: ${where}[${i}] "fill" takes "text" (not secret) or "env" (a secret's variable name), one of them`);
      if (s.wait !== undefined && !(Number.isFinite(s.wait) && s.wait >= 0 && s.wait <= 10000)) die(`capture.json: ${where}[${i}] "wait" is 0-10000 ms`);
      if (s.timeout !== undefined && !(Number.isFinite(s.timeout) && s.timeout >= 1000 && s.timeout <= 300000)) die(`capture.json: ${where}[${i}] "timeout" is 1000-300000 ms`);
    });
  };
  steps(cfg.login, "login");
  if (!Array.isArray(cfg.shots) || !cfg.shots.length) die('capture.json: "shots" must list at least one shot');
  const seen = new Set();
  cfg.shots.forEach((s, i) => {
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(String(s?.name ?? ""))) die(`capture.json: shots[${i}].name: lowercase letters, digits and dashes`);
    if (seen.has(s.name)) die(`capture.json: two shots named "${s.name}"`);
    seen.add(s.name);
    steps(s.steps, `shots[${i}].steps`);
    if (s.boxes !== undefined && (typeof s.boxes !== "object" || Array.isArray(s.boxes))) die(`capture.json: shots[${i}].boxes is { "name": "css selector" }`);
    if (s.mask !== undefined && !Array.isArray(s.mask)) die(`capture.json: shots[${i}].mask is a list of css selectors`);
  });
  return { base, viewport: vp };
};

/**
 * Run capture.json. Returns, per shot, the PNG bytes (already masked), the
 * boxes measured on the page and the masks drawn, plus the hosts blocked.
 */
export const runCapture = async (videoDir, cfg, { secrets = {}, allowHosts = [], storageState } = {}) => {
  const { base, viewport } = checkCapture(cfg);
  const allowed = new Set([base.host.toLowerCase(), ...(cfg.allowHosts ?? []), ...allowHosts].map((h) => String(h).toLowerCase()));
  const blocked = {};
  const secret = (name) => {
    const v = secrets[name] ?? process.env[name];
    if (v === undefined || v === "") die(`the variable ${name} is not set (give it in the environment or with --env-file)`, 1);
    return v;
  };
  return withBrowser(videoDir, async (browser) => {
    const context = await browser.newContext({
      viewport: { width: viewport[0], height: viewport[1] },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: cfg.ignoreHttpsErrors === true,
      acceptDownloads: false,
      serviceWorkers: "block",
      locale: cfg.locale,
      ...(storageState ? { storageState } : {}),
    });
    // Only the site's own host (and the hosts the user allowed) is reached.
    await context.route("**/*", (route) => {
      let host;
      try {
        host = new URL(route.request().url()).host.toLowerCase();
      } catch {
        return route.abort("blockedbyclient");
      }
      if (allowed.has(host)) return route.continue();
      blocked[host] = (blocked[host] ?? 0) + 1;
      return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT);
    page.setDefaultNavigationTimeout(30000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));

    const runSteps = async (list = [], where) => {
      for (const [i, s] of list.entries()) {
        const at = `${where} step ${i + 1}`;
        // "ifVisible": the step runs only when that element is on the page now
        // (a login form that some installs of the same app do not have).
        if (s.ifVisible !== undefined && !(await page.locator(s.ifVisible).first().isVisible().catch(() => false))) continue;
        const timeout = s.timeout ?? STEP_TIMEOUT;
        try {
          if (s.goto !== undefined) {
            const url = new URL(s.goto, base);
            if (!allowed.has(url.host.toLowerCase())) die(`${at}: ${url.host} is not the site's host nor an allowed host`, 1);
            await page.goto(url.href, { waitUntil: "load", timeout: Math.max(timeout, 30000) });
          } else if (s.click !== undefined) await page.locator(s.click).first().click({ timeout });
          else if (s.fill !== undefined) await page.locator(s.fill).first().fill(s.env !== undefined ? secret(s.env) : String(s.text), { timeout });
          else if (s.press !== undefined) await (s.on ? page.locator(s.on).first().press(s.press, { timeout }) : page.keyboard.press(s.press));
          else if (s.select !== undefined) await page.locator(s.select).first().selectOption(String(s.value), { timeout });
          else if (s.hover !== undefined) await page.locator(s.hover).first().hover({ timeout });
          else if (s.scroll !== undefined) await page.locator(s.scroll).first().scrollIntoViewIfNeeded({ timeout });
          else if (s.waitFor !== undefined) await page.locator(s.waitFor).first().waitFor({ state: "visible", timeout });
          else if (s.wait !== undefined) await page.waitForTimeout(s.wait);
        } catch (e) {
          // The message names the step and the selector; a filled value is never in it.
          const msg = String(e.message ?? e).split("\n")[0];
          die(`${at} failed: ${msg}`, 1);
        }
      }
    };

    await runSteps(cfg.login, "login");
    const shots = [];
    for (const shot of cfg.shots) {
      await runSteps(shot.steps, `shot "${shot.name}"`);
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      const boxes = {};
      const missing = [];
      for (const [name, sel] of Object.entries(shot.boxes ?? {})) {
        const b = await page.locator(sel).first().boundingBox().catch(() => null);
        const box = b && clip([b.x, b.y, b.width, b.height], viewport);
        if (box) boxes[name] = box;
        else missing.push(`${name} (${sel})`);
      }
      const autos = shot.autoMask === false ? [] : await page.evaluate(findSensitive, AUTO_PATTERNS);
      const masks = autos.map((a) => ({ box: clip(a.box, viewport), by: "auto", why: a.kind })).filter((m) => m.box);
      const selectorMasks = (shot.mask ?? []).map((sel) => page.locator(sel));
      for (const sel of shot.mask ?? []) {
        for (const b of await page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.top, r.width, r.height]))) {
          const box = clip(b, viewport);
          if (box) masks.push({ box, by: "selector", why: sel });
        }
      }
      await page.evaluate(coverBoxes, [masks.filter((m) => m.by === "auto").map((m) => m.box), MASK_COLOR]);
      const png = await page.screenshot({ type: "png", mask: selectorMasks, maskColor: MASK_COLOR, animations: "disabled", caret: "hide" });
      await page.evaluate(coverBoxes, [null, MASK_COLOR]);
      shots.push({ name: shot.name, png, size: viewport, url: new URL(page.url()).pathname, boxes, missing, masks });
    }
    await context.close();
    return { shots, blocked, errors };
  });
};

/** A box inside the frame, rounded; null when nothing of it is visible. */
const clip = ([x, y, w, h], [fw, fh]) => {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(fw, Math.round(x + w));
  const y1 = Math.min(fh, Math.round(y + h));
  return x1 - x0 >= 2 && y1 - y0 >= 2 ? [x0, y0, x1 - x0, y1 - y0] : null;
};

/**
 * A copy of an image with a labelled coordinate grid, to measure a box by
 * eye when the page is not there to measure it (an imported image). With
 * `crop` the area is shown enlarged, labelled in the image's own pixels.
 */
export const renderGrid = async (videoDir, file, size, { crop, step = 50, boxes = {} } = {}) => {
  const [cx, cy, cw, ch] = crop ?? [0, 0, size[0], size[1]];
  const scale = Math.min(3, Math.max(0.5, 1600 / cw));
  const m = 44;
  const W = Math.round(cw * scale);
  const H = Math.round(ch * scale);
  const data = readFileSync(file).toString("base64");
  const ext = path.extname(file).slice(1).toLowerCase().replace("jpg", "jpeg");
  const lines = [];
  const first = (v) => Math.ceil(v / step) * step;
  // Labels at least 40 px apart on screen: a 4-digit label is about 30 px wide.
  const every = step * Math.max(1, Math.ceil(40 / (step * scale)));
  for (let x = first(cx); x <= cx + cw; x += step) {
    const px = m + (x - cx) * scale;
    const major = x % (step * 4) === 0;
    lines.push(`<line x1="${px}" y1="${m}" x2="${px}" y2="${m + H}" stroke="${major ? "#e0004d" : "#00a0e0"}" stroke-opacity="${major ? 0.8 : 0.45}" stroke-width="1"/>`);
    if (x % every === 0) lines.push(`<text x="${px}" y="${m - 8}" text-anchor="middle">${x}</text>`);
  }
  for (let y = first(cy); y <= cy + ch; y += step) {
    const py = m + (y - cy) * scale;
    const major = y % (step * 4) === 0;
    lines.push(`<line x1="${m}" y1="${py}" x2="${m + W}" y2="${py}" stroke="${major ? "#e0004d" : "#00a0e0"}" stroke-opacity="${major ? 0.8 : 0.45}" stroke-width="1"/>`);
    if (y % Math.max(step, every / 2) === 0) lines.push(`<text x="${m - 6}" y="${py + 4}" text-anchor="end">${y}</text>`);
  }
  for (const [name, b] of Object.entries(boxes)) {
    const [bx, by, bw, bh] = b.box;
    lines.push(`<rect x="${m + (bx - cx) * scale}" y="${m + (by - cy) * scale}" width="${bw * scale}" height="${bh * scale}" fill="none" stroke="#00b050" stroke-width="3"/>`);
    lines.push(`<text x="${m + (bx - cx) * scale + 4}" y="${m + (by - cy) * scale - 4}" fill="#00803a">${name}</text>`);
  }
  const html = `<!doctype html><html><body style="margin:0;background:#fff">
<div style="position:relative;width:${W + 2 * m}px;height:${H + 2 * m}px;overflow:hidden">
<div style="position:absolute;left:${m}px;top:${m}px;width:${W}px;height:${H}px;overflow:hidden">
<img src="data:image/${ext};base64,${data}" style="position:absolute;left:${-cx * scale}px;top:${-cy * scale}px;width:${size[0] * scale}px;height:${size[1] * scale}px;image-rendering:${scale > 1 ? "pixelated" : "auto"}"></div>
<svg width="${W + 2 * m}" height="${H + 2 * m}" style="position:absolute;left:0;top:0;font:12px monospace;fill:#222">${lines.join("")}</svg>
</div></body></html>`;
  return withBrowser(videoDir, async (browser) => {
    const page = await browser.newPage({ viewport: { width: W + 2 * m, height: H + 2 * m }, deviceScaleFactor: 1 });
    await page.route("**/*", (r) => r.abort("blockedbyclient"));
    await page.setContent(html, { waitUntil: "load" });
    const png = await page.screenshot({ type: "png" });
    await page.close();
    return { png, scale };
  });
};
