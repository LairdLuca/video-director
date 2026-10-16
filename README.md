# video-director

**Version 0.2.0**, see the [changelog](CHANGELOG.md).

A Claude Code plugin that teaches Claude to make a **short narrated explainer
video** from facts: a DevOps how-to ("how we fixed X"), a report of work done,
or the explanation of a task to do. You ask for a video; Claude gathers the
facts, writes the narration, records it with a local voice, lays out the
shots, checks them on stills, renders an MP4 (16:9, 9:16 or 1:1, 1080 px on
the short side) with quiet music and sound effects made on your machine
and, if you want, writes an HTML page with the commands next to it.

```
you:     make a video explaining how we fixed the checkout crash after the 2.4.0 deploy
claude:  facts.md -> narration (your OK) -> voice -> storyboard -> stills -> render
         videos/checkout-crashloop/out/checkout-crashloop.mp4    (86 s, 16:9, 1080p)
         videos/checkout-crashloop/out/checkout-crashloop.html   (summary, commands, transcript)
         videos/checkout-crashloop/OUTCOME.md                    (times, checks, what was not checked)
```

Everything runs on your machine: no API key, no cloud voice, no stock
music, nothing uploaded, no administrator rights.

## What a video looks like

The style comes from earlier test videos of one brief, a 90-second
explainer; the rules are in
[`skills/make/references/style.md`](plugins/video-director/skills/make/references/style.md).
In short:

- **one subject per frame, big**: a terminal across the frame, a 2-4 node
  diagram, a status card, a number; nothing under 28 px (terminals and
  code 24 px on the narrow formats);
- **something changes on the spoken word that names it**, about every 2
  seconds: a command types, a line gets brackets, a tick strokes in;
- a slow camera on every shot, on **squared paper**: a light paper for
  concepts (a yellow notepad by default, seven others to choose from) and a
  faded black one for close-ups and the lesson, with a crossfade between
  the two;
- **three formats**: 16:9 for explanations and long commands, 9:16 for a
  short phone video, 1:1 for a clip pasted into a chat; Claude picks it from
  the subject unless you ask for one;
- a **chapter bar** at the top where every chapter is always visible and
  the current one fills as it plays; with many chapters, two rows (the
  parts below, the chapters of the current part above);
- short **captions** with the exact terms, commands and names in a code
  font (`kubectl`, `DATABASE_URL`);
- a narration with **English terms pronounced in English** inside another
  language, by the same local voice;
- **quiet music** under the voice, in a style Claude picks from the
  subject, that changes with each chapter and ends with the film, and a few
  **sound effects** (a chapter change, the error, the passing check), only
  in the pauses of the narration, never over a word;
- the symptom of the first shot comes back resolved at the end.

## Install

From GitHub:

```
/plugin marketplace add LairdLuca/video-director
/plugin install video-director@video-director
```

From a local clone: `/plugin marketplace add <path to the clone>`, then the
same `install` line.

Then run the setup once:

```
/video-director:setup
```

It checks your machine, builds the voice runtime and the models at user
level, and asks a few questions, one at a time, each with a default. Every
choice is a key of the plugin's config:

| Key | Choice | Default |
|---|---|---|
| `language` | Narration and on-screen language | `it` (also `en`, `en-gb`, `es`, `fr`, `pt`; only Italian is tested) |
| `voice` | Voice, with a 5-second sample of each candidate | the language's default (`im_nicola` for Italian) |
| `captions` | Captions | on |
| `page` | HTML page next to each video | on |
| `openOnDelivery` | Open the page (or the MP4) by itself when the video is ready | on |
| `checkpoints` | Where video-making stops for your OK | `narration` (also `none`, `narration+preview`) |
| `videosDir` | Folder for the video projects | `videos` in your project |
| `paletteLight` | Paper of the light stage: `giallo` (yellow notepad), `quaderno`, `milli`, `arancio`, `tecnico`, `rosso`, `verde`, `grigio` | `giallo` |
| `paletteDark` | Paper of the dark stage: `notte` (faded black), `ardesia` (slate) | `notte` |
| `font` | Text font: the bundled Inter, a sans-serif found on your machine, or a font file of yours | `inter` |
| `music` | Background music under the narration | on |
| `sfx` | Short sound effects at chapter changes and key moments | on |
| `audioDir` | A folder of your own music and effects, used instead of the generated ones | none |
| `format` | Not asked: 16:9, 9:16 or 1:1, picked for each video from the subject | `auto` |
| `musicStyle` | Not asked: `warm`, `pulse` or `minimal`, picked for each video from the subject | `auto` |
| `musicLevel` | Not asked: the music under the voice, `high` (16 LU under it), `normal` (20) or `low` (24) | `high` |
| `engine` | Not asked: the local Kokoro voice, the only engine | `kokoro` |
| `speed` | Not asked: the voice's speed, tuned to 2.3-2.7 words per second | the voice's own |
| `resolution` | Not asked: 1080 px on the short side, in every format | `1080p` |
| `flagDashes` | Not asked: say `--atomic` as "dash dash atomic" instead of "atomic" | off |
| `modelsDir`, `runtimeDir` | The voice models (setup asks whether you already have them) and the Python venv of the voice step | in the plugin's data folder |

Every key, its values and the phrases that change it for one video are in
[`config.md`](plugins/video-director/skills/setup/references/config.md).
The answers are saved in the plugin's data folder and survive updates. Run
setup again to change them. **Any choice can be changed for a single video**
just by asking: "without captions", "female voice", "no page", "don't open it",
"in English", "vertical", "no music", "music lower", "more rhythm".

## Requirements

- Claude Code with plugin support.
- **Node.js 18 or newer** and **npm** (each video project installs its pinned
  Remotion packages from a lockfile).
- **Python 3.12 or 3.13** for the voice step (a venv in the plugin's data
  folder; 3.14 is not supported yet by the pinned packages).
- **ffmpeg and ffprobe** on PATH.
- About **3 GB** of disk for the runtime and the models (about 840 MB of
  models), plus about **600 MB per video project** (mostly Remotion's headless
  browser, downloaded into each project).
- **8 GB of RAM** or more; renders refuse to start under 2.5 GB free.
- Windows x64, Linux x86_64 or aarch64, macOS 14+ on Apple silicon. Intel Macs
  are not supported (the pinned onnxruntime has no wheel for them). Only
  Windows was run during development.

Setup prints a user-level install command for anything missing (winget,
brew, uv) and never runs it without asking. Nothing needs administrator
rights.

Network: npm and PyPI packages and the model files are downloaded once,
pinned and checked by hash (or reused from a folder you already have). After
setup, the voice step runs offline. One more download happens per video: on
the first still, Remotion fetches its headless browser (Chrome Headless
Shell, about 280 MB on disk) into the video project. Its version is fixed by
the pinned Remotion version, and it comes from Google's Chrome for Testing
storage (on macOS and recent Linux, from Remotion's own `remotion.media`);
Remotion checks that download, not a sha256 of this plugin.

## How a video is made

`/video-director:make`, or just ask for a video. The steps:

1. **Facts** into `facts.md`, each with its source: the conversation, git
   (log, diff, commits) or markdown files. Nothing is invented; a gap is
   written down, not filled. Claude picks the format and the music style
   from the subject, unless you asked for them.
2. **Narration** (`script.json`): 60-90 seconds, one idea per sentence, in
   chapters. **Checkpoint**: you see the script and the chapters before the
   voice is recorded (unless checkpoints are `none`).
3. **Voice**: one WAV per sentence with Kokoro; a local Whisper model listens
   to every sentence, gives the word timings and lists English terms it did
   not recognise, and Claude fixes them. Commands, file names and
   identifiers are marked as code for the captions.
4. **Storyboard** (`storyboard.json`): shots from a catalogue of nine scene
   types, every visual change anchored to a spoken word; a lint checks
   anchors, lengths, layout limits of the chosen format, where the sound
   effects fall, and that every command on screen is in the facts.
5. **Stills**: contact sheets that Claude reads as images, and a freeze probe,
   before any full render. Optional **checkpoint**: you see the stills.
6. **Render**: one headless browser on 127.0.0.1, memory check first, every
   child process cleaned up; then the music and effects are generated and
   mixed under the narration, and the whole mix is normalized to -14 LUFS.
7. **Page**: one self-contained HTML file next to the MP4.
8. **Final review** by a fresh sub-agent against the facts; one round of
   fixes.
9. **Delivery**: the MP4, the page and `OUTCOME.md` with the times of each step
   and what was not checked; then the page (or the MP4) opens with your default
   program, unless you turned that off.

On a 16 GB laptop, CPU only, the machine steps of a 90-second video took
about 15-25 minutes (project install 1 min, voice 2 min, stills 4 min, freeze
probe 4 min, render 5-9 min depending on free memory, music and effects a
few seconds), plus the time Claude spends writing. Timed test runs, writing and one review round included, took
42-54 minutes per video.

A complete example (facts, narration with its pronunciation fixes and
lexicon, storyboard, page data) is in
[`plugins/video-director/examples/acme-shop-crashloop/`](plugins/video-director/examples/acme-shop-crashloop/).

## Remotion license

video-director is MIT. It uses [Remotion](https://www.remotion.dev) to render
the videos, and **Remotion has its own license, which is not MIT**. Remotion
is free for individuals, for-profit organizations with up to 3 employees,
non-profits, and for evaluation; larger for-profit organizations need a
Remotion company license. Read the
[Remotion license](https://www.remotion.dev/license) before using
video-director at work, and buy a company license if it applies to you. The
plugin does not pass a license key, so Remotion sends no usage event.

The other third-party pieces (fonts, icons, voice and speech models, Python
packages) and their licenses are listed in [THIRD_PARTY.md](THIRD_PARTY.md).
The music and effects are made by the plugin's own code; a folder of
your own sounds, and a font from your machine, are yours to check for
rights. Two points there are not settled by a lawyer: the voice module imports the
GPL-3.0 `phonemizer` and loads espeak-ng at run time (setup installs them,
this repository does not ship them), and `@remotion/transitions` declares
`UNLICENSED` in its `package.json` and is taken to fall under the Remotion
License.

## Known limits

- **Only Italian narration has been tested**, with the voices `im_nicola` and
  `if_sara`. Other languages have voices and sample sentences but no test.
- **Pronunciation is judged by Whisper, not by a human ear.** In a prototype,
  93% of English terms in Italian sentences were recognised on sentences held
  out from tuning; `on-call` and `rebase` still failed. Acronyms need markup.
- **1080 px on the short side only** (16:9, 9:16, 1:1); no screen recording,
  no publishing. On 9:16 and 1:1 a terminal or code line fits about 61
  characters: videos with longer lines stay 16:9.
- **Music and effects were measured, then heard only on 20-second clips**,
  not yet in a whole video. Three generated styles, no samples at setup.
- **9:16 and 1:1 were checked on stills and short clips** of the example,
  not yet in a full video.
- The **Screenshot** and **Custom** scenes have only been tried on test data.
- A fix after the final review means a **full re-render** (about 5 minutes).
- Each video project carries its own `node_modules` and headless browser
  (about 600 MB).
- Developed and run on Windows; the macOS and Linux paths are written but not
  run.

## Repository layout

```
.claude-plugin/marketplace.json      this repository is a one-plugin marketplace
plugins/video-director/
  .claude-plugin/plugin.json
  README.md                          how the plugin is built
  skills/setup/                      /video-director:setup
  skills/make/                       /video-director:make, and its references
  template/                          the Remotion project copied for each video
  scripts/                           Node scripts: new video, config, fonts, voice, lint, stills, freeze, audio, render, page, open
  voice/                             the Python voice module (Kokoro + Whisper)
  examples/acme-shop-crashloop/      a worked example with fictional facts
```

## License

MIT, see [LICENSE](LICENSE). Remotion and the other dependencies keep their
own licenses: see above and [THIRD_PARTY.md](THIRD_PARTY.md).
