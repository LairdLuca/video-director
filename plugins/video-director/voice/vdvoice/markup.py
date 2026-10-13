r"""Narration markup: which parts are spoken in the main language and which in English.

A narration line is plain text in the main language (Italian in the tests).
English parts are found automatically, from a glossary of known terms plus
identifiers, flags and code, or marked by hand:

    {en:rollout restart}              English, shown as written
    {it:main}                         main language (any code but en), never auto-detected
    {503|cinquecento tre}             shown text | spoken text (main language)
    {kubectl|en:kube control}         shown text | spoken text in English
    {kubectl|ipa:kjˈuːb kəntɹˈoʊl}    shown text | phonemes as given
    {main|it:mèin}                    shown text | spoken text, main language, explicit
    `kubectl logs --previous`         code: English, shown without backticks
    \{  \}  \`  \\                     a literal brace, backtick or backslash

The shown text (screen and captions) is always what the author wrote, minus
the markup. Only the spoken side is normalized.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from pathlib import Path

MAIN = "main"
EN = "en"
IPA = "ipa"

_EXPLICIT = re.compile(
    r"\\(?P<esc>[{}`\\])"
    r"|\{(?P<lang>[a-z]{2}):(?P<body>[^{}]*)\}"
    r"|\{(?P<shown>[^{}|]*)\|(?P<spoken>[^{}]*)\}"
    r"|`(?P<code>[^`]+)`"
)

# Identifier shapes that are never main-language words
_FLAG = r"--?[A-Za-z][\w-]*"
_SNAKE = r"[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+"
_CAMEL = r"[A-Z]?[a-z]+(?:[A-Z][a-z0-9]*)+"
_KEBAB = r"[a-z][a-z0-9]*(?:-[a-z0-9]+)+"
_DOTTED = r"[A-Za-z][\w-]*(?:\.[A-Za-z][\w-]*)+"
_DOTFILE = r"\.[A-Za-z][\w-]*(?:\.[A-Za-z][\w-]*)*"
_IDENTIFIERS = [_FLAG, _DOTFILE, _DOTTED, _SNAKE, _CAMEL, _KEBAB]

_VERSION = re.compile(r"\bv?(\d+(?:\.\d+)+)\b")
_POINT = {"it": "punto", "es": "punto", "fr": "point", "de": "Punkt", "pt": "ponto"}


@dataclass(frozen=True)
class Segment:
    shown: str
    spoken: str
    lang: str  # MAIN, EN or IPA
    source: str  # "plain", "auto" or "explicit"


# Lexicon keys match whatever separates their words: "acme-shop", "acme_shop"
# and "acme shop" are one key, since the spoken side turns - and _ into spaces
LEXICON_SEP = r"[\s_-]+"


def lexicon_key(text: str) -> str:
    return " ".join(re.split(LEXICON_SEP, text.strip().lower()))


def load_glossary(path: str | Path) -> list[str]:
    """One term per line; blank lines and lines starting with # are skipped."""
    terms = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            terms.append(line)
    return terms


def _auto_pattern(glossary: list[str]) -> re.Pattern:
    # Longest terms first, so "kubectl logs" wins over "kubectl"
    words = [r"\s+".join(map(re.escape, t.split())) for t in sorted(glossary, key=len, reverse=True)]
    # Identifier shapes are case-sensitive (CamelCase needs its capitals),
    # glossary terms are not
    alternatives = _IDENTIFIERS + ([r"(?i:" + "|".join(words) + ")"] if words else [])
    return re.compile(r"(?<![\w-])(?:" + "|".join(alternatives) + r")(?![\w-])")


def _split_plain(text: str, pattern: re.Pattern | None) -> list[Segment]:
    if not pattern:
        return [Segment(text, text, MAIN, "plain")] if text else []
    out, pos = [], 0
    for m in pattern.finditer(text):
        if m.start() > pos:
            out.append(Segment(text[pos:m.start()], text[pos:m.start()], MAIN, "plain"))
        out.append(Segment(m.group(0), m.group(0), EN, "auto"))
        pos = m.end()
    if pos < len(text):
        out.append(Segment(text[pos:], text[pos:], MAIN, "plain"))
    return out


def _merge(segments: list[Segment]) -> list[Segment]:
    """Join English segments separated only by spaces, so they share one phrase."""
    out: list[Segment] = []
    for seg in segments:
        if (
            len(out) >= 2
            and seg.lang == EN
            and out[-1].lang == MAIN
            and out[-1].source == "plain"
            and out[-1].shown.isspace()
            and out[-2].lang == EN
        ):
            gap, prev = out.pop(), out.pop()
            seg = Segment(
                prev.shown + gap.shown + seg.shown,
                prev.spoken + " " + seg.spoken,
                EN,
                "explicit" if "explicit" in (prev.source, seg.source) else "auto",
            )
        out.append(seg)
    return out


def parse(line: str, glossary: list[str] | None = None, auto: bool = True) -> list[Segment]:
    """Split one marked narration line into segments."""
    pattern = _auto_pattern(glossary or []) if auto else None
    segments: list[Segment] = []
    plain, pos = "", 0
    for m in _EXPLICIT.finditer(line):
        plain += line[pos:m.start()]
        pos = m.end()
        if m.group("esc"):
            plain += m.group("esc")
            continue
        segments += _split_plain(plain, pattern)
        plain = ""
        if m.group("lang"):
            lang = EN if m.group("lang") == "en" else MAIN
            body = m.group("body")
            segments.append(Segment(body, body, lang, "explicit"))
        elif m.group("code") is not None:
            code = m.group("code")
            segments.append(Segment(code, code, EN, "explicit"))
        else:
            spoken = m.group("spoken")
            lang = MAIN
            prefix = re.match(r"(en|ipa|[a-z]{2}):", spoken)
            if prefix:
                lang = {"en": EN, "ipa": IPA}.get(prefix.group(1), MAIN)
                spoken = spoken[prefix.end():]
            segments.append(Segment(m.group("shown"), spoken, lang, "explicit"))
    segments += _split_plain(plain + line[pos:], pattern)
    return _merge([s for s in segments if s.shown or s.spoken])


def shown_text(segments: list[Segment]) -> str:
    """The exact text for screen and captions."""
    return "".join(s.shown for s in segments)


def normalize_spoken(segments: list[Segment], main_lang: str = "it", flag_dashes: bool = False) -> list[Segment]:
    """Rewrite the spoken side of each segment so a voice reads it naturally.

    Main language: version numbers are read digit group by digit group
    ("2.4.0" -> "2 punto 4 punto 0"). English: flag dashes are dropped, or
    read as "dash dash" with `flag_dashes`; underscores and dots become spaces
    and "dot". Shown text is untouched.
    """
    point = _POINT.get(main_lang.split("-")[0], "point")
    dashes = (lambda m: "dash " * len(m.group(0))) if flag_dashes else ""
    out = []
    for seg in segments:
        spoken = seg.spoken
        if seg.lang == MAIN and seg.source != "explicit":
            spoken = _VERSION.sub(lambda m: f" {point} ".join(m.group(1).split(".")), spoken)
        elif seg.lang == EN:
            spoken = re.sub(r"(?<![\w-])--?(?=[A-Za-z])", dashes, spoken)
            spoken = re.sub(r"(?<=[A-Za-z0-9])_(?=[A-Za-z0-9])", " ", spoken)
            spoken = re.sub(r"(?<![\w])\.(?=[A-Za-z])", "dot ", spoken)
            spoken = re.sub(r"(?<=[A-Za-z])\.(?=[A-Za-z])", " dot ", spoken)
            spoken = re.sub(r"(?<=[a-z0-9])-(?=[a-z0-9])", " ", spoken)
        out.append(replace(seg, spoken=spoken))
    return out
