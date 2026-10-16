// audio: the music and effects bed of a film (style rule 32), built from the
// timeline, and its mix with the rendered narration.
//
// The narration is rendered by Remotion as before. render.mjs then builds the
// bed here (music ducked under the voice, effects only in the pauses), mixes
// it with ffmpeg and normalizes the loudness as before. The bed is computed
// from the timeline and the narration WAVs, so the lint can check where the
// effects fall without rendering anything.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_STYLE, EFFECT_SECONDS, generateEffect, generateMusic, seedOf, SR, STYLES } from "./music.mjs";

export { SR, STYLES };

// Effects a storyboard can ask for on a shot; "chapter" comes by itself at
// every chapter change.
export const SFX_KINDS = ["error", "success"];
export const USER_KINDS = ["music", "chapter", "error", "success"];
const USER_EXT = /\.(wav|mp3|ogg|oga|flac|m4a|aac|opus)$/i;

// Speech is treated as continuous across gaps shorter than this: the music
// stays down between words and short phrases, and rises only in real pauses.
export const RISE_GAP_MS = 700;
// An effect needs a pause this long (the chapter pause is 800 ms), and keeps
// this far from the words on both sides.
export const MIN_EFFECT_GAP_MS = 420;
export const GUARD_MS = 70;
// How far from its word a key effect (error, success) may fall: it starts at
// most 0.3 s after the word ends, or ends at most 0.3 s before the word
// starts; with no room there it is left out. Seen in test videos: moved up to
// 0.85 s after the word, into the next chapter's cut, it no longer belonged
// to what it marked.
export const KEY_WINDOW_MS = 300;
// The chapter effect may move up to 4 s after the cut or end 0.4 s before it.
export const MAX_AFTER_MS = 4000;
export const MAX_BEFORE_MS = 400;
// Levels, in LU below the voice measured while it speaks.
export const MUSIC_BELOW_VOICE = { low: 24, normal: 20, high: 16 };
export const DEFAULT_MUSIC_LEVEL = "high";
export const MUSIC_RISE_DB = 8;
export const FX_BELOW_VOICE = 8;
// Transients of the music (decision of the second fix cycle): the rise of
// the music's level above 500 Hz in 20 ms over the 300 ms before it, before
// ducking. Seen in test videos: bell, piano and plucked notes rose 11 to 18
// dB this way, stood out in the pauses (where the music comes up 8 dB) and
// were heard as loud, random sound effects; the soft-attack styles stay
// under 6.5 dB. The guard sits between the two.
export const MUSIC_TRANSIENT_LIMIT_DB = 8;
const TRANSIENT_HP_HZ = 500;
// Voice activity in the narration WAVs: 10 ms windows over this level.
const VAD_DB = -42;

const msToS = (ms) => ms / 1000;

/** The user's folder: music*, chapter*, error*, success* audio files, by name. */
export const userSounds = (dir) => {
  const out = Object.fromEntries(USER_KINDS.map((k) => [k, []]));
  if (!dir || !existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    if (!USER_EXT.test(name)) continue;
    const kind = USER_KINDS.find((k) => name.toLowerCase().startsWith(k));
    if (kind) out[kind].push(path.join(dir, name));
  }
  return out;
};

// WAV reading (PCM 16/24/32 bit or float 32, any rate, mono or stereo), to
// mono at SR. Only the narration WAVs the voice step writes are read this way.
const readWavMono = (file) => {
  const b = readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error(`${file}: not a WAV file`);
  let pos = 12;
  let fmt = null;
  while (pos + 8 <= b.length) {
    const id = b.toString("ascii", pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") {
      fmt = { format: b.readUInt16LE(body), channels: b.readUInt16LE(body + 2), rate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
    } else if (id === "data" && fmt) {
      const bytes = fmt.bits / 8;
      const frames = Math.floor(Math.min(size, b.length - body) / (bytes * fmt.channels));
      const x = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let v = 0;
        for (let c = 0; c < fmt.channels; c++) {
          const o = body + (i * fmt.channels + c) * bytes;
          if (fmt.format === 3) v += b.readFloatLE(o);
          else if (fmt.bits === 16) v += b.readInt16LE(o) / 32768;
          else if (fmt.bits === 24) v += b.readIntLE(o, 3) / 8388608;
          else v += b.readInt32LE(o) / 2147483648;
        }
        x[i] = v / fmt.channels;
      }
      return { x, rate: fmt.rate };
    }
    pos = body + size + (size % 2);
  }
  throw new Error(`${file}: no audio data`);
};

/**
 * The narration on the film's clock, mono at SR: each sentence's WAV at its
 * start, as the composition plays it. Missing files are left silent.
 */
export const narrationTrack = (videoDir, timeline) => {
  const x = new Float32Array(Math.ceil(msToS(timeline.totalMs) * SR) + 1);
  for (const s of timeline.sentences) {
    if (!s.file) continue;
    const file = path.join(videoDir, "public", s.file);
    if (!existsSync(file)) continue;
    const w = readWavMono(file);
    const k = w.rate / SR;
    const start = Math.round(msToS(s.startMs) * SR);
    const n = Math.floor(w.x.length / k);
    for (let i = 0; i < n && start + i < x.length; i++) {
      const p = i * k;
      const j = Math.floor(p);
      const f = p - j;
      x[start + i] += w.x[j] * (1 - f) + (w.x[Math.min(j + 1, w.x.length - 1)] ?? 0) * f;
    }
  }
  return x;
};

/** Merge [from, to] ranges (ms) that overlap or are closer than `join`. */
const merge = (ranges, join = 0) => {
  const out = [];
  for (const r of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && r[0] - last[1] <= join) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
};

/**
 * Where the voice speaks, in ms: the word times of every sentence (the whole
 * sentence when its times are estimated), joined with the voice activity of
 * the narration WAVs when `track` is given (10 ms windows over -42 dBFS), so
 * a word whose measured time ends early still counts as speech.
 */
export const speechRanges = (timeline, track = null) => {
  const ranges = [];
  for (const s of timeline.sentences) {
    if (s.timing === "whisper" && s.words.length) for (const w of s.words) ranges.push([w.startMs, w.endMs]);
    else ranges.push([s.startMs, s.endMs]);
  }
  if (track) ranges.push(...voiceActivity(track));
  return merge(ranges.filter((r) => r[1] > r[0]), 1);
};

/** Ranges (ms, from the start of `track`) of 10 ms windows over -42 dBFS. */
export const voiceActivity = (track) => {
  const out = [];
  const win = SR / 100;
  const floor = 10 ** (VAD_DB / 20);
  for (let i = 0; i + win <= track.length; i += win) {
    let e = 0;
    for (let j = i; j < i + win; j++) e += track[j] * track[j];
    if (Math.sqrt(e / win) > floor) out.push([(i / SR) * 1000, ((i + win) / SR) * 1000]);
  }
  return merge(out, 1);
};

/** The pauses between speech ranges, from 0 to the end of the film. */
export const pausesOf = (speech, totalMs) => {
  const out = [];
  let at = 0;
  for (const [a, b] of speech) {
    if (a > at) out.push([at, a]);
    at = Math.max(at, b);
  }
  if (totalMs > at) out.push([at, totalMs]);
  return out;
};

const shotStartMs = (timeline, shot) => (shot.from / timeline.fps) * 1000;

/**
 * The effects of the film and where they fall. A shot's `sfx` ([{ kind, at
 * }], `at` a beat of the shot) gets its effect next to the beat's word: in a
 * pause long enough for it, starting at most 0.3 s after the word ends or
 * ending at most 0.3 s before it starts, and dropped when there is none: an
 * effect never plays over speech, and never far from its word. Then every chapter change gets the chapter effect at the cut,
 * unless its pause already holds one of those: one effect per pause, and the
 * key moment wins (the music still changes with the chapter).
 * Returns { cues: [{ kind, from, startMs, endMs, movedMs (from the beat),
 * fromWordMs (key effects: after the word's end, or negative: from the
 * effect's end to the word's start) }], dropped, yielded, errors }.
 */
export const planCues = (timeline, storyboard, { speech = speechRanges(timeline), lengths = EFFECT_SECONDS } = {}) => {
  const pauses = pausesOf(speech, timeline.totalMs).filter(([a, b]) => b - a >= MIN_EFFECT_GAP_MS);
  const cues = [];
  const dropped = [];
  const yielded = [];
  const errors = [];
  const taken = new Map();
  // The spoken word a beat falls on: its start and end (the beat itself
  // when the sentence's times are estimated)
  const words = timeline.sentences.flatMap((s) => (s.timing === "whisper" ? s.words : []));
  const wordAt = (ms) => {
    let best = null;
    for (const w of words) if (!best || Math.abs(w.startMs - ms) < Math.abs(best.startMs - ms)) best = w;
    return best && Math.abs(best.startMs - ms) <= 150 ? { from: best.startMs, to: Math.max(best.endMs, best.startMs) } : { from: ms, to: ms };
  };
  const place = (kind, wantMs, from, hint = null) => {
    const len = (lengths[kind] ?? 0.5) * 1000;
    const key = kind !== "chapter";
    const word = !key ? { from: wantMs, to: wantMs } : { ...(hint ?? wordAt(wantMs)) };
    if (key) {
      // The measured word end is often early (seen: "200." ended 0.5 s before
      // its sound did); the voice's own energy carries it to where the sound
      // stops, never past the next word
      const seg = speech.find(([a, b]) => a <= word.to && b >= word.to);
      const next = Math.min(Infinity, ...words.filter((w) => w.startMs >= word.to - 20 && w.startMs > word.from).map((w) => w.startMs));
      if (seg) word.to = Math.max(word.to, Math.min(seg[1], next));
    }
    const after = key ? KEY_WINDOW_MS : MAX_AFTER_MS;
    const before = key ? KEY_WINDOW_MS : MAX_BEFORE_MS;
    let best = null;
    for (const [a, b] of pauses) {
      // Inside the pause, a guard away from the words; as close to the word
      // as the effect's length allows (all of it when the pause is long enough)
      const lo = a + GUARD_MS;
      const hi = b - GUARD_MS;
      let start;
      let end;
      let cost;
      let gap = null;
      if (key) {
        // After the word (or around a beat with estimated times): it starts
        // within 0.3 s of the word's end. Before it: it ends within 0.3 s of its start.
        const late = hi > word.to;
        start = Math.min(Math.max(late ? word.to : word.from - len, lo), Math.max(lo, hi - len));
        end = Math.min(hi, start + len);
        if (late ? start - word.to > after : end > word.from || word.from - end > before) continue;
        cost = late ? start - word.to : 1.5 * (word.from - end);
        gap = late ? start - word.to : end - word.from;
      } else {
        start = Math.min(Math.max(wantMs, lo), Math.max(lo, hi - len));
        end = Math.min(hi, start + len);
        // After the cut: up to 4 s late. Before it: it must end at most 0.4 s before.
        if (start >= wantMs ? start - wantMs > after : end < wantMs && wantMs - end > before) continue;
        // An effect that comes early costs more than one that comes late
        cost = start >= wantMs ? start - wantMs : 1.5 * (wantMs - start);
      }
      if (!best || cost < best.cost) best = { start, end, delta: start - wantMs, gap, cost, pause: a };
    }
    if (!best) {
      dropped.push({ kind, from, wantMs: Math.round(wantMs), ...(key ? { reason: `no pause of ${MIN_EFFECT_GAP_MS / 1000} s within ${KEY_WINDOW_MS / 1000} s of its word` } : {}) });
      return;
    }
    if (taken.has(best.pause)) {
      const other = taken.get(best.pause);
      if (kind === "chapter") yielded.push({ kind, from, to: `${other.kind} effect (${other.from})` });
      else dropped.push({ kind, from, wantMs: Math.round(wantMs), reason: `its pause already holds the ${other.kind} effect (${other.from})` });
      return;
    }
    const cue = { kind, from, startMs: Math.round(best.start), endMs: Math.round(best.end), movedMs: Math.round(best.delta), ...(key ? { fromWordMs: Math.round(best.gap) } : {}) };
    taken.set(best.pause, cue);
    cues.push(cue);
  };

  const byId = new Map((storyboard?.shots ?? []).map((s) => [String(s.id), s]));
  for (const shot of timeline.shots) {
    const asked = byId.get(shot.id)?.sfx;
    if (asked === undefined) continue;
    if (!Array.isArray(asked)) {
      errors.push(`shot ${shot.id}: sfx must be a list of { kind, at }`);
      continue;
    }
    for (const fx of asked) {
      if (!SFX_KINDS.includes(fx?.kind)) {
        errors.push(`shot ${shot.id}: sfx kind "${fx?.kind}" (${SFX_KINDS.join(", ")})`);
        continue;
      }
      if (!Object.hasOwn(shot.beats, fx.at)) {
        errors.push(`shot ${shot.id}: sfx "${fx.kind}" at "${fx.at}", which is not a beat of the shot`);
        continue;
      }
      // The anchor's own words (all of them for a beat of several words);
      // a project made with an older template has only their start
      const info = shot.beatInfo?.find((b) => b.name === fx.at);
      const hint = Number.isFinite(info?.wordEndMs) ? { from: info.wordStartMs, to: info.wordEndMs } : null;
      place(fx.kind, shotStartMs(timeline, shot) + ((shot.beats[fx.at] / timeline.fps) * 1000), `shot ${shot.id}`, hint);
    }
  }
  // Chapter changes: the cut sits in the middle of the chapter pause; the
  // sound starts a little before it, with the transition.
  timeline.chapters.slice(1).forEach((c) => place("chapter", (c.from / timeline.fps) * 1000 - 120, `chapter ${c.id}`));
  cues.sort((a, b) => a.startMs - b.startMs);
  // Belt and braces: nothing placed may touch a speech range.
  for (const c of cues) {
    if (speech.some(([a, b]) => c.startMs < b && a < c.endMs)) errors.push(`${c.kind} effect (${c.from}) at ${c.startMs} ms falls on speech`);
  }
  return { cues, dropped, yielded, errors };
};

// Loudness (ITU-R BS.1770 K-weighting: a high shelf and a high-pass), over
// chosen ranges, without gating: enough to compare voice and music.
const kFilters = () => {
  const shelf = (() => {
    const f0 = 1681.974450955533;
    const G = 3.999843853973347;
    const Q = 0.7071752369554196;
    const K = Math.tan((Math.PI * f0) / SR);
    const Vh = 10 ** (G / 20);
    const Vb = Vh ** 0.4996667741545416;
    const a0 = 1 + K / Q + K * K;
    return { b0: (Vh + (Vb * K) / Q + K * K) / a0, b1: (2 * (K * K - Vh)) / a0, b2: (Vh - (Vb * K) / Q + K * K) / a0, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  })();
  const hp = (() => {
    const f0 = 38.13547087602444;
    const Q = 0.5003270373238773;
    const K = Math.tan((Math.PI * f0) / SR);
    const a0 = 1 + K / Q + K * K;
    return { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  })();
  return [shelf, hp];
};
const filterInPlace = (y, f) => {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < y.length; i++) {
    const v = f.b0 * y[i] + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = y[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
};
const kWeighted = (x) => {
  const y = Float32Array.from(x);
  for (const f of kFilters()) filterInPlace(y, f);
  return y;
};

/** Loudness in LUFS of `channels` (arrays at SR) over `ranges` in ms; -Infinity when silent. */
export const loudness = (channels, ranges) => {
  const ks = channels.map(kWeighted);
  let sum = 0;
  let n = 0;
  for (const [a, b] of ranges) {
    const i0 = Math.max(0, Math.round(msToS(a) * SR));
    const i1 = Math.min(ks[0].length, Math.round(msToS(b) * SR));
    for (let i = i0; i < i1; i++) {
      for (const k of ks) sum += k[i] * k[i];
      n++;
    }
  }
  return n && sum > 0 ? -0.691 + 10 * Math.log10(sum / n) : -Infinity;
};

/**
 * The transients of a music track (stereo, at SR, before ducking): for every
 * 5 ms, the K-weighted level above 500 Hz over the next 20 ms minus the level
 * over the 300 ms before; only where the music is audible (that 20 ms level
 * within 20 dB of the track's own loudness) and after its first second.
 * Returns { maxDb, over: count of onsets over the limit (250 ms apart),
 * at: the first few of them in seconds }.
 */
export const musicTransients = ({ L, R }, limitDb = MUSIC_TRANSIENT_LIMIT_DB) => {
  const band = (x) => {
    const y = Float32Array.from(x);
    for (let p = 0; p < 2; p++) {
      const w = (2 * Math.PI * TRANSIENT_HP_HZ) / SR;
      const al = Math.sin(w) / (2 * Math.SQRT1_2);
      const c = Math.cos(w);
      const a0 = 1 + al;
      filterInPlace(y, { b0: (1 + c) / 2 / a0, b1: -(1 + c) / a0, b2: (1 + c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0 });
    }
    return kWeighted(y);
  };
  const ks = [band(L), band(R)];
  const hop = SR / 200;
  const nh = Math.floor(ks[0].length / hop);
  const cum = new Float64Array(nh + 1);
  for (let h = 0; h < nh; h++) {
    let e = 0;
    for (let i = h * hop; i < (h + 1) * hop; i++) e += ks[0][i] * ks[0][i] + ks[1][i] * ks[1][i];
    cum[h + 1] = cum[h] + e / hop;
  }
  const level = (a, b) => {
    const m = (cum[Math.min(nh, b)] - cum[Math.max(0, a)]) / Math.max(1, Math.min(nh, b) - Math.max(0, a));
    return m > 0 ? 10 * Math.log10(m) : -Infinity;
  };
  const whole = level(0, nh);
  let maxDb = 0;
  const onsets = [];
  for (let h = 200; h + 4 <= nh; h++) {
    const now = level(h, h + 4);
    if (!(now > whole - 20)) continue;
    const rise = now - level(h - 60, h - 2);
    if (!Number.isFinite(rise)) continue;
    maxDb = Math.max(maxDb, rise);
    if (rise > limitDb) {
      const last = onsets[onsets.length - 1];
      if (last && h - last.h < 50) {
        if (rise > last.rise) Object.assign(last, { h, rise });
      } else onsets.push({ h, rise });
    }
  }
  return { maxDb: round(maxDb), limitDb, over: onsets.length, at: onsets.slice(0, 5).map((o) => round((o.h * hop) / SR)) };
};

/** Decode any audio file to stereo float at SR with ffmpeg. */
export const decodeAudio = (ffmpeg, file) => {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-nostdin", "-v", "error", "-i", file, "-vn", "-ac", "2", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 2 ** 31 - 1 });
  if (r.error) throw new Error(`cannot decode ${file}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`cannot decode ${file}: ${String(r.stderr).trim().split(/\r?\n/).pop() || `ffmpeg exit ${r.status}`}`);
  if (!r.stdout.length) throw new Error(`cannot decode ${file}: no audio in it`);
  const all = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
  const L = new Float32Array(all.length / 2);
  const R = new Float32Array(all.length / 2);
  for (let i = 0; i < L.length; i++) {
    L[i] = all[2 * i];
    R[i] = all[2 * i + 1];
  }
  return { L, R };
};

/** Write stereo float WAV (32-bit float, SR). */
export const writeWav = (file, { L, R }) => {
  mkdirSync(path.dirname(file), { recursive: true });
  const n = L.length;
  const b = Buffer.alloc(44 + n * 8);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + n * 8, 4);
  b.write("WAVEfmt ", 8, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 8, 28);
  b.writeUInt16LE(8, 32);
  b.writeUInt16LE(32, 34);
  b.write("data", 36, "ascii");
  b.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) {
    b.writeFloatLE(L[i], 44 + i * 8);
    b.writeFloatLE(R[i], 48 + i * 8);
  }
  writeFileSync(file, b);
};

/**
 * Gain curve of the music, in dB relative to its level under speech, one
 * value per ms: 0 while the voice speaks (gaps under 0.7 s count as speech),
 * up to +8 dB in a longer pause (rising 0.4 s from 0.15 s after the last
 * word, falling 0.3 s so it is down 0.1 s before the next), a 0.4 s fade-in
 * at the start and a fade to silence over the last 0.6 s.
 */
export const duckCurve = (speech, totalMs) => {
  const n = Math.ceil(totalMs) + 1;
  const db = new Float32Array(n);
  const joined = merge(speech, RISE_GAP_MS);
  const ease = (u) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2;
  const pauses = pausesOf(joined, totalMs);
  for (const [a, b] of pauses) {
    const first = a === 0;
    const lastPause = b >= totalMs;
    for (let t = Math.floor(a); t < Math.min(n, Math.ceil(b)); t++) {
      const up = first ? 1 : ease((t - a - 150) / 400);
      const down = lastPause ? 1 : ease((b - 100 - t) / 300);
      db[t] = MUSIC_RISE_DB * Math.min(up, down);
    }
  }
  const out = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    const fadeIn = ease(t / 400);
    const fadeOut = ease((totalMs - t) / 600);
    const g = 10 ** (db[t] / 20) * fadeIn * fadeOut;
    out[t] = g;
  }
  return out;
};

const applyCurve = (x, curve) => {
  for (let i = 0; i < x.length; i++) {
    const t = (i / SR) * 1000;
    const j = Math.floor(t);
    const f = t - j;
    const a = curve[Math.min(j, curve.length - 1)];
    const b = curve[Math.min(j + 1, curve.length - 1)];
    x[i] *= a + (b - a) * f;
  }
};

/** Fit a user's music file to the film: loop it with a 2 s crossfade when shorter, cut it when longer. */
const fitMusic = (track, samples) => {
  const out = { L: new Float32Array(samples), R: new Float32Array(samples) };
  const len = track.L.length;
  if (!len) return out;
  const xf = Math.min(Math.round(2 * SR), Math.floor(len / 4));
  const step = len - xf;
  for (let start = 0; start < samples; start += step) {
    for (let i = 0; i < len && start + i < samples; i++) {
      let g = 1;
      if (start > 0 && i < xf) g = i / xf;
      if (start + step < samples && i >= step) g = (len - i) / xf;
      out.L[start + i] += track.L[i] * g;
      out.R[start + i] += track.R[i] * g;
    }
  }
  return out;
};

/**
 * The user's sounds of the `kinds` asked for, decoded: { sounds: { music:
 * [{ file, L, R }], ... }, unreadable: [{ kind, file, reason }] }. A file
 * ffmpeg cannot decode (a truncated download, a protected .m4a, a codec the
 * local ffmpeg lacks) is left out, so its kind falls back to another file
 * of that kind or to the generated sound. Seen in a review: one such file
 * stopped the render with a stack trace after the whole film had rendered.
 */
export const loadUserSounds = (ffmpeg, dir, kinds = USER_KINDS) => {
  const found = userSounds(dir);
  const sounds = Object.fromEntries(USER_KINDS.map((k) => [k, []]));
  const unreadable = [];
  for (const kind of kinds) {
    for (const file of found[kind]) {
      try {
        sounds[kind].push({ file, ...decodeAudio(ffmpeg, file) });
      } catch (e) {
        unreadable.push({ kind, file: slashed(file), reason: e.message.replace(`cannot decode ${file}: `, "") });
      }
    }
  }
  return { sounds, unreadable };
};

const slashed = (p) => p.split(path.sep).join("/");

/** One line per unreadable user file: what is used instead. */
export const unreadableNotes = ({ sounds, unreadable }) =>
  unreadable.map((u) => `${u.file} cannot be decoded (${u.reason}): ${sounds[u.kind].length ? `another ${u.kind} file of audioDir` : `the generated ${u.kind === "music" ? "music" : `${u.kind} effect`}`} is used`);

/** The effect sound of a kind: the user's file when the folder has a readable one, else generated. */
export const effectSound = (kind, user, { seed, key = 0 }) => {
  const files = user[kind] ?? [];
  if (files.length) {
    const f = files[seed % files.length];
    return { L: f.L, R: f.R, source: path.basename(f.file) };
  }
  return { ...generateEffect(kind, { seed, key }), source: "generated" };
};

/**
 * The bed of a film: music (generated in `musicStyle`, or the user's) ducked
 * under the voice, plus the effects in the pauses, each at its level relative
 * to the voice. `cfg` is video.config.json (music, musicStyle, musicLevel,
 * sfx, audioDir). Returns { bed: { L, R } for the whole film, report }.
 */
export const buildBed = ({ videoDir, timeline, storyboard, cfg, ffmpeg, slug }) => {
  const t0 = Date.now();
  const seed = seedOf(slug ?? path.basename(videoDir));
  const total = timeline.totalMs;
  const samples = Math.ceil(msToS(total) * SR);
  const voice = narrationTrack(videoDir, timeline);
  const speech = speechRanges(timeline, voice);
  // The render plays the mono narration on both channels at -3 dB each
  // (measured: a clip's rendered voice at -16.9 LUFS and -4.0 dBFS peak, its
  // WAVs at -14.0 and -1.0), so it is measured that way
  const voiceLufs = loudness([voice, voice], speech) - 3.01;
  const kinds = [...(cfg.music !== false ? ["music"] : []), ...(cfg.sfx !== false ? ["chapter", ...SFX_KINDS] : [])];
  const loaded = loadUserSounds(ffmpeg, cfg.audioDir, kinds);
  const user = loaded.sounds;
  const bed = { L: new Float32Array(samples), R: new Float32Array(samples) };
  // music and effects stay null when they are off for this video
  const report = { seed, voiceLufs: round(voiceLufs), music: null, effects: null, warnings: unreadableNotes(loaded) };

  const style = STYLES[cfg.musicStyle] ? cfg.musicStyle : DEFAULT_STYLE;
  let key = 0;
  if (cfg.music !== false) {
    let music;
    let source;
    if (user.music.length) {
      const f = user.music[seed % user.music.length];
      music = fitMusic(f, samples);
      source = path.basename(f.file);
    } else {
      const sections = timeline.chapters.map((c, i) => ({ fromMs: i === 0 ? 0 : (c.from / timeline.fps) * 1000, toMs: (c.to / timeline.fps) * 1000 }));
      if (!sections.length) sections.push({ fromMs: 0, toMs: total });
      const g = generateMusic({ seed, style, sections, durationMs: total });
      music = { L: g.L.subarray(0, samples), R: g.R.subarray(0, samples) };
      key = g.key;
      source = `generated, style ${style}, key ${["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"][g.key]} major, ${g.bpm} bpm`;
    }
    // Transients, measured before the ducking (which only moves the level slowly)
    const transients = musicTransients(music);
    if (transients.over) {
      report.warnings.push(`the music has ${transients.over} note(s) that start sharply (a rise of up to ${transients.maxDb} dB, the limit is ${transients.limitDb} dB; first at ${transients.at.map((t) => `${t} s`).join(", ")}): they stand out in the pauses like sound effects${user.music.length ? "; use a smoother music file, or the generated music" : ""}`);
    }
    // Level: the music under speech sits `musicLevel` LU below the voice.
    const below = MUSIC_BELOW_VOICE[cfg.musicLevel] ?? MUSIC_BELOW_VOICE[DEFAULT_MUSIC_LEVEL];
    const curve = duckCurve(speech, total);
    applyCurve(music.L, curve);
    applyCurve(music.R, curve);
    const under = loudness([music.L, music.R], speech);
    const gain = Number.isFinite(under) && Number.isFinite(voiceLufs) ? 10 ** ((voiceLufs - below - under) / 20) : 0;
    for (let i = 0; i < samples; i++) {
      bed.L[i] += music.L[i] * gain;
      bed.R[i] += music.R[i] * gain;
    }
    // Measured on the bed, which holds only the music so far
    const musicLufs = loudness([bed.L, bed.R], speech);
    const pauses = pausesOf(merge(speech, RISE_GAP_MS), total).filter(([a, b]) => b - a >= 1000);
    report.music = {
      source,
      level: MUSIC_BELOW_VOICE[cfg.musicLevel] ? cfg.musicLevel : DEFAULT_MUSIC_LEVEL,
      underSpeechLufs: round(musicLufs),
      voiceOverMusicLu: round(voiceLufs - musicLufs),
      inLongPausesLufs: pauses.length ? round(loudness([bed.L, bed.R], pauses)) : null,
      transientDb: transients.maxDb,
      transientLimitDb: transients.limitDb,
      transientsOver: transients.over,
    };
  }

  if (cfg.sfx !== false) {
    const sounds = {};
    const lengths = {};
    for (const kind of ["chapter", ...SFX_KINDS]) {
      sounds[kind] = effectSound(kind, user, { seed, key });
      lengths[kind] = sounds[kind].L.length / SR;
    }
    const plan = planCues(timeline, storyboard, { speech, lengths });
    report.effects = [];
    report.dropped = plan.dropped;
    report.yielded = plan.yielded;
    report.errors = plan.errors;
    for (const c of plan.cues) {
      const s = sounds[c.kind];
      const start = Math.round(msToS(c.startMs) * SR);
      const n = Math.min(s.L.length, Math.round(msToS(c.endMs - c.startMs) * SR));
      // Level: the loudness of the part that plays, FX_BELOW_VOICE under the voice
      const own = loudness([s.L, s.R], [[0, (n / SR) * 1000]]);
      const gain = Number.isFinite(own) && Number.isFinite(voiceLufs) ? 10 ** ((voiceLufs - FX_BELOW_VOICE - own) / 20) : 0;
      const fade = Math.round(0.04 * SR);
      for (let i = 0; i < n && start + i < samples; i++) {
        const g = gain * (i >= n - fade && n < s.L.length ? (n - i) / fade : 1);
        bed.L[start + i] += s.L[i] * g;
        bed.R[start + i] += s.R[i] * g;
      }
      report.effects.push({ ...c, source: s.source, cut: n < s.L.length });
    }
    // Measured on the narration itself: voice energy under each effect
    report.effectsOverSpeech = report.effects.filter((c) => voiceActivity(voice.subarray(Math.round(msToS(c.startMs) * SR), Math.round(msToS(c.endMs) * SR))).length).length;
  }
  report.buildSeconds = round((Date.now() - t0) / 1000);
  return { bed, report };
};

const round = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

/**
 * Mix the rendered narration (`raw`, a video file) with the bed and write
 * `out` (WAV, float). `fromMs`: where the rendered part starts in the film
 * (a one-shot composition starts at its shot). Returns the ffmpeg result.
 */
export const mixWithBed = ({ ffmpeg, raw, bedFile, out, fromMs = 0 }) => {
  const r = spawnSync(
    ffmpeg,
    [
      "-hide_banner", "-nostdin", "-v", "error", "-y",
      "-i", raw,
      ...(fromMs > 0 ? ["-ss", (fromMs / 1000).toFixed(6)] : []),
      "-i", bedFile,
      "-filter_complex",
      "[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[v];" +
        "[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo[b];" +
        "[v][b]amix=inputs=2:normalize=0:duration=first:dropout_transition=0[m]",
      "-map", "[m]", "-c:a", "pcm_f32le", out,
    ],
    { encoding: "utf8" },
  );
  return { code: r.status, stderr: r.stderr ?? "" };
};
