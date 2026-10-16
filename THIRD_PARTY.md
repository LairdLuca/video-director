# Third-party notices

video-director-explainer is MIT (see [LICENSE](LICENSE)). This file lists what it
installs and uses, and under which license. The repository itself ships no
third-party code, font, icon, sound or model file: everything below is a
package or a model that setup and each video install on the user's machine
from pinned sources, or a file the user chooses.

Licenses were read from the installed packages (`package.json`, `LICENSE`
files, Python package metadata) at the pinned versions, and for the models
from their model cards.

The official Remotion skills for Claude Code
([remotion-dev/claude-code-plugin](https://github.com/remotion-dev/claude-code-plugin))
are a useful API reference next to this plugin; nothing of them is copied.

## Installed in each video project (npm, from `template/package-lock.json`)

| Package | Version | License | Notes |
|---|---|---|---|
| `remotion`, `@remotion/cli`, `@remotion/renderer`, `@remotion/bundler` | 4.0.535 | **Remotion License** (`LICENSE.md` in each package) | free for individuals, for-profit organizations with up to 3 employees, non-profits and evaluation; a company license is required above that. See [remotion.dev/license](https://www.remotion.dev/license) |
| `@remotion/transitions` | 4.0.535 | its `package.json` says `UNLICENSED` | part of the Remotion project, so it falls under the Remotion License like the packages above; the package itself ships no license file |
| `@remotion/fonts` | 4.0.535 | MIT | |
| `react`, `react-dom` | 19.2.3 | MIT | |
| `lucide-react` | 1.47.0 | ISC; some icons derived from Feather, MIT | icons are drawn into the rendered frames |
| `@fontsource/inter` | 5.2.8 | SIL Open Font License 1.1 | Inter, copyright The Inter Project Authors |
| `@fontsource/jetbrains-mono` | 5.2.8 | SIL Open Font License 1.1 | JetBrains Mono, copyright The JetBrains Mono Project Authors |
| `typescript` | 5.9.3 | Apache-2.0 | development only (type check) |

`new-video.mjs` copies the five font files with both font licenses
(`LICENSE-inter.txt`, `LICENSE-jetbrains-mono.txt`) into each video's
`public/fonts/`. Remotion downloads its own headless browser (Chrome Headless
Shell, under Google's terms) into each project on the first still or render.

## Installed by setup: the voice runtime (PyPI, from `voice/requirements.txt`)

Installed into a venv in the plugin data folder, wheels only, every file
checked by sha256. The direct dependencies are `kokoro-onnx` and
`faster-whisper`; the full pinned set is 31 packages.

| Package | Version | License (from the package metadata) |
|---|---|---|
| kokoro-onnx | 0.6.1 | MIT |
| faster-whisper | 1.2.1 | MIT |
| ctranslate2 | 4.8.2 | MIT |
| onnxruntime | 1.31.0 | MIT |
| **phonemizer** | 3.4.0 | **GPL-3.0-or-later** |
| **espeakng-loader** | 0.2.4 | no license in its metadata; it bundles the espeak-ng library and data. espeak-ng is **GPL-3.0-or-later** (espeak-ng project) |
| av (PyAV) | 16.1.0 | BSD-3-Clause; the wheel bundles FFmpeg libraries under their own licenses |
| numpy | 2.5.4 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 |
| huggingface-hub | 2.2.0 | Apache-2.0 |
| tokenizers | 0.23.3 | Apache-2.0 |
| hf-xet | 1.7.0 | Apache-2.0 |
| flatbuffers | 25.12.19 | Apache-2.0 |
| protobuf | 7.36.2 | BSD-3-Clause |
| tqdm | 4.70.1 | MPL-2.0 AND MIT |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause |
| typing-extensions | 4.16.0 | PSF-2.0 |
| anyio, attrs, dlinfo, filelock, h11, pyyaml, truststore | | MIT |
| click, cloudpickle, colorama, fsspec, httpcore2, httpx2, idna, joblib | | BSD-3-Clause (colorama: BSD) |

**GPL note.** The voice module (`voice/vdvoice/phonemes.py`) imports
`phonemizer` and loads espeak-ng at run time, both GPL-3.0-or-later. This
repository does not contain or redistribute either of them: setup installs
them on the user's machine from PyPI. If you redistribute a bundle that includes the
runtime, the GPL applies to that distribution.

## Downloaded by setup: the models

Downloaded once into the plugin data folder (or reused from a folder the user
already has), each file checked against a pinned size and sha256
(`scripts/lib/models.mjs`).

| Model | Files | Source | License |
|---|---|---|---|
| Kokoro-82M v1.0, ONNX export | `kokoro-v1.0.onnx`, `voices-v1.0.bin` | releases of [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) (model-files-v1.0) | Apache-2.0 (model card of [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M); kokoro-onnx states "kokoro model: Apache 2.0") |
| faster-whisper small | `model.bin`, `config.json`, `tokenizer.json`, `vocabulary.txt` | [Systran/faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small) at a pinned revision | MIT (model card); a CTranslate2 conversion of OpenAI's `whisper-small` |

## Music and sound effects

Generated at every render by the plugin's own code (`scripts/lib/music.mjs`,
MIT like the rest): no sample, loop or recording of anyone else is used,
and nothing is downloaded. When the user names a folder of their own sounds
(`audioDir`), those files are read where they are at every render and mixed
into that user's videos; they are never copied into the plugin, and their
rights are the user's to check.

## Fonts chosen by the user

The text font can be one found on the user's machine or a font file the
user names (`font`). Its files are copied into each video project that uses
it, under `public/fonts/text/`, and that folder is left out of the video
project's git; the font's license is the user's to check. Inter and
JetBrains Mono, above, are the ones the plugin installs.

## Tools the user installs

ffmpeg and ffprobe (render, loudness, the music and effects mix, decoding
the user's own sounds, contact sheets), Node.js and Python are installed by
the user, at user level, with their own licenses. Setup prints the install
command; it does not ship them.
