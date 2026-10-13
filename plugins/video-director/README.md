# video-director plugin

**Version 0.1.0.** Teaches Claude to turn facts into a 60-90 second narrated
explainer video (Remotion, a local Kokoro voice, captions, a chapter bar) and
a companion HTML page. The repository [README](../../README.md) is the
user's guide; this file explains how the plugin is built.

## Install and setup

```
/plugin marketplace add LairdLuca/video-director
/plugin install video-director@video-director
/video-director:setup
```

Setup checks the machine, builds the voice runtime and the models in the
plugin data folder (`${CLAUDE_PLUGIN_DATA}`, kept across updates), and asks
the install-time choices one at a time. Then ask for a video, or run
`/video-director:make`.

## Requirements

Node 18+ with npm, Python 3.12 or 3.13, ffmpeg and ffprobe on PATH, about
3 GB of disk plus about 600 MB per video, 8 GB of RAM. No administrator
rights, no API key, no cloud service. Windows x64, Linux x86_64 and aarch64,
macOS 14+ on Apple silicon (only Windows was run).

## Options

Saved by setup in `${CLAUDE_PLUGIN_DATA}/config.json`; every one can be
overridden for a single video on request. Full table:
[skills/setup/references/config.md](skills/setup/references/config.md).

| Key | Default | What |
|---|---|---|
| `language` | `it` | narration and on-screen language (only `it` tested) |
| `engine` | `kokoro` | local text-to-speech, the only engine in 0.1.0 |
| `voice` | language default (`im_nicola`) | Kokoro voice, chosen from samples |
| `speed` | the voice's own | tuned to 2.3-2.7 words per second |
| `captions` | `true` | burned-in captions |
| `page` | `true` | HTML page next to the video |
| `openOnDelivery` | `true` | open the page (or the MP4) with the default program when the video is ready |
| `checkpoints` | `narration` | `none`, `narration`, `narration+preview` |
| `videosDir` | `videos` | where video projects are created |
| `resolution` | `1080p` | the only size in 0.1.0 |
| `flagDashes` | `false` | say `--atomic` as "dash dash atomic" |
| `modelsDir`, `runtimeDir` | in the data folder | can point at existing folders |

## The flow of one video

`/video-director:make` ([SKILL.md](skills/make/SKILL.md)): facts with sources
-> script (checkpoint) -> voice with a pronunciation check -> storyboard and
lint -> stills, contact sheets and freeze probe (optional checkpoint) ->
render -> HTML page -> review by a fresh sub-agent -> `OUTCOME.md`.

Each video is its own folder:

```
<videosDir>/<slug>/
  facts.md            facts, each with its source (Claude)
  script.json         narration, contract A (Claude)
  public/voice/       one WAV per sentence (voice step)
  voiceover.json      durations and word times, contract B (voice step)
  storyboard.json     shots, scenes, props, beats, contract C (Claude)
  STORYBOARD.md       readable version, with "Unfinished" (Claude)
  video.config.json   the choices of this video (config.mjs video)
  page.json           page content, contract D (Claude)
  src/ ...            the template, untouched in the common case
  qa/                 lint, stills, contact sheets, freeze, render and review reports
  out/<slug>.mp4, out/<slug>.html
  OUTCOME.md
```

## How it is built

**A data-driven template.** `template/` is a Remotion project that renders
`storyboard.json` and `voiceover.json`. Shot lengths come from the measured
narration, beats from the spoken words, so Claude writes data, not React.
The same timeline code (`template/src/lib/timeline.mjs`) is used by the
composition and by the Node scripts, so the lint, the stills and the render
agree on every frame. A `Custom` scene is the escape hatch.

Where this comes from: in a comparison of six video tools on the same brief,
the fastest run used a data-driven engine and needed no code per video, and
the clearest video anchored every visual change to a spoken word.

**Scripts** (`scripts/`, Node, no dependencies, no shell, Windows first):

| Script | What |
|---|---|
| `runtime.mjs` | `doctor`, `install` (venv), `models` (pinned, sha256, reuse a folder), `voices`, `sample` |
| `config.mjs` | `keys`, `show`, `set`, `unset`, `video` (writes `video.config.json`: override > config > default) |
| `new-video.mjs` | copies the template, `npm ci --ignore-scripts` from the lockfile, copies the fonts |
| `voice.mjs` | script.json -> WAVs + voiceover.json, Whisper check, `--try` variants |
| `lint-storyboard.mjs` | anchors, lengths, beats, layout limits, facts, icons |
| `stills.mjs` | QA stills with labels and contact sheets, one headless browser |
| `freeze.mjs` | freeze probe on still pairs 0.8 s apart |
| `render.mjs` | memory check, loopback-only render, process cleanup, two-pass loudnorm |
| `page.mjs` | page.json -> one self-contained HTML file |
| `open.mjs` | at delivery, opens the page (or the MP4) with the default program, once |

Every script has `--help`. Every script that starts a browser or a server
preloads `scripts/lib/force-localhost.cjs` (all `listen()` calls go to
127.0.0.1), uses Remotion's own headless browser, and kills its process tree
and any leftover headless browser on exit.

**Voice** (`voice/`, Python): Kokoro v1.0 through `kokoro-onnx`, phonemes from
espeak-ng in the narration language for the text and in English for the
English terms, joined into one phoneme string for one voice; a small IPA
lexicon; faster-whisper `small` for word times and the pronunciation check.
See [voice/README.md](voice/README.md) and
[skills/make/references/voice.md](skills/make/references/voice.md).

**Skills**: [setup](skills/setup/SKILL.md) and [make](skills/make/SKILL.md);
the make skill keeps its details in `skills/make/references/`:
[style](skills/make/references/style.md), [scenes](skills/make/references/scenes.md),
[storyboard](skills/make/references/storyboard.md), [voice](skills/make/references/voice.md),
[page](skills/make/references/page.md), [qa](skills/make/references/qa.md),
[safety](skills/make/references/safety.md).

**Pinned versions**: Remotion and `@remotion/*` 4.0.535, React 19.2.3,
`lucide-react` 1.47.0, `@fontsource` 5.2.8 (lockfile in `template/`);
`kokoro-onnx` 0.6.1 and `faster-whisper` 1.2.1 with every dependency pinned by
sha256 (`voice/requirements.txt`); the model files pinned by size and sha256
(`scripts/lib/models.mjs`).

## Remotion license

This plugin is MIT, but it renders with Remotion, which has **its own
license**: free for individuals, for-profit organizations with up to 3
employees, non-profits and evaluation; larger for-profit organizations need a
Remotion company license. See the [Remotion license](https://www.remotion.dev/license).
Other third-party licenses: [THIRD_PARTY.md](../../THIRD_PARTY.md).

## Known limits

- Only Italian narration tested; pronunciation judged by Whisper, not by ear.
- 16:9 1080p only; no music, sound effects, screen recording or publishing.
- `Screenshot` and `Custom` scenes tried on test data only.
- A fix after the final review means a full re-render.
- About 600 MB per video project (its own `node_modules` and headless browser).
- macOS and Linux code paths written, not run.

## Common mistakes

- Calling `npx remotion` instead of the scripts: no loopback shim, no memory
  check, no cleanup.
- Editing `src/` of a video for something a storyboard prop can say.
- Adding npm packages to a video project: the lockfile is the reviewed set.

## Not yet proven

- Languages other than Italian, report and task videos, facts from git
  history, videos over 2 minutes.
- Per-shot re-render of a finished film.
- The model download path for the large files, and downloads behind a proxy.
- License questions not settled by a lawyer: the MIT voice module imports
  `phonemizer` and loads espeak-ng (both GPL-3.0-or-later) at run time,
  without redistributing them; `@remotion/transitions` declares `UNLICENSED`
  in its `package.json` and is taken to fall under the Remotion License. See
  [THIRD_PARTY.md](../../THIRD_PARTY.md).
