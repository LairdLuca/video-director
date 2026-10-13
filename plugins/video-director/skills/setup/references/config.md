# Config: install choices and per-video overrides

Setup saves the user's answers in `<data>/config.json`. That
folder survives plugin updates, so the answers do too; running setup again
changes them. Each video gets a `video.config.json` with the choices that
apply to it.

**Resolution, key by key: override for this video > `config.json` > default.**

## Keys

| Key | Values | Default | What it does |
|---|---|---|---|
| `language` | `it`, `en`, `en-gb`, `es`, `fr`, `pt` | `it` | narration and on-screen language; only `it` is tested |
| `engine` | `kokoro` | `kokoro` | text-to-speech engine; local only |
| `voice` | a Kokoro voice of the language | the language's default (`im_nicola` for `it`) | the narrator |
| `speed` | 0.7-1.3, or `auto` | `auto`: the voice's own default | Kokoro speed; the defaults put the pace at 2.3-2.7 words/s |
| `captions` | `true`, `false` | `true` | burned-in captions |
| `page` | `true`, `false` | `true` | the HTML page next to the video |
| `openOnDelivery` | `true`, `false` | `true` | at delivery, `open.mjs` opens the page (or the MP4 when `page` is false) with the default program |
| `checkpoints` | `none`, `narration`, `narration+preview` | `narration` | where the make skill stops for the user's OK |
| `videosDir` | a folder | `videos` (relative to the project) | where video projects are created |
| `resolution` | `1080p` | `1080p` | 16:9, 1920x1080 |
| `flagDashes` | `true`, `false` | `false` | say `--atomic` as "dash dash atomic" instead of "atomic" |
| `modelsDir` | a folder | `<data>/models` | voice and Whisper models; can point at an existing folder |
| `runtimeDir` | a folder | `<data>/runtime` | the voice step's Python venv |

`<data>` is the plugin data folder: `~/.claude/plugins/data/<id>`, where
`<id>` is the plugin id `video-director@<marketplace>` with every character
other than letters, digits, `_` and `-` replaced by `-` (installed from this
repository's marketplace: `video-director-video-director`). Uninstalling the
plugin deletes that folder (the runtime, the models downloaded or copied
there, `config.json`) unless the uninstall is run with `--keep-data`; models
used from another folder stay where they are.

Relative `videosDir` values are resolved against the project the video
belongs to; `modelsDir` and `runtimeDir` are install settings and cannot
change for one video.

**Keep `videosDir` relative.** An absolute `videosDir` in `config.json`
applies to every project: in a test, a video for a new project was proposed
the folder of an earlier one. `config.mjs set` warns when it saves an
absolute path, and `config.mjs show` warns when `videosDir` is outside the
`--project` folder. A video made in another folder needs no `videosDir=`:
`config.mjs video` takes the folder that holds `<videoDir>` and records it as
an override (and refuses a `videosDir=` that does not hold it).

Two keys depend on others, so that one change does not leave a mismatched
pair:

- **A voice belongs to a language.** If a video switches language and does not
  name a voice, the language's default voice is used, not the install voice.
- **A speed belongs to a voice.** A speed saved in `config.json` applies only
  to the voice it was saved with; another voice uses its own default. Setting
  a new voice with `config.mjs set` drops the saved speed.

Example `config.json` (only the keys the user changed are saved):

```json
{ "voice": "if_sara", "checkpoints": "none", "videosDir": "docs/videos" }
```

## Commands

Commands below write the plugin folder as `<plugin>` and the plugin data
folder as `<data>`. Use the two paths shown in the skill's `SKILL.md`: the
plugin variables are filled in there only, not in reference files and not in
the shell.

```
node "<plugin>/scripts/config.mjs" keys
node "<plugin>/scripts/config.mjs" show  --data "<data>"
node "<plugin>/scripts/config.mjs" set   --data "<data>" voice=if_sara captions=false
node "<plugin>/scripts/config.mjs" unset --data "<data>" speed
node "<plugin>/scripts/config.mjs" video <videoDir> --data "<data>" captions=false page=false
```

- `set` checks every value first and writes nothing if one is wrong: unknown
  keys, values out of range, a `language` outside the table above, a `voice`
  that is not one of the Kokoro voices of those languages. With no
  `key=value` it writes `config.json` as it is (`{}` on a first setup where
  every answer was the default), so the file always exists after setup.
- `doctor` exit code 0 means the plugin is set up (runtime and models in
  place); a missing `config.json` is a `warn` line and means every default
  applies.
- `video` writes `<videoDir>/video.config.json` and prints the values that did
  not come from a default, with their source. `videosDir` is the folder
  that holds `<videoDir>`.
- `show` prints the effective config plus `modelsFound` (the folders that
  really hold the model files, which can be outside `modelsDir` when setup
  found them elsewhere) and `modelsMissing`.
- Values: `true`/`false` (also `on`/`off`, `yes`/`no`), numbers, `auto` for
  speed, text otherwise.

## `video.config.json`

Every key above, resolved, plus:

- `width`, `height` from `resolution`;
- `dataDir`;
- absolute `videosDir`, `modelsDir`, `runtimeDir`, with forward slashes;
- `from`: for each key, `default`, `config`, `override` or `voice default`, so
  the video's OUTCOME can say which choices were the user's.

```json
{
  "language": "it", "engine": "kokoro", "voice": "im_nicola", "speed": 1.15,
  "captions": false, "page": true, "checkpoints": "narration",
  "videosDir": "/home/dev/acme-shop/videos", "resolution": "1080p", "flagDashes": false,
  "modelsDir": "/home/dev/.claude/plugins/data/video-director-video-director/models",
  "runtimeDir": "/home/dev/.claude/plugins/data/video-director-video-director/runtime",
  "width": 1920, "height": 1080, "dataDir": "/home/dev/.claude/plugins/data/video-director-video-director",
  "from": { "captions": "override", "voice": "default", "speed": "voice default" }
}
```

## Mapping what the user says to overrides

| The user says | Override |
|---|---|
| "without captions", "senza sottotitoli" | `captions=false` |
| "no page", "niente pagina" | `page=false` |
| "don't open it", "non aprirlo" | `openOnDelivery=false` |
| "female voice", "voce femminile" (Italian) | `voice=if_sara` |
| "a bit slower" | `speed=` the voice default minus 0.05 |
| "in English" | `language=en` (the voice follows) |
| "don't stop to ask" | `checkpoints=none` |
| "put it in docs/videos" | no key: pass that folder to `new-video`; `config.mjs video` records it |

## Runtime and models

Setup builds them with `scripts/runtime.mjs`:

```
node "<plugin>/scripts/runtime.mjs" doctor  --data "<data>"
node "<plugin>/scripts/runtime.mjs" install --data "<data>"
node "<plugin>/scripts/runtime.mjs" models  --data "<data>" [--from <folder>]... [--copy]
node "<plugin>/scripts/runtime.mjs" voices  --data "<data>" --lang it
node "<plugin>/scripts/runtime.mjs" sample  --data "<data>" --voice im_nicola --lang it
```

- `doctor` checks Node 18+, Python 3.12 or 3.13, ffmpeg and ffprobe, free disk
  (about 3 GB) and RAM (8 GB total recommended; the render itself starts
  with 2.5 GB free, and uses concurrency 2 only above 6 GB free), and whether the runtime and
  models are in place. For each missing piece it prints a user-level install
  command; it never runs it. Show the command to the user and run it only if
  they ask.
- `install` creates the venv in `runtimeDir`, with `uv` when it is on PATH,
  else `python -m venv` and pip. Requirements are pinned with exact versions
  and sha256 hashes, wheels only, so no package code runs at install time.
  A second run with unchanged requirements does nothing.
- `models` checks every model file against its pinned sha256. Files found with
  `--from` (search by name and size, any layout, including a Hugging Face
  cache) are used where they are, or copied into `modelsDir` with `--copy`.
  Missing files are downloaded: Kokoro v1.0 ONNX and `voices-v1.0.bin` from the
  kokoro-onnx GitHub releases, faster-whisper `small` from Hugging Face at a
  pinned revision. About 840 MB in total. The result is
  `<modelsDir>/models.json`.
- `sample` writes `<data>/samples/<voice>-<lang>.wav` (about 5 s) and prints
  its path. Nothing is played or opened: give the user the path.
- The voice step runs with `HF_HUB_OFFLINE=1` and `HF_HUB_DISABLE_TELEMETRY=1`:
  no network after setup.

Why Python 3.12-3.13 and not older: the pinned numpy needs 3.12, and
kokoro-onnx does not support 3.14 yet. The pinned wheels cover Windows x64,
Linux x86_64 and aarch64 (glibc 2.28 or newer) and macOS 14 or newer on Apple
silicon; Intel Macs have no onnxruntime wheel at the pinned version.

## Common mistakes

- Saving a per-video wish in `config.json`: use an override, so the next video
  is not affected.
- Pointing `modelsDir` at a folder and then moving it: run `models` again.
- Running `install` with admin rights or into a system Python: the venv is
  enough, and nothing needs admin.
- Opening the sample WAV for the user: print the path, let them play it.

## Not yet proven

- The install commands `doctor` prints for macOS and Linux, and the winget
  ones for a machine without Python or ffmpeg: written from the tools'
  documentation, not run.
- Downloads behind a proxy: Node's fetch does not read proxy variables.
- `language` other than `it`.
- The whole runtime on macOS and Linux (only Windows was run).
