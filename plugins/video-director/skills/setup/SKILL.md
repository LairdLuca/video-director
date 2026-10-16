---
name: setup
description: Installs or reconfigures video-director, once per machine. Checks Node, Python, ffmpeg, disk and memory, builds the local voice runtime and models at user level, and asks the install-time choices (language, voice with a sample, captions, HTML page, checkpoints, video folder, light and dark paper, text font, music, sound effects, a folder of one's own sounds). Use only when the user explicitly asks to install, set up or reconfigure video-director, or to change its default voice, language, captions, page, checkpoints, palettes, font, music or sound effects. Never use it to make a video.
argument-hint: "[optional: an existing folder with the Kokoro and Whisper models]"
---

# video-director: setup

Run once per machine, and again whenever the user wants to change a default.
Everything goes into the plugin data folder `${CLAUDE_PLUGIN_DATA}`, which
survives plugin updates: the answers (`config.json`), the Python venv of the
voice step (`runtime/`) and the models (`models/`, or an existing folder).

Arguments: $ARGUMENTS

Read first: [../make/references/safety.md](../make/references/safety.md) (the
rules hold here too) and [references/config.md](references/config.md) (every
key, the commands, the runtime).

Talk to the user in their language. Ask **one question at a time**, always
with the default (or the current value, on a re-run) so that "ok" is a valid
answer.

## Rules for this skill

1. **No administrator rights.** Everything is user level. If a step asks for
   elevation (a UAC prompt, an installer that exits with an elevation error, a
   folder that is write-protected), **stop**: tell the user which step needs
   it and why, give the user-level alternative if `doctor` printed one, and do
   not retry with elevation or look for a workaround. Source: this plugin was
   built on a managed work laptop where an MSI installer failed this way.
2. **Never install a missing tool unasked.** `doctor` prints the user-level
   command for each missing piece; show it, and run it only if the user says
   so. Source: our choice: the machine is the user's, often a managed one
   (see rule 1).
3. **Say what goes on the network before it does**: PyPI for the venv (about
   100 MB of wheels when not cached), GitHub and Hugging Face for the models
   (about 840 MB). Everything is pinned and checked by sha256. Later, each
   video also fetches npm packages and, on its first still, Remotion's
   headless browser (about 280 MB): mention it when you sum up. Source: the
   plugin's own rule that nothing reaches the network without the user
   knowing what and why.
4. **Reuse before downloading**: always ask whether the models are already on
   disk. Source: the models are about 840 MB; during development they were
   found on disk from an earlier prototype and reused instead of downloaded.
5. **Do not play or open anything**: give the sample paths, the user plays
   them. Source: the same as rule 5 of the make skill: seen in test runs, a
   window of the user's browser opened on its own.

## Steps

Commands use `${CLAUDE_PLUGIN_ROOT}` (the plugin) and `${CLAUDE_PLUGIN_DATA}`;
always pass `--data`. Run them from the user's project folder. In the reference files the plugin folder is written `<plugin>` and the data
folder `<data>`: use the two paths in this paragraph for them.

### 1. Check the machine

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/runtime.mjs" doctor --data "${CLAUDE_PLUGIN_DATA}"
```

It checks Node 18+, Python 3.12 or 3.13, ffmpeg and ffprobe, about 3 GB of
free disk, the memory (8 GB total recommended for rendering), and whether the
runtime and the models are already there. `MISS` lines are required, `warn`
lines are not. For each `MISS` on Node, Python or ffmpeg: show the printed
command, explain it installs for this user only, and ask. After an install,
the new tool may need a new terminal to be on PATH: if `doctor` still misses
it, ask the user to restart Claude Code and run setup again.

Python must be 3.12 or 3.13: the pinned packages need 3.12 and do not yet
support 3.14. Intel Macs are not supported (no wheel of the pinned
onnxruntime).

### 2. Build the voice runtime

Tell the user: a Python venv of about 300 MB in the plugin data folder, with
pinned packages (exact versions, sha256 hashes, wheels only, so no package
code runs while installing). Then:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/runtime.mjs" install --data "${CLAUDE_PLUGIN_DATA}"
```

With `uv` on PATH it takes seconds when the packages are cached; with plain
`python -m venv` and pip, about 2 minutes. A second run with unchanged
requirements does nothing. It ends with a self-check.

### 3. The models

Ask: "Do you already have the Kokoro v1.0 model (`kokoro-v1.0.onnx`,
`voices-v1.0.bin`) or the faster-whisper `small` model on this machine? If so,
which folder?" If the user gives a folder (or several), or passed one as the
argument:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/runtime.mjs" models --data "${CLAUDE_PLUGIN_DATA}" --from "<folder>" [--from "<folder2>"]
```

Files are found by name and size in any layout (a Hugging Face cache too),
checked against their pinned sha256 and used where they are; nothing is
copied unless the user wants it (`--copy`). Files not found are downloaded,
so before running without `--from`, or when some files are missing, say what
will be downloaded and how big it is, and ask. To check without downloading,
add `--no-download`.

### 4. The choices

Ask these, in this order, one at a time. On a re-run, `config.mjs show`
gives the current values; offer them as the defaults.

| Key | Question | Default |
|---|---|---|
| `language` | Language of the narration and of the text on screen? | `it` (others: `en`, `en-gb`, `es`, `fr`, `pt`; only Italian is tested) |
| `engine` | (no question) tell the user the voice is Kokoro, local; it is the only engine in this version | `kokoro` |
| `voice` | Which voice? See below | the language's default (`im_nicola` for `it`) |
| `captions` | Captions burned into the video? | yes |
| `page` | An HTML page next to each video, with a short explanation, the commands shown and, when the facts have them, the decisions to take? | yes |
| `openOnDelivery` | When a video is ready, open its page (or the MP4) by itself with your default program? | yes |
| `checkpoints` | Where should video-making stop for your OK: `none`, `narration` (the script, before the voice), or `narration+preview` (also the stills before the render)? | `narration` |
| `videosDir` | Folder for the video projects, relative to the project? Each video takes about 600 MB. Save it relative (`videos`, `docs/videos`); save an absolute path only if the user wants every project's videos in that one folder, and say so (`config.mjs set` warns) | `videos` |
| `paletteLight` | Which paper for the light stage? See below | `giallo` |
| `paletteDark` | Which paper for the dark stage (close-ups, code, the lesson)? `notte`, a faded neutral black with dim blue squares, or `ardesia`, slate with warm white ink and dim green graph paper | `notte` |
| `font` | Which font for the text on screen? See below | `inter` |
| `music` | Background music under the narration? See below | yes |
| `musicStyle` | (no question) say that Claude picks the style for each video from what it describes, and that the user can ask for one; save `musicStyle` only if the user wants one style for every video | `auto` |
| `sfx` | Short sound effects at chapter changes and at a few key moments (the error that appears, the check that passes), only in the pauses of the narration? | yes |
| `audioDir` | (only when `music` or `sfx` is yes) A folder of your own music and effects, used instead of the generated ones? See below | none |
| `musicLevel` | (no question) the music sits 16 LU under the voice; say that "music lower" works for one video or for all (`normal` 20 LU, `low` 24 LU) | `high` |
| `format` | (no question) say that each video is 16:9, 9:16 or 1:1, picked from the subject, and that the user can ask for one; save `format` only if the user wants every video in one format | `auto` |
| `resolution` | (no question) 1080 px on the short side, in every format | `1080p` |

**The voice.** List the voices of the chosen language:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/runtime.mjs" voices --data "${CLAUDE_PLUGIN_DATA}" --lang <language>
```

Make a sample of the default voice and of one alternative (for Italian:
`im_nicola`, male, and `if_sara`, female), about 5 seconds each:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/runtime.mjs" sample --data "${CLAUDE_PLUGIN_DATA}" --voice <voice> --lang <language>
```

Give the user the paths it prints (`<data>/samples/<voice>-<language>.wav`) and
ask which voice to keep. Make more samples if asked. Each voice has its own
default speed, tuned to about 2.4 words per second; do not ask about speed
unless the user brings it up (key `speed`, 0.7-1.3).

**The light paper.** Offer the default and the others in one short list,
with the words of style rule 8 ([../make/references/style.md](../make/references/style.md)):
`giallo` (yellow notepad, blue squares, red margin; the default),
`quaderno` (school notebook, white), `milli` (blue graph paper), `arancio`
(orange graph paper), `tecnico` (green engineering pad), `rosso`, `verde`,
`grigio` (squares in that colour). There are no sample images: the user
sees the paper on the first video's stills and can change it then, for
that video or for all.

**The font.** List the fonts this machine has that fit:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/fonts.mjs" list
```

Offer Inter (bundled, the default) and the first two or three of the list,
plus "a font file of yours". For a file, run `fonts.mjs check "<file>"` and
tell the user what it says (a single file gives no real bold, and a
`.woff` or `.woff2` loads as weight 400 even when it is variable; a font
whose maker restricts embedding gets a warning). Say that the chosen font is
copied into each video folder and kept out of git there. Save it as
`font=<family as listed>` or `font=<file path>`.

**Music and effects.** Say that both are made by the plugin itself, from
the video's name: no audio of anyone else, nothing downloaded, the same
video always sounds the same. The music is a quiet bed under the voice: it
drops while the voice speaks (16 LU under it), rises a little in the long
pauses, changes slightly at each chapter and ends with the video. There are
three styles, with the words of style rule 32
([../make/references/style.md](../make/references/style.md)): `warm` (soft
pad, round bass, a slow upper line; calm), `pulse` (a soft bass on every
beat, the chord breathing on the beat; more rhythm), `minimal` (glassy pad,
a faint bass, a slow glassy line; the most discreet). No note starts
sharply, in any style. Do not ask which one: Claude picks it for
each video from what the video describes (a calm bed for an explanation,
more rhythm for a short demo, the most discreet for an incident or a lot of
code), and says which in one line. If the user wants one style always,
save it. There are no samples here: the user hears it in the first video
and can change it then, for that video or for all. Effects never play over
the voice: each one waits for a pause.

**A folder of one's own sounds.** Optional. Files named `music...`,
`chapter...`, `error...`, `success...` (wav, mp3, ogg, flac, m4a, aac or
opus); a kind found there replaces the generated one, at the same level and
in the same pauses; with several `music` files, each video takes one. Say
that the user is responsible for the rights of those files, that they are
read from the folder at every render and never copied into the plugin.
Save it as `audioDir=<path>`; check that the folder exists.

### 5. Save

Always run `set`, with the keys the user changed from the default (a key left
at its default is not saved, so a better default in a later version still
reaches it):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" set --data "${CLAUDE_PLUGIN_DATA}" voice=if_sara captions=false
```

When the user kept every default, run it with no `key=value`: it still writes
`config.json` (an empty `{}` on a first setup), which records that setup ran.
`set` checks every value (unknown keys, languages and voices included) and
writes nothing if one is wrong. A value equal to its default is not
saved, and a default an earlier setup saved is removed by any `set`. When
an answer on a re-run goes back to the default, `unset` the key:
`config.mjs unset --data "${CLAUDE_PLUGIN_DATA}" <key>`. Then:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" show --data "${CLAUDE_PLUGIN_DATA}" --project .
node "${CLAUDE_PLUGIN_ROOT}/scripts/runtime.mjs" doctor --data "${CLAUDE_PLUGIN_DATA}"
```

### 6. Tell the user

In a few lines: the choices in effect, where the runtime and the models are,
that every choice can be changed for one video just by asking ("without
captions", "female voice", "no page", "don't open it"), that running setup again changes the
defaults, and that a video is made with `/video-director:make` or by asking
for one. Mention the Remotion license note from the README if the user may
use it for a company with more than 3 people.

## Common mistakes

- Running the printed `winget`, `brew` or `uv` command without asking.
- Downloading the models without asking whether they are already on disk.
- Asking all the questions in one message: one at a time, with defaults.
- Saving every key, defaults included: only changed keys go in `config.json`.
- Skipping `set` because every answer was the default: run it with no
  `key=value`, so `config.json` is written.
- Opening the sample WAV in a player for the user.
- Saving `audioDir` with a folder of someone else's music without saying
  that its rights are the user's to check.
- Asking which music style to use, or saving `musicStyle=warm` as an answer
  nobody gave: the default `auto` lets each video take the style that fits
  its subject.
- Proposing a font that `fonts.mjs list` does not list (a serif, a code
  font, one without the full Latin alphabet): the captions and labels are
  made for a readable sans-serif.
- Retrying a step that failed for missing rights with elevation.

## Not yet proven

- The install commands `doctor` prints for macOS and Linux, and the winget
  ones on a machine that has no Python or ffmpeg at all.
- Downloads behind a proxy: Node's fetch does not read proxy variables.
- Languages other than Italian.
- The palette, font, music and sound questions: written for this version,
  not yet asked in a fresh setup; the font list was run on Windows only.
- The music style left to Claude for every video (`auto`): not yet tried
  on a series of real videos.
- A folder of one's own sounds: tried with test files made for the purpose
  (an MP3 shorter than the film, looped, and WAV and OGG effects), not with
  real music.
