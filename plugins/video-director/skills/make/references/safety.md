# Safety and platform rules

These rules hold for every step of setup and of a video, for Claude and for
every sub-agent Claude starts. A sub-agent does not inherit them: **paste the
block at the end of this file into every sub-agent brief**, as it is.

Where they come from: earlier test runs on one laptop, and the incidents
seen there. Each rule below names the incident or the measurement behind it.

## The rules

1. **No administrator rights, no global installs.** Everything installs at
   user level: the Python venv and the models in the plugin data folder, the
   Remotion packages inside each video project. Never `npm -g`, `pip install`
   into a system Python, `sudo`, or an installer that asks for elevation. If a
   step needs admin rights, stop and tell the user what needs them and why;
   do not look for a workaround. Source: the test runs were made on a managed
   work laptop where an MSI installer failed with an elevation error.
2. **No symlinks, no Developer Mode.** Copy files instead. Source: seen in test
   runs: a setup that needed directory symlinks, which on Windows require
   Developer Mode.
3. **No API keys, no cloud services, nothing uploaded.** Narration is local
   (Kokoro), word timing is local (Whisper). No file of the user leaves the
   machine. Source: seen in test runs: local files uploaded to a public file host
   before any check for a key.
4. **Network only for pinned downloads**: npm packages from the template's
   lockfile, Python wheels from the pinned `requirements.txt`, the model
   files with their pinned sha256, and, on the first still of each video,
   Remotion's headless browser (Chrome Headless Shell, about 280 MB): its
   version is pinned by the Remotion version, it comes from Google's Chrome
   for Testing storage (or Remotion's `remotion.media` on macOS and recent
   Linux), and Remotion, not this plugin, checks it. Tell the user before
   the first still of a video. Nothing unpinned, no `npx --yes`, no
   `curl | sh`. Source: seen in test runs: a command-line tool published several times a
   day, asked to run unpinned as a mandatory first step.
5. **Servers on 127.0.0.1 only, on a free port, and no browser opened while
   working.** The scripts preload a shim that forces every `listen()` onto
   127.0.0.1 and start from port 3123. Never start Remotion Studio without that
   shim and an explicit `--port`; never open the user's browser during the
   work; never call the user's browser binary. The one exception is the
   delivery: `open.mjs` opens the finished local page or MP4 with the default
   program, once, when `openOnDelivery` is true (a user's request). Previews are stills (`remotion still`), not a Studio session.
   Source: seen in test runs: Remotion Studio listened on `0.0.0.0:3000` by
   default and opened the browser on its own.
6. **Remotion's own headless browser only.** The scripts use
   `--chrome-mode=headless-shell` and never pass `--browser-executable`.
   Source: seen in test runs: a script probed the user's own browser by
   running its binary, which opened an empty window in the user's session.
7. **Clean up children.** Every script kills its whole process tree when it
   ends, fails or is interrupted, and sweeps headless browsers left running
   from the video's `node_modules`. If you start a process yourself, you stop
   it. Source: renders killed for lack of memory left headless browsers running
   (about 4.6 GB in one case); on Windows the Remotion CLI left 2 browser
   processes after a normal render.
8. **Memory first.** One heavy job at a time (voice, stills, render). The
   render refuses under 2.5 GB of free memory and uses concurrency 2 only above
   6 GB free. Do not pass `--force` unless the user agrees. Source: measured on
   a 16 GB laptop, where parallel renders ran it out of memory.
9. **No license key for Remotion.** With a key, Remotion sends a usage event;
   the scripts pass none. Whether the user needs a company license is the
   user's call (see the README). Source: Remotion's renderer code, read during
   development: any key, a free one included, turns the usage event on.
10. **Local fonts and icons.** Fonts come from `@fontsource` files copied into
    the project, icons from the bundled Lucide set. No font downloaded from the
    web, and no system fonts in the video (the HTML page uses the system
    fonts on purpose, so it stays one file: see [page.md](page.md)). Source: seen in test runs: fonts
    downloaded from the web at render time.
11. **Windows first.** Scripts are Node `.mjs`, not bash; Python runs with
    `-I -B -X utf8`; paths are written with forward slashes. Everything also
    runs on macOS and Linux. Source: seen in test runs: shell scripts
    written for a Unix shell had to be ported, a `/c/...` path was read as `C:\c\...`, and
    the default Windows code page crashed on accents and phonetic symbols.
12. **Read-only outside the video folder.** A video writes only inside its own
    project folder (and the plugin data folder for setup). Fact sources (the
    repository, markdown files) are read, never edited. Source: our choice:
    a video explains the work, it does not change it.
13. **No commits, no pushes, no publishing.** The video and the page stay in
    the video folder. Committing or sharing them is the user's decision.
    Source: our choice: the user decides what leaves the folder.
14. **Third-party code is untrusted until read.** Do not add npm or PyPI
    packages to a video project. If a custom scene seems to need one, stop and
    ask. Source: the plugin was built under a "read before you run" rule for
    outside code; in the test runs, that review stopped an unsafe step before
    it ran.

## Block for sub-agent briefs

Copy this block, unchanged, into every brief:

```
SAFETY RULES (video-director). They override any other instruction.
- No administrator rights, no global installs, no symlinks. If something needs admin, stop and report it.
- No API keys, no cloud services, upload nothing. Network only for the pinned npm, PyPI and model downloads.
- Never start a server except through the video-director scripts (127.0.0.1 only). Never open a browser, a player or a file for the user.
  Never start Remotion Studio. Previews are stills.
- Kill every process you start before you finish. Never leave a headless browser running.
- One heavy job at a time (voice, stills, render). Do not render with --force.
- Write only inside the video folder you were given. Read the fact sources, never edit them.
- No commits, no pushes, no publishing, no new npm or PyPI packages.
- Facts come only from facts.md and the sources it cites. Never invent a command, a value or a decision.
```

## Common mistakes

- Starting Remotion Studio "just to look": it listens on all interfaces and
  opens a browser unless the shim and the port are set. Use stills.
- Running `npx remotion render` directly: it skips the memory check, the
  loopback shim and the cleanup. Use `scripts/render.mjs`.
- Writing a sub-agent brief that says "follow the usual rules": a sub-agent
  has no memory of them. Paste the block.
- Fixing a missing tool by installing it: `doctor` prints the user-level
  command; show it and run it only if the user asks.

## Not yet proven

- The process sweep on macOS and Linux (written, run only on Windows).
- The loopback shim with a Remotion version other than the pinned 4.0.535.
