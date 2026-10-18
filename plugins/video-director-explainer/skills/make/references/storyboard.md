# The storyboard (contract C: `storyboard.json`)

The storyboard is the film as data. Claude writes it after the voice step,
because shot lengths and beat frames come from the measured narration in
`voiceover.json`. The template renders it; nothing else needs code.

Where this comes from: seen in test runs, the fastest run used a
data-driven engine and needed no code per video, and the clearest video
anchored every visual change to a spoken word. This contract combines
the two.

## Shape

```json
{
  "fps": 30, "width": 1920, "height": 1080,
  "captions": true, "paletteLight": "giallo", "paletteDark": "notte",
  "chapters": [{ "id": "problem", "label": "PROBLEMA" }, { "id": "diagnosis", "label": "DIAGNOSI" }],
  "shots": [ ... ]
}
```

| Field | Notes |
|---|---|
| `fps`, `width`, `height` | 30, and the format's size from `video.config.json`: 1920x1080 (16:9), 1080x1920 (9:16) or 1080x1080 (1:1) |
| `captions` | copy it from `video.config.json`: the template reads it here |
| `paletteLight`, `paletteDark` | copy them from `video.config.json`: the papers of the light and the dark stage (style rule 8). Left out: the defaults, `giallo` and `notte` |
| `targetSeconds` | optional: `[min, max]`, the length the user asked for (for example `[90, 150]`). The lint warns outside it; without it the default 60-90 s applies. Write it only when the user named a length |
| `chapters` | the chapter bar labels, in order; copy them from `script.json`. Without it the bar shows the ids in uppercase |
| `parts` | optional: the chapters grouped for the chapter bar, `[{ "id", "label", "chapters": [chapter ids] }]`, in film order, every chapter in exactly one part. Needed when the labels do not fit one row (see below) |
| `shots` | in narration order; every sentence of `voiceover.json` in exactly one shot |

`width`, `height`, `captions`, `paletteLight` and `paletteDark` are copied
from `video.config.json`, never chosen here: the lint fails, and `render.mjs`
refuses to start, when one of them differs (a "no captions" or "vertical"
wish must reach the video).

**Parts.** The chapter bar shows every chapter, on one row (style rule 6).
When the labels do not fit it, group the chapters into 2-4 parts: the bar
then shows the chapters of the current part above and the parts below. A
row holds about 5 labels of 14 characters on 16:9 and 3 on 9:16 and 1:1
(shorter labels fit more); the lint measures them. The 6 chapters of a
how-to fit one row on 16:9 and need parts on 9:16 and 1:1:

```json
"parts": [
  { "id": "understand", "label": "CAPIRE", "chapters": ["problem", "diagnosis", "cause"] },
  { "id": "solve", "label": "RISOLVERE", "chapters": ["fix", "verify", "lesson"] }
]
```

Part labels follow the chapter labels' rules (the video's language,
uppercase, at most 14 characters) and are not a chapter's label again.
`CAPIRE` and `RISOLVERE` ("understand", "solve") are in Italian like the
example's chapters; an English video would use `UNDERSTAND` and `SOLVE`.

A shot:

| Field | Required | Notes |
|---|---|---|
| `id` | yes | `sh01`, `sh02`... (also names the one-shot composition `Shot-sh01`) |
| `chapter` | yes | the chapter of its sentences (all of them) |
| `scene` | yes | a catalogue type ([scenes.md](scenes.md)) or `Custom` with `component` |
| `sentences` | yes | ids from `script.json`, whole sentences, consecutive |
| `props` | yes | the scene's data |
| `beats` | yes | 3-6 anchors (1-6 for a `HookStatus` slab without a flow), see below |
| `theme` | no | `light` (default) or `dark` |
| `transitionIn` | no | `push` (default), `wipe`, `fade-dark`; a push between a light and a dark shot is drawn as a crossfade, by itself |
| `chapterBar` | no | `false` to hide the bar on this shot |
| `camera` | no | `{ "from": 1, "to": 1.04 }` |
| `sfx` | no | sound effects on the shot's key moments: `[{ "kind": "error" or "success", "at": "<beat name>" }]`, see "Sound effects" below |
| `learns` | yes, by convention | one line: what the viewer learns in this shot |
| `sources` | yes, by convention | the `facts.md` lines behind what is on screen (`"facts.md:14"`) |

`learns` and `sources` are not read by the template; they make the review
possible (the final QA checks every shot against them).

## Beats

```json
"beats": [
  { "name": "cmd", "word": "pod", "sentence": "s02" },
  { "name": "crash", "word": "CrashLoopBackOff", "sentence": "s03" },
  { "name": "exit", "word": "exit code", "sentence": "s04", "occurrence": 1 }
]
```

- `word`: one or more **shown** words, as they appear in the sentence
  (`kubectl`, not the voice form). Case and edge punctuation are ignored, so
  `CrashLoopBackOff:` matches `CrashLoopBackOff`.
- `sentence`: limits the search to one sentence of the shot (recommended).
- `occurrence`: 1-based, when the word appears more than once.
- A beat resolves to the frame where the word starts, relative to the shot;
  props refer to it by `name`.

Pick words that **name** the thing that appears: the command ("describe"),
the value ("503"), the object ("manifest"). Space beats 1.5-2.5 s apart
(style rule 22), and keep the last one out of the final 0.5 s of the shot.

## Sound effects

```json
"sfx": [{ "kind": "error", "at": "error" }]
```

Mark 1-3 key moments of the film (style rule 32): `error` where the error
appears (the red terminal line, the failed status), `success` where the
check passes (the mirror of the symptom, the green line). `at` is a beat of
the same shot. The chapter changes get their effect by themselves; write
nothing for them.

The effect never plays over speech and stays next to its word: it starts
in the pause at most 0.3 s after the beat's word ends, or ends at most 0.3
s before the word starts. So anchor it to the **last word of the sentence**
that states the moment (the pause that ends the sentence holds the effect),
or to the first word after a pause; a beat in the middle of a sentence
leaves the effect out, with a lint warning that says so. Seen in test
videos: an effect allowed to wait seconds for a pause fell on the next
chapter's cut, where nobody could tell what it marked. One effect per pause: when a key effect lands in a chapter
pause, the chapter effect yields. With `sfx` off for the video the field
is still checked and simply not played.

## Timing, as the template computes it

- Sentence n+1 starts at start(n) + duration(n) + pause(n), after a 250 ms
  lead-in; the film ends 600 ms after the last sentence. Pauses are 400 ms,
  800 ms at a chapter change.
- A cut sits in the middle of the pause between two shots, and transitions
  are centred on it, so the film length equals the narration length.
- A shot's length is therefore the audio of its sentences plus half the
  pauses around it: to make a shot longer, give it more narration.

## A complete example

The example video in [`examples/acme-shop-crashloop/`](../../../examples/acme-shop-crashloop/storyboard.json)
has 10 shots over 14 sentences. Its first three shots, with the sentences
they cover:

```
s01  Dopo il deploy della versione 2.4.0, il checkout di acme-shop risponde con errore 503.
s02  Partiamo dai pod, nel namespace shop.
s03  Il pod di checkout è in CrashLoopBackOff: sei riavvii in otto minuti.
s04  Con kubectl describe vediamo che il container termina con exit code 1, e kubelet lo riavvia in back-off.
```

```json
{
  "fps": 30, "width": 1920, "height": 1080, "captions": true,
  "chapters": [
    { "id": "problem", "label": "PROBLEMA" }, { "id": "diagnosis", "label": "DIAGNOSI" },
    { "id": "cause", "label": "CAUSA" }, { "id": "fix", "label": "FIX" },
    { "id": "verify", "label": "VERIFICA" }, { "id": "lesson", "label": "LEZIONE" }
  ],
  "shots": [
    {
      "id": "sh01", "chapter": "problem", "scene": "HookStatus", "theme": "light",
      "sentences": ["s01"],
      "props": {
        "flow": { "nodes": [{ "icon": "rocket", "label": "deploy 2.4.0" },
                            { "icon": "shopping-cart", "label": "checkout" }], "broken": true },
        "slab": { "value": "503", "side": "right", "tone": "accent" }
      },
      "beats": [
        { "name": "flowIn", "word": "deploy", "sentence": "s01" },
        { "name": "target", "word": "checkout", "sentence": "s01" },
        { "name": "slab", "word": "503", "sentence": "s01" }
      ],
      "learns": "after the 2.4.0 deploy, checkout answers 503",
      "sources": ["facts.md:9", "facts.md:10"]
    },
    {
      "id": "sh02", "chapter": "diagnosis", "scene": "Terminal", "theme": "light",
      "sentences": ["s02", "s03"], "transitionIn": "push",
      "props": {
        "title": "~/acme-shop", "size": "tile",
        "lines": [
          { "kind": "cmd", "text": "kubectl get pods -n shop", "at": "cmd" },
          { "kind": "out", "text": "NAME                        READY   STATUS             RESTARTS   AGE" },
          { "kind": "err", "text": "checkout-7d9f8c6b5-x2kqp    0/1     CrashLoopBackOff   6          8m" },
          { "kind": "out", "text": "cart-5c8b7d9f4-p9wzt        1/1     Running            0          3d" }
        ],
        "focus": [
          { "line": 3, "style": "brackets", "at": "crash" },
          { "line": 3, "style": "tint", "at": "restarts" }
        ]
      },
      "beats": [
        { "name": "cmd", "word": "pod", "sentence": "s02" },
        { "name": "crash", "word": "CrashLoopBackOff", "sentence": "s03" },
        { "name": "restarts", "word": "riavvii", "sentence": "s03" }
      ],
      "learns": "the checkout pod is in CrashLoopBackOff with 6 restarts in 8 minutes",
      "sources": ["facts.md:14", "facts.md:15", "facts.md:16", "facts.md:17"]
    },
    {
      "id": "sh03", "chapter": "diagnosis", "scene": "Terminal", "theme": "light",
      "sentences": ["s04"], "transitionIn": "push",
      "props": {
        "title": "~/acme-shop", "size": "tile",
        "lines": [
          { "kind": "cmd", "text": "kubectl describe pod checkout-7d9f8c6b5-x2kqp -n shop", "at": "cmd" },
          { "kind": "out", "text": "    Last State:     Terminated" },
          { "kind": "out", "text": "      Reason:       Error" },
          { "kind": "out", "text": "      Exit Code:    1" },
          { "kind": "out", "text": "  Warning  BackOff  2m (x24 over 8m)  kubelet  Back-off restarting failed container" }
        ],
        "focus": [
          { "line": 4, "style": "brackets", "at": "exit" },
          { "line": 5, "style": "brackets", "at": "backoff" }
        ]
      },
      "beats": [
        { "name": "cmd", "word": "describe", "sentence": "s04" },
        { "name": "exit", "word": "exit code", "sentence": "s04" },
        { "name": "backoff", "word": "back-off", "sentence": "s04" }
      ],
      "learns": "the container exits with code 1 and kubelet restarts it in back-off",
      "sources": ["facts.md:22", "facts.md:24", "facts.md:25", "facts.md:26", "facts.md:29"]
    }
  ]
}
```

The terminals have `"title": "~/acme-shop"` because the example's `facts.md`
names that folder. A title is a fact like any other: when `facts.md` gives no
folder or file for the command, leave `title` out (the lint warns about a
title it cannot find in `facts.md`).

## `STORYBOARD.md`

A readable version next to the JSON, for the user and for the final review.
One block per shot:

```
## sh02  DIAGNOSI  Terminal (light, push)  s02-s03  8.4 s
Learns: the checkout pod is in CrashLoopBackOff with 6 restarts in 8 minutes.
Beats: "pod" -> the command types; "CrashLoopBackOff" -> brackets on the pod line;
       "riavvii" -> the line is tinted.
Sources: facts.md:14-17
```

End it with an **Unfinished** section: anything missing (a fact, a screenshot,
a value the facts do not give) and what the storyboard did instead. A gap is
written down, never covered by a design choice.

## The lint

```
node "<plugin>/scripts/lint-storyboard.mjs" <videoDir>
```

(`<plugin>` is the plugin folder shown in the skill's `SKILL.md`; the plugin
variables are not filled in in reference files or in the shell.)

It runs in about 2 seconds, writes `qa/lint.json`, refreshes
`src/icons.generated.ts`, and exits 1 on any error. **Errors** (fix them all):

- a sentence missing from every shot, in two shots, or out of order; a shot
  whose chapter differs from its sentences; an unknown scene or transition;
- a beat whose word is not found, defined twice, more than 100 ms from its
  word, or in the last 0.5 s of its shot;
- the template's placeholder `storyboard.json` or `voiceover.json` still in
  place (stills, freeze and render stop on it too);
- fewer than 3 or more than 6 beats in a shot (1-6 for a slab without a
  flow); a shot shorter than 5 s (4 s for the last shot, whose 0.6 s tail
  holds the closing frame) or longer than 15 s;
- a prop that names a beat that does not exist; a required prop missing;
- a terminal or code line not found in `facts.md`, or too long for its tile
  in the video's format; a `StepList` item that does not fit two lines, or a
  `StrikeReplace` `after` that would be drawn under 28 px to fit one line;
- an unknown icon; a missing voice file, screenshot or custom component;
- node, row, item and line counts outside the scene's limits;
- `captions`, `width`, `height`, `paletteLight` or `paletteDark` that
  differs from `video.config.json` (the user's "no captions" or "vertical"
  would not reach the video); a size that is not one of the three formats;
  a palette name that does not exist; the old `palette` key;
- chapter labels that do not fit one row of the chapter bar (use parts), or
  part labels, or one part's chapter labels, that do not fit theirs; a
  chapter in no part or in two, parts out of film order;
- a `HookStatus` slab with `side: "center"` next to a flow; a `targetSeconds`
  that is not `[min, max]`; a `startLine` that is not a whole number from 1;
- an `sfx` that is not a list, of an unknown kind, or at a name that is not
  a beat of its shot.

**Warnings** (read them; fix or explain them in `OUTCOME.md`): estimated word
times, a command without a typing beat, slab and row values not found in
`facts.md`, labels over 3 words, lesson lines over 6 words, more than one red
or green terminal line, more than 3 transition types, `fade-dark` outside the
lesson, too many light-to-dark switches, a video outside `targetSeconds` or,
without it, outside 60-90 s (under 45 s it says "short video"), a beat not
used by its scene, a terminal `title` or a code `file` or `startLine` not
found in `facts.md`, a first and last slab whose tones do not pair (same
tone, or `negative` then `positive`), a slab value drawn under 120 px to
fit, a list item that makes the list text smaller than 36 px, more than one
`StatusCard` row with `ok: false`, a strike that comes after its
replacement, a diagram whose labels would be drawn under 28 px, a
`StatusCard` and its slab taller than the stage of a 1080 px wide frame (or
a slab value drawn smaller to fit with them), a `StepList` item that wraps
to two lines, a `StrikeReplace` `after` drawn under three quarters of the
statement size, a `HookStatus` node label over two lines on a 1080 px wide
frame, a code word drawn under 28 px in the captions, an `sfx` effect with
no pause within 0.3 s of its word (left out) or in a pause that already
holds one, a music file of `audioDir` with notes that start sharply,
more than about two key effects a minute, a file of `audioDir` that ffmpeg
cannot decode (the generated sound of its kind is used). With `audioDir`
the effects are planned with the real lengths of the user's files, as the
render plans them.

`qa/lint.json` lists the effects with their times (`effects`); `audio.mjs
<videoDir>` builds the music and effects alone to check them, and prints
which chapter effects yielded to a key effect.

Values, titles and file names are looked up in `facts.md` without
backticks, bold or case: "container checkout" finds container `checkout`,
and "manca" finds "Manca". Terminal and code lines are still matched line
by line, exactly.

## Common mistakes

- Writing the storyboard before the voice step: lengths and beats come from
  the measured audio, so they would all move.
- Anchoring to the word that *follows* the thing ("vediamo" instead of
  "describe"): the element lands before it is named, or late.
- Anchoring several beats to the same word: they start together, which breaks
  the one-accent rule (style rule 15).
- One shot per sentence to satisfy the 5-15 s rule: merge sentences that
  belong to one idea instead.
- Forgetting to copy `captions` from `video.config.json`: the lint fails until
  the two agree.
- Copying the terminal `title` of the example (`~/acme-shop`): it is a fact of
  that example. A final review classed an invented title as P0.
- An `sfx` on a beat in the middle of a sentence: there is no pause within
  0.3 s of its word, so it is left out; anchor it to the last word of the
  sentence that states the moment.

## Not yet proven

- Beats on estimated word times (voice step run with `--no-check`): the lint
  allows them with a warning; only clause edges are safe.
- Storyboards over about 2 minutes and a half: test videos of 131-141 s were
  rendered, nothing longer.
- `sfx`: placed and measured on the example (an error and a success effect,
  both in the pause that ends their sentence), then heard by the user in four
  whole videos (five effects each, none over speech); not yet in a video
  over 2 minutes.
- `parts`: checked with the lint and on stills (two parts of three chapters,
  and four parts over ten chapters), and rendered in one 9:16 test video
  (two parts of three chapters); four parts not in a rendered video.
