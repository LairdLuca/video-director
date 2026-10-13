# vdvoice: the voice step of video-director

Bilingual narration with one local Kokoro voice. The narration language is
spoken with its own phonemes and the English terms inside it with English
phonemes, in a single pass of the same voice. A local Whisper model then
listens to every sentence: it gives the word times for captions and anchors,
and it checks that each English term can be recognised.

The plugin's scripts run this module for you (`scripts/voice.mjs`,
`scripts/runtime.mjs`). This file is for working on the module itself.

## Why

A narration-language voice reads English terms with its own rules
("checkout" as "kekkot"). Respelling the terms for the voice ("cecàut") makes
them understandable but keeps the accent. Kokoro does not read text, it reads
phonemes, so the English parts get English phonemes (espeak-ng `en-us`) while
the rest stays in the narration language (espeak-ng `it`), and the whole
sentence goes to one voice in one pass, so the intonation runs across the
joins.

In a comparison on 16 Italian sentences with 64 English terms, half of them
held out from tuning, Whisper recognised 93% of the terms on the held-out half
with this approach, against 76-79% with respellings and 45-55% with plain
text. Nobody had listened yet when those numbers were taken.

## Files

| Path | What |
|---|---|
| `run.py` | entry point; adds its own folder to `sys.path` (needed under `-I`) |
| `vdvoice/markup.py` | narration markup: shown text, spoken text, language of each part |
| `vdvoice/phonemes.py` | espeak-ng phonemes per part, joined for one voice; lexicon; final-consonant rule |
| `vdvoice/synth.py` | Kokoro synthesis from phonemes, peak normalization, WAV output |
| `vdvoice/timing.py` | Whisper transcription, alignment of shown words, term check |
| `vdvoice/script.py` | contract A in (`script.json`), pauses, cache keys, fix suggestions |
| `vdvoice/cli.py` | the commands below |
| `data/glossary-en.txt` | English terms marked automatically |
| `data/lexicon-en.json` | IPA for the few English terms espeak gets wrong |
| `data/voices.json` | languages (espeak and Whisper codes, default voice, sample sentence) and per-voice default speed |
| `tests/test_vdvoice.py` | plain-assert tests; no model files needed |
| `requirements.in`, `requirements.txt` | direct dependencies; the full pinned set with sha256 hashes |

## Requirements

- Python 3.12 or 3.13 in a venv, with `requirements.txt` (kokoro-onnx 0.6.1,
  faster-whisper 1.2.1 and their pinned dependencies). Install with
  `--require-hashes --only-binary :all:`: wheels only, so no package code runs
  at install time.
- `kokoro-v1.0.onnx` and `voices-v1.0.bin`; the faster-whisper `small` model
  folder for the check.
- No admin rights: espeak-ng comes from the `espeakng-loader` wheel.
- Always `python -I -B -X utf8`: isolated (no stray modules from the current
  folder), no bytecode written into the plugin folder, UTF-8 everywhere
  (Windows consoles default to cp1252, which breaks on IPA).

## Commands

```
run.py script script.json --out-dir <video>/public/voice --voiceover <video>/voiceover.json \
    --report <video>/qa/voice-report.json --model kokoro-v1.0.onnx --voices voices-v1.0.bin \
    --voice im_nicola [--speed 1.15] (--whisper-model <dir> | --no-whisper) [--force]
run.py try script.json --sentence s04 --text "<marked alternative>" [...] --out-dir <dir> <model options>
run.py sample out.wav --lang it --voice im_nicola --model ... --voices ...
run.py voices --voices voices-v1.0.bin [--lang it]
run.py check [--model ... --voices ... --whisper-model ...]
run.py phonemes lines.txt [--lang it]
run.py synth lines.txt <out> <model options>
```

Text options for every command that phonemizes: `--glossary-extra FILE`,
`--lexicon-extra FILE` (both repeatable; the video's own `glossary.txt` and
`lexicon.json`), `--flag-dashes`, `--en-lang en-gb`, `--no-final-fix`,
`--en-style kokoro`, `--tmp DIR`.

- `script` skips sentences whose shown text, phonemes, voice, speed, model
  and check mode did not change since the last run (the key is in the
  report), and deletes the WAVs of sentences no longer in the script.
- phonemizer copies the espeak-ng library at every start; on Windows the copy
  stays locked until exit. The copies go to `espeak-tmp` inside the venv (or
  `--tmp`), never to the user's TEMP, and the next run removes the old ones.
- `HF_HUB_OFFLINE=1` and `HF_HUB_DISABLE_TELEMETRY=1` are set before
  faster-whisper loads: the model is never fetched from here.

Markup, contract A and contract B are described for the plugin's users in
`skills/make/references/voice.md`.

## Boundaries and final consonants

- Each part is phonemized apart, then joined. espeak stresses and lengthens
  the last word it is given ("il" becomes "ˈiːl"), so a narration part that
  precedes another part is phonemized with a neutral filler word appended,
  whose phonemes are then dropped.
- An elided article before an English word (`l'endpoint`) is phonemized fused
  to a vowel-initial filler, cut, and glued to the English word, instead of
  being read as a letter name.
- `final_fix` (on by default): the narration-language voices swallow English
  word-final consonants ("pod" heard as "pot", "commit" as "cammin"). A final
  stop is doubled to hold it, and a final `ɚ` becomes `əɹ`. It applies to
  espeak output only, never to lexicon IPA. In some places the held stop adds
  a vowel ("un pod nuovo" heard as "un po' di nuovo", "rollout restart" as
  "rollout to restart"); the fix suggestions then offer the same phonemes
  without it, as `{term|ipa:...}`.

## Lexicon

`data/lexicon-en.json` maps an English term to `{"ipa", "say", "why"}`. Keys
are case-insensitive whole words; spaces, `-` and `_` between words are the
same (`acme-shop` matches the spoken "acme shop"). `ipa` is what the voice
gets; `say` is the same pronunciation in letters, what Whisper should write,
with readings that sound the same separated by `|` ("kube control|cube
control"). Every entry is a correct English pronunciation, picked among
English variants with the check, never a respelling in the narration language.
Each entry says why it exists.

## Tests

```
python -I -B -X utf8 tests/test_vdvoice.py
```

18 tests: markup, normalization, the dash option, the term check, alignment,
lexicon keys and readings, fix suggestions, `script.json` checks, pauses, and
a whole `script` run with a fake synthesizer and a fake Whisper that checks
the shape of `voiceover.json` and the reuse of unchanged sentences.

## Common mistakes

- Running Python without `-X utf8` on Windows: IPA and accented letters break
  on cp1252 pipes.
- Running without `-I`: a file named like a standard module in the current
  folder would be imported instead.
- Leaving a narration-language word in the glossary (`data`, `file`, `come`):
  it would be read in English everywhere.
- Putting a respelling in the lexicon: the lexicon holds English phonemes only.
- Judging a pronunciation only from Whisper: its language model fills in known
  terms, so a recognised term can still have an accent. Listen.
- Putting a brand that reads the same in both languages in the glossary
  (Grafana): the English vowels came out worse than the narration reading.
- Expecting a one-phoneme lexicon change to affect one word only: Kokoro picks
  its style vector by the phoneme count, so the whole line can shift.

## Not yet proven

- Narration languages other than Italian (the filler and elision rules have
  entries for es, pt, fr, de, untested).
- Kokoro word timing: kokoro-onnx 0.6.1 can report phoneme times only for a
  model export with a `duration` output; the published v1.0 file has none.
- Long sentences (over 510 phonemes Kokoro splits into batches).
- The `--flag-dashes` reading on more than two sentences.
- macOS and Linux: the pinned set resolves to wheels for Linux x86_64 and
  aarch64 (glibc 2.28 or newer) and macOS 14 or newer on Apple silicon, but the
  module has only run on Windows. Intel Macs are not covered: onnxruntime
  1.31.0 has no wheel for them.
- Human listening: all checks so far are Whisper checks.
