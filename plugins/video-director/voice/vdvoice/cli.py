"""Command line of the voice step.

    script   script.json in, one WAV per sentence and voiceover.json out
    try      synthesize other versions of one sentence and check them
    sample   a short sample of a voice, to choose it
    voices   the voices of a language, with their default speed
    check    the runtime works (imports, espeak-ng, optional model files)
    phonemes print how marked lines are split and phonemized, no audio
    synth    marked lines in, one WAV per line plus a detailed JSON out
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from . import __version__
from .markup import EN, IPA, load_glossary, normalize_spoken, parse, shown_text

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"


def load_voices_table() -> dict:
    return json.loads((DATA / "voices.json").read_text(encoding="utf-8"))


def language(code: str) -> dict:
    """espeak and Whisper codes for a narration language ("it", "en", "pt"...)."""
    table = load_voices_table()["languages"]
    if code in table:
        return table[code]
    base = code.split("-")[0]
    if base in table:
        return table[base]
    # Unknown language: try it as an espeak code as given
    return {"espeak": code, "whisper": base, "prefix": None, "default": None, "tested": False}


def default_speed(voice: str) -> float:
    return float(load_voices_table()["voices"].get(voice, {}).get("speed", 1.0))


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


class Voice:
    """Everything needed to turn marked text into audio for one voice and language."""

    def __init__(self, args, lang_code: str):
        from .phonemes import Phonemizer, load_lexicon

        self.lang = language(lang_code)
        self.main_lang = self.lang["espeak"]
        glossary = load_glossary(args.glossary) if args.glossary else []
        for extra in args.glossary_extra or []:
            glossary += load_glossary(extra)
        self.glossary = glossary
        lexicon = load_lexicon(args.lexicon) if args.lexicon else {}
        for extra in args.lexicon_extra or []:
            lexicon.update(load_lexicon(extra))
        self.flag_dashes = args.flag_dashes
        self.ph = Phonemizer(
            self.main_lang, args.en_lang, lexicon, en_style=args.en_style, final_fix=not args.no_final_fix
        )

    def segments(self, text: str):
        return normalize_spoken(parse(text, self.glossary), self.main_lang, self.flag_dashes)

    def prepare(self, text: str) -> dict:
        segments = self.segments(text)
        phonemes, pieces = self.ph.sentence(segments)
        return {"segments": segments, "pieces": pieces, "shown": shown_text(segments), "phonemes": phonemes}

    def lexicon_keys(self, text: str) -> list[str]:
        return self.ph.lexicon_keys(text)

    def forms(self, seg) -> str:
        """Every written form a term may be heard as: shown, spoken, lexicon 'say',
        each also with its symbols as words ("deployment slash checkout").

        An ipa: part has no spoken text: it is checked against its shown form
        and that form's lexicon readings.
        """
        from .timing import symbol_readings

        base = [seg.shown, *self.ph.say(seg.shown)] if seg.lang == IPA else [seg.shown, seg.spoken, *self.ph.say(seg.spoken)]
        return "|".join(dict.fromkeys(form for b in base for form in symbol_readings(b)))

    def spoken_words(self, text: str) -> int:
        """Words of the spoken side ("2.4.0" is "2 punto 4 punto 0", five words).

        A part whose shown text has an acronym counts its shown words: letter
        names are short, and "{SSO|esse esse o}" counted as three words
        pushed a test video's pace over the target with nothing too fast.
        """
        from .script import is_acronym

        n = 0
        for seg in self.segments(text):
            spoken = len(seg.spoken.split())
            shown = seg.shown.split()
            if seg.source == "explicit" and any(is_acronym(w) for w in shown) and spoken > len(shown):
                n += len(shown)
            else:
                n += spoken
        return n

    def forced(self, seg) -> bool:
        """An English term (glossary or identifier shape) marked to be said in the narration language."""
        return any(s.lang == EN for s in parse(seg.shown, self.glossary))


def probe(voice: Voice, prepared: dict, heard_words, duration: float):
    """Word times for the shown words, which English parts Whisper heard, and
    which parts marked in the narration language it heard (shown or spoken form)."""
    from .script import english_parts, marked_parts
    from .timing import align, heard_near, locate_terms, symbol_readings

    shown_words = prepared["shown"].split()
    words = align(shown_words, heard_words, duration)
    heard_text = [w.text for w in heard_words]

    def check(parts, forms):
        out = []
        for p, span in zip(parts, locate_terms([forms(p.segment) for p in parts], heard_text)):
            if span:
                heard = " ".join(w.text for w in heard_words[span[0]:span[1] + 1])
            else:
                heard = heard_near(words[p.first_word].start, words[p.last_word].end, heard_words)
            out.append({"term": p.segment.shown.strip(), "heard": heard, "ok": span is not None, "_part": p})
        return out

    terms = check(english_parts(prepared["segments"]), voice.forms)
    marked = check(
        marked_parts(prepared["segments"]),
        lambda seg: "|".join(dict.fromkeys(f for b in (seg.shown, seg.spoken) for f in symbol_readings(b))),
    )
    for m in marked:
        m["forced"] = voice.forced(m["_part"].segment)
    return words, terms, marked


def synth_one(voice: Voice, synth, transcriber, text: str, voice_name: str, speed: float, wav: Path) -> dict:
    """Synthesize one marked sentence to `wav`; with a transcriber, also check it."""
    from .synth import peak_normalize, write_wav
    from .timing import estimate

    prepared = voice.prepare(text)
    t0 = time.perf_counter()
    audio, sr = synth.from_phonemes(prepared["phonemes"], voice_name, speed)
    synth_s = time.perf_counter() - t0
    audio = peak_normalize(audio)
    wav.parent.mkdir(parents=True, exist_ok=True)
    write_wav(wav, audio, sr)
    duration = len(audio) / sr
    out = {"prepared": prepared, "sr": sr, "duration": duration, "synth_s": synth_s}
    if transcriber:
        t0 = time.perf_counter()
        heard_text, heard_words = transcriber.words(wav, voice.lang["whisper"])
        out["whisper_s"] = time.perf_counter() - t0
        out["heard_text"] = heard_text
        out["words"], out["terms"], out["marked"] = probe(voice, prepared, heard_words, duration)
        out["timing"] = "whisper"
    else:
        out["words"] = estimate(prepared["shown"].split(), duration)
        out["terms"] = []
        out["marked"] = []
        out["timing"] = "estimated"
    return out


def load_models(args):
    from .synth import Synth
    from .timing import Transcriber

    t0 = time.perf_counter()
    synth = Synth(args.model, args.voices)
    if args.voice not in synth.voices():
        raise SystemExit(f"error: unknown voice {args.voice}; see the voices command")
    transcriber = None if args.no_whisper else Transcriber(args.whisper_model)
    print(f"models loaded in {time.perf_counter() - t0:.1f} s", flush=True)
    return synth, transcriber


def cmd_script(args) -> int:
    from .script import LEAD_IN_MS, TAIL_MS, ScriptError, cache_key, load_script, marked_suggestions, pause_after, suggestions

    try:
        script = load_script(args.script)
    except ScriptError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    out_dir = Path(args.out_dir)
    voiceover_path = Path(args.voiceover)
    report_path = Path(args.report)
    lang_code = script["language"]
    voice = Voice(args, lang_code)
    speed = args.speed if args.speed else default_speed(args.voice)
    model_id = f"{Path(args.model).name}:{Path(args.model).stat().st_size}"
    probe_id = "none" if args.no_whisper else "whisper-small"

    previous, prev_report = {}, {}
    if not args.force:
        try:
            previous = {s["id"]: s for s in json.loads(voiceover_path.read_text(encoding="utf-8"))["sentences"]}
            prev_report = {s["id"]: s for s in json.loads(report_path.read_text(encoding="utf-8"))["sentences"]}
        except (OSError, ValueError, KeyError, TypeError):
            previous, prev_report = {}, {}

    sentences = script["sentences"]
    plans = []
    for s in sentences:
        prepared = voice.prepare(s["text"])
        key = cache_key(prepared["shown"] + "\n" + prepared["phonemes"], args.voice, speed, model_id, probe_id)
        old, old_report = previous.get(s["id"]), prev_report.get(s["id"])
        wav = out_dir / f"{s['id']}.wav"
        reuse = bool(old and old_report and old_report.get("key") == key and wav.is_file())
        plans.append((s, key, reuse))

    todo = sum(1 for _, _, reuse in plans if not reuse)
    synth = transcriber = None
    if todo:
        synth, transcriber = load_models(args)
    print(f"{len(sentences)} sentences, {todo} to synthesize, voice {args.voice}, speed {speed}", flush=True)

    vo_sentences, report_sentences = [], []
    t_start = time.perf_counter()
    for i, (s, key, reuse) in enumerate(plans):
        sid = s["id"]
        wav = out_dir / f"{sid}.wav"
        if reuse:
            entry = dict(previous[sid])
            rep = dict(prev_report[sid])
            note = "unchanged"
        else:
            r = synth_one(voice, synth, transcriber, s["text"], args.voice, speed, wav)
            prepared = r["prepared"]
            terms = r["terms"]
            marked = r["marked"]
            entry = {
                "id": sid,
                "chapter": s["chapter"],
                "file": f"voice/{wav.name}",
                "durationMs": round(r["duration"] * 1000),
                "pauseAfterMs": 0,
                "shown": prepared["shown"],
                "words": [
                    {"text": w.text, "startMs": round(w.start * 1000), "endMs": round(w.end * 1000)}
                    for w in r["words"]
                ],
                "timing": r["timing"],
            }
            if r["timing"] == "whisper":
                entry["probe"] = {
                    "terms": [{k: t[k] for k in ("term", "heard", "ok")} for t in terms],
                    "marked": [{k: t[k] for k in ("term", "heard", "ok", "forced")} for t in marked],
                }
                entry["notHeard"] = [t["term"] for t in terms + marked if not t["ok"]]
            rep = {
                "id": sid,
                "key": key,
                "text": s["text"],
                "phonemes": prepared["phonemes"],
                "segments": [
                    {"shown": seg.shown, "spoken": seg.spoken, "lang": seg.lang, "source": seg.source, "phonemes": p}
                    for seg, p in zip(prepared["segments"], prepared["pieces"])
                ],
                "synthSeconds": round(r["synth_s"], 2),
            }
            if r["timing"] == "whisper":
                rep["whisperSeconds"] = round(r["whisper_s"], 2)
                rep["heardText"] = r["heard_text"]
                rep["fix"] = {
                    t["term"]: suggestions(
                        prepared["segments"],
                        t["_part"].index,
                        voice.lexicon_keys(t["_part"].segment.spoken),
                        prepared["pieces"][t["_part"].index],
                    )
                    for t in terms
                    if not t["ok"]
                }
                rep["fix"].update({
                    t["term"]: marked_suggestions(t["_part"].segment, t["forced"]) for t in marked if not t["ok"]
                })
            note = f"synth {r['synth_s']:.1f} s" + (f", check {r['whisper_s']:.1f} s" if transcriber else "")
        entry["chapter"] = s["chapter"]
        entry["pauseAfterMs"] = pause_after(sentences, i)
        vo_sentences.append(entry)
        report_sentences.append(rep)
        missing = entry.get("notHeard") or []
        flag = f"  NOT HEARD: {', '.join(missing)}" if missing else ""
        print(f"{sid:>6}  {entry['durationMs'] / 1000:6.2f} s  ({note}){flag}", flush=True)

    # WAVs of sentences that are no longer in the script would end up in the render's public folder
    for old_id in set(previous) - {s["id"] for s in sentences}:
        stale = out_dir / f"{old_id}.wav"
        if stale.is_file():
            stale.unlink()

    speech_ms = sum(s["durationMs"] for s in vo_sentences)
    words = sum(len(s["words"]) for s in vo_sentences)
    # The pace target is for what is said: numbers and versions say more words than they show
    spoken = sum(voice.spoken_words(s["text"]) for s in sentences)
    terms = [(s["id"], t) for s in vo_sentences for t in s.get("probe", {}).get("terms", [])]
    marked = [(s["id"], t) for s in vo_sentences for t in s.get("probe", {}).get("marked", [])]
    timings = {s["timing"] for s in vo_sentences}
    summary = {
        "sentences": len(vo_sentences),
        "speechMs": speech_ms,
        "videoMs": LEAD_IN_MS + sum(s["durationMs"] + s["pauseAfterMs"] for s in vo_sentences) + TAIL_MS,
        "wordsPerSecond": round(words / (speech_ms / 1000), 2) if speech_ms else 0,
        "spokenWordsPerSecond": round(spoken / (speech_ms / 1000), 2) if speech_ms else 0,
        "timing": timings.pop() if len(timings) == 1 else "mixed",
        "terms": len(terms),
        "termsHeard": sum(1 for _, t in terms if t["ok"]),
        # Parts marked in the narration language: checked the same way, counted
        # apart; English terms forced into it are listed, since "terms heard"
        # no longer counts them
        "marked": len(marked),
        "markedHeard": sum(1 for _, t in marked if t["ok"]),
        "saidInNarrationLanguage": [t["term"] for _, t in marked if t.get("forced")],
        "notHeard": [{"sentence": sid, "term": t["term"], "heard": t["heard"], "kind": "term"} for sid, t in terms if not t["ok"]]
        + [{"sentence": sid, "term": t["term"], "heard": t["heard"], "kind": "marked"} for sid, t in marked if not t["ok"]],
    }
    voiceover = {
        "language": lang_code,
        "voice": args.voice,
        "engine": "kokoro",
        "sampleRate": 24000,
        "speed": speed,
        "summary": summary,
        "sentences": vo_sentences,
    }
    write_json(voiceover_path, voiceover)
    write_json(report_path, {"generator": f"vdvoice {__version__}", "voice": args.voice, "speed": speed,
                             "language": lang_code, "sentences": report_sentences})
    print(
        f"done in {time.perf_counter() - t_start:.1f} s: speech {speech_ms / 1000:.1f} s, "
        f"video about {summary['videoMs'] / 1000:.1f} s, {summary['spokenWordsPerSecond']} words/s spoken "
        f"({summary['wordsPerSecond']} shown), "
        f"terms heard {summary['termsHeard']}/{summary['terms']}, "
        f"marked parts heard {summary['markedHeard']}/{summary['marked']}",
        flush=True,
    )
    return 0


def cmd_try(args) -> int:
    """Other versions of one sentence, each synthesized and checked; voiceover.json is not touched."""
    from .script import ScriptError, load_script

    try:
        script = load_script(args.script)
    except ScriptError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    base = next((s for s in script["sentences"] if s["id"] == args.sentence), None)
    if base is None:
        print(f"error: sentence {args.sentence} is not in {args.script}", file=sys.stderr)
        return 2
    voice = Voice(args, script["language"])
    speed = args.speed if args.speed else default_speed(args.voice)
    synth, transcriber = load_models(args)
    out_dir = Path(args.out_dir)
    results = []
    for n, text in enumerate([base["text"], *args.text]):
        wav = out_dir / f"{args.sentence}-try{n}.wav"
        r = synth_one(voice, synth, transcriber, text, args.voice, speed, wav)
        terms = [{k: t[k] for k in ("term", "heard", "ok")} for t in r["terms"] + r["marked"]]
        results.append({"text": text, "wav": wav.name, "heard": r.get("heard_text", ""), "terms": terms})
        label = "current" if n == 0 else f"try {n}"
        print(f"[{label}] {text}")
        print(f"    heard: {r.get('heard_text', '')}")
        for t in terms:
            print(f"    {'ok ' if t['ok'] else 'NO '} {t['term']!r} heard as {t['heard']!r}")
        print(f"    {wav}")
    write_json(out_dir / f"{args.sentence}-try.json", results)
    return 0


def cmd_sample(args) -> int:
    from .synth import Synth, peak_normalize, write_wav

    lang = language(args.lang)
    text = args.text or lang.get("sample") or "CrashLoopBackOff"
    voice = Voice(args, args.lang)
    synth = Synth(args.model, args.voices)
    if args.voice not in synth.voices():
        print(f"error: unknown voice {args.voice}; see the voices command", file=sys.stderr)
        return 2
    speed = args.speed if args.speed else default_speed(args.voice)
    audio, sr = synth.from_phonemes(voice.prepare(text)["phonemes"], args.voice, speed)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    write_wav(out, peak_normalize(audio), sr)
    print(f"{out.resolve().as_posix()}  {len(audio) / sr:.1f} s  voice {args.voice}, speed {speed}")
    return 0


def cmd_voices(args) -> int:
    import numpy as np

    table = load_voices_table()
    names = sorted(np.load(args.voices).files)
    langs = [args.lang] if args.lang else list(table["languages"])
    for code in langs:
        lang = language(code)
        prefix = lang.get("prefix")
        own = [n for n in names if prefix and n.startswith(prefix)]
        tested = "" if lang.get("tested") else "  (not tested)"
        print(f"{code}{tested}")
        for n in own:
            gender = {"f": "female", "m": "male"}.get(n[1:2], "")
            mark = "  default" if n == lang.get("default") else ""
            print(f"  {n:14} {gender:6}  speed {default_speed(n)}{mark}")
    return 0


def cmd_check(args) -> int:
    from importlib.metadata import version

    from .phonemes import Phonemizer

    for pkg in ("kokoro-onnx", "faster-whisper", "onnxruntime", "ctranslate2", "phonemizer", "espeakng-loader"):
        print(f"{pkg} {version(pkg)}")
    ph = Phonemizer("it", "en-us", {})
    print("espeak-ng ok:", ph.sentence(parse("Il pod di checkout.", ["pod", "checkout"]))[0])
    if args.model and args.voices:
        from .synth import Synth

        print(f"kokoro ok: {len(Synth(args.model, args.voices).voices())} voices")
    if args.whisper_model:
        from .timing import Transcriber

        Transcriber(args.whisper_model)
        print("whisper ok")
    print(f"vdvoice {__version__} ready")
    return 0


def read_lines(path: Path) -> list[dict]:
    """A .json list of {"id", "text"}, or a text file with one line per sentence."""
    if path.suffix.lower() == ".json":
        items = json.loads(path.read_text(encoding="utf-8"))
        return [{"id": str(it["id"]), "text": it["text"]} for it in items]
    lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines()]
    lines = [line for line in lines if line and not line.startswith("#")]
    return [{"id": f"{i:03d}", "text": line} for i, line in enumerate(lines, 1)]


def cmd_phonemes(args) -> int:
    voice = Voice(args, args.lang)
    for item in read_lines(Path(args.input)):
        line = voice.prepare(item["text"])
        print(f"[{item['id']}] {line['shown']}")
        for s, p in zip(line["segments"], line["pieces"]):
            print(f"    {s.lang:4} {s.source:8} {s.shown!r:34} -> {p}")
        print(f"    = {line['phonemes']}")
    return 0


def cmd_synth(args) -> int:
    """Lab command: marked lines, one WAV each, and a JSON with every detail."""
    voice = Voice(args, args.lang)
    synth, transcriber = load_models(args)
    speed = args.speed if args.speed else default_speed(args.voice)
    out_dir = Path(args.out)
    result = {"voice": args.voice, "speed": speed, "language": args.lang, "lines": []}
    for item in read_lines(Path(args.input)):
        r = synth_one(voice, synth, transcriber, item["text"], args.voice, speed, out_dir / f"{item['id']}.wav")
        line = {
            "id": item["id"],
            "shown": r["prepared"]["shown"],
            "phonemes": r["prepared"]["phonemes"],
            "duration": round(r["duration"], 3),
            "timing": r["timing"],
            "heard_text": r.get("heard_text"),
            "terms": [{k: t[k] for k in ("term", "heard", "ok")} for t in r["terms"] + r["marked"]],
            "words": [{"text": w.text, "start": w.start, "end": w.end} for w in r["words"]],
        }
        result["lines"].append(line)
        missing = [t["term"] for t in line["terms"] if not t["ok"]]
        print(f"{item['id']}.wav  {line['duration']:6.2f} s" + (f"  NOT HEARD: {missing}" if missing else ""))
    write_json(out_dir / "lines.json", result)
    return 0


def _quiet_espeak_cleanup(unraisable, _default=sys.unraisablehook):
    """phonemizer cannot delete its locked DLL copy at exit on Windows; the next run does."""
    if isinstance(unraisable.exc_value, PermissionError) and "espeak" in str(unraisable.exc_value):
        return
    _default(unraisable)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="vdvoice", description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    p.add_argument("--version", action="version", version=f"vdvoice {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True)

    def text_options(sp):
        sp.add_argument("--en-lang", default="en-us", help="espeak language for English parts: en-us or en-gb")
        sp.add_argument("--glossary", default=str(DATA / "glossary-en.txt"), help="English terms found automatically")
        sp.add_argument("--glossary-extra", action="append", help="more glossary terms (repeatable)")
        sp.add_argument("--lexicon", default=str(DATA / "lexicon-en.json"), help="IPA overrides for English terms")
        sp.add_argument("--lexicon-extra", action="append", help="more lexicon entries, they win (repeatable)")
        sp.add_argument("--flag-dashes", action="store_true", help='read "--flag" as "dash dash flag"')
        sp.add_argument("--no-final-fix", action="store_true", help="do not hold English word-final consonants")
        sp.add_argument("--en-style", choices=["espeak", "kokoro"], default="espeak",
                        help="kokoro: single-symbol English diphthongs (tried, not better)")
        sp.add_argument("--tmp", help="folder for espeak-ng library copies (default: espeak-tmp in the venv)")

    def model_options(sp, whisper=True):
        sp.add_argument("--model", required=True, help="kokoro-v1.0.onnx")
        sp.add_argument("--voices", required=True, help="voices-v1.0.bin")
        sp.add_argument("--voice", default="im_nicola")
        sp.add_argument("--speed", type=float, help="Kokoro speed (default: the voice's own, see voices)")
        if whisper:
            sp.add_argument("--whisper-model", help="faster-whisper 'small' model folder")
            sp.add_argument("--no-whisper", action="store_true", help="no check; word times estimated by length")

    sp = sub.add_parser("script", help="script.json in, WAVs and voiceover.json out")
    sp.add_argument("script", help="script.json (contract A)")
    sp.add_argument("--out-dir", required=True, help="folder for <id>.wav (the video's public/voice)")
    sp.add_argument("--voiceover", required=True, help="voiceover.json to write (contract B)")
    sp.add_argument("--report", required=True, help="detailed report: phonemes, transcripts, fixes")
    sp.add_argument("--force", action="store_true", help="synthesize every sentence, even unchanged ones")
    text_options(sp)
    model_options(sp)
    sp.set_defaults(func=cmd_script, tmp_default=lambda a: Path(a.report).parent / ".espeak-tmp")

    sp = sub.add_parser("try", help="synthesize and check other versions of one sentence")
    sp.add_argument("script", help="script.json")
    sp.add_argument("--sentence", required=True, help="sentence id")
    sp.add_argument("--text", action="append", default=[], help="a marked alternative (repeatable)")
    sp.add_argument("--out-dir", required=True, help="folder for the trial WAVs")
    text_options(sp)
    model_options(sp)
    sp.set_defaults(func=cmd_try, tmp_default=lambda a: Path(a.out_dir) / ".espeak-tmp")

    sp = sub.add_parser("sample", help="a short sample of a voice")
    sp.add_argument("out", help="WAV to write")
    sp.add_argument("--lang", default="it")
    sp.add_argument("--text", help="marked text (default: the language's sample sentence)")
    text_options(sp)
    model_options(sp, whisper=False)
    sp.set_defaults(func=cmd_sample, tmp_default=lambda a: Path(a.out).parent / ".espeak-tmp")

    sp = sub.add_parser("voices", help="voices of a language, with their default speed")
    sp.add_argument("--voices", required=True, help="voices-v1.0.bin")
    sp.add_argument("--lang", help="narration language (default: all)")
    sp.set_defaults(func=cmd_voices, tmp_default=None)

    sp = sub.add_parser("check", help="the runtime works")
    sp.add_argument("--model")
    sp.add_argument("--voices")
    sp.add_argument("--whisper-model")
    sp.add_argument("--tmp")
    sp.set_defaults(func=cmd_check, tmp_default=lambda a: Path.cwd() / ".espeak-tmp")

    sp = sub.add_parser("phonemes", help="print segments and phonemes, no audio")
    sp.add_argument("input", help="marked lines: .txt (one each) or .json [{id, text}]")
    sp.add_argument("--lang", default="it")
    text_options(sp)
    sp.set_defaults(func=cmd_phonemes, tmp_default=lambda a: Path(a.input).resolve().parent / ".espeak-tmp")

    sp = sub.add_parser("synth", help="marked lines in, WAVs and lines.json out (lab use)")
    sp.add_argument("input", help="marked lines: .txt (one each) or .json [{id, text}]")
    sp.add_argument("out", help="output folder")
    sp.add_argument("--lang", default="it")
    text_options(sp)
    model_options(sp)
    sp.set_defaults(func=cmd_synth, tmp_default=lambda a: Path(a.out) / ".espeak-tmp")

    args = p.parse_args(argv)
    sys.unraisablehook = _quiet_espeak_cleanup
    if getattr(args, "model", None) and hasattr(args, "no_whisper"):
        if not args.no_whisper and not args.whisper_model:
            p.error("--whisper-model is required unless --no-whisper is given")
    # phonemizer copies the espeak-ng library at each start; the copies go to the
    # runtime's own folder when running in a venv, never to the user's TEMP
    in_venv = sys.prefix != sys.base_prefix
    tmp = getattr(args, "tmp", None) or (Path(sys.prefix) / "espeak-tmp" if in_venv else None)
    tmp = tmp or (args.tmp_default(args) if args.tmp_default else None)
    if tmp:
        from .phonemes import use_private_tmp

        use_private_tmp(tmp)
    return args.func(args)

