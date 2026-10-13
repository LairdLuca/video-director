---
name: setup
description: Installs or reconfigures video-director, once per machine. Checks Node, Python, ffmpeg, disk and memory, builds the local voice runtime and models at user level, and asks the install-time choices (language, voice with a sample, captions, HTML page, checkpoints, video folder). Use only when the user explicitly asks to install, set up or reconfigure video-director, or to change its default voice, language, captions, page or checkpoints. Never use it to make a video.
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
   them. Source: the same as rule 5 of the make skill: in the comparison, a
   tool opened a window of the user's browser on its own.

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
| `resolution` | (no question) 1920x1080, 16:9; the only size in this version | `1080p` |

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
writes nothing if one is wrong. To go back to a
default: `config.mjs unset --data "${CLAUDE_PLUGIN_DATA}" <key>`. Then:

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
- Retrying a step that failed for missing rights with elevation.

## Not yet proven

- The install commands `doctor` prints for macOS and Linux, and the winget
  ones on a machine that has no Python or ffmpeg at all.
- Downloading the large model files (only a small file of the pinned set was
  downloaded during development; the code path is the same).
- Downloads behind a proxy: Node's fetch does not read proxy variables.
- Languages other than Italian.
