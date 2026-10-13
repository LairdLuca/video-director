"""Turn segments into one phoneme string for a single Kokoro voice.

Main-language segments go through espeak-ng in the main language, English
segments through espeak-ng in English (or a lexicon entry), and the pieces are
joined into one string. Kokoro then reads the whole sentence in one pass, so
the prosody runs across the joins instead of being glued from separate clips.
"""

from __future__ import annotations

import json
import re
import shutil
import tempfile
from pathlib import Path

import espeakng_loader
from phonemizer.backend import EspeakBackend
from phonemizer.backend.espeak.wrapper import EspeakWrapper
from phonemizer.separator import Separator

from .markup import EN, IPA, LEXICON_SEP as _SEP, MAIN, Segment, lexicon_key

_WORDS = Separator(phone="", syllable="", word=" ")

# espeak stresses and lengthens the last word of what it is given, so a segment
# that ends on "il" or "di" before an English term would come out as "ˈiːl".
# A neutral word is appended for espeak and its phonemes are dropped again.
_FILLER = {"it": "cosa", "es": "cosa", "pt": "coisa", "fr": "chose", "de": "Sache"}

# An elided article before an English word ("l'endpoint") would be read as a
# letter name on its own. It is phonemized fused to a vowel-initial word, whose
# phonemes are cut off again, and then joined to the English word.
_ELISION_FILLER = {"it": "amico", "fr": "ami"}
_ELIDED = re.compile(r"\w+['’]$")

# Kokoro's English training data spells diphthongs and affricates as single
# symbols (misaki style: "A" for eI, "O" for oU...), while espeak writes two.
# en_style="kokoro" rewrites espeak's English output that way. Long-vowel marks
# are dropped as in that style. Main-language phonemes are left as espeak gives
# them, since the non-English voices were trained on espeak output.
_KOKORO_EN = [
    ("eɪ", "A"), ("aɪ", "I"), ("aʊ", "W"), ("ɔɪ", "Y"), ("oʊ", "O"), ("əʊ", "Q"),
    ("dʒ", "ʤ"), ("tʃ", "ʧ"), ("ː", ""),
]


def kokoro_style(phonemes: str) -> str:
    for a, b in _KOKORO_EN:
        phonemes = phonemes.replace(a, b)
    return phonemes


# The main-language voices tend to swallow English word-final consonants (an
# Italian word ends in a vowel): "pod" is heard as "pot", "balancer" as
# "balance". final_fix holds a final stop a little longer by doubling it, and
# spells a final r-coloured schwa as schwa plus r.
_FINAL_STOP = re.compile(r"(?<=[ˈˌ\w])([bdɡptk])(?=$|[ \s,.;:!?])")
_FINAL_R = re.compile(r"ɚ(?=$|[ \s,.;:!?])")


def hold_finals(phonemes: str) -> str:
    phonemes = _FINAL_R.sub("əɹ", phonemes)
    return _FINAL_STOP.sub(lambda m: m.group(1) * 2, phonemes)


_espeak_ready = False


def use_private_tmp(folder: str | Path) -> None:
    """Keep phonemizer's espeak-ng DLL copies in `folder`, not in the user's TEMP.

    phonemizer copies the espeak-ng library into a new temporary folder for each
    language backend. On Windows the copy is often still locked at exit, so the
    folder stays behind. Here those copies live in a folder of ours, and the ones
    left by earlier runs (no longer locked) are removed first.
    """
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob("tmp*"):
        if old.is_dir() and {p.name for p in old.iterdir()} <= {"espeak-ng.dll", "libespeak-ng.so", "libespeak-ng.dylib"}:
            shutil.rmtree(old, ignore_errors=True)
    tempfile.tempdir = str(folder)


def _init_espeak() -> None:
    global _espeak_ready
    if not _espeak_ready:
        # The espeak-ng library and data come from the espeakng-loader wheel,
        # so no system install (and no admin rights) is needed
        EspeakWrapper.set_library(espeakng_loader.get_library_path())
        EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
        _espeak_ready = True


def load_lexicon(path: str | Path) -> dict[str, dict]:
    """JSON object: term -> {"ipa", "say", "why"}; keys match case-insensitively.

    "ipa" is what the voice gets; "say" is the same pronunciation in letters
    (what Whisper is expected to write), used by the pronunciation check;
    readings that sound the same are separated by "|".
    """
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return {lexicon_key(k): v for k, v in data.items() if not k.startswith("_")}


class Phonemizer:
    def __init__(
        self,
        main_lang: str = "it",
        en_lang: str = "en-us",
        lexicon: dict[str, dict] | None = None,
        boundary_care: bool = True,
        en_style: str = "espeak",
        final_fix: bool = True,
    ):
        _init_espeak()
        self.main_lang = main_lang
        self.en_lang = en_lang
        self.lexicon = {lexicon_key(k): v for k, v in (lexicon or {}).items()}
        self.boundary_care = boundary_care
        self.en_style = en_style
        self.final_fix = final_fix
        self._backends: dict[str, EspeakBackend] = {}
        if self.lexicon:
            keys = sorted(self.lexicon, key=len, reverse=True)
            self._lex = re.compile(
                r"(?<![\w-])(" + "|".join(_SEP.join(map(re.escape, k.split())) for k in keys) + r")(?![\w-])",
                re.IGNORECASE,
            )
        else:
            self._lex = None

    def _espeak(self, text: str, lang: str) -> str:
        if lang not in self._backends:
            self._backends[lang] = EspeakBackend(
                lang,
                preserve_punctuation=True,
                with_stress=True,
                language_switch="remove-flags",
            )
        if not text.strip():
            return text.strip()
        return self._backends[lang].phonemize([text], separator=_WORDS, strip=True)[0].strip()

    def _main(self, text: str, before_foreign: bool) -> str:  # before another segment
        base = self.main_lang.split("-")[0]
        filler = _FILLER.get(base)
        stripped = text.rstrip()
        if self.boundary_care and before_foreign and _ELIDED.search(stripped) and base in _ELISION_FILLER:
            tail = self._espeak(_ELISION_FILLER[base], self.main_lang)
            out = self._espeak(stripped + _ELISION_FILLER[base], self.main_lang)
            if out.endswith(tail):
                return out[: -len(tail)]
        if not (self.boundary_care and before_foreign and filler and re.search(r"\w", stripped)):
            return self._espeak(text, self.main_lang)
        if not re.search(r"\w$", stripped):
            # Ends on punctuation: the last word is already phrase-final
            return self._espeak(text, self.main_lang)
        out = self._espeak(f"{stripped} {filler}", self.main_lang)
        return out.rsplit(" ", 1)[0] if " " in out else out

    def _espeak_en(self, text: str) -> str:
        ph = self._espeak(text, self.en_lang)
        # Lexicon entries are used as written; only espeak's output is adjusted
        return hold_finals(ph) if self.final_fix else ph

    def _english(self, text: str) -> str:
        if not self._lex:
            return self._espeak_en(text)
        parts, pos = [], 0
        for m in self._lex.finditer(text):
            if text[pos:m.start()].strip():
                parts.append(self._espeak_en(text[pos:m.start()]))
            parts.append(self.lexicon[lexicon_key(m.group(1))]["ipa"])
            pos = m.end()
        if text[pos:].strip():
            parts.append(self._espeak_en(text[pos:]))
        return " ".join(parts)

    def lexicon_keys(self, text: str) -> list[str]:
        """The lexicon entries used inside the text, in order."""
        return [lexicon_key(m.group(1)) for m in self._lex.finditer(text)] if self._lex else []

    def say(self, text: str, limit: int = 8) -> list[str]:
        """The text with lexicon terms replaced by their spoken forms ("say"), for checks.

        "say" may list readings that sound the same, separated by "|"
        ("kube control|cube control"): every combination is returned, up to `limit`.
        """
        if not self._lex:
            return [text]
        forms, pos = [""], 0
        for m in self._lex.finditer(text):
            entry = self.lexicon[lexicon_key(m.group(1))]
            readings = [r.strip() for r in str(entry.get("say", m.group(1))).split("|") if r.strip()]
            forms = [f + text[pos:m.start()] + r for f in forms for r in readings][:limit]
            pos = m.end()
        return [f + text[pos:] for f in forms]

    def segment(self, seg: Segment, before_foreign: bool = False) -> str:
        if seg.lang == IPA:
            return seg.spoken.strip()
        if seg.lang == EN:
            ph = self._english(seg.spoken)
            return kokoro_style(ph) if self.en_style == "kokoro" else ph
        return self._main(seg.spoken, before_foreign)

    def sentence(self, segments: list[Segment]) -> tuple[str, list[str]]:
        """The phoneme string for a line, and the phonemes of each segment."""
        pieces = []
        for i, seg in enumerate(segments):
            nxt = segments[i + 1] if i + 1 < len(segments) else None
            # Any following segment is phonemized apart, so the boundary needs care
            # even when it is main language too (an explicit {it:...})
            pieces.append(self.segment(seg, before_foreign=bool(nxt and re.search(r"\w", nxt.spoken))))
        joined, glue = "", False
        for seg, piece in zip(segments, pieces):
            if not piece:
                continue
            if joined and not glue and not re.match(r"[,.;:!?)]", piece):
                joined += " "
            joined += piece
            # An elided article stays fused to the next word
            glue = seg.lang == MAIN and bool(_ELIDED.search(seg.spoken.rstrip()))
        return " ".join(joined.split()), pieces
