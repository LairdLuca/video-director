// Child process started by qa.mjs: renders a list of stills with one browser.
// Runs with the loopback shim preloaded (NODE_OPTIONS), uses Remotion's own
// headless shell (never a browser installed on the machine) and passes no
// license key, so Remotion sends no usage event.
//
// usage: node still-worker.mjs <job.json>
// job: { videoDir, serveUrl, composition, port, scale, imageFormat, stills: [{ frame, out, label? }] }
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { BROWSER_DOWNLOAD_NOTE, headlessBrowserReady } from "./common.mjs";

const job = JSON.parse(readFileSync(process.argv[2], "utf8"));
const require = createRequire(path.join(job.videoDir, "package.json"));
const { openBrowser, renderStill, selectComposition, ensureBrowser } = require("@remotion/renderer");

const main = async () => {
  // The download is silent at log level warn: say when it happens and how long it took
  const download = !headlessBrowserReady(job.videoDir);
  const t0 = Date.now();
  if (download) console.log(BROWSER_DOWNLOAD_NOTE);
  await ensureBrowser({ chromeMode: "headless-shell", logLevel: "warn" });
  if (download) console.log(`headless browser downloaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const browser = await openBrowser("chrome", { chromeMode: "headless-shell", logLevel: "warn" });
  try {
    const composition = await selectComposition({
      serveUrl: job.serveUrl,
      id: job.composition,
      puppeteerInstance: browser,
      port: job.port,
      logLevel: "warn",
      chromeMode: "headless-shell",
    });
    let done = 0;
    for (const s of job.stills) {
      const t0 = Date.now();
      await renderStill({
        composition: { ...composition, props: { ...composition.props, qaLabel: s.label ?? undefined } },
        serveUrl: job.serveUrl,
        frame: Math.max(0, Math.min(composition.durationInFrames - 1, s.frame)),
        output: s.out,
        imageFormat: job.imageFormat,
        ...(job.imageFormat === "jpeg" ? { jpegQuality: 85 } : {}),
        scale: job.scale,
        puppeteerInstance: browser,
        port: job.port,
        overwrite: true,
        logLevel: "warn",
        chromeMode: "headless-shell",
      });
      done++;
      process.stdout.write(`still ${done}/${job.stills.length} frame ${s.frame} ${Date.now() - t0} ms\n`);
    }
  } finally {
    await browser.close({ silent: true });
  }
};

main().catch((e) => {
  console.error(e?.stack ?? String(e));
  process.exit(1);
});
