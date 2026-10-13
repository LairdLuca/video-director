# Changelog

## 0.1.0

First release.

- `/video-director:setup`: machine check (`doctor`), a Python venv for the
  voice step built at user level from pinned, hashed wheels, the Kokoro and
  Whisper models pinned by sha256 (or reused from an existing folder), and the
  install-time choices: language, voice with samples, captions, HTML page,
  checkpoints, video folder. Every choice can be overridden for one video.
- `/video-director:make`: facts with sources, narration with an optional
  checkpoint, bilingual voice (English terms with English phonemes in the same
  Kokoro voice) with a Whisper pronunciation check and a fix loop, a
  data-driven storyboard with word-anchored beats and a lint, stills and
  contact sheets, a freeze probe, a loopback-only render with process cleanup
  and loudness at -14 LUFS, a self-contained HTML page, a final review by a
  fresh sub-agent, and `OUTCOME.md`.
- A Remotion template (4.0.535, lockfile) with nine scene types (`HookStatus`,
  `Terminal`, `CodeWalk`, `FlowDiagram`, `StrikeReplace`, `StatusCard`,
  `StepList`, `Lesson`, `Screenshot`) plus a `Custom` escape hatch, a chapter
  bar that fills and scrolls, short captions, a camera on every shot, light and
  dark stages, and push, wipe and fade-to-dark transitions.
- A worked example: `plugins/video-director/examples/acme-shop-crashloop/`
  (fictional incident).

### Fixed after timed test runs, before release

- Delivery opens the result: a new install choice `openOnDelivery` (default on,
  overridable per video) and `scripts/open.mjs`, which opens the finished page,
  or the MP4 when there is no page, with the system's default program, once, at
  the end. Nothing is opened while the video is being made, and sub-agents never
  open anything.

- Template: a `HookStatus` slab value shrinks to fit its card (a five-digit
  value ran out of it beside a flow) and the caption wraps; a `StatusCard`
  row without `ok` has no mark (it showed a red cross); `StepList` and
  `StatusCard` are centred in the stage with larger type for 1-3 items, and
  `FlowDiagram` scales its whole drawing to fill the stage (up to 1.4x); the
  title of a list and the empty card are on screen from the first frame;
  `CodeWalk` draws line numbers only with `startLine`; `StrikeReplace` takes
  `atBefore`; between a light and a dark shot the theme colours switch at the
  hand-over of the push, so no mid-grey frame.
- Lint: values are found in `facts.md` without backticks, bold or case; the
  length is checked against the storyboard's `targetSeconds` when the user
  asked for a length; a slab alone needs one beat; warnings for a slab value
  drawn small, a list item that makes the list small, more than one red row,
  a strike after its replacement; errors for a centred slab next to a flow and
  for the template's placeholder `storyboard.json` and `voiceover.json` (also
  in stills, freeze and render).
- Voice: parts marked in the narration language (`{SSO|...}`, `{503|...}`,
  `{commit|it:commit}`) are checked like English terms and counted apart;
  English terms said in the narration language are listed; a spelled acronym
  counts as one word in the pace; `kubelet` is in the base lexicon; the
  summary points to the "Pace over 2.7" steps.
- `stills.mjs --shot` takes several shots, with one bundle and one browser.
- Config: `config.mjs set` and `show` warn about an absolute `videosDir`;
  `config.mjs video` takes `videosDir` from the video's folder; `show`
  prints `modelsFound`. `doctor` states the memory the render needs.
- Page: `values` for codes and names that are not commands; decisions with
  one option (a proposal) or none; warnings for sources, commands, values and
  numbers not found in `facts.md`.
- Skill: an example and the "decisions already taken are not open" rule for
  the task arc; a section on longer videos; what to do when the pace is over
  2.7; which stills to run after the review fix; render time 5-9 minutes.
- Example: the code close-up is titled "container checkout", as its facts
  say, without line numbers.
