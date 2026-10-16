"""Plain-assert tests, no test framework needed.

python -I -X utf8 tests/test_vdvoice.py

The tests that phonemize need the runtime's packages (espeak-ng through
phonemizer); none of them needs the model files.
"""

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vdvoice.markup import EN, IPA, MAIN, code_words, load_code_terms, load_glossary, normalize_spoken, parse, shown_text  # noqa: E402
from vdvoice.script import ScriptError, english_parts, load_script, pause_after, suggestions  # noqa: E402
from vdvoice.timing import Word, align, heard_near, heard_terms  # noqa: E402

GLOSSARY = ["pod", "checkout", "kubectl", "kubectl logs", "rollout restart", "log", "main"]
# Test files go to a temporary folder, removed at the end. phonemizer's locked
# espeak-ng copies go to the venv instead (swept on the next run), never to TEMP
TMP = Path(tempfile.mkdtemp(prefix="vdvoice-test-"))
ESPEAK_TMP = Path(sys.prefix) / "espeak-tmp"


def kinds(segments):
    return [(s.shown, s.lang) for s in segments if s.shown.strip()]


def test_auto_marking():
    segs = parse("Il pod di checkout è in CrashLoopBackOff: manca DATABASE_URL.", GLOSSARY)
    assert ("pod", EN) in kinds(segs)
    assert ("checkout", EN) in kinds(segs)
    assert ("CrashLoopBackOff", EN) in kinds(segs)
    assert ("DATABASE_URL", EN) in kinds(segs)
    assert all(lang == MAIN for shown, lang in kinds(segs) if shown.startswith("Il"))


def test_lowercase_italian_is_not_camel_case():
    segs = parse("Facciamo il punto e controlliamo tutto.", GLOSSARY)
    assert all(s.lang == MAIN for s in segs)


def test_adjacent_english_merges():
    segs = parse("con kubectl logs --previous.", GLOSSARY)
    assert ("kubectl logs --previous", EN) in kinds(segs)


def test_explicit_forms_and_exact_shown_text():
    line = "Apri {PR-1234|en:pull request} su {main|it:mèin}, poi `helm upgrade` e {kubectl|ipa:kjˈuːb}: {503|cinque zero tre}."
    segs = parse(line, GLOSSARY)
    assert shown_text(segs) == "Apri PR-1234 su main, poi helm upgrade e kubectl: 503."
    by_shown = {s.shown: s for s in segs}
    assert by_shown["PR-1234"].lang == EN and by_shown["PR-1234"].spoken == "pull request"
    assert by_shown["main"].lang == MAIN and by_shown["main"].spoken == "mèin"
    assert by_shown["helm upgrade"].lang == EN
    assert by_shown["kubectl"].lang == IPA
    assert by_shown["503"].spoken == "cinque zero tre"


def test_escape():
    assert shown_text(parse(r"usa \{x\} e \`y\`", GLOSSARY)) == "usa {x} e `y`"


def test_normalize_spoken():
    segs = normalize_spoken(parse("release 2.4.0 con --previous, DATABASE_URL, values.yaml e .env", GLOSSARY), "it")
    spoken = {s.shown: s.spoken for s in segs}
    assert "2 punto 4 punto 0" in "".join(s.spoken for s in segs if s.lang == MAIN)
    assert spoken["--previous"] == "previous"
    assert spoken["DATABASE_URL"] == "DATABASE URL"
    assert spoken["values.yaml"] == "values dot yaml"
    assert spoken[".env"] == "dot env"


def test_flag_dashes():
    segs = normalize_spoken(parse("con `helm upgrade --atomic` e -n shop", GLOSSARY), "it", flag_dashes=True)
    spoken = {s.shown: s.spoken for s in segs}
    assert spoken["helm upgrade --atomic"] == "helm upgrade dash dash atomic", spoken
    assert spoken["-n"] == "dash n", spoken
    assert shown_text(segs) == "con helm upgrade --atomic e -n shop"


def test_heard_terms_keeps_word_edges():
    assert heard_terms(["kubectl|cube ctl", "logs"], "con Cubect Logs previos") == [False, True]
    assert heard_terms(["CrashLoopBackOff"], "in crash-loop back-off") == [True]
    assert heard_terms(["endpoint"], "L'endpoint degli ordini") == [True]
    assert heard_terms(["pod", "pod"], "il pod e il pot") == [True, False]


def test_align_splits_fused_words_and_fills_gaps():
    heard = [Word("Apripul", 0.0, 1.0), Word("e", 1.0, 1.2), Word("niente", 1.5, 2.0)]
    words = align(["Apri", "PR", "e", "boh", "niente"], heard, 2.0)
    assert [w.text for w in words] == ["Apri", "PR", "e", "boh", "niente"]
    assert words[0].end <= words[1].start + 1e-9
    assert words[3].start >= words[2].end and words[3].end <= words[4].start + 1e-9
    assert all(a.start <= b.start for a, b in zip(words, words[1:]))


def test_heard_near():
    heard = [Word("il", 0.0, 0.2), Word("Cubelet", 0.3, 0.8), Word("lo", 0.9, 1.0)]
    assert heard_near(0.3, 0.8, heard) == "Cubelet"
    # neighbours that only touch the span are not part of what was heard there
    heard = [Word("Con", 0.0, 0.33), Word("Cube", 0.3, 0.6), Word("Control", 0.6, 1.0), Word("torniamo", 0.97, 1.5)]
    assert heard_near(0.31, 1.0, heard) == "Cube Control"
    # nothing centred inside: fall back to what overlaps
    assert heard_near(0.1, 0.2, heard) == "Con"


def test_long_code_term_said_in_full_is_heard():
    """A command of five words plus a slash, said right, is seven heard words."""
    import argparse

    from vdvoice.cli import DATA, Voice

    args = argparse.Namespace(glossary=str(DATA / "glossary-en.txt"), glossary_extra=None,
                              lexicon=str(DATA / "lexicon-en.json"), lexicon_extra=None, flag_dashes=False,
                              en_lang="en-us", en_style="espeak", no_final_fix=False)
    voice = Voice(args, "it")
    segs = voice.segments("Con `kubectl rollout undo deployment/checkout` torniamo indietro.")
    (part,) = english_parts(segs)
    forms = voice.forms(part.segment)
    heard = "Con Cube Control Rollout Undo Deployment Slash Checkout torniamo indietro,"
    assert heard_terms([forms], heard) == [True], forms
    assert heard_terms([forms], "Con kubectl rollout undo deployment/checkout torniamo") == [True]
    assert heard_terms([forms], "Con Cube Control Rollout Undo Deployment Slash Check out") == [True]
    assert heard_terms([forms], "Con Cube Control Rollout Undo Deployment Slash Checkin torniamo") == [False]
    assert heard_terms([forms], "Con Cube Control Rollout Undo Deployment torniamo") == [False]
    (part,) = english_parts(voice.segments("Apri `values.yaml` ora."))
    assert heard_terms([voice.forms(part.segment)], "Apri values dot YAML ora") == [True]
    assert heard_terms([voice.forms(part.segment)], "Apri values.yaml ora") == [True]
    # the pace counts what is said: a version shows one word and says five
    assert voice.spoken_words("Versione 2.4.0 pronta.") == 7
    # ...and an acronym weighs half a word per letter, at least one, spelled or not
    assert voice.spoken_words("Accesso con {SSO|esse esse o} attivo.") == 4.5
    assert voice.spoken_words("Accesso con SSO attivo.") == 4.5
    assert voice.spoken_words("Chiama {HTTP|acca ti ti pi} ora.") == 4
    assert voice.spoken_words("Premi {F5|effe cinque} ora.") == 3
    assert voice.spoken_words("Errore {503|cinque zero tre} ora.") == 5
    # an acronym said as a word, and capitals inside an identifier, are words
    assert voice.spoken_words("Libera la {RAM|ram} ora.") == 4
    assert voice.spoken_words("Non usa DB_HOST ora.") == voice.spoken_words("Non usa db_host ora.")


def test_marked_parts_are_checked():
    """Parts marked in the narration language are checked on their shown or spoken form."""
    import argparse

    from vdvoice.cli import DATA, Voice, probe

    args = argparse.Namespace(glossary=str(DATA / "glossary-en.txt"), glossary_extra=None,
                              lexicon=str(DATA / "lexicon-en.json"), lexicon_extra=None, flag_dashes=False,
                              en_lang="en-us", en_style="espeak", no_final_fix=False)
    voice = Voice(args, "it")
    prepared = voice.prepare("Con {SSO|esse esse o} fai il {commit|it:commit} del {503|cinque zero tre}.")

    def heard(text):
        return [Word(w, i * 0.3, i * 0.3 + 0.25) for i, w in enumerate(text.split())]

    _, terms, marked = probe(voice, prepared, heard("Con SSO fai il commit del 503."), 3.0)
    assert terms == []
    assert [(m["term"], m["ok"], m["forced"]) for m in marked] == [("SSO", True, False), ("commit", True, True), ("503", True, False)]
    # the spoken form is accepted too; a different word is not heard
    _, _, marked = probe(voice, prepared, heard("Con esse esse o fai il comet del cinque zero tre."), 3.0)
    assert [(m["term"], m["ok"]) for m in marked] == [("SSO", True), ("commit", False), ("503", True)]
    assert marked[1]["heard"] == "comet"


def test_english_parts_word_indexes():
    segs = parse("Con kubectl describe vediamo che {en:kubelet} lo riavvia.", GLOSSARY + ["kubectl describe"])
    parts = english_parts(segs)
    assert [(p.segment.shown, p.first_word, p.last_word) for p in parts] == [
        ("kubectl describe", 1, 2),
        ("kubelet", 5, 5),
    ]


def test_suggestions():
    segs = parse("Controlla l'API del pod.", GLOSSARY + ["API"])
    i = next(n for n, s in enumerate(segs) if s.shown == "API")
    fixes = suggestions(segs, i, [])
    assert fixes[0].startswith("rephrase") and "l'" in fixes[0]
    assert any("{API|en:A P I}" in f for f in fixes)
    assert any(f.startswith('lexicon: no entry for "api"') for f in fixes), fixes
    segs = parse("parte un pod nuovo.", GLOSSARY)
    i = next(n for n, s in enumerate(segs) if s.shown == "pod")
    fixes = suggestions(segs, i, [], phonemes="pˈɑːdd")
    assert "{pod|ipa:pˈɑːd}" in fixes[0], fixes
    # an entry for the whole term, and an entry for one word of a longer term
    segs = parse("Con kubectl vediamo.", GLOSSARY)
    i = next(n for n, s in enumerate(segs) if s.shown == "kubectl")
    assert any('the entry for "kubectl" did not work' in f for f in suggestions(segs, i, ["kubectl"]))
    segs = normalize_spoken(parse("Con `kubectl rollout undo deployment/checkout` torniamo.", GLOSSARY), "it")
    i = next(n for n, s in enumerate(segs) if s.shown.startswith("kubectl"))
    fixes = [f for f in suggestions(segs, i, ["kubectl"]) if f.startswith("lexicon")]
    assert fixes and fixes[0].startswith('lexicon: only "kubectl" of'), fixes
    assert not any("did not work" in f for f in fixes), fixes


def test_ipa_parts_are_checked_against_the_shown_form():
    segs = parse("il {pod|ipa:pˈɑːd} nuovo", GLOSSARY)
    assert [(p.segment.shown, p.first_word) for p in english_parts(segs)] == [("pod", 1)]


def write_script(data) -> Path:
    path = TMP / f"script-{len(list(TMP.glob('script-*')))}.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


SCRIPT = {
    "language": "it",
    "chapters": [{"id": "problem", "label": "PROBLEMA"}, {"id": "fix", "label": "FIX"}],
    "sentences": [
        {"id": "s01", "chapter": "problem", "text": "Il pod di checkout è in CrashLoopBackOff."},
        {"id": "s02", "chapter": "problem", "text": "Manca la variabile DATABASE_URL."},
        {"id": "s03", "chapter": "fix", "text": "Riavviamo con {en:rollout restart}."},
    ],
}


def test_load_script_reports_every_problem():
    bad = {"language": "it", "chapters": [{"id": "a"}],
           "sentences": [{"id": "s1", "chapter": "b", "text": ""}, {"id": "s1", "chapter": "a", "text": "x"}]}
    try:
        load_script(write_script(bad))
    except ScriptError as e:
        msg = str(e)
        assert "chapter 'b'" in msg and "empty text" in msg and "duplicate id" in msg, msg
    else:
        raise AssertionError("bad script accepted")
    assert load_script(write_script(SCRIPT))["language"] == "it"


def coded(line, glossary=GLOSSARY, code_terms=("kubectl", "kubectl logs", "rollout restart")):
    words = shown_text(parse(line, glossary)).split()
    flags = code_words(line, glossary, list(code_terms))
    assert len(words) == len(flags), (words, flags)
    return [w for w, f in zip(words, flags) if f]


def test_code_words():
    # Identifier shapes, glossary code terms, backticks and paths are code;
    # glossary words, numbers and versions are not
    assert coded("Il pod di checkout è in CrashLoopBackOff: manca DATABASE_URL.") == ["CrashLoopBackOff:", "DATABASE_URL."]
    assert coded("Con kubectl logs --previous vediamo il log.") == ["kubectl", "logs", "--previous"]
    assert coded("Riavviamo con {rollout restart|ipa:x}, poi `helm upgrade`.") == ["rollout", "restart,", "helm", "upgrade."]
    assert coded("La 2.4.0 di acme-shop risponde {503|cinque zero tre}.") == ["acme-shop"]
    assert coded("Apri /etc/hosts, ./run.sh e src/app.ts.") == ["/etc/hosts,", "./run.sh", "src/app.ts."]
    # Not paths: e/o, A/B; a language marker keeps a word in the text font
    assert coded("Test A/B e/o {en:back-off} con {it:main}.") == []
    # A glossary word with an identifier shape stays a word unless it is in backticks there
    assert coded("in back-off", GLOSSARY + ["back-off"]) == []
    assert coded("in back-off") == ["back-off"]


def test_command_with_a_spoken_form_is_code():
    # A shown side of several words that starts with a code term is a command
    assert coded("Poi {kubectl rollout restart|ipa:x}.") == ["kubectl", "rollout", "restart."]
    assert coded("Il {pod checkout|pod chèckaut} riparte.") == []


def test_markup_inside_backticks_is_an_error():
    def problems(text):
        path = TMP / "bad.json"
        data = json.loads(json.dumps(SCRIPT))
        data["sentences"][0]["text"] = text
        path.write_text(json.dumps(data), encoding="utf-8")
        try:
            load_script(path)
        except ScriptError as e:
            return str(e)
        return ""

    assert "markup inside backticks" in problems("Poi `{kubectl rollout restart|ipa:kjˈuːb}`.")
    assert "markup inside backticks" in problems("Poi `{en:rollout restart}`.")
    assert "markup inside backticks" in problems("Poi `kubectl ipa:x`.")
    # Code with a pipe, a variable or an escaped brace is not markup
    assert problems("Poi `kubectl get pods | grep checkout`.") == ""
    assert problems("Poi `echo ${HOME}`.") == ""
    assert problems(r"Poi `a \{b|c\}`.") == ""


def test_estimated_pace():
    from vdvoice.cli import estimated_pace

    # Measured on the test videos with im_nicola: 2.75-2.85 at 1.15, 2.72-2.73 at 1.10, 2.66 at 1.05
    assert round(estimated_pace("im_nicola", 1.15), 2) == 2.80
    assert 2.70 <= estimated_pace("im_nicola", 1.10) <= 2.76
    assert 2.62 <= estimated_pace("im_nicola", 1.05) <= 2.70


def test_glossary_code_terms():
    path = TMP / "glossary.txt"
    path.write_text("# comment\npod\n`kubectl get`\n\n`secretKeyRef`\n", encoding="utf-8")
    assert load_glossary(path) == ["pod", "kubectl get", "secretKeyRef"]
    assert load_code_terms(path) == ["kubectl get", "secretKeyRef"]


def test_pauses():
    s = SCRIPT["sentences"]
    assert [pause_after(s, i) for i in range(len(s))] == [400, 800, 0]


class FakeSynth:
    """Silence of a length proportional to the phonemes; no model needed."""

    def __init__(self, *_):
        self.calls = 0

    def voices(self):
        return ["im_nicola", "if_sara"]

    def from_phonemes(self, phonemes, voice, speed=1.0):
        import numpy as np

        self.calls += 1
        n = int(24000 * 0.06 * len(phonemes) / speed)
        return np.full(n, 0.1, dtype=np.float32), 24000


class FakeWhisper:
    """Hears the shown text, except the word listed in `miss`."""

    def __init__(self, texts, miss):
        self.texts, self.miss, self.n = texts, miss, 0

    def words(self, wav, language):
        text = self.texts[self.n]
        self.n += 1
        out, t = [], 0.0
        for w in text.split():
            heard = "Rolla Restar" if w.startswith("rollout") and self.miss else w
            out.append(Word(heard, t, t + 0.3))
            t += 0.35
        return " ".join(w.text for w in out), out


def test_script_writes_contract_b_and_reuses_unchanged_sentences():
    from vdvoice import cli

    shown = ["Il pod di checkout è in CrashLoopBackOff.", "Manca la variabile DATABASE_URL.", "Riavviamo con rollout restart."]
    fake = FakeSynth()
    cli.load_models = lambda args: (fake, FakeWhisper(shown, miss=True))
    model = TMP / "model.onnx"
    model.write_bytes(b"x")
    out = TMP / "video"
    script = write_script(SCRIPT)
    argv = ["script", str(script), "--out-dir", str(out / "public" / "voice"), "--voiceover", str(out / "voiceover.json"),
            "--report", str(out / "qa" / "voice-report.json"), "--model", str(model), "--voices", "v.bin",
            "--whisper-model", "w", "--tmp", str(ESPEAK_TMP)]
    assert cli.main(argv) == 0
    vo = json.loads((out / "voiceover.json").read_text(encoding="utf-8"))
    assert list(vo)[:7] == ["language", "voice", "engine", "sampleRate", "speed", "summary", "sentences"]
    assert vo["voice"] == "im_nicola" and vo["speed"] == cli.default_speed("im_nicola")
    s1, s2, s3 = vo["sentences"]
    assert s1["file"] == "voice/s01.wav" and (out / "public" / "voice" / "s01.wav").is_file()
    assert [s["pauseAfterMs"] for s in vo["sentences"]] == [400, 800, 0]
    assert isinstance(s1["durationMs"], int) and s1["timing"] == "whisper"
    assert [w["text"] for w in s1["words"]] == shown[0].split()
    # Code words for the captions' code font; {en:...} keeps a part in the text font
    assert [w.get("code", False) for w in s1["words"]] == [False] * 6 + [True]
    assert [w["text"] for w in s2["words"] if w.get("code")] == ["DATABASE_URL."]
    assert not any(w.get("code") for w in s3["words"])
    assert all(isinstance(w["startMs"], int) and w["endMs"] >= w["startMs"] for w in s1["words"])
    assert {t["term"]: t["ok"] for t in s1["probe"]["terms"]} == {"pod": True, "checkout": True, "CrashLoopBackOff": True}
    assert s3["notHeard"] == ["rollout restart"]
    assert s3["probe"]["terms"] == [{"term": "rollout restart", "heard": "Rolla Restar restart.", "ok": False}], s3
    assert vo["summary"]["notHeard"][0]["sentence"] == "s03"
    assert vo["summary"]["videoMs"] == 250 + sum(s["durationMs"] + s["pauseAfterMs"] for s in vo["sentences"]) + 600
    report = json.loads((out / "qa" / "voice-report.json").read_text(encoding="utf-8"))
    assert report["sentences"][2]["fix"]["rollout restart"], report["sentences"][2]

    # Second run: one sentence changed, one removed; only the changed one is synthesized again
    changed = json.loads(json.dumps(SCRIPT))
    changed["sentences"][1]["text"] = "Manca DATABASE_URL."
    del changed["sentences"][2]
    calls = fake.calls
    cli.load_models = lambda args: (fake, FakeWhisper(["Manca DATABASE_URL."], miss=False))
    argv[1] = str(write_script(changed))
    assert cli.main(argv) == 0
    assert fake.calls == calls + 1
    vo2 = json.loads((out / "voiceover.json").read_text(encoding="utf-8"))
    assert [s["id"] for s in vo2["sentences"]] == ["s01", "s02"]
    assert vo2["sentences"][0] == {**s1, "pauseAfterMs": 400}
    assert [s["pauseAfterMs"] for s in vo2["sentences"]] == [400, 0]
    assert not (out / "public" / "voice" / "s03.wav").exists()


def test_lexicon_readings_for_the_check():
    from vdvoice.phonemes import Phonemizer

    lexicon = {"kubectl": {"ipa": "x", "say": "kube control|cube control"}, "url": {"ipa": "y", "say": "URL"}}
    ph = Phonemizer("it", "en-us", lexicon)
    assert ph.say("kubectl describe") == ["kube control describe", "cube control describe"]
    assert ph.say("kubectl url") == ["kube control URL", "cube control URL"]
    assert ph.say("rollout") == ["rollout"]
    forms = "|".join(["kubectl describe", *ph.say("kubectl describe")])
    assert heard_terms([forms], "Con Cube Control Describe vediamo") == [True]
    # a key written with a dash matches the spoken side, where - became a space
    ph = Phonemizer("it", "en-us", {"acme-shop": {"ipa": "ˈækmi ʃˈɑːp", "say": "acme shop|acmi shop"}})
    spoken = normalize_spoken(parse("di acme-shop", GLOSSARY), "it")[-1].spoken
    assert spoken == "acme shop" and ph.say(spoken) == ["acme shop", "acmi shop"]
    assert ph.segment(normalize_spoken(parse("acme-shop", []), "it")[0]) == "ˈækmi ʃˈɑːp"


def test_boundary_care_and_elision():
    from vdvoice.phonemes import Phonemizer

    ph = Phonemizer("it", "en-us", {})
    _, pieces = ph.sentence(parse("Il pod e l'endpoint.", GLOSSARY + ["endpoint"]))
    assert pieces[0] == "il", pieces  # not the phrase-final "ˈiːl"
    joined, _ = ph.sentence(parse("l'endpoint", ["endpoint"]))
    assert joined.startswith("lɛnd"), joined  # elided article fused, not "ˈɛlle"


if __name__ == "__main__":
    import shutil

    from vdvoice.phonemes import use_private_tmp

    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")
    use_private_tmp(ESPEAK_TMP)
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    try:
        for t in tests:
            t()
            print("ok", t.__name__)
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
    print(f"{len(tests)} passed")
