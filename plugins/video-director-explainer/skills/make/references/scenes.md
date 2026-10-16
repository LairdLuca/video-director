# Scene catalogue

Nine scene types plus a `Custom` escape hatch. A shot picks one with
`"scene"` and gives it data in `"props"`; timing never goes in props, it comes
from **beats** (named anchors on spoken words, see [storyboard.md](storyboard.md)).
A prop such as `"at": "crash"` names a beat of the same shot.

The props below are the ones the template reads (`template/src/scenes/*.tsx`)
and the lint checks (`scripts/lint-storyboard.mjs`). Every scene draws inside
the stage band, inside the shot's camera, on the shot's `theme`.

Where the catalogue comes from: the scene types of the clearest of the
earlier test videos, restated as data-driven components; the lint
limits come from the layout of the template in each format.

**Formats.** Every scene is laid out for 16:9, 9:16 and 1:1 (style rule 1)
from the same props; the storyboard does not change with the format, only
what fits does. On 9:16 and 1:1 (a 1080 px wide frame) side-by-side layouts
are stacked and lines are shorter; each scene below says how. The lint
checks the limits of the video's format.

Icons are [Lucide](https://lucide.dev/icons/) names in file form (`server`,
`file-text`, `shopping-cart`); PascalCase is converted. Only the icons used by
the storyboard are bundled (`src/icons.generated.ts`, refreshed by the lint).

## HookStatus: the symptom or the result in one frame

```json
"props": {
  "flow": { "nodes": [{ "icon": "rocket", "label": "deploy 2.4.0" },
                      { "icon": "shopping-cart", "label": "checkout" }],
            "broken": true },
  "slab": { "value": "503", "caption": "checkout", "side": "right", "tone": "accent" }
}
```

| Prop | Required | Notes |
|---|---|---|
| `slab.value` | yes | the hero number or word: 192 px mono up to 4 characters beside a flow, smaller beyond so it fits (see below) |
| `slab.caption` | no | a short line under the value; wraps inside the slab |
| `slab.side` | no | `right` (default) or `left`, the flow takes the other half; `center` only without a flow (the lint fails otherwise: it covers node A) |
| `slab.tone` | no | `accent` (default), `negative`, `positive`; use red only if the colour is the point; in a mirror, see the pair rule below |
| `flow.nodes` | no | exactly 2, each `{ icon, label }`, label at most 3 words |
| `flow.broken` | no | a cross on node B (`true`) or a tick (`false`) |

On 9:16 and 1:1 the flow is above the slab (`side: "left"` puts the slab
above), the nodes 220 px on 9:16 and 160 on 1:1, and the
slab gets the text width, so a value of up to 6 characters keeps the hero
size; on 1:1 the value is at most 140 px, so the stack fits the shorter
stage.

Beats: `slab` (required); `flowIn` (required with `flow`: node A draws in);
optional `target` (node B lands, default 0.7 s after A) and `cross` (the mark,
default 0.3 s after the slab). Without `flow` only the slab is shown, centred,
and the shot needs only the `slab` beat (the lint asks 1-6 beats there, 3-6
everywhere else).

**Long values.** Beside a flow the slab has a 620 px slot: 4 characters fit
at 192 px, a five-digit task number at about 164 px, an 11-letter word at
about 74 px. The value shrinks to fit instead of running out of the card (a
five-digit number did, in a test video), and the lint warns when it would be
under 120 px. For a long value, use the slab without the flow: alone, it
gets the whole stage.
Use it twice: the symptom in the first shot, the resolution near the end,
same component (style rule 35). **Tones go in pairs**: both slabs `accent`
(the default; the value carries the change, 503 then 200), or `negative` for
the symptom and `positive` for the resolution. Never one of each kind: an
`accent` 503 and a `positive` 200 read as two unrelated cards, not as the
same thing resolved (a final review flagged it on a test video).

## Terminal: a command and its evidence

```json
"props": {
  "size": "tile",
  "lines": [
    { "kind": "cmd", "text": "kubectl get pods -n shop", "at": "cmd" },
    { "kind": "out", "text": "NAME                        READY   STATUS             RESTARTS   AGE" },
    { "kind": "err", "text": "checkout-7d9f8c6b5-x2kqp    0/1     CrashLoopBackOff   6          8m" }
  ],
  "focus": [{ "line": 3, "style": "brackets", "at": "crash" }]
}
```

| Prop | Required | Notes |
|---|---|---|
| `lines[]` | yes | `kind`: `cmd` (typed, `$ ` prefix added), `out`, `err` (red), `ok` (green); `text` exactly as in `facts.md` |
| `lines[].at` | no | beat where the line starts; a `cmd` without it gets a lint warning |
| `focus[]` | no | `line` (1-based), `style`: `brackets`, `band` (other lines dim to 30%), `tint`; `at` |
| `size` | no | `tile` (default: dark tile on a light stage, 1500 px) or `full` (fills the frame; use a dark theme) |
| `title` | no | the tile's title bar: a folder or a file name, only when `facts.md` gives it (the lint warns otherwise); without it the bar stays empty. Never guess a folder |
| `typeCps`, `outCps` | no | typing and output speed, default 25 and 70 characters per second |

Behaviour: commands type from their beat; output without a beat follows in
chunks of up to 3 lines; a line that a focus points at is on screen by then.
The font fits the longest line between 28 and 32 px (34 for `full`); on
9:16 and 1:1 it may go down to 24 px. Over 10 lines (16 on 9:16) the content
scrolls one line at a time.

| Format | `tile` | `full` |
|---|---|---|
| 16:9 | 1500 px wide, 85 characters a line | 1728 px, 99 characters, from the top of the stage |
| 9:16, 1:1 | the width less 64 px each side, 61 characters (at 24 px) | less 40 px each side, 65 characters, centred |

Lint: every line must equal a line of `facts.md` (whitespace normalized; a
command also matches `$ command` or `# command`); at most the characters in
the table for the video's format (the `$ ` counts); a warning for more than
one red or one green line; a warning when `title` is not found in
`facts.md`. A line too long for a narrow frame is not shortened by hand:
the video is 16:9, or the facts give a shorter output (style rule 1,
"Choosing the format").

## CodeWalk: a close-up on a file or a long output

```json
"props": {
  "file": "container checkout", "language": "yaml",
  "code": "env:\n  - name: DATABASE_URL\n    valueFrom:\n      secretKeyRef:\n        name: checkout-db\n        key: url\n",
  "walk": [{ "line": 5, "at": "secretName" }, { "line": 2, "at": "var" }]
}
```

| Prop | Required | Notes |
|---|---|---|
| `file` | yes | the title bar. A file name only when `facts.md` says the snippet is in that file; otherwise a short title from the facts that is not a file name ("container checkout"). The lint warns when it is not in `facts.md` |
| `code` | yes | 6-12 lines (warning outside), at most 79 characters per line on 16:9 (at 30 px) and 61 on 9:16 and 1:1 (at 24 px; 3-4 fewer with line numbers), each non-empty line in `facts.md` |
| `walk[]` | yes | `line` (1-based, counted in the snippet) and `at`: the band moves to that line on its beat |
| `startLine` | no | the snippet's first line number in the file, **only when `facts.md` gives it**: then line numbers are drawn from it. Without it no numbers are drawn |
| `language` | no | `yaml`, `json`, `shell` or `text` (default): subdued colouring, keys in the accent |
| `zoom` | no | default 1.6, at most 2 |

Why no numbers by default: a file name over lines numbered 1-6 says "the
first six lines of this file", a position no fact gave. A final review rated
it P0 on a test video whose facts had the snippet but not its place.

Behaviour: the camera pushes in just before the first walk beat, the band
walks from line to line (other lines at 30%), and pulls back in the last
second. The push stops where the longest line still fits between the text
margins (at least 1, at most `zoom`), so no line runs out of the frame; on
9:16 and 1:1 the tile is the width less the margins and zooms less. Use a dark theme, and `"transitionIn": "wipe"` when it continues the
terminal of the previous shot.

## FlowDiagram: a mechanism with 2 to 4 nodes

```json
"props": {
  "layout": "row",
  "nodes": [{ "id": "manifest", "icon": "file-text", "label": "manifest", "at": "manifest" },
            { "id": "container", "icon": "box", "label": "container checkout", "at": "container" }],
  "edges": [{ "from": "manifest", "to": "container", "at": "edge", "broken": true }],
  "marks": [{ "node": "container", "kind": "slot-missing", "label": "DATABASE_URL", "at": "missing" }]
}
```

| Prop | Required | Notes |
|---|---|---|
| `nodes[]` | yes | 2-4; `id`, `icon`, `label` (at most 3 words), optional `sub` (a second line), `at` |
| `edges[]` | no | `from`, `to`, `at`, optional `label`, `broken` (dashed, the target does not light) |
| `marks[]` | no | `node`, `kind`: `cross`, `tick`, `slot-missing` (a dashed box with `label`: "should be here and is not"), `at` |
| `layout` | no | `row` (default), `column`, `fork` (one source, the rest on the right) |

An edge draws in 0.4 s from its beat; its target lights when it arrives. More
than 4 nodes: split into two shots.

| Format | `row` | `column` | `fork` |
|---|---|---|---|
| 16:9 | as written | as written | as written |
| 1:1 | 2-3 nodes closer together, labels under them; 4 nodes become a column | as written | the targets closer to the source |
| 9:16 | becomes a column (labels on the right, edges downward) | as written | the targets closer to the source |

An edge label sits above a horizontal edge and on the right of a vertical
one. The lint warns when the drawing has to shrink so much that its labels
fall under 28 px: shorten the labels, drop the subs, or split the diagram.

The whole drawing (nodes, labels, edge labels, slot boxes) is centred in the
stage and scaled to fill it, up to 1.4 times: two nodes are drawn at about
280 px, four in a row stay near 200 px. Nodes keep their final places while
they arrive, so the first node of a three-node row appears on the left, not
in the middle.

## StrikeReplace: "not A, but B"

```json
"props": { "before": "DB_HOST + DB_PORT", "after": "DATABASE_URL",
           "atStrike": "strike", "atAfter": "after", "note": "dalla 2.4.0: connessione al database", "atNote": "note" }
```

| Prop | Required | Notes |
|---|---|---|
| `before`, `after` | yes | code-looking tokens are drawn in mono |
| `atStrike`, `atAfter` | yes | beat names: the strike line, then `after` rising into the slot |
| `prefix` | no | text before the slot; prefix + before at most about 40 characters on 16:9, about 25 a line and two lines on 9:16 and 1:1 (warning). It is read with `before` until the strike, so it must be true of the old value too: a neutral label ("connessione:"), never the new version ("2.4.0:" in front of the old value states the opposite of the fact) |
| `atBefore` | no | beat where the statement (prefix and `before`) appears; default: the start of the shot. Set it when the narration names the old value after the shot starts (style rule 27). Until then the stage is empty paper: more than 0.8 s of it is a lint warning, and the freeze check fails on it (seen in a test video: 0.00% change at 25% of the shot). Anchor it to an earlier word, or end the shot before on a later sentence |
| `note`, `atNote` | no | a muted line below; default 0.8 s after `atAfter` |

Beat order: the statement, then the strike, then `after`; the lint warns
when `atStrike` comes after `atAfter` (the old value would be struck after
the new one is in its slot). When the sentence names the new value first
("the new one, no longer the old one"), anchor both to the words that name
the old value, the strike first, `after` about 0.5 s later.

## StatusCard: the verification

```json
"props": {
  "title": "checkout-6b8d9f7c4-m4vtr",
  "rows": [{ "label": "STATUS", "value": "Running", "ok": true, "at": "running" },
           { "label": "RESTARTS", "value": "0", "ok": true, "at": "restarts" }],
  "slab": { "value": "200", "side": "right", "tone": "accent", "at": "slab" }
}
```

| Prop | Required | Notes |
|---|---|---|
| `title` | yes | mono, e.g. the pod name |
| `rows[]` | yes | 1-5; `label`, `value`, `at`, optional `ok`: `true` a tick, `false` a cross, 0.1 s after the row; left out, no mark |
| `slab` | no | as in HookStatus, plus `at` (default beat `slab`): the mirrored status |

Leave `ok` out for a state, an option or a value that is not a check
("open", "option A"): in a test video, rows without `ok` were drawn with a red
cross, and two options read as two failures. The lint warns when a row value
or the slab value is not found in `facts.md`, and when more than one row has
`ok: false`.

The card is on screen from the first frame (the transition shows it, not an
empty stage) and the rows arrive on their beats. With 1-3 rows the card is
wider and its type larger; a long value shrinks to stay on one line.
On 9:16 and 1:1 the card takes the width less the margins and the slab is
under it (`side: "left"`: above); on 1:1 with a slab the rows are compact
and the value at most 120 px, and the lint warns over 3 rows there (they
do not fit the stage).

## StepList: numbered steps or a checklist

```json
"props": { "title": "Prima del deploy", "ordered": true,
           "items": [{ "text": "Leggi le note di rilascio", "icon": "list-checks", "at": "notes", "done": true }] }
```

| Prop | Required | Notes |
|---|---|---|
| `items[]` | yes | 1-5; `text` (one line; a long item makes the whole list smaller), optional `icon`, `at`, `done` (a tick) |
| `ordered` | no | default `true`: numbers and a rail; the current item gets an accent ring |
| `title` | no | a heading above the list, on screen from the first frame |

Good for "what we checked", a recap, the steps of a task, the decisions of a
report. Space the item beats at least 0.4 s apart.

Layout: the title and the list are one block, centred in the stage, with
larger type for 1-3 items (up to 66 px) than for 4-5 (up to 54 px); on 9:16
and 1:1, 56 and 48. Items not yet reached
keep their place, so the block does not move as the list builds. The text
shrinks so the longest item stays on one line; the lint warns when that
takes it under 36 px.

## Lesson: the takeaway

```json
"props": {
  "lines": [{ "text": "Nuove variabili richieste?", "at": "line1" },
            { "text": "Manifest nello stesso rilascio", "at": "line2" }],
  "keyword": "stesso rilascio",
  "reminders": [{ "icon": "list-checks", "text": "note di rilascio", "at": "notes" }]
}
```

| Prop | Required | Notes |
|---|---|---|
| `lines` | yes | 1-3 (2-3 is best), at most 6 words each; strings use beats `line1`, `line2`... if defined, else they follow each other 0.15 s apart; or `{ text, at }` |
| `keyword` | no | a phrase drawn in the accent; must appear in a line (warning) |
| `reminders[]` | no | `icon`, `text`, `at`; each gets a tick |

Use `"theme": "dark"`, `"transitionIn": "fade-dark"` and `"chapterBar": false`.
The block is centred in the stage; lines are 72 px on 16:9 and 60 px on 9:16
and 1:1, where a line of 6 words may wrap.

## Screenshot: a still of a UI or a page (not yet proven)

```json
"props": { "src": "shots/dashboard.png", "size": [1600, 900],
           "regions": [{ "box": [120, 80, 420, 60], "kind": "callout", "label": "error rate", "at": "rate" }],
           "pan": [{ "to": [330, 110, 1.4], "at": "rate" }] }
```

| Prop | Required | Notes |
|---|---|---|
| `src` | yes | a file under the video's `public/` |
| `size` | yes | `[width, height]` of the image in pixels |
| `regions[]` | no | `box` `[x, y, w, h]` in image pixels, **measured, never guessed**; `kind`: `brackets`, `band`, `callout` (with `label`); `at` |
| `pan[]` | no | `to` `[x, y, scale]` in image pixels, scale at most 1.5; `at` |

The image comes from the user or from the facts; never draw a fake browser
frame around it. The lint always warns that this scene is not yet proven.

## Custom: the escape hatch

```json
{ "scene": "Custom", "component": "src/custom/RetryTimeline.tsx", "props": { "attempts": 3 } }
```

Only when no catalogue type fits. Write `<videoDir>/src/custom/<Name>.tsx`,
export the component as default or under its file name, and import what it
needs from `../kit`: `useShot()` (props, theme colours `c`), `useBeat()`
(`beat("name")` gives the frame), `useShotStart()`, `StageFrame` (camera and
background, always wrap the scene in it), `tween`, `arrive`, `follow`, `ease`,
`Icon`, `Mark`, `Brackets`, `Slab`, `Paper`, `TYPE`, `BAND`, `mono`, `sans`.
`useShot().L` gives the frame of the video's format (`width`, `height`,
`stageTop`, `stageBottom`, `margin`, `textMargin`); `BAND` is the 16:9 frame
only. Follow the style guide by hand: the lint checks the beats, not the
layout. No new npm package.

## Shot settings shared by every scene

| Field | Default | Notes |
|---|---|---|
| `theme` | `light` | `dark` for close-ups and the lesson (style rule 9) |
| `transitionIn` | `push` | `wipe`, `fade-dark`; ignored on the first shot. A push between a light and a dark shot is drawn as a crossfade (style rule 29) |
| `chapterBar` | `true` | `false` hides the bar (fades with the transition) |
| `camera` | `{ "from": 1, "to": 1.04 }` | a slower or no push: `{ "to": 1.02 }` |

## Common mistakes

- Typing a command into `lines` that is not in `facts.md` (shortened, other
  flags): the lint fails. Add it to the facts with its source, or show the
  real one.
- Beat names in props that the `beats` list does not define: the lint fails
  with the shot id.
- A `Terminal` with a 120-character line: split the output across lines as
  the facts show it, or add the shortened output to `facts.md`, with its
  source, and show that (the lint fails on any line not in the facts).
- Guessing `Screenshot` region boxes: measure them on the image.
- A `Custom` scene that does not wrap itself in `StageFrame`: no camera, no
  background, and the freeze probe fails.
- A long value (a task number, a word) in a `HookStatus` slab beside a flow:
  it shrinks to fit; for a hero-size value, drop the flow.
- `ok: false` on `StatusCard` rows that are options or states, not failed
  checks: leave `ok` out.
- A `CodeWalk` titled with a file name and numbered from 1 when the facts do
  not say where the snippet sits in the file.
- Shortening a command or an output line to fit 9:16: the line is no longer
  the one in the facts. Pick 16:9 when the video must show the long lines;
  a wide table's values fit a `StatusCard`, and a line not needed for the
  point can stay out of the video.
- A `StrikeReplace` prefix that names the new state ("2.4.0:") in front of
  the old value: until the strike the screen states a false fact. A test
  review classed it P1. Use a neutral label, or put the version in the
  note.
- A `Terminal` output line, or a focus on it, anchored before its command
  has finished typing (25 characters a second): the output is on screen
  while the command is still being written. The lint warns; anchor it to a
  later word, or raise `typeCps`.

## Not yet proven

- `Screenshot` (tested only with a synthetic image) and `Custom` (tested only
  with a trivial component).
- The 9:16 and 1:1 layouts: checked on stills of every scene of the example
  (with terminal lines shortened in a lab copy) and on a 3 s clip each, not
  in a full video. `fork`, `column` with edge labels, `Screenshot` and a
  4-node row were not drawn on a narrow frame.
- The lint's layout limits are estimates from character widths and counts,
  not a measured layout; the contact sheet is the real check. The same
  estimates size the slab value, the list text and the diagram's scale.
- `StrikeReplace` with `atBefore`, and `CodeWalk` with `startLine`: checked
  with the lint, not yet in a rendered video.
