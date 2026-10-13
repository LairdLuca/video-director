# The HTML page (contract D: `page.json`)

When the `page` choice is on, every video gets one HTML file next to it:
`out/<slug>.html`, built by `scripts/page.mjs` from `<videoDir>/page.json`.
Claude writes `page.json` from the same `facts.md` and `script.json` as the
video; the script only renders it. Nothing on the page may be invented: every
statement comes from `facts.md`, and every command shows its source.

Where this comes from: a video is quick to watch but slow to copy from, so
the commands and values go on a page next to it (a design decision of this
plugin); the "facts only, with a source" rule comes from a comparison of six
video tools, where the clearest results cited a facts file for every value.

## What the page is

- One file. Inline CSS, no script, no CDN, no web font, no network. It works
  when opened from `file://` and when the folder is copied elsewhere.
- The video is linked with a relative path (`<video src="<slug>.mp4" controls>`),
  not embedded, so the page stays small. Keep the page and the MP4 in the
  same folder.
- Light and dark theme follow the reader's system setting, with the video's
  palette. Readable at phone width: one column, code blocks scroll sideways.
- Written in the video's language (`language`). The page's own labels
  (Description, Transcript...) exist for `it` and `en`; other languages fall
  back to English labels.

## Sections, in order

1. Title and a one-paragraph short explanation (`title`, `summary`).
2. The video.
3. Description: one section per chapter, each with a short text and the
   commands and values shown in the video, each with its source.
4. Decisions to take: only when the facts contain open decisions. Each one
   with who decides and, when the facts give them, its options and the
   trade-off of each. A decision with one proposal waiting for a yes is
   written with that one option; a decision the facts name without any
   option is written with none ("The sources give no options"). Never add
   an option to make a pair. When the facts hold no open decision, leave
   `decisions` out: the section is then omitted, never filled with invented
   choices.
5. The transcript, collapsed.

## Schema

```json
{
  "title": "acme-shop: checkout in CrashLoopBackOff after the 2.4.0 deploy",
  "language": "en",
  "summary": "One paragraph: what happened, why, what fixed it.",
  "video": "acme-shop-crashloop.mp4",
  "sections": [
    {
      "chapter": "diagnosis",
      "heading": "The pod does not stay up",
      "body": ["Paragraph one.", "Paragraph two, with `inline code`."],
      "commands": [
        { "text": "$ kubectl get pods -n shop", "source": "facts.md:14" }
      ],
      "values": [
        { "label": "Restarts", "text": "6 in 8 minutes", "source": "facts.md:15" }
      ]
    }
  ],
  "decisions": [
    {
      "question": "Keep the old variables as a fallback?",
      "options": [
        { "label": "Yes", "tradeoff": "safer rollback, two code paths to test" },
        { "label": "No", "tradeoff": "one code path, the manifest must be right first" }
      ],
      "owner": "the checkout team",
      "source": "facts.md:80"
    }
  ],
  "transcript": [
    { "chapter": "problem", "text": "The shown text of sentence one." }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Page title and `<h1>`. |
| `language` | yes | `it`, `en`, ... (sets `lang` and the page's labels). |
| `summary` | yes | One paragraph; a blank line starts another paragraph. Backticks make `code`. |
| `video` | yes | Relative path from the page to the MP4, normally `<slug>.mp4`. |
| `sections[]` | yes, at least one | One per chapter, in the video's order. |
| `sections[].chapter` | no | Chapter id from `script.json` (shown as its label) or a label. |
| `sections[].heading` | yes | A short heading. |
| `sections[].body` | yes | A string (blank lines split paragraphs) or a list of paragraphs. |
| `sections[].commands[]` | no | `text` (exact, as in `facts.md`; multi-line allowed) and `source` (`facts.md:14`, `facts.md:48-53`, a commit, a file). Shown as code: only for commands, output and code. |
| `sections[].values[]` | no | Values that are not commands: codes, names, paths, counts, dates. `text` (as in `facts.md`), `source`, optional `label`. Shown as a list of label and value, not as code. Before this field, a video without a terminal had its codes on the page as code blocks. |
| `decisions[]` | no | Omit when there are none. Each needs `question`, `owner`, `source`; `options` is a list of `{ label, tradeoff }`: two or more (each with its `tradeoff`), one (a proposal to confirm; `tradeoff` optional) or none (`[]` or left out). Optional `note`, one line from the facts. |
| `transcript` | yes | A string, a list of strings, or a list of `{ chapter, text }`. Use the *shown* text of each sentence (exact spelling), not the respelling for the voice. |

## Build

```
node "<plugin>/scripts/page.mjs" <videoDir> [--out <file.html>]
```

(`<plugin>` is the plugin folder shown in the skill's `SKILL.md`; the plugin
variables are not filled in in reference files or in the shell.)

It validates `page.json` first and lists every problem (exit code 1), then
checks the page against `facts.md` and prints warnings for: a `facts.md:N`
source past the end of the file or on a blank line, a command line or a
value not found in `facts.md`, and a number of 3 or more digits that
`facts.md` never writes. Then it writes the page. It warns when the MP4 is
not yet next to the page. Run it after `render.mjs`, or before it: the link
works as soon as the video lands.

The check is mechanical: a statement in the prose that is not in the facts
still needs the final review. It exists because a final review found four
page statements with no fact behind them, and no script had seen them.

## Common mistakes

- A command on the page that is not the one in `facts.md` (retyped, shortened
  with a different flag). Copy it from `facts.md` and cite the line.
- A `decisions` section made up to fill the page. It exists only for open
  decisions that are in the facts.
- An absolute path or a URL in `video`: the page must keep working when the
  folder is moved or sent.
- The respelled text of the voice in the transcript instead of the shown text.
- Codes and names put in `commands` because there is no terminal: use
  `values`.
- A second option invented so a decision has two: write the one the facts
  give, or none.

## Not yet proven

- Right-to-left languages and languages other than Italian and English for
  the page's own labels.
- Very long transcripts (over 10 minutes of narration): the page has no table
  of contents.
- Rendering in old mobile browsers: checked as text, not opened in a browser
  during development.
- `values` and decisions with 0 or 1 option: built on test data and read as
  HTML text, not yet used by a video.
