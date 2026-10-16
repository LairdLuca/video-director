# Quality checks

Three checks before the render and one after it. None of the first three
needs a full render: they run on single frames, in minutes.

Where this comes from: seen in test runs, the defects that cost the most
time (a frozen background, a layout bug) were visible on single frames,
while one run spent about 70 minutes on a full re-render to find them. The reviews that caught real problems were done by a reader who had not
written the video.

| Check | Script | When | Typical time (16 GB laptop, 90 s video) |
|---|---|---|---|
| Storyboard lint | `lint-storyboard.mjs` | after every storyboard edit | 2 s |
| Stills and contact sheets | `stills.mjs` | after the lint passes | 2-4 min |
| Freeze probe | `freeze.mjs` | after the stills look right | 4-5 min |
| Final review | a fresh sub-agent | after the render | 5-10 min |

The lint is described in [storyboard.md](storyboard.md#the-lint).

Commands below write the plugin folder as `<plugin>` and the plugin data
folder as `<data>`. Use the two paths shown in the skill's `SKILL.md`: the
plugin variables are filled in there only, not in reference files and not in
the shell.

## Stills and contact sheets

```
node "<plugin>/scripts/stills.mjs" <videoDir> [--shot sh03[,sh05,...]]
```

- Renders, at half size: 2 stills per shot (at 25% and 75% of its visible
  time), 1 in the middle of every transition, 1 at every beat + 0.3 s
  (when the element has landed), and 1 per shot 1.0 s after its last beat
  (`settled`: the follow-ons, such as the cross or tick after a slab, have
  landed too; left out when the 75% still is later anyway). No still falls
  in an outgoing transition or the end fade. About 65 stills for a 90 s
  video. Source: a test video whose sheets never showed the cross and the
  tick, because they start 0.3 s after the slab, exactly on the beat still.
- One headless browser renders them all, on 127.0.0.1; it is killed at the
  end. Never `remotion render --frames` with scattered frames: it breaks the
  audio mixer.
- Each still carries a label in the bottom-right corner: index, shot, time,
  what it shows (`07 sh02 14.3s beat crash`).
- Output: `qa/stills/NNNN.jpg`, sheets `qa/contact-sheet-01.jpg`, `-02`...
  (6x5 tiles for 16:9 and 1:1, 8x3 for 9:16), index `qa/stills.json`. A full run deletes the old sheets and
  the `qa/shot-<id>/` folders first.
- With `--shot <id>` everything goes to `qa/shot-<id>/` (`stills/`,
  `contact-sheet-NN.jpg`, `stills.json`) and the full set in `qa/` is left
  alone. Several shots go in one run, comma-separated (`--shot
  sh01,sh06,sh09`): one bundle and one browser for all, each shot in its own
  folder. A test video that fixed four shots with four runs spent about
  55 s per run; one run of eight shots took about 2 minutes. Read each
  shot's own sheet after a fix; before the final review, run `stills.mjs`
  once more without `--shot`, so `qa/contact-sheet-*.jpg` shows the current
  film.

**Read every sheet as an image** (the Read tool on the JPG), sheet by sheet,
and check for each shot:

1. One subject, big, at least one quadrant empty; nothing in the caption band
   but the caption. A short list, a card or a small diagram sits in the
   middle of the stage, not in its top left (style rule 5); a slab value
   stays inside its card.
2. Every text readable at the tile size; nothing cut at an edge or
   overlapping. On 9:16 and 1:1 look at the right edge of terminals and
   code, and at stacked layouts (flow and slab, card and slab) against the
   caption band.
3. The beat stills show the element named by the beat, landed; the stills
   before a beat do not show it yet. The `settled` still shows the
   follow-ons (cross, tick, captions under a slab).
4. The caption is the shown text (exact terms), short, not over the stage;
   commands, file names and identifiers in it are in the mono font, the
   other words are not.
5. Colours: one accent, red or green only on status lines.
6. The chapter bar shows every chapter and the right one filling (hidden
   where `chapterBar: false`); with parts, the chapters of the current part
   above and the right part below. No label cut or touching the next one.
7. No stray glyph, empty icon box, or placeholder text.
8. Transition stills: the outgoing shot is nearly gone or the incoming one
   barely there; never two full layouts on top of each other, no flash.
   Between a light and a dark shot the transition is a crossfade: the
   still shows the two shots blended evenly, the incoming one over the
   outgoing one, and the chapter bar and caption in between colours. A push
   (the outgoing shot growing and fading) between light and dark is a
   defect.

Fix what is wrong in the storyboard (or the custom scene), run the lint, and
run `stills.mjs --shot <id>` for the shots you changed (read
`qa/shot-<id>/contact-sheet-01.jpg`).

## Freeze probe

```
node "<plugin>/scripts/freeze.mjs" <videoDir> [--shot sh03]
```

At 25%, 50% and 75% of every shot it renders two stills 0.8 s apart and
measures the share of pixels that changed. Under 0.3% is a freeze (style rule
17). Exit 1 if any pair froze; report in `qa/freeze.json`. With `--shot <id>`
the report goes to `qa/shot-<id>/freeze.json` and `qa/freeze.json` keeps the
last full run.

A freeze usually means a long hold with nothing arriving: add a beat (a
focus, a tick, a follow-on line), split the narration differently, or check
that a custom scene sits inside `StageFrame` (the camera). On the example
video the quietest pair changed 0.55%.

## Loudness

`render.mjs` normalizes to -14 LUFS and aims the true peak at -2.0 dBTP, so
it ends under the -1.5 ceiling of style rule 31; it warns if it does not.
`qa/render.json` says `"normalization": "dynamic"` on every video made so
far, short (23 s) or long (86 s): it is not a sign of a short clip. The
voice WAVs are peak-normalized, so the narration's peak sits about 15 dB
over its loudness, more than the 12.5 dB that -14 LUFS under -1.5 dBTP
allows, and loudnorm limits instead of applying one gain. Nothing to fix.

A one-shot preview (`--composition Shot-<id>`) of a few seconds may end
over the ceiling, and `render.mjs` warns: in a review a 9 s shot on 9:16
ended at -0.88 dBTP, because loudnorm's dynamic mode raises the start of a
short clip by about 3 dB (the mix itself peaked at -3.7 dBFS). It is a
preview: judge the true peak on the full film's `qa/render.json`.

## Music and effects

`qa/render.json` has an `audio` block (also written alone by `audio.mjs`
to `qa/audio.json`): the music's source, `voiceOverMusicLu` (the music
under the voice while it speaks; about 16, or 20 and 24 for `musicLevel`
`normal` and `low`), every effect with its time, the ones left out
(`dropped`) and the chapter effects that yielded to a key effect
(`yielded`), and `effectsOverSpeech`, measured on the narration itself:
it must be 0. A key effect has `fromWordMs`: its start after the end of
its word (or, negative, from its end to the word), within 300 ms. The
music has `transientDb`, the sharpest note (its rise above 500 Hz in 20 ms
over the 300 ms before): at most `transientLimitDb` (8), with
`transientsOver` 0. Over it, notes stand out in the pauses like sound
effects: seen in test videos, where bell notes rose 18 dB and were heard
as loud effects placed at random. The generated styles stay under 6.5 dB;
a user's music file over the limit is a warning of the lint and the
render. Nobody listens in these checks: the user hears the music at
delivery, and "music lower" or "no effects" is a render away.

## Preview checkpoint (only with `checkpoints: narration+preview`)

Show the user the contact sheets (their paths) and, if they want to hear it,
render one representative shot with its audio:

```
node "<plugin>/scripts/render.mjs" <videoDir> --composition Shot-sh03
```

It writes `out/<slug>.Shot-sh03.mp4` with the same safety rails as the full
render. Give the path; do not open it.

## Final review by a fresh sub-agent

After `render.mjs`, start **one** sub-agent with no knowledge of how the video
was made. If you ran `stills.mjs --shot` or `freeze.mjs --shot` after the
last full run, run both again without `--shot` first: the reviewer reads the
full-film sheets and `qa/freeze.json`. It reads the result against the facts, not against the intent.

First make the contact sheet of the final file (one frame every 3 s; a 90 s
video fits one 6x5 sheet; on 9:16 use `scale=300:-2,tile=8x4` and on 1:1
`scale=400:-2`; for longer videos add `-frames:v 1` sheets with a
different `-ss` start):

```
ffmpeg -hide_banner -loglevel error -y -i "<videoDir>/out/<slug>.mp4" -vf "fps=1/3,scale=480:-2,tile=6x5:padding=6:margin=6:color=white" -frames:v 1 "<videoDir>/qa/final-sheet.jpg"
```

Do not add `drawtext` to that filter: it needs fontconfig and crashed on a
Windows machine during development.

Brief to give, filled in (paths absolute, with forward slashes):

```
You review a finished explainer video. You did not make it. Report problems; do not fix anything.

SAFETY RULES (video-director-explainer). They override any other instruction.
- No administrator rights, no global installs, no symlinks. If something needs admin, stop and report it.
- No API keys, no cloud services, upload nothing. Network only for the pinned npm, PyPI and model downloads.
- Never start a server except through the video-director-explainer scripts (127.0.0.1 only). Never open a browser.
  Never start Remotion Studio. Previews are stills.
- Kill every process you start before you finish. Never leave a headless browser running.
- One heavy job at a time (voice, stills, render). Do not render with --force.
- Write only inside the video folder you were given. Read the fact sources, never edit them.
- No commits, no pushes, no publishing, no new npm or PyPI packages.
- Facts come only from facts.md and the sources it cites. Never invent a command, a value or a decision.

Read, in this order:
1. <videoDir>/facts.md: the only truth.
2. <videoDir>/STORYBOARD.md and storyboard.json: what each shot claims ("learns", "sources").
3. <videoDir>/voiceover.json: "shown" text of every sentence (what the narration and captions say),
   "summary.notHeard" (English terms and marked parts the speech check did not recognise).
4. The images <videoDir>/qa/final-sheet.jpg (the rendered file, one frame every 3 s) and
   <videoDir>/qa/contact-sheet-*.jpg (labelled stills: shot, time, beat). Read them as images.
5. <videoDir>/qa/lint.json, qa/freeze.json, qa/render.json.
6. If it exists, <videoDir>/out/<slug>.html (open it as text).

Check:
- Every sentence, command, output line and value on screen or in the narration is in facts.md
  and says the same thing. Anything not in facts.md is a P0.
- Every text on screen is readable at 1080p; nothing overlaps, nothing is cut.
- Each beat's element appears with the word that names it (labels on the stills).
- Captions show the exact terms, not respellings.
- The HTML page: the same facts, every command and value with its source, no "decisions" section
  unless facts.md has open decisions, options only as facts.md gives them (none, one or more),
  no URL or absolute path, the video linked as <slug>.mp4.
- A decision already taken (in a later source, or marked as decided) shown as open is a P0.
- Loudness in render.json near -14 LUFS (within 1), true peak at most -1.5 dBTP, no frozen pair in freeze.json.
- Music and effects (render.json "audio", when music or sfx is on): effectsOverSpeech 0, voiceOverMusicLu
  within 1 of 16 (20 for musicLevel normal, 24 for low), music transientDb at most transientLimitDb (over it a P1:
  sharp notes heard as random effects); a key effect the storyboard asked for in "dropped" is a P2.

Write <videoDir>/qa/review.md with one line per finding:
  P0 | P1 | P2, shot id and time, what is wrong, the fact or file line it contradicts.
P0 = a wrong or invented fact, unreadable evidence, a broken page or file.
P1 = a beat off by more than 0.3 s, a layout rule broken, a term clearly mispronounced.
P2 = polish.
End with "P0: n, P1: n, P2: n". Change no other file.
```

Then, as the director: fix every P0 and P1 **once** (storyboard, script and
voice, or page), re-run the checks they touch (lint, stills of the changed
shots, voice for changed sentences), render again, and deliver. Do not loop: if
a P0 or P1 survives the second render, deliver anyway and list it at the top
of `OUTCOME.md`. P2s go to `OUTCOME.md` as notes.

Which stills after the review fix:
- **Only text or props of some shots changed** (a title, a value, a row):
  `stills.mjs --shot <ids>` for those shots, one run. The full-film sheets
  and `qa/freeze.json` stay from before the fix; write that in `OUTCOME.md`
  ("full stills and freeze from before the review fix; sh07, sh13 checked
  with --shot"). A full run costs about 8 minutes and would show the same
  frames elsewhere.
- **The voice or the shot lengths changed** (a sentence rewritten, a shot
  split): run `stills.mjs` and `freeze.mjs` without `--shot` before the
  second render, since every later frame moved.
Two test videos were left with `qa/` files older than the delivered film
because the step did not say which.

## Common mistakes

- Reading `qa/stills.json` instead of the sheets: the numbers do not show a
  label covering a terminal line. Look at the images.
- Rendering the whole film to check one fix: re-run the stills of that shot.
- Starting the final review after `--shot` runs only: the full-film sheets
  and `qa/freeze.json` are then older than the fix. Run both scripts once
  without `--shot` first.
- Giving the reviewer the conversation or the script draft: it must judge the
  video against `facts.md` only.
- A brief without the safety block: the sub-agent does not know the rules.
- Looping on review findings: one fix round, then deliver with an honest list.

## Not yet proven

- Re-rendering only the changed shots of the final film: one-shot compositions
  exist (`Shot-<id>`), but splicing them into the final file is not
  implemented; a fix means a full render.
- The one-shot preview render (`--composition Shot-<id>`) was run on two
  shots in a review (16:9 and 9:16), not yet at a user's checkpoint.
- The freeze probe compares two frames 0.8 s apart, a proxy for "change over
  the whole stretch"; a fast flicker between them would pass.
