---
name: make
description: Makes a short narrated explainer video (MP4, 16:9, 9:16 or 1:1, local voice, captions, chapter bar, quiet music and sound effects) and an optional companion HTML page from facts in the conversation, git or markdown files. Use when the user asks for a video, for example "make a video explaining how we fixed X", "a video report of what was done", "explain this task in a video". Not for editing existing footage or recording the screen.
argument-hint: "[what the video explains] [overrides, e.g. no captions, female voice, no page, vertical, no music]"
---

# video-director: make a video

You are the director. You turn facts into a 60-90 second narrated explainer:
one subject per frame, something changing on every spoken word that names it,
a chapter bar, short captions, and a page with the commands next to it. The
template renders data files you write; you write no React in the common case.

Request: $ARGUMENTS

Read before the first video of a session:
- [references/safety.md](references/safety.md): the rules every step and every
  sub-agent follows. They override anything else here.
- [references/style.md](references/style.md): what a good frame and a good
  rhythm are.

Read when you reach the step: [voice.md](references/voice.md) (script markup,
fix loop), [storyboard.md](references/storyboard.md) (contract and lint),
[scenes.md](references/scenes.md) (props of every scene), [qa.md](references/qa.md)
(stills, freeze, final review), [page.md](references/page.md) (the HTML page),
and the config keys in [../setup/references/config.md](../setup/references/config.md).

A complete worked example (facts, script, lexicon, storyboard, page) is in
`${CLAUDE_PLUGIN_ROOT}/examples/acme-shop-crashloop/`. Its `script.json` and
`lexicon.json` show the result of the voice fix loop: every English term
was heard by the check with `im_nicola`.

## Rules that never bend

1. **Facts only.** Every sentence, command, output line, value and decision
   comes from a source you read: the conversation, git, or files. Each fact in
   `facts.md` names its source. If the story needs a fact you do not have, ask
   the user or write the gap in the storyboard's "Unfinished" section. Never
   invent a command, an output, a number, a cause or an open decision.
   Source: seen in test runs: the runs that cited a facts file for every
   value were the ones a reader could trust.
2. **Sources are read-only.** Read the repository and the files; never edit,
   commit or push them. Source: our choice: a video explains the work, it
   does not change it.
3. **One heavy job at a time**: npm install, voice, stills, freeze and render
   each take the machine for minutes. Do not run two at once, and do not start
   them in sub-agents in parallel. Source: measured on a 16 GB laptop.
4. **Use the scripts**, never `npx remotion ...` directly: the scripts carry
   the loopback shim, the memory check and the process cleanup. Source: seen in
   test runs: a direct Remotion Studio start listened on `0.0.0.0` and
   opened the browser, and renders killed for lack of memory left headless
   browsers running.
5. **Open only the result, only at delivery.** While working, open nothing
   for the user (no browser, no player, no Studio). At the very end, when
   `openOnDelivery` is true (the default), run `open.mjs` once: it opens the
   finished page, or the MP4 when there is no page, with the system's default
   program. Sub-agents never open anything. Source: seen in test runs: a
   window of the user's browser opened on its own in the middle of the work;
   the user of this plugin asked instead for the page to open by itself when
   the video is ready.

## Steps

Commands below use `${CLAUDE_PLUGIN_ROOT}` (the plugin) and
`${CLAUDE_PLUGIN_DATA}` (its data folder: config, runtime, models). Run them
from the user's project folder. In the reference files the plugin folder is written `<plugin>` and the data
folder `<data>`: use the two paths in this paragraph for them. `<videoDir>` is `<videosDir>/<slug>`.
Write the start time of the video and of each step down as you go (`date`);
they go into `OUTCOME.md`.

### 0. Preflight

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/runtime.mjs" doctor --data "${CLAUDE_PLUGIN_DATA}"
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" show --data "${CLAUDE_PLUGIN_DATA}" --project .
```

If `doctor` exits with 1 (a `MISS` line: Node, Python, ffmpeg, the runtime
or the models), the plugin is not set up: tell the user and offer
`/video-director:setup`. Do not install anything from here. Exit 0 means it is
set up, whatever its `warn` lines say: a missing `config.json` only means every
default applies. `show` gives `videosDir`, `checkpoints` and the other
install choices, and `modelsFound`, the folders that really hold the models.
When `show` warns that `videosDir` is outside the project (an absolute path
saved at setup sends every project's videos to one folder), say where the
video will go before step 2, so the user can choose another folder.

### 1. Choices for this video

Any install choice can be changed for this video only, when the user asks
(for example "senza sottotitoli", "voce femminile", "niente pagina", "in
English", "don't stop to ask"). Map the words to keys with the table in
[config.md](../setup/references/config.md#mapping-what-the-user-says-to-overrides);
when a wish is unclear, ask once. Never save a per-video wish with
`config.mjs set`: that changes every later video.

**Another folder for this video** ("put it in docs/videos"): that folder is
`<videosDir>` from step 2 on. Pass it to `new-video`; `config.mjs video`
takes it from `<videoDir>` and records it as an override, so no
`videosDir=` is needed there.

**The format.** Unless the user named one ("in verticale", "square",
"16:9") or `config.mjs show` gives a `format` other than `auto`, pick it
from the subject and where the video will be watched, with the table in
[style.md](references/style.md#choosing-the-format): 16:9 for an
explanation of a minute or more and for long commands or code, 9:16 for a
short video for a phone, 1:1 for a clip to paste into a chat or a document.
When unsure, 16:9. What counts is what the video **shows**: a terminal or
code line longer than about 60 characters that the video must show rules
out 9:16 and 1:1, not every long line of `facts.md`. A wide table (`kubectl
get pods`) can show its values in a `StatusCard` (and the full table in the
page's `values`), and a line that is not needed for the point (an event
line) can stay out of the video, listed in "Unfinished". Only when the
lines the video needs do not fit is it 16:9; when the user asked for a
phone video, say so in the format line. Source: a test asked for a phone
video of an incident whose `facts.md` had four lines of 68-83 characters;
the rule as first written forced 16:9, and the video worked in 9:16 with
a `StatusCard`. Say the format and why in one line when you show the
chapter list (step 4), and write it in `OUTCOME.md` as your choice or the
user's.

**The music style** (when `music` is on). Unless the user named one ("più
ritmica", "più discreta") or `config.mjs show` gives a `musicStyle` other
than `auto`, pick it from what the video describes, with the table in
[style.md](references/style.md#choosing-the-music-style): `warm` for an
explanation, a how-to, a report or a task; `pulse` for a short demo with a
quick rhythm; `minimal` for a delicate subject (an incident or an outage,
also when the video is the how-to of its fix, a postmortem, a security
problem) or a video with a lot of code to read. When unsure, `warm`. Say
it in the same line as the format, and write it in `OUTCOME.md` as your
choice or the user's.

Pick a slug: lowercase letters, digits and dashes, from the subject
(`checkout-crashloop`). If `<videoDir>` exists, ask before reusing it.

### 2. Create the project

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/new-video.mjs" "<videosDir>" <slug>
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" video "<videoDir>" --data "${CLAUDE_PLUGIN_DATA}" --project . --chosen format,musicStyle format=<16:9|9:16|1:1> musicStyle=<warm|pulse|minimal> [key=value ...]
```

`new-video` copies the template and runs `npm ci --ignore-scripts` from the
pinned lockfile (about 1 minute, about 300 MB). Tell the user first that this
video will download its npm packages and, on its first still (step 7),
Remotion's headless browser, about 280 MB more, once per video (see safety
rule 4). It must run before `config.mjs video`, which writes
`<videoDir>/video.config.json`: the choices that apply, with where each came
from. Read that file; the rest of the steps follow it (`language`, `voice`,
`captions`, `page`, `checkpoints`, `format` with `width` and `height`, the
palettes, the font, and `music`, `musicStyle`, `musicLevel`, `sfx`,
`audioDir`, which only the render reads). Pass the format and the music
style chosen at step 1, or the ones the user named; leave out the one that
`config.json` fixes (`config.mjs show` gives a value other than `auto`).
Without them, `config.mjs video` warns and uses 16:9 and `warm`. A value
equal to `config.json`'s is recorded as `config`, not as a choice of this
video. `--chosen` lists the keys you chose (the format and the music
style, the speed when you lower it for the pace); leave a key the user
named out of it: `from` then says `claude` or `override` (the user's),
and the OUTCOME's "Choices" says who chose each. Run it from the project
(`--project .`): from inside the videos folder it warns and uses the
project above.

### 3. Intake: `facts.md`

Gather the facts into `<videoDir>/facts.md`, in the video's language:

- **From the conversation**: what the user said, quoted or summarized, with
  "conversation" as the source.
- **From git**: `git log`, `git show <commit>`, `git diff`; cite the commit
  (short hash) and the file.
- **From files**: markdown notes, pipeline files, logs; cite `path:line`.

Write commands and their output **verbatim** in fenced blocks, commands with a
`$ ` prefix, exactly as they ran (the lint matches terminal lines against
these lines). Put a source next to every fact. Keep a short "Open decisions"
section only if a source states a decision that is still open (with its
options and who decides); otherwise leave it out. Mark the file as fictional
when the user gave an invented scenario.

Decide what kind of video it is and take its arc (style rule 34):

| Kind | Chapters |
|---|---|
| How-to, incident, fix | problem, diagnosis, cause, fix, verify, lesson |
| Report of work done | goal, what changed, evidence, result, open decisions |
| A task to do | goal, where it lives, steps, risks, decisions |

**A task to do**, as one example (acme-shop: "add a gift-card payment to
checkout"):

| Chapter | What it shows | Scene |
|---|---|---|
| goal | what the task asks, in one sentence; the task number if the facts give it | `HookStatus` slab alone, or `FlowDiagram` |
| where it lives | the screens, services or files it touches, as the facts name them | `FlowDiagram` |
| steps | the work in order, done ones ticked | `StepList` |
| risks | what can go wrong, only as the sources state it | `StatusCard` rows without `ok`, or `StepList` |
| decisions | what is still open, and who decides | `StepList` (one item per decision, the owner in the text) |

**Decisions already taken are not open.** Task notes collect decisions over
time, and sources of different dates disagree: read every source for its
date and use the latest state. A question answered at a later gate, review
or meeting is a fact ("decided on 2026-03-02: X"), not an open decision;
show it, if at all, as done. Only what the newest source still leaves open
goes into "decisions", on screen and on the page. In the test videos of a
task, the notes held eleven points already closed at a gate next to the
few still open, and nothing in this skill said how to tell them apart; the
final review now counts a closed decision shown as open as a P0.

When the sources say the work is further along than the request ("to do",
but already developed), follow the sources and say what is left.

### 4. Script: `script.json` (contract A)

Write `<videoDir>/script.json` as described in [voice.md](references/voice.md):
chapters with labels in the video's language (uppercase, at most 14
characters), and sentences, each with its chapter.

- **Length**: the time the subject needs to be explained, no fixed number:
  60-90 s of video (about 140-210 words at 2.3-2.7 words per second,
  usually 12-18 sentences) is a guide for one how-to, not a limit, and
  "short" or "breve" without a number sets no target (a phone video of
  75 s is fine). **A length the user asks for wins**: write
  it in the storyboard as `targetSeconds` (step 6), and the lint checks the
  video against it. Over 2 minutes without a length from the user, propose a
  split. Under 45 s, follow [Short video](#short-video) below; over 90 s,
  [Longer video](#longer-video).
- **Sentence one states the problem** (or the goal); no greeting, no title.
- **One idea per sentence**, short, spoken style. Name each thing that will
  appear on screen with the word you will anchor it to.
- **Exact terms**: write `kubectl`, `DATABASE_URL`, `503` with their real
  spelling; the markup decides how they are said (`{503|cinque zero tre}`,
  `{en:rollout restart}`). Never put a respelling in the text.
- **Mirror**: if the first chapter shows a symptom, the verify chapter names
  it resolved.

**Estimate before the checkpoint** (a few seconds, no synthesis, no
models):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/voice.mjs" "<videoDir>" --estimate
```

It prints the expected pace and length from the spoken words and the
video's speed (on the test videos: 88.0 s estimated, 88.3 s rendered; 74.7
and 74.5). Make the cuts now, while nobody has approved the text yet: too
long for what the user asked, cut sentences; a pace over 3.0, lower the
speed now (`config.mjs video ... --chosen speed speed=`), not after a synthesis.

**Checkpoint: narration** (when `checkpoints` is `narration` or
`narration+preview`). Show the user, in one message, the chapter list and the
shown text of every sentence (markup removed), plus the estimated length.
Ask for corrections; apply them; do not go on without an answer. This is the
cheapest point to fix a fact or the tone. With `checkpoints: none`, go on.
After the checkpoint, change the text only for a pronunciation, a beat that
needs a word, or a fact; do not ask again: list every sentence changed
after the checkpoint, before and after, in `OUTCOME.md` under "Changed
after the checkpoint". Source: in a test video 9 of 15 approved sentences
changed afterwards (pace, length, storyboard) and the user approved a text
that was not the video's; the user prefers a video ready sooner to more
rounds of questions.

### 5. Voice

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/voice.mjs" "<videoDir>"
```

About 2 minutes for 90 s of speech. It writes `public/voice/*.wav`,
`voiceover.json` (contract B) and `qa/voice-report.json`, and prints the pace
and the English terms and marked parts (`{SSO|esse esse o}`,
`{commit|it:commit}`) Whisper did not recognise, with fixes. For each miss:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/voice.mjs" "<videoDir>" --try s04 "<variant 1>" "<variant 2>"
```

Put every variant you want to compare in **one** `--try` per sentence (2-4
of them), put the winner in `script.json` (or in `<videoDir>/lexicon.json`)
and run `voice.mjs` again; only changed sentences are synthesized. At most
two `--try` per term: when none is heard, keep the best and list it. Stop
after three rounds of `voice.mjs`: list what is still not heard in
`OUTCOME.md`, and the terms the summary lists as said in the narration
language. Check the pace in the summary (2.3-2.7 words per second, on the
spoken words; the shown-word pace is lower when the script has many numbers
or codes, and that is expected). **Up to 3.0 is fine**: note it in
`OUTCOME.md` and go on, no new synthesis. The test videos measured 2.72 to
2.85 with `im_nicola` at its default speed; lowering the speed meant
synthesizing everything again for a difference the user did not ask for.
**Over 3.0**, cutting words does not help (the pace stays the same): lower
the speed of this video by 0.05 with `config.mjs video ... --chosen speed speed=` and run
the voice again, as in [voice.md](references/voice.md#pace-over-30); write
it in `OUTCOME.md` as your choice. If the video is too long, cut words,
never raise the speed above the voice's default.

### 6. Storyboard

Read `voiceover.json` (sentence lengths and words), then write
`<videoDir>/storyboard.json` (contract C, [storyboard.md](references/storyboard.md))
and `<videoDir>/STORYBOARD.md`:

- `fps` 30; **`width`, `height`, `captions`, `paletteLight` and
  `paletteDark` copied from `video.config.json`**; `chapters` copied from
  `script.json`; `parts` when the chapter labels do not fit one row of the
  chapter bar (on 9:16 and 1:1 a how-to's 6 chapters need two parts of
  three, see [storyboard.md](references/storyboard.md)); and
  `targetSeconds` (`[90, 150]`) when the user asked for a length;
- 8-10 shots for 90 s, 6-14 s each, cut by idea; a scene from
  [scenes.md](references/scenes.md) for each; light for concepts, dark for
  close-ups and the lesson;
- 3-6 beats per shot on the words that name what appears, 1.5-2.5 s apart;
- every terminal and code line copied from `facts.md`; `learns` and `sources`
  on every shot;
- `sfx` on the 1-3 key moments (`error` where the error appears, `success`
  where the check passes), each at a beat on the last word of the sentence
  that states it, so it plays within 0.3 s of that word
  ([storyboard.md](references/storyboard.md#sound-effects)); the chapter
  changes get their effect by themselves;
- an "Unfinished" section in `STORYBOARD.md` for anything missing.

Then lint until it passes:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/lint-storyboard.mjs" "<videoDir>"
```

Fix every error; read every warning and fix it or note why in `OUTCOME.md`.

### 7. Stills and freeze

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stills.mjs" "<videoDir>"
node "${CLAUDE_PLUGIN_ROOT}/scripts/freeze.mjs" "<videoDir>"
```

The first `stills.mjs` of a video downloads Remotion's headless browser
(about 280 MB, once per video), as you told the user at step 2.

Read every `qa/contact-sheet-NN.jpg` as an image and check each shot with the
list in [qa.md](references/qa.md#stills-and-contact-sheets). Fix, lint, re-run
`stills.mjs --shot sh01,sh06` for the shots you changed, all in one run (each
shot's sheets go to `qa/shot-<id>/`). Then the freeze probe; fix any frozen
pair the same way.
After the last fix, run `stills.mjs` and `freeze.mjs` once more without
`--shot`, so the full-film sheets and `qa/freeze.json` are current.

**Checkpoint: preview** (only with `narration+preview`): give the user the
contact sheet paths and offer a one-shot render with audio
(`render.mjs "<videoDir>" --composition Shot-<id>`). Wait for the OK.

### 8. Render

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" "<videoDir>"
```

About 5-9 minutes for 90-140 s on a 16 GB laptop: it depends on the free
memory more than on the length (concurrency 2 needs more than 6 GB free;
test renders took 9 minutes at 4.7 GB free and 5 minutes at 5.8 GB, both at
concurrency 1). Close heavy programs before it. It checks free memory (refuses
under 2.5 GB: ask the user to close something; do not pass `--force` without
their OK), renders on 127.0.0.1 with Remotion's own headless browser, cleans
up every child process, mixes in the music and the effects (style rule 32;
built in a few seconds before the render starts, only in the pauses of the
narration), normalizes the
whole mix to -14 LUFS and writes `out/<slug>.mp4` and `qa/render.json`.
It prints the music's source and its level under the voice, and how many
effects were placed and left out; copy that line into `OUTCOME.md`.

### 9. The HTML page (when `page` is true)

Write `<videoDir>/page.json` (contract D, [page.md](references/page.md)) from
the same `facts.md` and `script.json`: title, a one-paragraph summary, one
section per chapter with the commands shown in the video and their sources,
decisions only if `facts.md` has open decisions, and the transcript (shown
text). Then:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/page.mjs" "<videoDir>"
```

It writes `out/<slug>.html`, one self-contained file that links the MP4 next
to it.

### 10. Final review

Make the final contact sheet and start one fresh sub-agent with the brief in
[qa.md](references/qa.md#final-review-by-a-fresh-sub-agent) (it contains the
safety block). It writes `qa/review.md` with P0/P1/P2 findings. Fix P0 and P1
**once**, re-run the checks they touch, render again (and rebuild the page if
it changed). Do not loop. Which stills to run after the fix (only the changed
shots with `--shot`, or the full set when the voice or the shot lengths
changed) is in [qa.md](references/qa.md#final-review-by-a-fresh-sub-agent);
say in `OUTCOME.md` which `qa/` files are from before the fix.

### 11. Deliver: `OUTCOME.md`

Write `<videoDir>/OUTCOME.md`:

```
# <title>

- Video: out/<slug>.mp4 (<duration> s, <width>x<height>, <size> MB)
- Page: out/<slug>.html  (or: not made, page=false)
- Started <time>, delivered <time>, total <minutes> min

## Choices
<every key of video.config.json whose source is not "default", with its source: claude (your choice), override (the user's), config>

## Steps
| Step | Start | Minutes | Result |
|---|---|---|---|
| intake | | | n facts, sources: ... |
| script | | | n sentences, n chapters, checkpoint answered / skipped |
| voice | | | pace n spoken words/s, terms heard n/m, marked parts heard n/m, said in the narration language: ... |
| storyboard + lint | | | n shots, n warnings |
| stills + freeze | | | n stills, lowest change n% |
| render | | | loudness n LUFS, true peak n dBTP; music <style or file>, n LU under the voice; effects n (n left out) |
| page | | | |
| final review | | | P0 n, P1 n, P2 n; fixed: ... |

## Changed after the checkpoint
<each sentence changed after the narration checkpoint: id, approved text, final text, why; or "none">

## Not checked or not fixed
<terms not heard, lint warnings left, review findings left, gaps from "Unfinished">
```

Then tell the user, in their language: the paths of the MP4, the page and
`OUTCOME.md`, the length, and anything in "Not checked or not fixed". Last,
open the result (rule 5):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/open.mjs" "<videoDir>"
```

It opens `out/<slug>.html`, or `out/<slug>.mp4` when `page` is false, and
does nothing when `openOnDelivery` is false for this video ("non aprire",
"don't open it"). If the user later asks to see it, run it with `--force`.
If it cannot open the file, the paths you already gave are enough.

## Short video

When the user asks for a video under 45 s (for example "15-25 seconds"), the
steps are the same; only the sizes change. Source: a 23 s test video, where
the closing sentence of 3 s could not form a shot of its own and could not
join the shot before (another chapter).

- **Chapters**: 2-4, a reduced arc (how-to: problem, fix, verify; report:
  goal, result). One shot per chapter, so every chapter must be long enough
  for a shot.
- **Sentences**: the lint wants shots of at least 5 s (4 s for the last one,
  which ends on the 0.6 s tail). At the default pace that is about 12 spoken
  words of narration per chapter (about 4.5 s), 9 for the last one. Write
  each chapter as one or two sentences of that size; a closing sentence of 5
  or 6 words is too short. Lengthen with facts only, never with filler.
- **Beats**: 3 per shot, the lint minimum, 1.5-2.5 s apart; anchor them to
  the words that name what appears, as usual.
- **Mirror**: keep it when there is a symptom; the first and the last shot
  are then the same scene.
- **Lint**: the length warning says "short video". It is expected: note in
  `OUTCOME.md` that the user asked for that length.
- **Time**: the fixed costs do not shrink (npm install, the headless browser
  download, bundling, one review): that 23 s video took about 26 minutes,
  one fix round included.

## Longer video

When the user asks for more than 90 s (for example "90-150 seconds" for a
task with many decisions), the steps are the same and the user's length
wins: no split to propose, `targetSeconds` in the storyboard, no length
warning to explain. Sizes: about 1 shot per 9 s (15 shots for 135 s), the
chapters of the arc (5 for a task), the same 3-6 beats per shot. The chapter bar shows every chapter;
when the labels do not fit one row, group them into parts. Source: three test videos asked for 90-150 s ended
at 131-141 s; each one had to explain a "60-90 s" warning.

## Changing a delivered video

A later request on the same video ("shorter", "change the voice", "no
captions") reuses `<videoDir>`: run `config.mjs video` again with the new
values only. It keeps the video's earlier overrides (the keys that
`video.config.json` marks `override` in `from`, such as `format` and
`musicStyle`) unless they are given again; `key=default` drops one, so the
key goes back to `config.json`. Then redo only the steps that change (voice
for script or voice changes, storyboard and lint for picture changes),
stills of the changed shots, render, page, and update `OUTCOME.md`. Music
and effects ("no music", "music lower", "more rhythm", "no effects")
change at the render only: `config.mjs video` with the new values, then
`render.mjs`; no voice, stills or lint needed. A new format ("make it
vertical") is a new layout: `format=` here, the storyboard's `width` and
`height`, then lint and stills of every shot. Source: in a review, a
"music lower" run without the format turned a 9:16 video back to 16:9.

## Common mistakes

- Writing the storyboard before `voiceover.json` exists: shot lengths and beat
  frames come from the measured voice.
- Forgetting to copy `captions`, `width`, `height` or the palettes from
  `video.config.json` into the storyboard: the lint fails and the render
  refuses to start until they agree.
- A 9:16 or 1:1 video for a subject whose video must show long commands or
  YAML: the lines do not fit; it is a 16:9 video. The opposite mistake:
  ruling out 9:16 for long lines of `facts.md` that the video does not need
  to show (a wide table's values fit a `StatusCard`).
- Leaving out `musicStyle=` at step 2 when the install value is `auto`: the
  video gets `warm` whatever it is about. A postmortem with a rhythmic bed
  sounds careless; pick the style from the subject.
- Writing a command in the narration as `{en:...}`: it is drawn as a word in
  the captions; backticks make it code (voice.md).
- Saving a one-video wish in `config.json` with `config.mjs set`.
- Paraphrasing a command on screen ("kubectl get pods" when the facts say
  `kubectl get pods -n shop`): the lint fails, and the page would teach the
  wrong command.
- An "Open decisions" section made up to fill the report arc or the page.
- Rendering to see whether a fix worked: use the stills of that shot.
- Starting the final reviewer without the safety block, or giving it the
  conversation instead of `facts.md`.
- Running the voice step and a render at the same time: both need the CPU and
  the memory, and the render may refuse to start.
- An `sfx` on many shots, or anchored mid-way through a sentence: the
  effects are for 1-3 key moments, and one with no pause within 0.3 s of
  its word is left out.
- Raising the voice speed to fit 90 s: cut sentences.
- Cutting sentences to lower a pace over 3.0: it shortens the video, the
  pace stays; lower the speed of that video instead.
- Lowering the speed for a pace of 2.7-3.0: a whole new synthesis for
  nothing; note it and go on.
- Asking for the narration again after the checkpoint for a pronunciation
  fix: list the change in `OUTCOME.md` instead.
- Showing as open a decision a later source has already taken.
- Passing `videosDir=` to `config.mjs video` for a video in another folder:
  it comes from `<videoDir>`; a different value is refused.
- Copying `width` and `height` from `video.config.json` into the storyboard
  when they differ and the user did not ask for a new format: run
  `config.mjs video` again with the video's `format=` instead.

## Not yet proven

- Videos in a language other than Italian: the voices, sample sentences and
  page labels exist for English and others, but no video was made.
- The "report of work done" arc, and facts taken from git history: the
  rendered examples are a how-to from a facts file and three "task to do"
  test videos from markdown notes (none of them in this repository).
- The preview checkpoint's one-shot render, and changes to a delivered video
  (the kept overrides were run on a test video, not with a user).
- `Screenshot` and `Custom` scenes in a real video.
- Videos longer than about 2 minutes and a half.
- Short videos with 4 chapters, or with more than one sentence per chapter:
  only a 3-chapter, 3-sentence one was made.
- macOS and Linux (written for them, run only on Windows), including the
  font folders searched for the text font.
- 9:16 and 1:1 videos: the layouts were checked on stills and 3 s clips of
  the example, not in a full video; Claude's choice of the format was not
  tried yet.
- Music and sound effects in a full video: measured on the example with its
  real voice and on 20 s clips of each style, not yet heard by a viewer in
  a whole film; `sfx` and the music style chosen by Claude in a new video
  were not tried yet.
