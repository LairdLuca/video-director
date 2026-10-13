"""Kokoro synthesis from phonemes, peak normalization and WAV output."""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

PEAK_DBFS = -1.0


class Synth:
    def __init__(self, model_path: str | Path, voices_path: str | Path):
        from kokoro_onnx import Kokoro

        self.kokoro = Kokoro(str(model_path), str(voices_path))
        # True only for model exports with a "duration" output; the published
        # v1.0 ONNX has none, so word timing comes from Whisper instead
        self.has_timings = self.kokoro.has_timings

    def voices(self) -> list[str]:
        return self.kokoro.get_voices()

    def from_phonemes(self, phonemes: str, voice: str, speed: float = 1.0) -> tuple[np.ndarray, int]:
        return self.kokoro.create(phonemes, voice=voice, speed=speed, is_phonemes=True)

    def from_text(self, text: str, voice: str, lang: str, speed: float = 1.0) -> tuple[np.ndarray, int]:
        return self.kokoro.create(text, voice=voice, speed=speed, lang=lang)


def peak_normalize(audio: np.ndarray, dbfs: float = PEAK_DBFS) -> np.ndarray:
    """Scale so the highest sample sits at `dbfs`; Kokoro output can exceed ±1 and clip."""
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak == 0.0:
        return audio.astype(np.float32)
    return (audio * (10 ** (dbfs / 20) / peak)).astype(np.float32)


def write_wav(path: str | Path, audio: np.ndarray, sample_rate: int) -> None:
    """16-bit mono PCM through the standard library, no extra audio package."""
    pcm = np.clip(np.round(audio * 32767), -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm.tobytes())
