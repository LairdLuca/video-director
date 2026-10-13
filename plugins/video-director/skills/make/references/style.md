# Style guide

The rules every video follows. The template implements most of them (sizes,
palette, camera, transitions, chapter bar, captions); the rest are choices
Claude makes in the script and the storyboard. All sizes are for a
1920x1080 composition at 30 fps.

Where they come from: six tools were asked to make the same 90-second DevOps
explainer from the same facts, and the six videos were compared frame by
frame. One of them read as clearly the easiest to follow; most rules below
describe what it did differently, in our own words. The ideas, and some
measured values such as sizes and timings, were chosen after the comparison;
no code, text or palette of a tool whose license allows no reuse is in this
repository. "Seen in the
comparison" refers to that test. Rules marked "our choice" are decisions of
this plugin, with the reason given.

## Why one video read as the clearest

The other five put a heading, a panel and a boxed sentence-long caption on
every frame, on a dark dashboard, with terminal text around 14-18 px. The
clearest one put **one subject per frame, big** (a terminal across 80% of the
width with 32 px text, a two-node diagram, a status card, a number), no
heading, and a 3-7 word caption without a box. **Something changed about every
2 seconds, on the word that named it**, and the camera pointed: a slow push,
a band walking from line to line while the rest dimmed. Light stages carried
concepts; dark stages carried close-ups and the lesson. The symptom shown at
the start came back resolved at the end.

## 1. Frame and layout

1. **1920x1080 at 30 fps.** Small mono text needs the pixels; a 720p video in
   the comparison looked soft.
2. **Margins**: 96 px for any content, 160 px for text that must be read,
   never readable text closer than 64 px to an edge. Text near the edge is
   lost when the video is scaled down in a chat or a slide.
3. **Bands**: chapter bar y 40-110, stage y 140-860, captions y 900-1000. The
   stage never enters the caption band, so captions need no background box.
4. **One subject group per frame, two at most, one quadrant left empty.** A
   group is one terminal, one 2-4 node diagram, or one card plus one number.
   Seen in the comparison: the clearest video never showed more than two.
5. **Main content at most 1440 px wide, centred.** Spacing tokens
   8/16/24/32/48/64/96; more space between groups than inside them.
   A scene with few elements is drawn larger and centred in the stage, both
   ways: a 2-3 node diagram scales up to 1.4 times, a card or a list of 1-3
   rows gets larger type. Our choice, after test videos of tasks to do left
   about two thirds of the frame empty with a list, a card or two small
   nodes in the top left.

## 2. Chapter bar

6. **One chapter bar, drawn once above all shots.** Our choice, from an idea
   seen in the comparison (a persistent chapter indicator at the top):
   - chapter labels come from `chapters` in the storyboard, in the video's
     language, 1-2 words, uppercase, at most 14 characters;
   - equal segments with a rail on top: future chapters muted, past ones full
     in the muted colour, the current one fills in the accent colour as the
     chapter plays, so the viewer sees which step and how far into it;
   - more than 5 chapters (a how-to has 6): a window of 5 segments. When the
     current chapter would move past the third slot, the row shifts by one
     segment over 0.5 s (ease in-out) as that chapter starts, so the current
     one stays in the second or third slot until the last chapters are in
     view; with 6 chapters it shifts once, at the fourth. The fill stays as
     above;
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
   - Inter 44 px weight 600 (38 px over 34 characters), centred, baseline near
     y 990, at most 1270 px wide, a soft halo in the stage colour;
   - the **shown** text, exact spelling (`kubectl`, `DATABASE_URL`), never the
     form written for the voice;
   - off: the caption band stays empty, nothing moves.
   Seen in the comparison: a short phrase is read in one glance and the eye
   goes back to the stage; a boxed two-line sentence holds it down.

## 4. Palette and stages

8. **One accent colour; red and green only on status.** Light stage by
   default, dark tiles for terminals and code. Our values:

   | Token | Light | Dark | Use |
   |---|---|---|---|
   | `bg` | `#F6F7F9` | `#0B1120` | stage |
   | `ink` | `#151821` | `#EEF1F6` | text |
   | `muted` | `#5F6675` | `#9AA3B2` | secondary text |
   | `hairline` | `#DADDE3` | `#2A3247` | borders, future chapters |
   | `accent` | `#2563EB` | `#60A5FA` | the one "look here" colour |
   | `negative` | `#D92D20` | `#F97066` | error lines, crosses |
   | `positive` | `#15803D` | `#4ADE80` | success lines, ticks |
   | terminal tile | `#14161C` | `#14161C` | terminal and code |

   At most one red and one green line per terminal; never red or green in a
   title or a caption.
9. **Two stage themes, switched per act, not per shot.** Light for concepts,
   diagrams, status and terminals as tiles; dark for close-ups (a code walk, a
   full-frame terminal) and the lesson. At most 3 light-to-dark switches per
   minute, so the switch stays a signal. Seen in the comparison.
10. **Backgrounds in CSS, inside the camera.** A faint grid and a slow accent
    glow on light stages, a flat dark stage with one soft glow; a static grain
    on top. No WebGL: a shader background in the comparison rendered at about
    17 s per frame. The background moves with the camera, or holds read as
    frozen (a tool in the comparison failed its own freeze check 7 times for
    this).

## 5. Type

11. **Inter and JetBrains Mono, bundled** (SIL OFL 1.1, loaded from local
    files). System fonts differ per OS and cannot be shipped; web fonts need
    the network at render.
12. **Sizes**: hero number 192 (smaller when a value of 5 or more
    characters must fit beside a diagram), statement line 64-76, diagram
    label 36-40, body 40-44, terminal and code 28-34 mono, caption 44,
    chapter label 25.
    **Nothing under 28 px.** Seen in the comparison: 14-20 px terminals in a
    quarter of the frame left the viewer unable to read the evidence the
    narration was talking about.
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

19. **2.3-2.7 words per second while speaking.** The clearest video in the
    comparison ran at 2.56. Each voice has a default speed tuned to this; never
    speed up above 1.15 to fit a length: cut words. Cutting words shortens
    the video but does not lower the pace: a pace over 2.7 at the default
    speed is lowered with the speed of that video (see "Pace" in voice.md).
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
24. **Length**: 60-90 s for one how-to or one report. Over 2 minutes, propose
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
    Between a light and a dark shot the film's background, the chapter bar
    and the captions switch theme at the hand-over, when both shots are
    almost transparent, not over the whole transition: a linear mix showed a
    mid-grey frame between the two (a test video).

## 10. Audio

30. **Narration is mandatory**, one WAV per sentence, peak at -1 dBFS (Kokoro's
    raw output clips in 16-bit otherwise).
31. **Loudness -14 LUFS**, true peak at most -1.5 dBTP, two-pass, done by
    `render.mjs`. The filter aims at -2.0 dBTP: aiming at -1.5 ended at
    -1.49 after limiting and AAC encoding, on a short and on a long video.
32. **No music and no sound effects** in this version. In the comparison, a
    tool placed 45 sound cues under continuous speech and more than half were
    masked.

## 11. Story

33. **Facts only.** Every command, output line and value on screen comes from
    `facts.md`, and the storyboard cites the line.
34. **Arc of a how-to**: problem, diagnosis (one step per command), cause, fix,
    verify, lesson. These are the default chapters. **Report of work done**:
    goal, what changed, evidence, result, open decisions. **Task to do**:
    goal, where it lives, steps, risks, decisions (see the make skill for an
    example, and for decisions already taken). All six tools in the
    comparison converged on the how-to arc.
35. **Mirror the opening at the end**: the symptom of the first shot (a 503)
    comes back resolved in the verify chapter (a 200), same component, same
    size, and tones as a pair: both `accent`, or `negative` then `positive`.

## Avoid

| Don't | Why |
|---|---|
| Heading + panel + boxed caption on every frame | Three reading targets at once; it is what the less clear videos in the comparison did |
| Terminal text under 28 px, or a terminal in a quarter of the frame | The evidence becomes unreadable |
| Showing an element before its word, even dimmed | It is read before it is explained |
| WebGL backgrounds | Software rendering at about 17 s per frame, no clarity gained |
| A background outside the camera | Holds read as frozen |
| More than 3 transition types | Reads as decoration |
| The voice respelling on screen | The screen shows the real term |
| A gate that needs a full render to find a layout bug | Stills find it in minutes; a full re-render in the comparison took over an hour |
| Stray glyphs or missing icons | A tool in the comparison shipped a stray "· ," on its last card; read the final contact sheet |

## Common mistakes

- One shot per sentence: the film cuts every 4 s and nothing builds.
- Writing the on-screen text as a second caption: labels distil, the caption
  already says the sentence.
- Using red for every error-like line: one red line per terminal, or none
  stands out.
- Choosing dark for the whole film because the subject is technical: dark is
  the close-up signal; on every shot it signals nothing.

## Not yet proven

- Light stages together with the chapter bar and captions were not seen in any
  video of the comparison before this plugin; the first videos should be
  watched with that in mind.
- The palette and the caption halo are our own and have been checked on stills
  and one rendered video only.
- The "report of work done" arc has no rendered example yet. The "task to
  do" arc was made in three test videos from markdown sources, none of them
  in this repository.
- The larger, centred layout of scenes with few elements (rule 5) was
  checked on stills, not yet in a full video watched by a person.
