"""Contract A in (script.json), contract B out (voiceover.json).

script.json holds the narration: chapters and sentences, each sentence in the
markup of `markup.py`. The voice step writes one WAV per sentence and
voiceover.json, which the video template reads: measured durations, the pause
after each sentence, the shown words with their times, and the result of the
pronunciation check.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

from .markup import EN, IPA, MAIN, Segment, lexicon_key, markup_in_code

# Style rule: 0.4 s between sentences of a chapter, 0.8 s at a chapter change.
# The template adds its own lead-in and tail; they are only used here for the
# summary's estimate of the video length.
PAUSE_IN_CHAPTER_MS = 400
PAUSE_AT_CHAPTER_MS = 800
LEAD_IN_MS = 250
TAIL_MS = 600

_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_ELIDED = re.compile(r"\w+['’]\s*$")


class ScriptError(ValueError):
    pass


def load_script(path: str | Path) -> dict:
    """Read and check script.json; every problem is reported at once."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise ScriptError(f"cannot read {path}: {e}") from e
    problems = []
    if not isinstance(data, dict):
        raise ScriptError("script.json must be an object with language, chapters and sentences")
    if not isinstance(data.get("language"), str) or not data["language"]:
        problems.append('"language" is missing (for example "it")')
    chapters = data.get("chapters") if isinstance(data.get("chapters"), list) else []
    sentences = data.get("sentences") if isinstance(data.get("sentences"), list) else []
    if not chapters:
        problems.append('"chapters" is missing or empty')
    if not sentences:
        problems.append('"sentences" is missing or empty')
    chapter_ids = set()
    for c in chapters:
        cid = c.get("id") if isinstance(c, dict) else None
        if not isinstance(cid, str) or not _ID.match(cid):
            problems.append(f"chapter {c!r}: needs an id of letters, digits, _ or -")
        elif cid in chapter_ids:
            problems.append(f"chapter {cid}: duplicate id")
        else:
            chapter_ids.add(cid)
    seen = set()
    for s in sentences:
        sid = s.get("id") if isinstance(s, dict) else None
        if not isinstance(sid, str) or not _ID.match(sid):
            problems.append(f"sentence {s!r}: needs an id of letters, digits, _ or - (it names the WAV file)")
            continue
        if sid in seen:
            problems.append(f"sentence {sid}: duplicate id")
        seen.add(sid)
        if s.get("chapter") not in chapter_ids:
            problems.append(f"sentence {sid}: chapter {s.get('chapter')!r} is not in chapters")
        if not isinstance(s.get("text"), str) or not s["text"].strip():
            problems.append(f"sentence {sid}: empty text")
            continue
        for code in markup_in_code(s["text"]):
            problems.append(
                f"sentence {sid}: markup inside backticks (`{code}`) is not read: the voice would say it aloud, "
                "letter by letter. Write the markup without the backticks ({kubectl rollout restart|ipa:...} "
                "is drawn as code in the captions all the same), or escape a literal brace as \\{ \\}"
            )
    if problems:
        raise ScriptError("script.json:\n  " + "\n  ".join(problems))
    return data


def pause_after(sentences: list[dict], i: int) -> int:
    """400 ms inside a chapter, 800 ms at a chapter change, 0 after the last sentence."""
    if i + 1 >= len(sentences):
        return 0
    same = sentences[i + 1]["chapter"] == sentences[i]["chapter"]
    return PAUSE_IN_CHAPTER_MS if same else PAUSE_AT_CHAPTER_MS


def cache_key(phonemes: str, voice: str, speed: float, model_id: str, probe: str) -> str:
    """Same key, same audio: a sentence whose key did not change is not synthesized again."""
    raw = json.dumps([phonemes, voice, round(speed, 3), model_id, probe], ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


@dataclass
class Located:
    """A checked part of a sentence and the shown words it covers."""

    segment: Segment
    index: int  # position in the segment list
    first_word: int
    last_word: int


def english_parts(segments: list[Segment]) -> list[Located]:
    """English and IPA segments with the indexes of the shown words they fall on."""
    return _located(segments, lambda seg: seg.lang in (EN, IPA))


def marked_parts(segments: list[Segment]) -> list[Located]:
    """Parts marked by hand in the narration language: {SSO|esse esse o},
    {503|cinque zero tre}, {commit|it:commit}, {it:main}.

    The check heard only English parts, so a spelled acronym heard as another
    word and an English term forced into the narration language ("commit")
    went through unchecked in the tests.
    """
    return _located(segments, lambda seg: seg.lang == MAIN and seg.source == "explicit")


def _located(segments: list[Segment], keep) -> list[Located]:
    shown = "".join(s.shown for s in segments)
    # character offset -> shown word index
    owner, word = [], -1
    in_word = False
    for ch in shown:
        if ch.isspace():
            in_word = False
            owner.append(None)
        else:
            if not in_word:
                word += 1
                in_word = True
            owner.append(word)
    out, pos = [], 0
    for i, seg in enumerate(segments):
        start, end = pos, pos + len(seg.shown)
        pos = end
        if not keep(seg) or not seg.shown.strip():
            continue
        words = [w for w in owner[start:end] if w is not None]
        if words:
            out.append(Located(seg, i, words[0], words[-1]))
    return out


# An acronym as written: 2-6 capitals and digits with at least one letter (SSO, API, F5)
_ACRONYM = re.compile(r"^(?=[A-Z0-9]*[A-Z])[A-Z0-9]{2,6}$")


def is_acronym(word: str) -> bool:
    return bool(_ACRONYM.match(word.strip(".,;:!?()")))


def acronym_weight(word: str) -> float:
    """Weight of a word in the pace: an acronym is half a word per letter (or
    digit), at least one word ("SSO" 1.5, "HTTP" 2, "F5" 1); any other word 1."""
    if not is_acronym(word):
        return 1.0
    return max(1.0, len(word.strip(".,;:!?()")) / 2)


def marked_suggestions(seg: Segment, forced: bool) -> list[str]:
    """Ways to fix a part marked in the narration language that the check did not hear."""
    term = seg.shown.strip()
    out = []
    if is_acronym(term):
        out.append(f"markup: write each letter as the narration language names it, {{{term}|...}}, "
                   "or say the acronym as one word if that is how people say it; try both with voice.mjs --try")
    if forced:
        out.append(f'markup: "{term}" is an English term said with the narration language\'s sounds; '
                   f"try {{{term}|en:...}} with an English spelling, or a lexicon entry")
    if not out:
        out.append(f"markup: another spoken form for \"{term}\"; try a few with voice.mjs --try")
    out.append("rephrase: move the part to the end of a phrase, or use another word")
    return out


# A held (doubled) word-final stop, as the final-consonant rule writes it
_HELD = re.compile(r"([bdɡptk])\1(?=$|[ \s,.;:!?])")


def suggestions(segments: list[Segment], index: int, lexicon_keys: list[str], phonemes: str = "") -> list[str]:
    """Ways to fix a term the check did not hear, most specific first.

    `lexicon_keys`: the lexicon entries used inside the term's spoken text. An
    entry for one word of a longer term ("kubectl" in "kubectl rollout undo")
    says nothing about the rest of it.
    """
    seg = segments[index]
    term = seg.shown.strip()
    prev = segments[index - 1] if index > 0 else None
    out = []
    if prev is not None and prev.lang == MAIN and _ELIDED.search(prev.shown):
        out.append(f'rephrase: "{term}" follows an elided article ("{prev.shown.strip().split()[-1]}"), '
                   "which can fuse with it; use a full article or another word order")
    if seg.lang == IPA:
        out.append(f"markup: the ipa: reading of \"{term}\" was not recognised; try another English variant")
    elif _HELD.search(phonemes):
        # The rule that holds final consonants can add a vowel before a consonant
        # ("pod nuovo" heard as "po' di nuovo") or inside a phrase ("rollout to restart")
        plain = _HELD.sub(r"\1", phonemes)
        out.append(f"markup: the same English phonemes without the held final consonant, {{{term}|ipa:{plain}}}")
    if re.fullmatch(r"[A-Z0-9]{2,6}", term):
        spelled = " ".join(term)
        out.append(f"markup: spell the acronym, {{{term}|en:{spelled}}}")
    if seg.source == "auto" and not lexicon_keys:
        out.append(f"markup: give an English spelling closer to the sound, {{{term}|en:...}}, "
                   "for example split a compound into words")
    if lexicon_key(seg.spoken) in lexicon_keys:
        out.append(f'lexicon: the entry for "{term.lower()}" did not work here; try another English variant')
    elif lexicon_keys:
        used = ", ".join(f'"{k}"' for k in lexicon_keys)
        out.append(f'lexicon: only {used} of "{term}" has an entry, the rest is read by espeak; compare '
                   "the heard text with the term, and add an entry for the part that was missed to "
                   "lexicon.json in the video folder; try the variants first with voice.mjs --try")
    else:
        out.append(f'lexicon: no entry for "{term.lower()}" yet; add one with an English IPA to lexicon.json '
                   "in the video folder; try the variants first with voice.mjs --try")
    out.append("rephrase: move the term to the end of a phrase, or say it in the narration language")
    return out
