"""Word timing and pronunciation check with a local multilingual Whisper.

Whisper hears the synthesized sentence; its words carry times. The shown words
(what the captions print) are aligned to Whisper's words character by
character, so a shown "kubectl" gets the time of whatever Whisper wrote there.
Words Whisper did not match are placed between their matched neighbours.
"""

from __future__ import annotations

import difflib
import os
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path


def norm(text: str) -> str:
    """Lowercase letters and digits only, accents dropped: tolerant to case and spacing."""
    text = unicodedata.normalize("NFKD", text)
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in text if not unicodedata.combining(c)).lower())


@dataclass
class Word:
    text: str
    start: float
    end: float
    probability: float | None = None


class Transcriber:
    def __init__(self, model: str | Path, size: str = "small", compute_type: str = "int8"):
        """`model` is a folder holding the model files (model.bin, config.json,
        tokenizer.json, vocabulary.txt), or a Hugging Face cache folder that
        holds the `size` model."""
        # Offline: the model must already be on disk; no hub calls, no telemetry
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
        from faster_whisper import WhisperModel

        model = Path(model)
        if (model / "model.bin").is_file():
            self.model = WhisperModel(str(model), device="cpu", compute_type=compute_type)
        else:
            self.model = WhisperModel(
                size,
                device="cpu",
                compute_type=compute_type,
                download_root=str(model),
                local_files_only=True,
            )

    def words(self, wav: str | Path, language: str) -> tuple[str, list[Word]]:
        segments, _ = self.model.transcribe(
            str(wav),
            language=language,
            word_timestamps=True,
            beam_size=5,
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=False,
        )
        words, texts = [], []
        for seg in segments:
            texts.append(seg.text.strip())
            for w in seg.words or []:
                words.append(Word(w.word.strip(), round(w.start, 3), round(w.end, 3), round(w.probability, 3)))
        return " ".join(texts), words


def align(shown_words: list[str], heard: list[Word], duration: float) -> list[Word]:
    """Give every shown word a start and end, using the heard words' times."""
    s_chars, s_owner = [], []
    for i, w in enumerate(shown_words):
        for c in norm(w):
            s_chars.append(c)
            s_owner.append(i)
    h_chars, h_owner = [], []
    for j, w in enumerate(heard):
        for c in norm(w.text):
            h_chars.append(c)
            h_owner.append(j)

    hits: dict[int, set[int]] = {}
    matcher = difflib.SequenceMatcher(None, s_chars, h_chars, autojunk=False)
    for a, b, size in matcher.get_matching_blocks():
        for k in range(size):
            hits.setdefault(s_owner[a + k], set()).add(h_owner[b + k])

    times: list[tuple[float, float] | None] = []
    for i in range(len(shown_words)):
        js = hits.get(i)
        times.append((min(heard[j].start for j in js), max(heard[j].end for j in js)) if js else None)

    # Shown words that matched the same heard word ("Apri PR-1234" heard as
    # "Apripul") overlap: share their common span by word length
    i = 0
    while i < len(times):
        if times[i] is None:
            i += 1
            continue
        j, end = i + 1, times[i][1]
        while j < len(times) and times[j] is not None and times[j][0] < end:
            end = max(end, times[j][1])
            j += 1
        if j - i > 1:
            start = times[i][0]
            weights = [max(len(norm(w)), 1) for w in shown_words[i:j]]
            t = start
            for k, weight in zip(range(i, j), weights):
                step = (end - start) * weight / sum(weights)
                times[k] = (round(t, 3), round(t + step, 3))
                t += step
        i = j

    # Fill the gaps: share the time between matched neighbours by word length
    out: list[Word] = []
    i = 0
    while i < len(shown_words):
        if times[i] is not None:
            out.append(Word(shown_words[i], *times[i]))
            i += 1
            continue
        j = i
        while j < len(shown_words) and times[j] is None:
            j += 1
        left = out[-1].end if out else 0.0
        right = times[j][0] if j < len(shown_words) else duration
        right = max(right, left)
        weights = [max(len(norm(w)), 1) for w in shown_words[i:j]]
        t = left
        for w, weight in zip(shown_words[i:j], weights):
            step = (right - left) * weight / sum(weights)
            out.append(Word(w, round(t, 3), round(t + step, 3)))
            t += step
        i = j
    # Keep the sequence monotonic even where Whisper's times overlap
    for k in range(1, len(out)):
        if out[k].start < out[k - 1].start:
            out[k].start = out[k - 1].start
        if out[k].end < out[k].start:
            out[k].end = out[k].start
    return out


def estimate(shown_words: list[str], duration: float) -> list[Word]:
    """Times proportional to word length, when no Whisper model is available."""
    return align(shown_words, [], duration)


# Symbols a voice reads aloud inside code: "deployment/checkout" is said
# "deployment slash checkout", "values.yaml" "values dot yaml". Whisper may
# write the word or keep the symbol, so a term is checked in both forms.
_SAID_SYMBOLS = [
    (re.compile(r"(?<=\w)/(?=\w)"), " slash "),
    (re.compile(r"(?<=[A-Za-z])\.(?=[A-Za-z])"), " dot "),
]


def symbol_readings(text: str) -> list[str]:
    """The text, plus the text with its symbols written as the words a voice says."""
    said = text
    for pattern, word in _SAID_SYMBOLS:
        said = pattern.sub(word, said)
    return [text] if said == text else [text, said]


def locate_terms(terms: list[str], heard: list[str]) -> list[tuple[int, int] | None]:
    """For each term, in order, the span of heard words that says it, or None.

    Case, accents, spaces and hyphens are ignored, but word edges are kept: a
    term must be one or more whole heard words ("Crash Loop Back Off" matches
    CrashLoopBackOff, "Cubect Logs" does not match kubectl). A term may list
    accepted readings as "kubectl|kube control". Spans index into `heard`.
    There is no cap on the number of heard words: a long command said right
    ("Cube Control Rollout Undo Deployment Slash Checkout") is seven words.
    The window stops growing once it is longer than the longest reading.
    """
    pieces = [(norm(p), i) for i, w in enumerate(heard) for p in re.split(r"[-_/'’]+", w) if norm(p)]
    pos, spans = 0, []
    for term in terms:
        targets = {norm(alt) for alt in term.split("|")} - {""}
        longest = max((len(t) for t in targets), default=0)
        span = None
        for i in range(pos, len(pieces)):
            joined = ""
            for n in range(i, len(pieces)):
                joined += pieces[n][0]
                if joined in targets:
                    span = (i, n)
                    break
                if len(joined) >= longest:
                    break
            if span:
                break
        spans.append((pieces[span[0]][1], pieces[span[1]][1]) if span else None)
        if span:
            pos = span[1] + 1
    return spans


def heard_terms(terms: list[str], transcript: str) -> list[bool]:
    """For each term, in order, whether the transcript says it (see locate_terms)."""
    return [s is not None for s in locate_terms(terms, transcript.split())]


def heard_near(start: float, end: float, heard: list[Word], margin: float = 0.05) -> str:
    """What Whisper wrote where a term was said: the heard words whose middle
    falls inside the span. Only when none does, the words that overlap it
    (with `margin`), so a neighbour that merely touches the span is left out."""
    inside = [w.text for w in heard if start <= (w.start + w.end) / 2 <= end]
    if inside:
        return " ".join(inside)
    return " ".join(w.text for w in heard if w.end > start - margin and w.start < end + margin)
