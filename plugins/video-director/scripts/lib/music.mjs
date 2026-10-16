// music: the background music and the sound effects the plugin makes itself
// (style rule 32). No audio file ships with the plugin and nothing is
// downloaded: every sample is computed here from a seed, so the same video
// gives the same sound on every render.
//
// The music is a sober bed for a spoken explanation: a soft pad, a soft bass
// and one slow line, every note with a soft attack, in a major key, slow. It
// follows the chapters: each chapter starts on a downbeat with its own chord
// progression and a small change in the slow line, and the film ends on the
// home chord.

export const SR = 48000;

/** xorshift32: a small deterministic random generator, values in [0, 1). */
export const random = (seed) => {
  let x = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
  // the first values of close seeds are close: skip them
  for (let i = 0; i < 8; i++) next();
  return next;
};

/** FNV-1a hash of a text: a video's seed comes from its slug. */
export const seedOf = (text) => {
  let h = 0x811c9dc5;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// One-cycle wavetables, read with linear interpolation: a table holds a whole
// timbre (its harmonics), so a note costs one lookup per sample.
const N = 4096;
const table = (amps) => {
  const t = new Float32Array(N + 1);
  let peak = 0;
  for (let i = 0; i < N; i++) {
    let v = 0;
    for (let k = 0; k < amps.length; k++) v += amps[k] * Math.sin((2 * Math.PI * (k + 1) * i) / N);
    t[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < N; i++) t[i] /= peak;
  t[N] = t[0];
  return t;
};
const SINE = table([1]);
// Pad: a soft saw (harmonics falling at 1/k^1.8), dark enough to stay under a voice
const PAD = table(Array.from({ length: 10 }, (_, k) => 1 / (k + 1) ** 1.8));
// Pure pad of the minimal style
const GLASS = table([1, 0.18, 0.06]);
const BASS = table([1, 0.32, 0.08]);
// Odd harmonics, rolled off: the soft buzz of the error effect
const REED = table([1, 0, 0.3, 0, 0.12, 0, 0.05]);

const look = (t, phase) => {
  const p = phase * N;
  const i = p | 0;
  return t[i] + (t[i + 1] - t[i]) * (p - i);
};

/** A stereo buffer of `seconds`. */
export const buffer = (seconds) => {
  const n = Math.max(1, Math.ceil(seconds * SR));
  return { L: new Float32Array(n), R: new Float32Array(n) };
};

/**
 * Add one note. Envelope: linear attack `a`, exponential decay towards
 * sustain `s` with time constant `d`, then a release `r` after `dur`
 * seconds. `fm`: { ratio, index, decay } turns the note into a two-operator
 * FM tone (the index falls with `decay`), for plucked and bell sounds.
 * `until`: the note is cut (released) there at the latest, in seconds.
 */
const note = (buf, o) => {
  const { t0, hz, amp, tbl = SINE, a = 0.01, d = 0.4, s = 0.6, r = 0.3, pan = 0, detune = 0, fm = null, lfo = 0 } = o;
  const dur = Math.max(0.02, Math.min(o.dur, (o.until ?? Infinity) - t0));
  const start = Math.round(t0 * SR);
  const hold = Math.round(dur * SR);
  const total = hold + Math.round(r * SR);
  const inc = (hz * 2 ** (detune / 1200)) / SR;
  const minc = fm ? inc * fm.ratio : 0;
  const gl = amp * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = amp * Math.sin(((pan + 1) * Math.PI) / 4);
  const env = (t) => (t < a ? t / a : s + (1 - s) * Math.exp(-(t - a) / d));
  const atRelease = env(dur);
  const { L, R } = buf;
  let ph = 0;
  let mph = 0;
  for (let n = 0; n < total; n++) {
    const idx = start + n;
    if (idx >= L.length) break;
    const t = n / SR;
    let e = n < hold ? env(t) : atRelease * (1 - (n - hold) / (total - hold)) ** 2;
    if (lfo) e *= 1 + lfo * Math.sin(2 * Math.PI * 0.17 * (t0 + t));
    let v;
    if (fm) {
      const index = fm.index * Math.exp(-t / fm.decay);
      v = look(SINE, (((ph + (index * look(SINE, mph)) / (2 * Math.PI)) % 1) + 1) % 1);
      mph += minc;
      if (mph >= 1) mph -= 1;
    } else {
      v = look(tbl, ph);
    }
    ph += inc;
    if (ph >= 1) ph -= 1;
    if (idx >= 0) {
      L[idx] += v * e * gl;
      R[idx] += v * e * gr;
    }
  }
};

/** Short burst of noise through a band-pass, for a soft tick or a whoosh. */
const noise = (buf, { t0, dur, amp, rnd, from = 800, to = 800, q = 1.2, pan = 0, attack = 0.002 }) => {
  const start = Math.round(t0 * SR);
  const n = Math.round(dur * SR);
  const gl = amp * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = amp * Math.sin(((pan + 1) * Math.PI) / 4);
  // State-variable filter (band-pass output), centre moving from `from` to `to`
  let low = 0;
  let band = 0;
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    if (idx >= buf.L.length) break;
    const u = i / n;
    const fc = from * (to / from) ** u;
    const f = 2 * Math.sin((Math.PI * fc) / SR);
    const x = rnd() * 2 - 1;
    low += f * band;
    const high = x - low - band / q;
    band += f * high;
    const t = i / SR;
    const e = t < attack ? t / attack : Math.sin(Math.PI * Math.min(1, u)) ** 1.5;
    if (idx >= 0) {
      buf.L[idx] += band * e * gl;
      buf.R[idx] += band * e * gr;
    }
  }
};

/** Biquad filter in place (the usual audio EQ formulas). */
const biquad = (x, { b0, b1, b2, a1, a2 }) => {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
};
const peaking = (f0, gainDb, q) => {
  const A = 10 ** (gainDb / 40);
  const w = (2 * Math.PI * f0) / SR;
  const al = Math.sin(w) / (2 * q);
  const a0 = 1 + al / A;
  return { b0: (1 + al * A) / a0, b1: (-2 * Math.cos(w)) / a0, b2: (1 - al * A) / a0, a1: (-2 * Math.cos(w)) / a0, a2: (1 - al / A) / a0 };
};
const highpass = (f0, q = 0.707) => {
  const w = (2 * Math.PI * f0) / SR;
  const al = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const a0 = 1 + al;
  return { b0: (1 + c) / 2 / a0, b1: -(1 + c) / a0, b2: (1 + c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0 };
};
const lowpass = (f0, q = 0.707) => {
  const w = (2 * Math.PI * f0) / SR;
  const al = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const a0 = 1 + al;
  return { b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0 };
};

/**
 * A small stereo reverb: four damped feedback combs and two all-passes per
 * channel, the right channel's delays a little longer. Returns the wet signal.
 */
const reverb = (L, R, { size = 0.82, damp = 0.3 } = {}) => {
  const combs = [1559, 1621, 1493, 1427];
  const passes = [557, 443];
  const side = (x, spread) => {
    const out = new Float32Array(x.length);
    for (const len0 of combs) {
      const len = len0 + spread;
      const line = new Float32Array(len);
      let pos = 0;
      let store = 0;
      for (let i = 0; i < x.length; i++) {
        const y = line[pos];
        store = y * (1 - damp) + store * damp;
        line[pos] = x[i] * 0.015 + store * size;
        out[i] += y;
        if (++pos >= len) pos = 0;
      }
    }
    for (const len0 of passes) {
      const len = len0 + spread;
      const line = new Float32Array(len);
      let pos = 0;
      for (let i = 0; i < out.length; i++) {
        const b = line[pos];
        const y = -out[i] + b;
        line[pos] = out[i] + b * 0.5;
        out[i] = y;
        if (++pos >= len) pos = 0;
      }
    }
    return out;
  };
  return { L: side(L, 0), R: side(R, 31) };
};

// Chord progressions as scale degrees of a major key (0 = I ... 5 = vi):
// plain, consonant ones, so the music never asks for attention.
const PROGRESSIONS = [
  [0, 4, 5, 3], // I V vi IV
  [5, 3, 0, 4], // vi IV I V
  [3, 0, 4, 5], // IV I V vi
  [0, 3, 5, 4], // I IV vi V
  [0, 5, 3, 4], // I vi IV V
  [3, 4, 2, 5], // IV V iii vi
];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const degree = (d) => MAJOR[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
/** Chord tones (pitch offsets from the tonic) of a degree: triad, plus the 7th or the 9th when asked. */
const chordOf = (d, extra = null) => {
  const tones = [degree(d), degree(d + 2), degree(d + 4)];
  if (extra === 7) tones.push(degree(d + 6));
  if (extra === 9) tones.push(degree(d + 8));
  return tones;
};
/** Each tone in the octave from `low` (close voicing, so chords move smoothly). */
const voice = (tonic, tones, low) => tones.map((p) => {
  let m = tonic + p;
  while (m < low) m += 12;
  while (m >= low + 12) m -= 12;
  return m;
}).sort((x, y) => x - y);

/** The bass note of a degree, in E2-D#3 (82-156 Hz): low enough to carry the chord, high enough for small speakers. */
const bassOf = (tonic, d) => voice(tonic, [degree(d)], 40)[0];

/**
 * The styles, by character. Every layer of every style starts softly (an
 * attack of 60 ms or more): no bell, piano, pluck or tick. Seen in test
 * videos: the sharp-attack notes of the first styles (bells, an electric
 * piano, a plucked figure) rose over the bed in the pauses, where the music
 * comes up, and were heard as loud, random sound effects. The styles differ
 * by harmony, tempo, timbre and slow movement instead:
 * `warm` (soft saw pad with added 9ths, round bass, a slow upper line that
 * swells once a bar), `pulse` (lighter pad, a soft bass on every beat, the
 * chord breathing on the beat), `minimal` (glassy pad, a faint sine bass, a
 * slow glassy line on long notes; the most discreet).
 */
export const STYLES = {
  warm: { doc: "soft pad, round bass, a slow upper line; calm", bpm: [72, 80], wet: 0.3 },
  pulse: { doc: "lighter pad, a soft bass on every beat, the chord breathing on the beat; more rhythm", bpm: [92, 100], wet: 0.22 },
  minimal: { doc: "glassy pad, a faint bass, a slow glassy line; the most discreet", bpm: [64, 72], wet: 0.4 },
};
// The style of a video whose style was not chosen (musicStyle still auto).
export const DEFAULT_STYLE = "warm";

// Soft tables for the slow lines: few harmonics, no edge.
const SOFT = table([1, 0.25, 0.08]);

const bar = (buf, style, ctx, t, len, chord, sectionIndex, barIndex, rnd, until) => {
  const { tonic, beat } = ctx;
  const sec = sectionIndex % 2;
  const end = Math.min(until, t + len);
  if (style === "warm") {
    const pad = voice(tonic, chordOf(chord, chord === 0 || chord === 3 ? 9 : null), tonic + 7);
    for (const m of pad) {
      for (const [det, pan] of [[-6, -0.45], [6, 0.45]]) {
        note(buf, { t0: t, dur: len, until: end, hz: midiHz(m), amp: 0.032, tbl: PAD, a: 0.7, d: 1.6, s: 0.75, r: 1.2, pan, detune: det, lfo: 0.08 });
      }
    }
    note(buf, { t0: t, dur: len * 0.9, until: end, hz: midiHz(bassOf(tonic, chord)), amp: 0.11, tbl: BASS, a: 0.09, d: 1.1, s: 0.5, r: 0.45 });
    // slow upper line: one chord tone a bar, swelling from the second beat,
    // one octave higher on odd chapters
    const line = voice(tonic, chordOf(chord), tonic + 12 + 12 * sec);
    note(buf, { t0: t + beat, dur: Math.max(0.2, len - 1.5 * beat), until: end, hz: midiHz(line[(barIndex + sec) % line.length]), amp: 0.026 * (0.85 + 0.15 * rnd()), tbl: SOFT, a: 0.9, d: 1.4, s: 0.7, r: 0.9, pan: barIndex % 2 ? 0.25 : -0.25 });
  } else if (style === "pulse") {
    const pad = voice(tonic, chordOf(chord), tonic + 7);
    for (const m of pad) {
      for (const [det, pan] of [[-5, -0.35], [5, 0.35]]) {
        note(buf, { t0: t, dur: len, until: end, hz: midiHz(m), amp: 0.022, tbl: PAD, a: 0.6, d: 1.2, s: 0.7, r: 0.8, pan, detune: det, lfo: 0.06 });
      }
    }
    const root = bassOf(tonic, chord);
    for (let b = 0; b < 4; b++) {
      note(buf, { t0: t + b * beat, dur: 0.8 * beat, until: end, hz: midiHz(b === 3 && sec ? root + 12 : root), amp: b === 3 && sec ? 0.045 : 0.08, tbl: BASS, a: 0.08, d: 0.3, s: 0.55, r: 0.15 });
    }
    // the chord breathing on the beat: soft swells of the 7th chord, the
    // shape changing with the chapter
    const tones = voice(tonic, chordOf(chord, 7), tonic + 12);
    const shape = sec ? [0, 2, 1, 3] : [0, 1, 2, 1];
    shape.forEach((k, i) => {
      note(buf, { t0: t + i * beat, dur: 0.6 * beat, until: end, hz: midiHz(tones[k % tones.length]), amp: 0.024 * (i % 2 ? 0.8 : 1), tbl: SOFT, a: 0.18, d: 0.4, s: 0.5, r: 0.3, pan: i % 2 ? 0.3 : -0.3 });
    });
  } else {
    const pad = voice(tonic, chordOf(chord, chord === 0 ? 9 : null), tonic + 7);
    for (const m of pad) {
      for (const [det, pan] of [[-4, -0.5], [4, 0.5]]) {
        note(buf, { t0: t, dur: len, until: end, hz: midiHz(m), amp: 0.03, tbl: GLASS, a: 1.2, d: 2, s: 0.8, r: 1.8, pan, detune: det, lfo: 0.1 });
      }
    }
    note(buf, { t0: t, dur: len, until: end, hz: midiHz(bassOf(tonic, chord)), amp: 0.022, tbl: SINE, a: 0.3, d: 2, s: 0.6, r: 0.8 });
    // slow glassy line: one long chord tone a bar, higher on odd chapters
    const line = voice(tonic, chordOf(chord, 9), tonic + 12 + 5 * sec);
    note(buf, { t0: t + beat * (rnd() < 0.5 ? 0.5 : 1), dur: Math.max(0.2, len - 1.5 * beat), until: end, hz: midiHz(line[Math.floor(rnd() * line.length)]), amp: 0.022, tbl: GLASS, a: 1.1, d: 2, s: 0.7, r: 1.2, pan: rnd() * 0.6 - 0.3 });
  }
};

/**
 * The music of one film. `sections`: [{ fromMs, toMs }], one per chapter in
 * film order (the first starts at 0). Returns { L, R, key, bpm } at SR,
 * `durationMs` long, peak about 1 before any gain: the caller sets its level.
 */
export const generateMusic = ({ seed, style = DEFAULT_STYLE, sections, durationMs }) => {
  const spec = STYLES[style] ?? STYLES[DEFAULT_STYLE];
  const rnd = random(seed ^ seedOf(style));
  const keyShift = [0, 2, 3, 5, 7, 9][Math.floor(rnd() * 6)];
  const tonic = 48 + keyShift > 52 ? 36 + keyShift : 48 + keyShift;
  const bpm = spec.bpm[0] + Math.floor(rnd() * (spec.bpm[1] - spec.bpm[0] + 1));
  const beat = 60 / bpm;
  const barLen = 4 * beat;
  const total = durationMs / 1000;
  const buf = buffer(total);
  const ctx = { tonic, beat };
  const rotation = Math.floor(rnd() * PROGRESSIONS.length);

  // The home chord comes on the last downbeat at least 1.6 s before the end
  // and rings out; the film's 0.6 s fade to black closes it.
  const last = sections[sections.length - 1];
  const lastFrom = last ? last.fromMs / 1000 : 0;
  let finalAt = lastFrom;
  while (finalAt + barLen <= total - 1.6) finalAt += barLen;
  if (finalAt < lastFrom + 0.5 * barLen) finalAt = Math.max(lastFrom, total - 2.4);

  sections.forEach((sec, i) => {
    const prog = PROGRESSIONS[(rotation + i) % PROGRESSIONS.length];
    const from = sec.fromMs / 1000;
    const to = Math.min(total, i === sections.length - 1 ? finalAt : sec.toMs / 1000);
    for (let t = from, b = 0; t < to - 0.05; t += barLen, b++) {
      bar(buf, style, ctx, t, Math.min(barLen, to - t), prog[b % 4], i, b, rnd, to);
    }
  });
  // Home chord
  const home = voice(tonic, chordOf(0, style === "pulse" ? null : 9), tonic + 7);
  const ring = Math.max(0.5, total - finalAt);
  for (const m of home) {
    for (const [det, pan] of [[-6, -0.45], [6, 0.45]]) {
      note(buf, { t0: finalAt, dur: ring, hz: midiHz(m), amp: 0.03, tbl: style === "minimal" ? GLASS : PAD, a: 0.25, d: 2.5, s: 0.5, r: 0.2, pan, detune: det });
    }
  }
  note(buf, { t0: finalAt, dur: ring, hz: midiHz(bassOf(tonic, 0)), amp: 0.1, tbl: BASS, a: 0.09, d: 1.5, s: 0.3, r: 0.2 });

  const wet = reverb(buf.L, buf.R);
  for (let i = 0; i < buf.L.length; i++) {
    buf.L[i] += wet.L[i] * spec.wet;
    buf.R[i] += wet.R[i] * spec.wet;
  }
  // Leave room for the voice: no rumble, a dip where speech is understood
  for (const x of [buf.L, buf.R]) {
    biquad(x, highpass(45));
    biquad(x, peaking(2600, -4, 0.8));
    biquad(x, lowpass(8500));
  }
  return { ...buf, key: tonic % 12, bpm };
};

/** Length of each generated effect, in seconds (the tail is soft and may be cut). */
export const EFFECT_SECONDS = { chapter: 0.6, error: 0.42, success: 0.62 };

/**
 * A generated effect, tuned to the music's key (`key`: pitch class of the
 * tonic). chapter: a soft rising whoosh and a two-note mallet on the home
 * chord; error: two short, low, slightly buzzy notes stepping down; success:
 * two bell notes stepping up.
 */
export const generateEffect = (kind, { seed = 1, key = 0 } = {}) => {
  const rnd = random(seed ^ seedOf(kind));
  const buf = buffer(EFFECT_SECONDS[kind] ?? 0.5);
  const tonic = 60 + key;
  if (kind === "chapter") {
    noise(buf, { t0: 0, dur: 0.42, amp: 0.5, rnd, from: 500, to: 2200, q: 1.6, pan: -0.15, attack: 0.15 });
    note(buf, { t0: 0.16, dur: 0.1, hz: midiHz(tonic + 12), amp: 0.22, a: 0.003, d: 0.32, s: 0, r: 0.25, pan: -0.1, fm: { ratio: 4, index: 0.5, decay: 0.05 } });
    note(buf, { t0: 0.24, dur: 0.1, hz: midiHz(tonic + 19), amp: 0.18, a: 0.003, d: 0.3, s: 0, r: 0.25, pan: 0.15, fm: { ratio: 4, index: 0.5, decay: 0.05 } });
  } else if (kind === "error") {
    note(buf, { t0: 0, dur: 0.11, hz: midiHz(tonic - 9), amp: 0.3, tbl: REED, a: 0.006, d: 0.12, s: 0.4, r: 0.05 });
    note(buf, { t0: 0.15, dur: 0.16, hz: midiHz(tonic - 12), amp: 0.3, tbl: REED, a: 0.006, d: 0.15, s: 0.4, r: 0.1 });
    for (const x of [buf.L, buf.R]) biquad(x, lowpass(2200));
  } else {
    note(buf, { t0: 0, dur: 0.08, hz: midiHz(tonic + 7), amp: 0.22, a: 0.003, d: 0.22, s: 0, r: 0.2, pan: -0.1, fm: { ratio: 2, index: 0.6, decay: 0.15 } });
    note(buf, { t0: 0.12, dur: 0.1, hz: midiHz(tonic + 12), amp: 0.24, a: 0.003, d: 0.38, s: 0, r: 0.3, pan: 0.1, fm: { ratio: 2, index: 0.6, decay: 0.2 } });
  }
  return buf;
};
