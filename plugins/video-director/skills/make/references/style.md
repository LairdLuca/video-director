# Style guide

The rules every video follows. The template implements most of them (sizes,
palette, camera, transitions, chapter bar, captions); the rest are choices
Claude makes in the script and the storyboard. Sizes are in pixels of a
frame 1080 px on its short side, at 30 fps; where a format changes a size,
the rule says so.

Where they come from: earlier test videos of one brief, a 90-second DevOps
explainer made several times from the same facts. One of them read as
clearly the easiest to follow; most rules below describe what it did, in our
own words. "Seen in test runs" refers to those videos. Rules marked "our choice" are
decisions of this plugin, with the reason given.

## Why one video read as the clearest

The test videos that were harder to follow had a heading, a panel and a
boxed sentence-long caption on every frame, on a dark dashboard, with
terminal text around 14-18 px. The clearest one put **one subject per frame, big** (a terminal across 80% of the
width with 32 px text, a two-node diagram, a status card, a number), no
heading, and a 3-7 word caption without a box. **Something changed about every
2 seconds, on the word that named it**, and the camera pointed: a slow push,
a band walking from line to line while the rest dimmed. Light stages carried
concepts; dark stages carried close-ups and the lesson. The symptom shown at
the start came back resolved at the end.

## 1. Frame and layout

1. **Three formats, all 1080 px on the short side, at 30 fps**: 16:9
   (1920x1080), 9:16 (1080x1920) and 1:1 (1080x1080). Small mono text needs
   the pixels; a 720p test video looked soft. The short side is
   the same in all three, so one text size reads the same in all of them
   and the 28 px minimum (rule 12) holds everywhere, with one exception:
   terminal and code tiles on 9:16 and 1:1 go down to 24 px. Which one:
   "Choosing the format" below.
2. **Margins**: on 16:9, 96 px for any content and 160 px for text that must
   be read; on 9:16 and 1:1, 64 px and 104 px (text starts clear of the
   notebook papers' margin line at x 72). Never readable text closer than
   64 px to an edge. Text near the edge is lost when the video is scaled
   down in a chat or a slide.
3. **Bands** (one-row chapter bar):

   | | Chapter bar | Stage | Caption baseline |
   |---|---|---|---|
   | 16:9 | y 48-100 | y 140-860 | y 990 |
   | 1:1 | y 54-106 | y 146-860 | y 990 |
   | 9:16 | y 96-148 | y 188-1500 | y 1720 |

   With parts (a two-row chapter bar, rule 6) the bar is 64 px taller on
   16:9 and 54 px on 9:16 and 1:1 (one square, so the parts row sits on a
   ruling line too; at 64 px it sat 10 px off it), and the stage starts as
   much lower. On 9:16 the bottom 200 px stay free: players and
   phone apps draw their controls there. On 9:16 and 1:1 the bar's rail sits
   on a line of the 54 px squares (y 96 and y 54): at y 48 the square bar
   floated 6 px above the line where the portrait one sat on it. The stage never enters the caption
   band, so captions need no background box. The template computes the bands
   (`template/src/lib/layout.mjs`); the lint uses the same numbers.
4. **One subject group per frame, two at most, one quadrant left empty.** A
   group is one terminal, one 2-4 node diagram, or one card plus one number.
   Seen in test runs: the clearest video never showed more than two.
5. **Main content at most 1440 px wide on 16:9, the width less the margins
   on 9:16 and 1:1, centred.** Spacing tokens
   8/16/24/32/48/64/96; more space between groups than inside them.
   A scene with few elements is drawn larger and centred in the stage, both
   ways: a 2-3 node diagram scales up to 1.4 times, a card or a list of 1-3
   rows gets larger type. Our choice, after test videos of tasks to do left
   about two thirds of the frame empty with a list, a card or two small
   nodes in the top left.
   On 9:16 and 1:1 what sits side by side on 16:9 is stacked (the flow above
   the slab, the card above the slab) and a row of nodes becomes a column
   (9:16 always, 1:1 from 4 nodes); [scenes.md](scenes.md) gives each scene's
   layout per format. Our choice: side by side, either half would be too
   narrow for a 38 px label.

### Choosing the format

Claude picks the format at step 1 of the make skill, from the subject and
where the video will be watched, unless the user names one ("in verticale",
"square") or the install config fixes it (`format`):

| Format | When |
|---|---|
| 16:9 | the default: an explanation of a minute or more, terminals and code with long lines, a video watched on a computer, in a page or in a slide |
| 9:16 | a video watched on a phone, usually short (often about a minute, but it takes the time the subject needs; no limit): one idea, few and short commands on screen |
| 1:1 | a short clip pasted into a chat, a ticket or a document, where it sits in a square box |

When unsure, 16:9. On 9:16 and 1:1 a terminal or code line fits about 61
characters (65 in a full terminal), against 85 and 79 on 16:9: when the
lines the video must **show** are longer, the video is 16:9 (the lint
fails on a line that does not fit, and a line is never shortened without a
source). A long line of `facts.md` the video does not need to show does
not count: a wide table's values go in a `StatusCard` (the full table in
the page), a line not needed for the point stays out of the video and in
"Unfinished". Our choice: the user of this plugin asked for 9:16 and
square, picked by Claude from the subject; the line limits come from the
layout at the tile minimum, 24 px on 9:16 and 1:1 and 28-30 px on 16:9.

## 2. Chapter bar

6. **One chapter bar, drawn once above all shots.** Our choice, from an idea
   seen in test runs (a persistent chapter indicator at the top):
   - chapter labels come from `chapters` in the storyboard, in the video's
     language, 1-2 words, uppercase, at most 14 characters;
   - equal segments with a rail on top: future chapters muted, past ones full
     in the muted colour, the current one fills in the accent colour as the
     chapter plays, so the viewer sees which step and how far into it;
   - **fill only, every chapter always on screen, nothing scrolls**;
   - **parts** when the labels do not fit one row: the storyboard groups the
     chapters (`parts`, see storyboard.md) and the bar gets two rows, the
     chapters of the current part above and the parts below, each with the
     same fill. When a part starts, the upper row cross-fades to its
     chapters over 0.4 s. One row holds about 5 labels of 14 characters on
     16:9 and 3 on 9:16 and 1:1; short labels fit more (8 characters: 9 on
     16:9, 5 on 9:16 and 1:1). The lint measures the labels and fails when a
     row does not fit, so the 6 chapters of a how-to need parts on 9:16 and
     1:1 (for example two parts of three: "understand" and "solve"). Our
     choice, from the user's: fill only and every chapter visible; with many
     chapters, macro chapters below and their chapters above. A scrolling
     window of 5 segments was dropped;
   - it takes the colours of the stage (light or dark) and switches with it
     (see rule 29);
   - hidden on shots with `chapterBar: false` (the lesson card, usually).

## 3. Captions

7. **Captions are an install choice** (`captions`), changeable per video.
   When on:
   - short phrases, not sentences: split at punctuation, then at the space
     nearest the middle while a phrase is over 42 characters (3-7 words),
     but never right after an article, a preposition or a conjunction when
     another space will do (a phrase ending on "sul" reads as cut off);
   - a phrase appears on its first word and holds 0.3 s after its last word;
     no fade, no box, no karaoke;
   - the text font (rule 11) 44 px weight 600 (38 px over 34 characters),
     centred on the caption baseline (rule 3), at most 1270 px wide, a soft
     halo in the stage colour; on 9:16 and 1:1 at most 872 px wide, phrases
     split at 30 characters and 38 px over 24;
   - **code words in JetBrains Mono** (bold, at 0.9 of the caption size):
     commands, file names and identifiers, as the voice step marks them
     (voice.md, "Code words in the captions"); punctuation around them stays
     in the text font. The user of this plugin asked for it: `kubectl
     describe` in a caption reads as the command typed in the terminal;
   - the **shown** text, exact spelling (`kubectl`, `DATABASE_URL`), never the
     form written for the voice;
   - off: the caption band stays empty, nothing moves.
   Seen in test runs: a short phrase is read in one glance and the eye
   goes back to the stage; a boxed two-line sentence holds it down.

## 4. Palette and stages

8. **One accent colour; red and green only on status.** Light stage by
   default, dark tiles for terminals and code. **The stage is squared paper**:
   a light paper with coloured squares, and a dark one, a faded neutral
   black (not blue) with dim squares. Both are install choices
   (`paletteLight`, `paletteDark`), changeable per video, copied into the
   storyboard. The defaults:

   | Token | Light `giallo` | Dark `notte` | Use |
   |---|---|---|---|
   | `bg` | `#FCF4D2` | `#1E1E1E` | the paper |
   | `grid` | `#B0CBEA`, 54 px squares | `#29323C`, 54 px squares | the squares |
   | `marginLine` | `#E38F8F` at x 72 | none | the notebook margin |
   | `ink` | `#1F1E1A` | `#E8E8E8` | text |
   | `muted` | `#524C38` | `#A3A3A3` | secondary text, chapter labels |
   | `hairline` | `#E3D9AE` | `#3A3A3A` | borders, future chapters |
   | `accent` | `#0F6E78` | `#6FA3F7` | the one "look here" colour |
   | `negative` | `#C42B1C` | `#F47C6B` | error lines, crosses |
   | `positive` | `#1E7B3A` | `#6FCF86` | success lines, ticks |
   | `card` | `#FFFCEB` | `#282828` | node cards, status cards |
   | terminal tile | `#161616` | `#161616` | terminal and code |

   The other light papers: `quaderno` (school notebook: warm white, light
   blue squares, red margin), `milli` (blue graph paper: fine squares, a
   stronger line every 5), `arancio` (orange graph paper), `tecnico` (pale
   green engineering pad), `rosso` (soft red squares, blue pen ink), `verde`
   (soft green squares), `grigio` (light grey squares, no margin). The other
   dark paper: `ardesia` (slate: warm white ink, dim green graph paper).
   Plain squares are 54 px, graph papers keep their fine squares (12 px, 24
   for `tecnico`). Every value is in `template/src/lib/palettes.mjs`.
   Every text pair is at least 4.5:1 and every mark 3:1 on the paper and on
   its strongest ruling line, in every palette (lowest: text 4.95 on
   `rosso`, marks 3.18 on `giallo`). Our choice, from the user's: graph
   paper, not parchment, with coloured squares, not grey ones; the default
   yellow notepad with large squares and the dark `notte` were picked from
   twelve prototypes, the others are kept as options.

   At most one red and one green line per terminal; never red or green in a
   title or a caption.
9. **Two stage themes, switched per act, not per shot.** Light for concepts,
   diagrams, status and terminals as tiles; dark for close-ups (a code walk, a
   full-frame terminal) and the lesson. At most 3 light-to-dark switches per
   minute, so the switch stays a signal. Seen in test runs.
10. **The paper under the camera, everything else inside it.** The paper
    (its colour, squares and margin line) is CSS drawn under the camera, so
    the push never rescales the lines: a rescaled pattern changes every pixel
    of every frame and made a 5 s clip several times larger. A slow soft
    glow and the content move with the camera, and a static grain is on top,
    so holds do not read as frozen (the freeze probe passes on held light
    and dark shots, 0.6-3.7% of pixels changed per 0.8 s). No WebGL: a shader
    background in a test run rendered at about 17 s per frame, and another
    test run failed its own freeze check 7 times with a background that did
    not move. A custom scene that does not use
    `StageFrame` draws `Paper` itself (from `../kit`).

## 5. Type

11. **The text font is an install choice; code is JetBrains Mono.** Inter is
    bundled (SIL OFL 1.1) and is the default. Setup proposes a couple of
    sans-serif fonts found on the machine (the full Latin alphabet, a
    regular and a bold, not monospaced, embedding not restricted by the
    font's maker), or takes a font file the user names; a video can use
    another (`font`). The chosen files are copied into the video project and
    loaded from there: no network at render, no system font lookup, the same
    pixels on every machine that renders that project. A font copied from
    the machine is never put in this repository, and the video folder's
    `.gitignore` leaves it out of git (`public/fonts/text/`), since its
    licence may not allow sharing it. Our choice, from the user's: a couple
    of fonts found on the machine, or a custom one.
12. **Sizes**: hero number 192 (smaller when a value of 5 or more
    characters must fit beside a diagram), statement line 64-76, diagram
    label 36-40, body 40-44, terminal and code 28-34 mono, caption 44,
    chapter label 25. The same on the three formats, except the lesson
    and the not-A-but-B statement, 60 px on 9:16 and 1:1 so a line wraps
    less, and terminal and code tiles, which shrink to 24 px there when a
    line needs it.
    **Nothing under 28 px, except terminal and code on 9:16 and 1:1 (24
    px).** Seen in test runs: 14-20 px terminals in a quarter of the
    frame left the viewer unable to read the evidence the narration was
    talking about. The exception is the user's: at 28 px a narrow frame
    held 52 characters a line, so most real command output pushed a video
    to 16:9; at 24 px it holds 61, and the tile still fills the width.
13. **On-screen text distils.** A label is about 3 words, a statement about 6.
    Evidence (commands, output, YAML) is shown in full, exactly as in
    `facts.md`.

## 6. Motion

14. **Eased tweens, not springs.** Entrances 0.2-0.6 s ease-out, exits shorter
    and weaker, a small overshoot only for a hero number. Fixed durations are
    easier to place on a word.
15. **One accent at a time.** Two things never start within 0.15 s of each
    other unless they are one group (a list staggers 80-150 ms).
16. **A camera on every shot**: one slow push, 1.00 to about 1.04, with its
    keys outside the shot so the visible part never starts or stops. No
    wobble. The frame is never still, so holds feel calm, not frozen.
17. **No freeze**: no stretch of 0.8 s where under 0.3% of pixels change.
    Checked on stills (`freeze.mjs`).
18. **Pointing devices**, one per beat: corner brackets closing on a line, a
    band behind one line with the rest dimmed to 30%, a tint, a tick or a
    cross drawn as a stroke. The viewer always knows which of the visible
    things is being talked about.

## 7. Rhythm

19. **2.3-2.7 words per second while speaking.** The clearest test video
    ran at 2.56. Each voice has a default speed tuned to this; never
    speed up above 1.15 to fit a length: cut words. Cutting words shortens
    the video but does not lower the pace. Up to 3.0 is only noted (dense
    technical narrations measured 2.72-2.85 at the default speed); over
    3.0 the speed of that video goes down (see "Pace over 3.0" in
    voice.md).
20. **Pauses**: 0.4 s between sentences, 0.8 s at a chapter change, 0.25 s
    lead-in, 0.6 s tail. The longer pause lets the chapter bar and the
    transition land. (The voice step and the template apply these.)
21. **Shots of 6-14 s, usually 1-2 sentences; 8-10 shots for 90 s.** Cut by
    idea, never one shot per sentence. The lint allows 5-15 s, and 4 s for
    the last shot, which ends on the 0.6 s tail.
22. **A beat every 1.5-2.5 s**: 3-6 beats per shot, with typing or the camera
    filling the gaps. The clearest video had 43 beats in 88 s.
23. **Open on the problem.** No title card: the first sentence states the
    problem and the first shot shows it, within 10 frames of the cut.
24. **Length**: the time the subject needs. 60-90 s for one how-to or one
    report is a guide, not a limit: "short" without a number sets no
    target, and a phone video may run past a minute. Over 2 minutes, propose
    splitting it or ask the user. When the user asks for a length (shorter
    or longer), that length is the target: it goes in the storyboard's
    `targetSeconds` and the lint checks it. Under 45 s, see "Short video" in
    the make skill.

## 8. Voice and picture

25. **Every visual accent is anchored to a spoken word**, never to a typed
    time. The storyboard names the word; the timeline resolves it from the
    measured word times; the lint fails if it is not found or lands more than
    0.1 s from the word.
26. **Landing**: the hero of a beat finishes arriving on its word (the
    scenes start it slightly before). Follow-ons (a tick, a label) come
    0.2-0.8 s after. Commands type from the word that names them, at about 25
    characters per second; output follows in chunks.
27. **Before its word, an element does not exist**: not dimmed, absent.
    Something shown early is read before it is explained.
28. With estimated word times (voice step run with `--no-check`), anchor only
    to the first or last word of a clause, where the estimate is safe.

## 9. Transitions

29. **Every cut is treated, with two types per film, three at most**:
    `push` (default), `wipe` for "the same thing, closer" (a terminal becoming
    a code close-up), `fade-dark` only into the lesson card. The film ends with
    a 0.6 s fade to black. Few, consistent transitions read as structure; many
    read as decoration. `push` (0.43 s) hands over in sequence: the outgoing
    shot pushes in and is gone by 45% of the transition, the incoming one
    fades in from 40% while it settles, so two layouts are never seen on top
    of each other. Our choice, after a cross-fade version showed a
    half-transparent terminal over the nodes and the slab of the shot before.
    **Between a light and a dark shot, never the push: a crossfade** (15 frames: 0.5 s at 30 fps).
    The timeline turns the push into it by itself; the storyboard keeps
    `push`. The incoming shot fades in over the outgoing one, which stays
    opaque, so no stage colour shows through, and the chapter bar and the
    captions change colour with it. A wipe or a fade-dark between themes
    stays as asked. The user of this plugin asked for a dissolve between
    light and dark: the push hands over through two almost transparent
    shots, and between two papers that read as a flash.

## 10. Audio

30. **Narration is mandatory**, one WAV per sentence, peak at -1 dBFS (Kokoro's
    raw output clips in 16-bit otherwise).
31. **Loudness -14 LUFS**, true peak at most -1.5 dBTP, two-pass, done by
    `render.mjs` on the whole mix (narration, music and effects). The filter
    aims at -2.0 dBTP: aiming at -1.5 ended at -1.49 after limiting and AAC
    encoding, on a short and on a long video.
32. **Music and sound effects: install choices, both on by default**
    (`music`, `sfx`), changeable per video. The plugin makes them itself,
    from a seed taken from the video's slug: no audio file of anyone else,
    no download, and the same video sounds the same at every render.
    `render.mjs` mixes them under the narration before rule 31.
    - **Music**: a quiet bed for an explanation (a soft pad, a soft bass and
      one slow line, in a major key, slow), in one of three characters
      (`musicStyle`): `warm` (round pad and bass, a slow upper line that
      swells once a bar; calm), `pulse` (a soft bass on every beat, the
      chord breathing on the beat; more rhythm), `minimal` (glassy pad, a
      faint bass, a slow glassy line; the most discreet). **No note starts
      sharply**: every layer has an attack of 60 ms or more, so no bell,
      piano, pluck or tick; the styles differ by harmony, tempo, timbre and
      slow movement. Seen in test videos: the bell notes of the first
      `minimal` (and the piano and pluck of the other styles) rose 11 to 18
      dB over the bed in 20 ms, stood out in the pauses where the music
      comes up, and were heard as loud sound effects placed at random; the
      user asked for them to be removed, not softened. The render measures
      it (`transientDb` in `qa/render.json`: the rise of the music above
      500 Hz in 20 ms over the 300 ms before, before the ducking; the
      soft styles stay under 6.5 dB, over 8 dB is a warning, also for a
      music file of the user's). Claude
      picks the style for each video from what it describes ("Choosing the
      music style" below), unless the user names one; when unsure, and when
      `config.mjs video` is given no style, `warm`.
      **It follows the chapters**: each chapter starts on a downbeat with its
      own chord progression and a small change in the slow line; the film
      ends on the home chord, closed by the fade to black.
    - **Under the voice**: while the voice speaks the music sits 16 LU under
      it (`musicLevel`: `high` 16, the default; `normal` 20; `low` 24),
      measured over the
      spoken parts with the K-weighting of loudness meters, so the level
      does not depend on the track. It rises 8 dB in a pause of 0.7 s or
      more and is back down 0.1 s before the next word. It has no rumble
      under 45 Hz and a 4 dB dip around 2.6 kHz, where speech is understood.
    - **Effects**: few and short (0.4-0.6 s), 8 LU under the voice: a soft
      whoosh with two mallet notes at a chapter change, and on the key
      moments the storyboard marks on a shot (`sfx`: `error` where the error
      appears, `success` where the check passes; 1-3 per video). **Never
      over speech**: each one goes into a pause of the narration at least
      0.42 s long, 70 ms clear of the words on both sides, found from the
      word times and the narration's own energy. **A key effect stays next
      to its word**: it starts at most 0.3 s after the word ends (the end
      the voice's own energy shows) or ends at most 0.3 s before it starts;
      with no such pause it is left out, and the lint says so. Seen in test
      videos: moved up to a few seconds later, into the next chapter's cut,
      an effect no longer belonged to what it marked. The chapter effect
      may move up to 4 s after the cut. One effect per pause, and a key
      effect takes the chapter effect's place (the music still changes with
      the chapter). Seen in test runs: a video with 45 sound cues under
      continuous speech, more than half of them masked.
    - **The user's own sounds**: an optional folder (`audioDir`) with files
      named `music...`, `chapter...`, `error...`, `success...`; a kind found
      there replaces the generated one, at the same levels and in the same
      pauses. A music file is looped with a 2 s crossfade, or cut, to the
      film.
    Our choice, from the user's: music and effects as install choices, both
    on by default, made by the plugin's own code, with a folder of one's own
    that takes precedence. The levels are ours, measured on the example
    with its real voice at `normal`: music 20.4-20.6 LU under the voice on
    a rendered 20 s clip of each style, effects 0 over speech, the mix at
    -14.0 LUFS and -2.0 dBTP after rule 31. The user listened to those
    clips and asked for the music louder: `high`, 16 LU under the voice, is
    the default.

### Choosing the music style

Claude picks the style at step 1 of the make skill, from what the video
describes and how it should feel, unless the user names one ("musica più
ritmica", "più discreta") or the install config fixes it (`musicStyle`):

| Style | When |
|---|---|
| `warm` | an explanation, a how-to, a report of work done, a task to do: calm, it accompanies without pushing |
| `pulse` | a short demo with a quick rhythm: a feature shown in action, a short video for a phone, a series of quick steps, unless the subject is delicate (see `minimal`) |
| `minimal` | a delicate subject: an incident or an outage (also the how-to of its fix), a postmortem, a security problem, a loss of data; or a video where the viewer must read a lot of code or terminal output |

A delicate subject wins over the kind of video: "how we fixed the checkout
crash" is an incident, so `minimal`. When unsure, `warm`. The style is written into the video's config
(`config.mjs video ... musicStyle=<style>`) and said in one line with the
format, so the user can change it. Our choice, from the user's: the music
follows what the video describes, not a fixed default; the table is ours,
from the character of each style (rhythm draws attention, a discreet bed
leaves it to the screen and to a serious subject).

## 11. Story

33. **Facts only.** Every command, output line and value on screen comes from
    `facts.md`, and the storyboard cites the line.
34. **Arc of a how-to**: problem, diagnosis (one step per command), cause, fix,
    verify, lesson. These are the default chapters. **Report of work done**:
    goal, what changed, evidence, result, open decisions. **Task to do**:
    goal, where it lives, steps, risks, decisions (see the make skill for an
    example, and for decisions already taken). Seen in test runs: every
    version of the how-to test video converged on this arc.
35. **Mirror the opening at the end**: the symptom of the first shot (a 503)
    comes back resolved in the verify chapter (a 200), same component, same
    size, and tones as a pair: both `accent`, or `negative` then `positive`.

## Avoid

| Don't | Why |
|---|---|
| Heading + panel + boxed caption on every frame | Three reading targets at once; it is what the less clear test videos did |
| Terminal text under 28 px (24 px on 9:16 and 1:1), or a terminal in a quarter of the frame | The evidence becomes unreadable |
| Showing an element before its word, even dimmed | It is read before it is explained |
| WebGL backgrounds | Software rendering at about 17 s per frame, no clarity gained |
| Anything that moves drawn outside the camera (the static paper is the one exception) | Holds read as frozen |
| More than 3 transition types | Reads as decoration |
| The voice respelling on screen | The screen shows the real term |
| A gate that needs a full render to find a layout bug | Stills find it in minutes; a full re-render in a test run took over an hour |
| Stray glyphs or missing icons | A test video shipped a stray "· ," on its last card; read the final contact sheet |
| An effect under a sentence, or music as loud as the voice | Half the cues under speech were masked in a test video; the voice carries the explanation |

## Common mistakes

- One shot per sentence: the film cuts every 4 s and nothing builds.
- Writing the on-screen text as a second caption: labels distil, the caption
  already says the sentence.
- Using red for every error-like line: one red line per terminal, or none
  stands out.
- Choosing dark for the whole film because the subject is technical: dark is
  the close-up signal; on every shot it signals nothing.
- Picking 9:16 for a video whose commands are longer than about 60
  characters: the lint fails on every such line; it is a 16:9 video.
- Six chapters on 9:16 or 1:1 without parts: the labels do not fit one row.
- An `sfx` on every shot: effects mark a few moments; on every shot they
  mark nothing, and most find no free pause.
- Anchoring an `sfx` to a word in the middle of a long sentence: the effect
  waits for the pause at its end, and with a second sentence before the
  next pause it is left out.

## Not yet proven

- Light stages together with the chapter bar and captions were not seen in any
  test video before this plugin; the first videos should be watched with
  that in mind.
- The palettes and the caption halo are our own. The defaults were checked
  on stills of every scene in the three formats and on 3 s clips; the
  other palettes on one still each (their prototypes) and by contrast.
- 9:16 and 1:1: checked on stills of every scene and on one 3 s clip each,
  with estimated word times; no full video has been made in them.
- A text font other than Inter: checked on stills (a font found on the
  machine); a font file given by the user, only by the font check.
- Parts in the chapter bar: checked on stills (2 parts of 3 chapters, and 4
  parts over 10 chapters).
- Music and effects: levels and pauses measured, and 20 s clips of the three
  styles made for the user to listen to; not yet heard in a full video,
  not yet judged on a long one (does a style tire over 2-3 minutes?). The
  `high` level was chosen by ear on 20 s clips, not on a whole film.
  Claude's choice of the style (the table above) was not tried on a new
  video yet. The user folder was tried with test files only.
- 24 px terminals on 9:16 and 1:1: checked on stills and one shot render,
  not watched on a phone.
- The "report of work done" arc has no rendered example yet. The "task to
  do" arc was made in three test videos from markdown sources, none of them
  in this repository.
- The larger, centred layout of scenes with few elements (rule 5) was
  checked on stills, not yet in a full video watched by a person.
