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

Code words: the captions draw commands, file names and identifiers in a
monospaced font, so each shown word is also marked as code or not
(`code_words`). Code is: a part in backticks; an identifier shape found
automatically (snake_case, camelCase, kebab-case, --flags, dotted names such
as app.yaml) unless the glossary lists it as a plain term; a glossary term
written in backticks there (`kubectl describe`); a `{shown|spoken}` part whose
shown side is one of those; a path (/etc/hosts, ./run.sh, src/app.ts). A part
in a language marker, `{en:back-off}` or `{it:main}`, is never code: that is
how a hyphenated word stays in the text font.
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
    form: str = ""  # explicit parts: "lang" {en:...}, "code" `...`, "pair" {shown|spoken}


# Lexicon keys match whatever separates their words: "acme-shop", "acme_shop"
# and "acme shop" are one key, since the spoken side turns - and _ into spaces
LEXICON_SEP = r"[\s_-]+"


def lexicon_key(text: str) -> str:
    return " ".join(re.split(LEXICON_SEP, text.strip().lower()))


def _glossary_lines(path: str | Path) -> list[str]:
    out = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            out.append(line)
    return out


def load_glossary(path: str | Path) -> list[str]:
    """One term per line; blank lines and lines starting with # are skipped.
    A term in backticks is a code term (a command, an identifier): the
    backticks only mark it, the term is matched without them."""
    return [line.strip("`").strip() for line in _glossary_lines(path)]


def load_code_terms(path: str | Path) -> list[str]:
    """The glossary terms written in backticks: shown in the code font."""
    return [line.strip("`").strip() for line in _glossary_lines(path) if line.startswith("`") and line.endswith("`")]


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


def parse(line: str, glossary: list[str] | None = None, auto: bool = True, merge: bool = True) -> list[Segment]:
    """Split one marked narration line into segments. `merge`: join English
    segments separated only by spaces (for the voice; the code-word marking
    looks at them one by one)."""
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
            segments.append(Segment(body, body, lang, "explicit", "lang"))
        elif m.group("code") is not None:
            code = m.group("code")
            segments.append(Segment(code, code, EN, "explicit", "code"))
        else:
            spoken = m.group("spoken")
            lang = MAIN
            prefix = re.match(r"(en|ipa|[a-z]{2}):", spoken)
            if prefix:
                lang = {"en": EN, "ipa": IPA}.get(prefix.group(1), MAIN)
                spoken = spoken[prefix.end():]
            segments.append(Segment(m.group("shown"), spoken, lang, "explicit", "pair"))
    segments += _split_plain(plain + line[pos:], pattern)
    kept = [s for s in segments if s.shown or s.spoken]
    return _merge(kept) if merge else kept


_CODE_SHAPE = re.compile("(?:" + "|".join(_IDENTIFIERS) + ")")
# A path: rooted (/etc/hosts, ./run.sh, ~/x), a file in a folder (src/app.ts),
# or three parts and more (a/b/c). "e/o" and "A/B" are not paths.
_PATH = re.compile(r"(?:~|\.{1,2})?/[\w.-]+(?:/[\w.-]+)*/?|[\w-]+(?:/[\w.-]+)+\.[A-Za-z0-9]+|[\w.-]+(?:/[\w.-]+){2,}")
_EDGE = re.compile(r"^[(\"'«“‘\[]*(.*?)[)\"'»”’\],;:.!?…]*$")


def _term_key(text: str) -> str:
    return " ".join(text.lower().split())


# Markup written inside backticks is not read: the backticks make the whole
# part code, said as written. Seen in a test video: `{kubectl rollout
# restart|ipa:...}` had the voice spell the IPA aloud, letter by letter, and
# the check still heard the command's words. A shell pipe or ${VAR} alone is
# code, not markup.
_MARKUP_IN_CODE = re.compile(r"(?<!\\)\{(?:[a-z]{2}:[^{}]*|[^{}|]*\|[^{}]*)\}|\bipa:")


def markup_in_code(line: str) -> list[str]:
    """The backtick parts of a line that hold narration markup."""
    return [m.group("code") for m in _EXPLICIT.finditer(line) if m.group("code") and _MARKUP_IN_CODE.search(m.group("code"))]


def code_words(line: str, glossary: list[str] | None = None, code_terms: list[str] | None = None) -> list[bool]:
    """For each shown word of a marked line (as `shown_text(...).split()`),
    whether it is code: a command, a file name or an identifier. See the
    module docstring for the rules."""
    glossary = glossary or []
    plain_terms = {_term_key(t) for t in glossary}
    code_set = {_term_key(t) for t in (code_terms or [])}
    plain_terms -= code_set

    def is_code(text: str) -> bool:
        key = _term_key(text)
        if key in code_set:
            return True
        if key in plain_terms:
            return False
        return bool(_CODE_SHAPE.fullmatch(text.strip()) or _PATH.fullmatch(text.strip()))

    def starts_as_command(text: str) -> bool:
        """A shown side of several words that starts with a code term of the
        glossary (`kubectl`, `kubectl rollout`): a command given a spoken
        form, such as {kubectl rollout restart|ipa:...}. Seen in a test
        video: without this it was drawn in the text font."""
        words = _term_key(text).split()
        return len(words) > 1 and any(" ".join(words[:k]) in code_set for k in range(1, len(words)))

    flags, lang_marked = [], []
    for seg in parse(line, glossary, merge=False):
        if seg.form == "code":
            code = True
        elif seg.form == "lang" or seg.lang == MAIN and seg.source == "plain":
            code = False
        else:
            code = is_code(seg.shown) or seg.form == "pair" and starts_as_command(seg.shown)
        flags += [code] * len(seg.shown)
        lang_marked += [seg.form == "lang"] * len(seg.shown)
    shown = "".join(s.shown for s in parse(line, glossary, merge=False))
    out = []
    for m in re.finditer(r"\S+", shown):
        a, b = m.span()
        core = _EDGE.match(m.group(0)).group(1)
        start = a + m.group(0).find(core) if core else a
        chars = range(start, start + len(core)) if core else range(a, b)
        code = any(flags[i] for i in chars)
        if not code and core and not any(lang_marked[i] for i in chars):
            code = bool(_PATH.fullmatch(core))
        out.append(code)
    return out


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
