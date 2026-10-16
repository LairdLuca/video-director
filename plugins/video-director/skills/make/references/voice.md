# Voice: script.json, markup, voiceover.json

The voice step turns the narration into one WAV per sentence and
`voiceover.json`, which the template reads. It runs locally: Kokoro for the
voice, espeak-ng for phonemes, faster-whisper `small` for word times and the
pronunciation check.

Commands below write the plugin folder as `<plugin>` and the plugin data
folder as `<data>`. Use the two paths shown in the skill's `SKILL.md`: the
plugin variables are filled in there only, not in reference files and not in
the shell.

```
node "<plugin>/scripts/voice.mjs" <videoDir> [--force] [--no-check] [--strict]
node "<plugin>/scripts/voice.mjs" <videoDir> --try <sentenceId> "<marked text>" ["<marked text>" ...]
```

Voice, speed, language and the model folders come from
`<videoDir>/video.config.json` (written by `config.mjs video`). `--force`
synthesizes every sentence again; `--no-check` skips Whisper (word times are
then estimated); `--strict` exits with code 3 when a term was not heard;
`--try` is the fix loop below.

## How a sentence is spoken

The narration is written in the video's language, exactly as it must appear on
screen. English terms inside it (commands, identifiers, DevOps words) are
spoken with **English phonemes by the same voice, in the same pass**: the
narration language goes through espeak-ng in that language, the English parts
through espeak-ng `en-us`, and the joined phoneme string goes to one Kokoro
voice. A small IPA lexicon covers the few terms espeak gets wrong.

Source: a prototype that compared six ways of saying English terms with an
Italian voice, judged by Whisper on 16 sentences (64 terms), half of them held
out from tuning. Mixed phonemes were recognised 93% of the time on the
held-out half, against 76-79% for Italian respellings and 45-55% for plain
Italian text.

## Contract A: `script.json`

```json
{
  "language": "it",
  "chapters": [{ "id": "problem", "label": "PROBLEMA" }],
  "sentences": [
    { "id": "s01", "chapter": "problem",
      "text": "Il pod di checkout è in CrashLoopBackOff: manca DATABASE_URL." }
  ]
}
```

- `id`: letters, digits, `_` or `-`; it names the WAV file (`public/voice/s01.wav`).
- `chapter`: one of `chapters[].id`. A chapter change gives a longer pause.
- `text`: one sentence, in the markup below. Keep a sentence to one idea.
- Every problem in the file is reported at once, before any synthesis.

## Markup

Plain text is the narration language. English parts are found automatically:

- a glossary of English terms (`voice/data/glossary-en.txt`, about 80 DevOps
  words), whole words, any case, longest first;
- identifier shapes: `CamelCase`, `snake_case`, `UPPER_SNAKE`, `kebab-case`,
  `--flags`, `file.names`, `.dotfiles`;
- English parts separated only by spaces join into one phrase
  (`kubectl logs --previous`).

When the automatic choice is wrong or missing, mark it:

| Markup | Shown | Spoken |
|---|---|---|
| `{en:rollout restart}` | rollout restart | English |
| `{it:servizio}` (any code but `en`) | servizio | narration language, never auto-detected |
| `` `helm upgrade --atomic` `` | helm upgrade --atomic | English (code) |
| `{503\|cinque zero tre}` | 503 | narration language, as written |
| `{PR-1234\|en:pull request 1234}` | PR-1234 | English, as written |
| `{main\|it:mèin}` | main | narration language, as written |
| `{kubectl\|ipa:kjˈuːb kəntɹˈoʊl}` | kubectl | these phonemes |
| `\{` `\}` `` \` `` `\\` | the literal character | |

Rules:

- **No markup inside backticks.** Backticks make the whole part code, said
  as written: `` `{kubectl rollout restart|ipa:...}` `` would have the
  voice spell the IPA aloud, letter by letter (seen in a test video, where
  the check still heard the command's words). `voice.mjs` refuses such a
  line with an error. Write the markup without the backticks: a
  `{shown|spoken}` whose shown side is a command is drawn as code all the
  same. A shell pipe or `${VAR}` inside backticks is fine; a literal
  `{a|b}` in code is written `\{a|b\}`.
- **Shown text is exact.** What reaches the screen and the captions is the
  text minus the markup, never the spoken form. Write terms with their real
  spelling and case.
- **Only the spoken side is normalized.** Version numbers in the narration
  language are read group by group (`2.4.0` becomes "2 punto 4 punto 0"). In
  English, flag dashes are dropped (`--previous` is said "previous"), `_`
  becomes a space, `.` becomes "dot", `-` between words a space.
- **Flags with their dashes**: set `flagDashes=true` (config or one video) to
  say `--atomic` as "dash dash atomic".
- **Numbers that matter** (HTTP codes, counts on screen) are safest as
  `{503|cinque zero tre}`.
- **Acronyms** are not detected: `URL` alone would be read as a word of the
  narration language. Mark them, `{API|en:A P I}`, unless the glossary or the
  lexicon has them.
- **Words that exist in both languages** (data, file, come) are left out of
  the glossary on purpose. Mark them when they are meant in English.
- **Brands that read the same in both languages stay in the narration
  language** (such as "YouTube"): the English vowels came out
  worse in the prototype.

### Code words in the captions

The captions draw commands, file names and identifiers in JetBrains Mono
(style rule 7), so the voice step marks each shown word that is code
(`words[].code` in contract B). The markup decides, nothing else has to be
written:

| In the narration | Code? |
|---|---|
| `` `kubectl logs --previous` `` (backticks) | yes, every word |
| an identifier shape found automatically: `DATABASE_URL`, `CrashLoopBackOff`, `checkout-db`, `--force`, `app.yaml` | yes |
| a glossary term written in backticks in the glossary (`` `kubectl describe` ``, `` `rollout restart` ``) | yes |
| a path: `/etc/hosts`, `./run.sh`, `src/app.ts` | yes |
| `{shown\|spoken}` whose shown side is one of the above (`{rollout restart\|ipa:...}`), or a command that starts with a code term of the glossary (`{kubectl rollout restart\|ipa:...}`) | yes |
| a glossary word (`pod`, `deploy`, `back-off`), a number, a version | no |
| a language marker, `{en:back-off}`, `{it:main}` | no: the way to keep a hyphenated English word in the text font |

Punctuation around a code word stays in the text font (`DATABASE_URL,`),
except a colon, which stays with the code (`env:`, as a YAML key is
written): only `.`, `,` and `;` are the sentence's. A key or field name
that is code is written in backticks even when it is a plain lowercase
word (`` `url` ``, `` `env` ``): no shape gives it away, and without
backticks it stays in the text font while the identifiers around it are in
mono (seen in a test video's captions).
Extra code terms for one video go in `<videoDir>/glossary.txt` in backticks,
one per line. Source: our choice, so that a command in a caption reads as the
command shown in the terminal above it; the shapes are the ones the voice
already uses to find English terms, plus paths.

## Contract B: `voiceover.json`

```json
{
  "language": "it", "voice": "im_nicola", "engine": "kokoro", "sampleRate": 24000, "speed": 1.15,
  "summary": {
    "sentences": 14, "speechMs": 76100, "videoMs": 84100, "wordsPerSecond": 2.39, "spokenWordsPerSecond": 2.64,
    "timing": "whisper", "terms": 25, "termsHeard": 24,
    "marked": 3, "markedHeard": 3, "saidInNarrationLanguage": [],
    "notHeard": [{ "sentence": "s04", "term": "exit code", "heard": "exit cut", "kind": "term" }]
  },
  "sentences": [
    { "id": "s01", "chapter": "problem", "file": "voice/s01.wav",
      "durationMs": 5120, "pauseAfterMs": 400,
      "shown": "Il pod di checkout è in CrashLoopBackOff: manca DATABASE_URL.",
      "words": [{ "text": "Il", "startMs": 0, "endMs": 180 },
                { "text": "DATABASE_URL.", "startMs": 4210, "endMs": 5050, "code": true }],
      "timing": "whisper",
      "probe": { "terms": [{ "term": "CrashLoopBackOff", "heard": "Crash Loop Back Off", "ok": true }] },
      "notHeard": [] }
  ]
}
```

- Times are integer milliseconds; `words` times are relative to the sentence start.
- `words[].text` is the **shown** word, punctuation included, in order; there
  is one entry per space-separated word of `shown`. Whisper's words are aligned
  to them letter by letter; words it fused or missed get times between their
  neighbours.
- `words[].code`: `true` on a command, file name or identifier (see "Code
  words in the captions"), left out otherwise. It is marked again on every
  run, also on sentences that are not synthesized again, so a glossary change
  reaches the captions without new audio.
- `pauseAfterMs`: 400 inside a chapter, 800 before a new chapter, 0 after the
  last sentence. The template adds a 250 ms lead-in and a 600 ms tail;
  `summary.videoMs` includes them.
- `timing`: `whisper` (measured), `estimated` (by word length, with
  `--no-check`), or `engine` (from the TTS; not available with the published
  Kokoro v1.0 model).
- `probe.terms`: every English part, what Whisper wrote there (`heard`), and
  whether it counts as recognised (`ok`). A term is recognised when its shown
  form, its spoken form, or one of its lexicon readings appears as whole heard
  words; case, accents, spaces and hyphens are ignored. Each form is also
  tried with `/` written "slash" and a dot between letters written "dot",
  as the voice says them, and there is no limit on the number of heard
  words: `kubectl rollout undo deployment/checkout` said right is heard as
  seven ("Cube Control Rollout Undo Deployment Slash Checkout"). An `ipa:`
  part is checked against its shown form and that form's lexicon readings.
  `heard` is what Whisper wrote where the term was said: the heard words
  whose middle falls inside the term's time.
- `probe.marked`: every part marked by hand in the narration language
  (`{503|cinque zero tre}`, `{SSO|esse esse o}`, `{commit|it:commit}`,
  `{it:main}`), checked the same way against its shown and its spoken form:
  Whisper may write "503" or "cinque zero tre", "SSO" or "esse esse o".
  `forced: true` marks an English term (in the glossary, or shaped like an
  identifier) said in the narration language. Before, only English parts were
  checked: a spelled acronym heard as another word and an English term moved
  into the narration language went through unseen in test videos.
- `notHeard`: the terms and marked parts of that sentence with `ok: false`.
- `probe` and `notHeard` are there only when the check ran (`timing:
  "whisper"`); with `--no-check` they are left out, never written as empty.
- `summary` is at the top so one read tells the length, the pace and what
  failed. `spokenWordsPerSecond` counts the words that are said (`2.4.0` is
  "2 punto 4 punto 0", five words; `DATABASE_URL` two), and **an acronym
  weighs half a word per letter, at least one word**: `SSO` and `API` 1.5,
  `HTTP` 2, `F5` 1, whether it is spelled with markup (`{SSO|esse esse o}`)
  or left as it is. An acronym said as a word (`{RAM|ram}`) and the
  capitals inside an identifier (`DB_HOST`) count as words. Counting one
  word per letter put a test video over the target with nothing too fast;
  0.1.0 then counted one word per acronym, and the user of this plugin
  chose the middle.
  `wordsPerSecond` counts the shown words. The pace target is for the
  spoken one: a script with many numbers, versions or identifiers has a low
  shown pace by construction.
- `terms`/`termsHeard` count English parts, `marked`/`markedHeard` the marked
  parts; `saidInNarrationLanguage` lists the English terms said in the
  narration language, so "terms heard 3/3" does not hide them. `notHeard`
  holds both kinds, with `kind`: `term` or `marked`.

The detailed report, `qa/voice-report.json`, adds per sentence the phonemes,
the segments, Whisper's full transcript and the suggested fixes.

## The check and the fix loop

1. Run `voice.mjs`. It prints each sentence, then the terms not heard with
   fixes to try, most specific first.
2. Try a fix without touching `voiceover.json`:
   ```
   node "<plugin>/scripts/voice.mjs" <videoDir> --try s04 "Con kubectl describe vediamo che {kubelet|en:cube let} lo riavvia."
   ```
   It synthesizes the current sentence and each alternative into
   `qa/voice-try/` and says what Whisper heard.
3. Put the winning version in `script.json`, or the winning pronunciation in
   the video's own lexicon, and run `voice.mjs` again. Only the changed
   sentences are synthesized again.

Fixes, in this order:

- **Markup**: an English spelling closer to the sound (`{kubelet|en:cube let}`),
  letters for an acronym, `{x|it:...}` for a word that should not be English.
  When the term ends in a held consonant, the first suggestion is the same
  phonemes without it, ready to paste (`{pod|ipa:pˈɑːd}`): on the example
  video this fixed "un pod nuovo" (heard as "un po' di nuovo") and
  "rollout restart" (heard as "rollout to restart").
- **British vowel**: US `ɑː` in a short word can be heard as "a" ("pod" as
  "pad"); `ɒ` fixed it on the example video (`{pod|ipa:pˈɒdd}`).
- **Lexicon**: the fix line says whether the term already has an entry (it
  did not work: try another variant), whether only one word of it has one
  ("only "kubectl" of ... has an entry": the rest is read by espeak, so look
  for the missed part in the heard text), or none (add one).
  `<videoDir>/lexicon.json`, same format as
  `voice/data/lexicon-en.json`:
  `{"kubelet": {"ipa": "kjˈuːbɛlɪt", "say": "kubelet|cubelet", "why": "..."}}`.
  `ipa` is what the voice gets; `say` is the same pronunciation in letters,
  used by the check, with readings that sound the same separated by `|`.
  Keys ignore case, and spaces, `-` and `_` between words are the same.
  Every entry is a correct English pronunciation, never a respelling in the
  narration language.
- **Rephrase**: avoid an elided article right before the term (`l'health
  check`), or move the term to the end of a phrase.
- **Glossary**: `<videoDir>/glossary.txt`, one English term per line, for
  terms the automatic marking should catch in this video; a term in
  backticks is also code in the captions.

A marked part not heard (`kind: marked`) gets its own fixes: for an acronym,
the letters as the narration language names them or the acronym said as one
word, whichever people say; for an English term said in the narration
language, an English spelling with `{term|en:...}` or a lexicon entry; else
another spoken form, tried with `--try`. A marked number heard in another
form ("duemila e quarantotto" for `{2048|duemila quarantotto}`) is a miss of
the check, not of the voice: note it and go on.

A recognised term can still sound accented: Whisper's language model fills in
known words. If the user listens and complains, the ear wins over the check.

## Speed

Each voice has a default Kokoro speed that puts the narration at 2.3-2.7 words
per second while speaking (style rule 19: the pace of the clearest of the
earlier test videos). `im_nicola` is about 13% slower than `if_sara` at the
same speed (82.6 s against 73.1 s of speech for the same narration at 1.0). The
summary prints the measured pace twice: on the spoken words, which the target
is for, and on the shown words. Do not raise the speed above 1.15 to fit a
duration: cut words.

| Voice | Default speed | Measured on a 14-sentence narration (shown words) |
|---|---|---|
| `im_nicola` | 1.15 | 2.39 words/s (2.20 at 1.0, 2.32 at 1.1) |
| `if_sara` | 1.0 | 2.49 words/s (2.42 at 0.95, 2.56 at 1.05) |

The speeds were tuned on shown words. On the same narration `im_nicola` at
1.15 is 2.64 spoken words per second; a 3-sentence script full of versions
and a command, at the same speed, was 2.06 shown and 2.63 spoken. So a low
shown pace with a normal spoken pace is not a reason to change anything.

Kokoro's speed is not linear in the pace: +10% speed gave about +5% words
per second, because the pauses at punctuation do not shrink as much. Other
voices start at 1.0; check `spokenWordsPerSecond` in the summary.

### Estimate before the checkpoint

`voice.mjs <videoDir> --estimate` gives the expected pace and length of
`script.json` without synthesis or models, from the spoken words (numbers
and versions said in words, acronyms at half a word a letter) and the
video's speed: about 2.80 spoken words per second at a voice's default
speed, following the speed to the power 0.6. Those figures were measured
on the dense technical narrations of the test videos with `im_nicola`
(2.75-2.85 at 1.15, 2.72-2.73 at 1.10, 2.66 at 1.05), and they are used
for every voice until another is measured. On two test videos the estimate
was within 0.3 s of the rendered length. It writes `qa/voice-estimate.json`.

### Pace over 3.0

Cutting words shortens the video; it does not lower the pace, which is words
per second of speech. Dense narration (many numbers, codes and short
sentences) runs a little over 2.7 spoken words per second at the default
speed: test videos with `im_nicola` at 1.15 measured 2.75, 2.77, 2.82 and
2.85. **Up to 3.0 it is only noted** (`OUTCOME.md`, the voice line): the
narration is still easy to follow, and lowering the speed means
synthesizing every sentence again. The user's words: a video ready sooner
matters more than more correction rounds. Over 3.0:

1. Lower the speed **for this video** by 0.05 and run the voice step again
   (every sentence is synthesized again, about 2 minutes):
   ```
   node "<plugin>/scripts/config.mjs" video <videoDir> --data "<data>" --project . --chosen speed speed=1.10
   node "<plugin>/scripts/voice.mjs" <videoDir>
   ```
   One test video went from 2.77 to 2.69 this way, and lowering the speed
   adds length (a 9:16 test video gained about 4 s). The video's other
   overrides (format, music style) are kept: `config.mjs video` reads them
   from its `video.config.json`. Better: see it in `--estimate`, before
   the checkpoint, and set the speed before the first synthesis.
2. Still over 3.0: one more step, not below 1.0; or split long sentences
   with a comma or a full stop, since the pauses at punctuation lower the
   pace.
3. Write the speed in `OUTCOME.md` under "Choices", as the director's
   choice, not the user's.

A wrong pronunciation can depend on the speed (a test video's `manifest`
was heard right at 1.10 and wrong at 1.15): when the speed changes anyway,
change it before the pronunciation rounds.

Never raise the speed above the default to make a video shorter.

## Times

On a 16 GB laptop, CPU only, about 2-3 s of synthesis and 2-4 s of Whisper per
sentence: a 90 s video takes about 2 minutes. Unchanged sentences cost
nothing on a second run.

## Common mistakes

- Writing the spoken form in the text ("chiùb contròl"): it reaches the
  screen. Write `kubectl` and let the markup or the lexicon say it.
- Putting a respelling in the lexicon: it holds English phonemes only.
- Adding a word that is also common in the narration language to a glossary:
  it is then read in English everywhere.
- Expecting a one-phoneme change to affect one word only: Kokoro picks its
  style by the length of the whole sentence, so the whole line can shift.
- Running Python without `-I -X utf8` on Windows: IPA breaks on cp1252 pipes
  (the scripts do it for you).
- Treating `ok: true` as "sounds right": it means Whisper understood it.
- Cutting words to bring a fast pace down: the video gets shorter, the pace
  stays the same (see "Pace over 3.0").
- Lowering the speed for a pace between 2.7 and 3.0: a full synthesis
  again for a difference nobody hears; note it instead.
- Writing a command as `{en:kubectl apply}`: it is said right but drawn as a
  word in the captions. Use backticks for a command, `{en:...}` for a word.

## Not yet proven

- Narration languages other than Italian (`en`, `es`, `fr`, `pt` have voices,
  sample sentences and boundary rules, but no test).
- Terms that failed in the prototype even with every rule: `on-call`,
  `rebase`, `health check` after an elided article.
- `flagDashes=true`: tried on two sentences; "helm upgrade --atomic" was
  heard as "dash dash atomic", "--previous" as "-Dash Previous".
- Kokoro word timing (`timing: "engine"`): needs a model export with a
  duration output.
- Human listening: every number above comes from Whisper.
- The check of marked parts on a whole video: tried with `--try` on one
  sentence with three spelled acronyms (two heard, one heard as another
  word, as a test video's review had found by ear), and in the unit tests.
- Code words in the captions: the marking ran in the unit tests and on the
  example's narration, and the captions were checked on stills of a video
  with estimated word times; not yet in a video with measured voice.
- `kubelet` in the base lexicon: the same entry an example video proved;
  `pod` and `manifest` are left to the video's own lexicon, since the British
  `pod` variant made the next word sound different in one test.
