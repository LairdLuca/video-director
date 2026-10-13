// Applies to the Remotion CLI only. The video-director scripts pass the
// safety options (loopback server, own headless browser, concurrency) on the
// command line as well, so they hold even if this file is edited.
import { Config } from "@remotion/cli/config";

Config.setEntryPoint("src/index.ts");
Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setChromeMode("headless-shell");
Config.setShouldOpenBrowser(false);
Config.setDelayRenderTimeoutInMilliseconds(60000);
