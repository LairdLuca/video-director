# Config: install choices and per-video overrides

Setup saves the user's answers in `<data>/config.json`. That
folder survives plugin updates, so the answers do too; running setup again
changes them. Each video gets a `video.config.json` with the choices that
apply to it.

**Resolution, key by key: override for this video > `config.json` > default.**

## Keys

| Key | Values | Default | What it does |
|---|---|---|---|
| `language` | `it`, `en`, `en-gb`, `es`, `fr`, `pt` | `it` | narration and on-screen language; only `it` and `en` are tested |
| `engine` | `kokoro` | `kokoro` | text-to-speech engine; local only |
| `voice` | a Kokoro voice of the language | the language's default (`im_nicola` for `it`) | the narrator |
| `speed` | 0.7-1.3, or `auto` | `auto`: the voice's own default | Kokoro speed; the defaults put the pace at 2.3-2.7 words/s |
| `captions` | `true`, `false` | `true` | burned-in captions |
| `page` | `true`, `false` | `true` | the HTML page next to the video |
| `openOnDelivery` | `true`, `false` | `true` | at delivery, `open.mjs` opens the page (or the MP4 when `page` is false) with the default program |
| `checkpoints` | `none`, `narration`, `narration+preview` | `narration` | where the make skill stops for the user's OK |
| `videosDir` | a folder | `videos` (relative to the project) | where video projects are created |
| `format` | `auto`, `16:9`, `9:16`, `1:1` | `auto` | the frame's shape; `auto`: Claude picks it for each video from the subject (style rule 1) |
| `resolution` | `1080p` | `1080p` | 1080 px on the short side, in every format |
| `paletteLight` | `giallo`, `quaderno`, `milli`, `arancio`, `tecnico`, `rosso`, `verde`, `grigio` | `giallo` | the paper of the light stage (style rule 8) |
| `paletteDark` | `notte`, `ardesia` | `notte` | the paper of the dark stage |
| `font` | `inter`, a font family found on this machine, or the path of a `.ttf`, `.otf`, `.woff` or `.woff2` file | `inter` | the text font of the video (style rule 11); code is always JetBrains Mono |
| `music` | `true`, `false` | `true` | background music under the narration, ducked under the voice (style rule 32) |
| `musicStyle` | `auto`, `warm`, `pulse`, `minimal` | `auto` | character of the generated music: calm, more rhythm, most discreet; `auto`: Claude picks it for each video from what it describes (style rule 32, "Choosing the music style") |
| `musicLevel` | `low`, `normal`, `high` | `high` | the music while the voice speaks: 24, 20 or 16 LU under it |
| `sfx` | `true`, `false` | `true` | short effects at chapter changes and on the shots' `sfx` moments, only in pauses |
| `audioDir` | a folder, or `none` | none | the user's own sounds (`music*`, `chapter*`, `error*`, `success*`); a kind found there replaces the generated one; `none` for one video uses the generated ones |
| `flagDashes` | `true`, `false` | `false` | say `--atomic` as "dash dash atomic" instead of "atomic" |
| `modelsDir` | a folder | `<data>/models` | voice and Whisper models; can point at an existing folder |
| `runtimeDir` | a folder | `<data>/runtime` | the voice step's Python venv |

`<data>` is the plugin data folder: `~/.claude/plugins/data/<id>`, where
`<id>` is the plugin id `video-director-explainer@<marketplace>` with every character
other than letters, digits, `_` and `-` replaced by `-` (installed from this
repository's marketplace: `video-director-explainer-video-director-explainer`). Uninstalling the
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
{ "voice": "if_sara", "checkpoints": "none", "videosDir": "docs/videos", "paletteLight": "quaderno", "font": "Acme Sans" }
```

**Music and effects.** `render.mjs` builds them at every render (a few
seconds: 3 to 4 s for an 84 s video) and mixes them under the narration before the loudness
passes; `audio.mjs <videoDir>` builds them alone, to check where the
effects fall. The generated music is seeded by the video's slug: the same
video always gets the same music. `audioDir` is resolved against the
project like `videosDir`; files are matched by the start of their name
(`music-calm.mp3`, `chapter.wav`, `error_1.ogg`), and with several of a
kind each video takes one, picked by its slug. A music file shorter than
the film is looped with a 2 s crossfade, a longer one is cut; both fade
out with the film. An effect file longer than its pause is cut with a
40 ms fade. The files are read where they are at every render; nothing is
copied into the plugin. The levels are set by measure, not by the files'
own volume: music at `musicLevel` under the voice, effects 8 LU under it.
A file that ffmpeg cannot decode (a truncated download, a protected `.m4a`,
a codec the local ffmpeg lacks) is a warning at the lint and at the
render, and another file of its kind, or the generated sound, is used: the
lint decodes every file, so the warning comes before any render. Seen in a
review: one such file stopped the render after the whole film had
rendered.

**The text font.** `set` and `video` check a `font` value before saving it:
a family name must be found in the system or user font folders (Windows:
`%WINDIR%\Fonts` and `%LOCALAPPDATA%\Microsoft\Windows\Fonts`; macOS:
`/System/Library/Fonts`, `/Library/Fonts`, `~/Library/Fonts`; Linux:
`/usr/share/fonts`, `/usr/local/share/fonts`, `~/.local/share/fonts`,
`~/.fonts`) with an upright regular file; a file must exist. A family, or
a `.ttf` or `.otf` file, that lacks more than 20 letters of the Latin
alphabet the plugin checks (the full alphabet with Central and Eastern
European letters) is refused: a symbol font would draw the captions as
symbols. `fonts.mjs list` gives the fonts
worth proposing. `config.mjs video` resolves the font to its files
(`fontFiles` in `video.config.json`); the lint and the QA scripts copy them
into `<videoDir>/public/fonts/text/` and the template loads them from
there. A family with a regular, a semibold and a bold file uses all three; a
single file gives the other weights by the browser's synthesis (a variable
`.ttf` or `.otf`: its weight range). A `.woff` or `.woff2` file is not
read, so it loads as weight 400 even when it is variable, and captions and
labels (600, 700) get a synthesised bold: for a variable font, give its
`.ttf`. A font no longer on the machine when a video is
made falls back to Inter, with a warning.

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
  A key whose value is its default is left out, also one an earlier setup
  saved (seen in a test re-run: `videosDir=videos` still saved), and `set`
  says which; a key that differs from the default goes with `unset`.
- `doctor` exit code 0 means the plugin is set up (runtime and models in
  place); a missing `config.json` is a `warn` line and means every default
  applies.
- `video` writes `<videoDir>/video.config.json` and prints the values that did
  not come from a default, with their source. `videosDir` is the folder
  that holds `<videoDir>`; with `--project` inside the videos folder (run
  from the video's own folder, say), the project above it is used, with a
  warning. `--chosen format,musicStyle` marks the values Claude chose
  (step 1 of the make skill) as `claude` instead of `override`, so the
  OUTCOME says who chose. Run again on a video that already has a
  `video.config.json` (a change after delivery), it keeps that video's
  overrides, the keys its `from` marks `override` or `claude`, unless they are given
  again: `config.mjs video <videoDir> ... musicLevel=normal` keeps the
  video's `format` and `musicStyle`. `key=default` drops a kept override, so
  the key goes back to `config.json`. A new `language=` drops a kept voice,
  and a new `language=` or `voice=` drops a kept speed. An override equal to
  the value in `config.json` is recorded as `config`.
- `show` prints the effective config plus `modelsFound` (the folders that
  really hold the model files, which can be outside `modelsDir` when setup
  found them elsewhere) and `modelsMissing`.
- `format=auto` in `video` (no format given for the video and none in
  `config.json`) is a warning: 16:9 is used. Pass the format chosen at step
  1 of the make skill.
- `musicStyle=auto` in `video` works the same way: with music on, a
  warning, and `warm` is used. Pass the style chosen at step 1 of the make
  skill.
- Values: `true`/`false` (also `on`/`off`, `yes`/`no`), numbers, `auto` for
  speed, text otherwise.

## `video.config.json`

Every key above, resolved, plus:

- `width`, `height` from `format` (1920x1080, 1080x1920 or 1080x1080);
- `fontName` and `fontFiles` (`[{ "path", "weight" }]`, empty for Inter):
  the text font's family and files, found when `video` ran;
- `dataDir`;
- absolute `videosDir`, `modelsDir`, `runtimeDir`, with forward slashes;
- `from`: for each key, `default`, `config`, `override` (the user's wish for
  this video), `claude` (Claude's choice for this video, `--chosen`) or
  `voice default`, so the video's OUTCOME can say who chose what.

```json
{
  "language": "it", "engine": "kokoro", "voice": "im_nicola", "speed": 1.15,
  "captions": false, "page": true, "checkpoints": "narration",
  "videosDir": "/home/dev/acme-shop/videos", "format": "9:16", "resolution": "1080p",
  "paletteLight": "giallo", "paletteDark": "notte", "font": "inter",
  "music": true, "musicStyle": "minimal", "musicLevel": "high", "sfx": true, "audioDir": null, "flagDashes": false,
  "modelsDir": "/home/dev/.claude/plugins/data/video-director-explainer-video-director-explainer/models",
  "runtimeDir": "/home/dev/.claude/plugins/data/video-director-explainer-video-director-explainer/runtime",
  "width": 1080, "height": 1920, "dataDir": "/home/dev/.claude/plugins/data/video-director-explainer-video-director-explainer",
  "fontFiles": [], "fontName": "Inter",
  "from": { "captions": "override", "format": "claude", "musicStyle": "claude", "voice": "default", "speed": "voice default" }
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
| "in verticale", "for the phone", "9:16" | `format=9:16` |
| "quadrato", "square" | `format=1:1` |
| "orizzontale", "16:9" | `format=16:9` |
| "su carta millimetrata", "on graph paper with millimetre squares"; "il quaderno arancione", "the orange notebook" | `paletteLight=milli`, `paletteLight=arancio` (the names in style rule 8) |
| "scuro ardesia", "slate dark" | `paletteDark=ardesia` |
| "con il font <name>", "with the <name> font", "use this font: <file>" | `font=<name>` (as `fonts.mjs list` spells it), `font=<file>` |
| "senza musica", "no music" | `music=false` |
| "musica più bassa", "music lower" | one step down from the video's `musicLevel`: `high` (16 LU under the voice) to `normal` (20 LU), `normal` to `low` (24 LU); `low` for "much lower"; when it is already `low`, say so |
| "musica più alta", "music louder" | one step up: `low` to `normal`, `normal` to `high` (16 LU), the default and the loudest level; when it is already `high`, say so |
| "musica più ritmica", "more rhythm"; "più calma", "calmer"; "più discreta", "more discreet" | `musicStyle=pulse`, `musicStyle=warm`, `musicStyle=minimal` |
| "senza effetti", "no sound effects" | `sfx=false` |
| "senza audio di sottofondo", "no background sound" | `music=false sfx=false` |
| "usa la mia musica in <folder>", "use my music in <folder>" | `audioDir=<folder>` |
| "con la musica generata", "with the generated music" (when `config.json` names a folder) | `audioDir=none` |
| "come gli altri video", "like my other videos" (a key changed for this video) | `key=default`: the key goes back to `config.json` |

## Runtime and models

Setup builds them with `scripts/runtime.mjs`:

```
node "<plugin>/scripts/runtime.mjs" doctor  --data "<data>"
node "<plugin>/scripts/runtime.mjs" install --data "<data>"
node "<plugin>/scripts/runtime.mjs" models  --data "<data>" [--from <folder>]... [--copy]
node "<plugin>/scripts/runtime.mjs" voices  --data "<data>" --lang it
node "<plugin>/scripts/runtime.mjs" sample  --data "<data>" --voice im_nicola --lang it
node "<plugin>/scripts/fonts.mjs" list [--all]
node "<plugin>/scripts/fonts.mjs" check "<family or file>"
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
- `fonts.mjs list` reads the font folders above (nothing is downloaded or
  installed) and prints the families fit for the text font, best first:
  sans-serif by the font's own classification, the full Latin alphabet
  (with Central and Eastern European letters), a regular and a bold (a
  semibold or a variable weight ranks higher), not monospaced, embedding
  not restricted by the font's maker, not a symbol, script, display or code
  face, not made for another writing system. `--all` also lists the others
  with the reason. `check` tells what a value of `font` would use.
- The voice step runs with `HF_HUB_OFFLINE=1` and `HF_HUB_DISABLE_TELEMETRY=1`:
  no network after setup.

Why Python 3.12-3.13 and not older: the pinned numpy needs 3.12, and
kokoro-onnx does not support 3.14 yet. The pinned wheels cover Windows x64,
Linux x86_64 and aarch64 (glibc 2.28 or newer) and macOS 14 or newer on Apple
silicon; Intel Macs have no onnxruntime wheel at the pinned version.

## Common mistakes

- Saving a per-video wish in `config.json`: use an override, so the next video
  is not affected.
- Copying `width` and `height` from `video.config.json` into the storyboard
  after a `config.mjs video` run that gave another format: unless the user
  asked for a new format, run `config.mjs video` again with the video's
  `format=`.
- Pointing `modelsDir` at a folder and then moving it: run `models` again.
- Copying a font of the machine into a repository: the video folder's
  `.gitignore` leaves `public/fonts/text/` out on purpose; its licence may
  not allow sharing it.
- Running `install` with admin rights or into a system Python: the venv is
  enough, and nothing needs admin.
- Opening the sample WAV for the user: print the path, let them play it.
- Running `voice.mjs` again to change the music: music and effects change at
  the render only; for a new style or level, `config.mjs video` with the new
  value and `render.mjs`.
- Saving a music style in `config.json` because one video needed it: the
  default `auto` lets each video take the style of its subject; one style
  for every video is saved only when the user asks for it.

## Not yet proven

- The install commands `doctor` prints for macOS and Linux, and the winget
  ones for a machine without Python or ffmpeg: written from the tools'
  documentation, not run.
- Downloads behind a proxy: Node's fetch does not read proxy variables.
- `language` other than `it` and `en`.
- `fonts.mjs` on macOS and Linux (run only on Windows), and font files given
  by the user in `.woff` or `.woff2` (accepted without reading them).
- The whole runtime on macOS and Linux (only Windows was run).
- The music and effects levels were set by measure, chosen on 20 s clips and
  heard in four whole videos of 75-88 s (`minimal` and `warm`); `pulse` only
  on 20 s clips. A user folder was tried with test files only.
- `musicStyle=auto`: Claude's choice of the style was tried on four videos
  only (`minimal` twice, `warm` twice).
