// Timeline: storyboard.json + voiceover.json -> frames.
//
// Plain JavaScript on purpose: the Remotion bundle imports it (Root.tsx) and
// so do the Node scripts (lint, stills, freeze, page), so both always agree
// on where a sentence, a shot, a beat or a caption phrase falls.
//
// Contract B (voiceover.json): sentence n+1 starts at
//   start(n) + durationMs(n) + pauseAfterMs(n),
// after a lead-in, and the video ends with a tail.
// Contract C (storyboard.json): a shot covers whole sentences, its beats are
// anchored to spoken words and resolve to frames relative to the shot.

export const LEAD_IN_MS = 250;
export const TAIL_MS = 600;
export const PAUSE_IN_CHAPTER_MS = 400;
export const PAUSE_AT_CHAPTER_MS = 800;

export const TRANSITIONS = {
  push: 13,
  wipe: 20,
  "fade-dark": 15,
};

export const SCENES = [
  "HookStatus",
  "Terminal",
  "CodeWalk",
  "FlowDiagram",
  "StrikeReplace",
  "StatusCard",
  "StepList",
  "Lesson",
  "Screenshot",
  "Custom",
];

const CAPTION_MAX_CHARS = 42;
const CAPTION_HOLD_MS = 300;
const TRAILING_PUNCT = /[,;:.!?…]+$/;
const EDGE_PUNCT = /^[("'«“‘\[]+|[)"'»”’\],;:.!?…]+$/g;

/** Lowercase and strip quotes and punctuation at the edges of a word. */
export const normalizeWord = (text) =>
  String(text).replace(EDGE_PUNCT, "").toLowerCase();

const msToFrame = (ms, fps) => Math.round((ms / 1000) * fps);

// Short function words a caption phrase should not end on ("Con kubectl
// rollout undo sul" / "deployment checkout..."): articles, prepositions and
// conjunctions of the narration languages. Unknown language: all of them.
const FUNCTION_WORDS = {
  it: "il lo la i gli le l un uno una di a da in con su per tra fra del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle col sul sullo sulla sui sugli sulle e ed o ma che",
  en: "the a an of to in on at by for with from into onto and or but as than",
  es: "el la los las un una unos unas de del a al en con por para sin sobre y e o u que",
  fr: "le la les l un une des de du d à au aux en dans sur sous avec pour par sans et ou que",
  pt: "o a os as um uma uns umas de do da dos das em no na nos nas com por para sem e ou que",
  de: "der die das den dem des ein eine einen einem einer und oder mit von zu zum zur im in an am auf für aus bei nach",
};
const functionWords = (language) => {
  const base = String(language ?? "").split("-")[0];
  const list = FUNCTION_WORDS[base] ?? Object.values(FUNCTION_WORDS).join(" ");
  return new Set(list.split(" "));
};

/**
 * Split one sentence's words into caption phrases: at punctuation first, then
 * at the space nearest the middle while a phrase is longer than 42 characters,
 * never right after a short function word of the language when another space
 * is available (the phrase would end on "sul" or "the").
 */
export const splitPhrases = (words, language) => {
  const weak = functionWords(language);
  const groups = [];
  let current = [];
  for (const w of words) {
    current.push(w);
    if (TRAILING_PUNCT.test(w.text)) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);

  const textOf = (ws) => ws.map((w) => w.text).join(" ");
  const balance = (ws) => {
    if (ws.length < 2 || textOf(ws).length <= CAPTION_MAX_CHARS) return [ws];
    const total = textOf(ws).length;
    let best = 1;
    let bestCost = Infinity;
    for (let i = 1; i < ws.length; i++) {
      const diff = Math.abs(textOf(ws.slice(0, i)).length - total / 2);
      // A split after a function word is taken only when there is no other
      const cost = diff + (weak.has(normalizeWord(ws[i - 1].text)) ? 1000 : 0);
      if (cost < bestCost) {
        best = i;
        bestCost = cost;
      }
    }
    return [...balance(ws.slice(0, best)), ...balance(ws.slice(best))];
  };
  return groups.flatMap(balance);
};

/**
 * Smooth camera curve for one shot: scale goes from `from` to `to` across the
 * visible part, with the curve's keys placed `outsideS` seconds outside the
 * shot, so the visible part never starts or stops moving.
 */
export const cameraScale = (frame, durationInFrames, fps, from = 1, to = 1.04, outsideS = 3.5) => {
  const k = outsideS * fps;
  const span = durationInFrames + 2 * k;
  const ease = (u) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2;
  const e0 = ease(k / span);
  const range = (to - from) / (1 - 2 * e0);
  const base = from - range * e0;
  return base + range * ease((frame + k) / span);
};

/**
 * Build the whole timeline. Never throws on bad data: problems are collected
 * in `errors` and `warnings`, so the lint can report all of them at once and
 * the composition can refuse to render with a clear message.
 */
export const buildTimeline = (storyboard, voiceover) => {
  const errors = [];
  const warnings = [];
  const fps = Number(storyboard?.fps) || 30;
  const width = Number(storyboard?.width) || 1920;
  const height = Number(storyboard?.height) || 1080;
  const voiceSentences = Array.isArray(voiceover?.sentences) ? voiceover.sentences : [];
  const shotsIn = Array.isArray(storyboard?.shots) ? storyboard.shots : [];

  if (!voiceSentences.length) errors.push("voiceover.json has no sentences");
  if (!shotsIn.length) errors.push("storyboard.json has no shots");

  // Sentences on the audio clock.
  const sentences = [];
  let clock = LEAD_IN_MS;
  voiceSentences.forEach((s, i) => {
    const next = voiceSentences[i + 1];
    const durationMs = Math.max(0, Number(s.durationMs) || 0);
    if (!durationMs) errors.push(`sentence ${s.id}: durationMs missing or zero`);
    const defaultPause =
      next && next.chapter !== s.chapter ? PAUSE_AT_CHAPTER_MS : PAUSE_IN_CHAPTER_MS;
    const pauseAfterMs = next
      ? Number.isFinite(s.pauseAfterMs)
        ? s.pauseAfterMs
        : defaultPause
      : 0;
    const words = (Array.isArray(s.words) ? s.words : []).map((w) => ({
      text: String(w.text ?? ""),
      startMs: clock + Number(w.startMs || 0),
      endMs: clock + Number(w.endMs || 0),
    }));
    if (!words.length) errors.push(`sentence ${s.id}: no words (needed for anchors and captions)`);
    sentences.push({
      id: String(s.id),
      chapter: s.chapter,
      file: s.file ?? null,
      shown: s.shown ?? words.map((w) => w.text).join(" "),
      timing: s.timing ?? "estimated",
      startMs: clock,
      endMs: clock + durationMs,
      durationMs,
      pauseAfterMs,
      startFrame: msToFrame(clock, fps),
      words,
    });
    clock += durationMs + pauseAfterMs;
  });
  const totalMs = (sentences.length ? sentences[sentences.length - 1].endMs : 0) + TAIL_MS;
  const durationInFrames = Math.max(1, Math.ceil((totalMs / 1000) * fps));
  const byId = new Map(sentences.map((s) => [s.id, s]));

  // Shots: whole sentences, in order, each sentence in exactly one shot.
  const used = new Map();
  const shots = [];
  shotsIn.forEach((shot, index) => {
    const id = String(shot.id ?? `shot${index + 1}`);
    const own = (Array.isArray(shot.sentences) ? shot.sentences : []).map(String);
    if (!own.length) errors.push(`shot ${id}: no sentences`);
    for (const sid of own) {
      if (!byId.has(sid)) errors.push(`shot ${id}: sentence ${sid} is not in voiceover.json`);
      if (used.has(sid)) errors.push(`shot ${id}: sentence ${sid} is already in shot ${used.get(sid)}`);
      used.set(sid, id);
    }
    if (!SCENES.includes(shot.scene)) errors.push(`shot ${id}: unknown scene "${shot.scene}"`);
    if (shot.scene === "Custom" && !shot.component) errors.push(`shot ${id}: scene Custom needs "component"`);
    const transitionIn = index === 0 ? null : shot.transitionIn ?? "push";
    if (transitionIn && !(transitionIn in TRANSITIONS)) {
      errors.push(`shot ${id}: unknown transitionIn "${transitionIn}" (push, wipe, fade-dark)`);
    }
    const theme = shot.theme === "dark" ? "dark" : "light";
    if (shot.theme && shot.theme !== "light" && shot.theme !== "dark") {
      errors.push(`shot ${id}: theme must be light or dark`);
    }
    const ss = own.map((sid) => byId.get(sid)).filter(Boolean);
    shots.push({
      index,
      id,
      chapter: shot.chapter ?? ss[0]?.chapter ?? null,
      scene: shot.scene,
      component: shot.component ?? null,
      theme,
      transitionIn,
      transitionFrames: transitionIn ? TRANSITIONS[transitionIn] ?? TRANSITIONS.push : 0,
      chapterBar: shot.chapterBar !== false,
      camera: { from: shot.camera?.from ?? 1, to: shot.camera?.to ?? 1.04 },
      props: shot.props ?? {},
      sentences: ss.map((s) => s.id),
      beatsIn: Array.isArray(shot.beats) ? shot.beats : [],
      firstSentence: ss[0] ?? null,
      lastSentence: ss[ss.length - 1] ?? null,
    });
    for (const s of ss) {
      if (shot.chapter && s.chapter && s.chapter !== shot.chapter) {
        errors.push(`shot ${id}: chapter "${shot.chapter}" but sentence ${s.id} is in "${s.chapter}"`);
      }
    }
  });
  for (const s of sentences) {
    if (!used.has(s.id)) errors.push(`sentence ${s.id} is not in any shot`);
  }
  // Shots must follow the narration order.
  for (let i = 1; i < shots.length; i++) {
    const a = shots[i - 1].lastSentence;
    const b = shots[i].firstSentence;
    if (a && b && b.startMs < a.startMs) errors.push(`shot ${shots[i].id}: sentences out of narration order`);
  }

  // Boundaries: shot i is visible from b[i] to b[i+1]; a cut sits in the
  // middle of the pause between the two shots' sentences.
  const bounds = [0];
  for (let i = 1; i < shots.length; i++) {
    const a = shots[i - 1].lastSentence;
    const b = shots[i].firstSentence;
    const mid = a && b ? (a.endMs + b.startMs) / 2 : 0;
    bounds.push(msToFrame(mid, fps));
  }
  bounds.push(durationInFrames);

  // TransitionSeries layout: each sequence starts half a transition before
  // its boundary and ends half a transition after the next one, so the
  // overlap is centred on the cut and the total length equals the audio.
  shots.forEach((shot, i) => {
    const tIn = shot.transitionFrames;
    const tOut = shots[i + 1]?.transitionFrames ?? 0;
    shot.visibleFrom = bounds[i];
    shot.visibleTo = bounds[i + 1];
    shot.from = bounds[i] - Math.floor(tIn / 2);
    const end = bounds[i + 1] - Math.floor(tOut / 2) + tOut;
    shot.durationInFrames = Math.max(1, end - shot.from);
    shot.durationS = (shot.visibleTo - shot.visibleFrom) / fps;
  });

  // Beats: anchor word -> frame relative to the shot's sequence start.
  for (const shot of shots) {
    shot.beats = {};
    shot.beatInfo = [];
    const own = shot.sentences.map((sid) => byId.get(sid));
    for (const beat of shot.beatsIn) {
      const name = String(beat.name ?? "");
      if (!name) {
        errors.push(`shot ${shot.id}: a beat has no name`);
        continue;
      }
      if (name in shot.beats) errors.push(`shot ${shot.id}: beat "${name}" defined twice`);
      const anchor = String(beat.word ?? "").trim();
      if (!anchor) {
        errors.push(`shot ${shot.id}: beat "${name}" has no anchor word`);
        continue;
      }
      let pool = own;
      if (beat.sentence) {
        const s = byId.get(String(beat.sentence));
        if (!s || !shot.sentences.includes(s.id)) {
          errors.push(`shot ${shot.id}: beat "${name}" anchors to sentence ${beat.sentence}, which is not in the shot`);
          continue;
        }
        pool = [s];
      }
      const needle = anchor.split(/\s+/).map(normalizeWord);
      const occurrence = Math.max(1, Number(beat.occurrence) || 1);
      let seen = 0;
      let hit = null;
      for (const s of pool) {
        for (let w = 0; w + needle.length <= s.words.length && !hit; w++) {
          const match = needle.every((n, k) => normalizeWord(s.words[w + k].text) === n);
          if (match && ++seen === occurrence) hit = { sentence: s, word: s.words[w] };
        }
        if (hit) break;
      }
      if (!hit) {
        errors.push(
          `shot ${shot.id}: beat "${name}" anchor "${anchor}" (occurrence ${occurrence}) not found in ${pool
            .map((s) => s.id)
            .join(", ")}`,
        );
        continue;
      }
      const frame = msToFrame(hit.word.startMs, fps) - shot.from;
      const errorMs = Math.abs(((frame + shot.from) / fps) * 1000 - hit.word.startMs);
      shot.beats[name] = frame;
      shot.beatInfo.push({
        name,
        word: anchor,
        sentence: hit.sentence.id,
        occurrence,
        frame,
        globalFrame: frame + shot.from,
        wordStartMs: Math.round(hit.word.startMs),
        errorMs: Math.round(errorMs),
        timing: hit.sentence.timing,
      });
    }
    delete shot.beatsIn;
    delete shot.firstSentence;
    delete shot.lastSentence;
  }

  // Chapters: frame ranges derived from the shots' visible ranges.
  const labels = new Map(
    (Array.isArray(storyboard?.chapters) ? storyboard.chapters : []).map((c) => [String(c.id), String(c.label ?? c.id)]),
  );
  const chapters = [];
  for (const shot of shots) {
    const last = chapters[chapters.length - 1];
    if (last && last.id === shot.chapter) {
      last.to = shot.visibleTo;
    } else {
      if (chapters.some((c) => c.id === shot.chapter)) {
        warnings.push(`chapter "${shot.chapter}" comes back after another chapter`);
      }
      chapters.push({
        id: shot.chapter,
        label: (labels.get(String(shot.chapter)) ?? String(shot.chapter ?? "")).toUpperCase(),
        from: shot.visibleFrom,
        to: shot.visibleTo,
      });
    }
  }
  for (const c of chapters) {
    if (c.label.length > 14) warnings.push(`chapter label "${c.label}" is longer than 14 characters`);
  }

  // Caption phrases on the audio clock.
  const phrases = [];
  for (const s of sentences) {
    for (const group of splitPhrases(s.words, voiceover?.language)) {
      phrases.push({
        text: group
          .map((w) => w.text)
          .join(" ")
          .replace(TRAILING_PUNCT, ""),
        fromMs: group[0].startMs,
        endMs: group[group.length - 1].endMs,
      });
    }
  }
  phrases.forEach((p, i) => {
    const next = phrases[i + 1];
    const hold = p.endMs + CAPTION_HOLD_MS;
    p.toMs = next ? Math.min(hold, next.fromMs) : hold;
    p.fromFrame = msToFrame(p.fromMs, fps);
    p.toFrame = Math.max(p.fromFrame + 1, msToFrame(p.toMs, fps));
    delete p.endMs;
  });

  return {
    fps,
    width,
    height,
    durationInFrames,
    totalMs,
    captions: storyboard?.captions !== false,
    sentences,
    shots,
    chapters,
    phrases,
    errors,
    warnings,
  };
};

/** Which shot is on screen at a global frame (by visible range). */
export const shotAt = (timeline, frame) => {
  const shots = timeline.shots;
  for (let i = shots.length - 1; i >= 0; i--) {
    if (frame >= shots[i].visibleFrom) return shots[i];
  }
  return shots[0];
};

/**
 * Linear progress of a push at which it hands over: the outgoing shot is gone
 * at 45% of the eased progress and the incoming one starts at 40%
 * (transitions.tsx), so the hand-over is at 42.5% eased. The push timing is
 * Easing.inOut(Easing.sin), (1 - cos(PI t)) / 2 below the middle.
 */
export const PUSH_HANDOVER = Math.acos(1 - 2 * 0.425) / Math.PI;

/**
 * Mix of a per-shot value (0 or 1) at a global frame: inside a shot it is the
 * shot's value; during a transition it moves linearly from the outgoing to the
 * incoming value over the transition frames. With `handover` (the theme
 * colours) a push switches at its hand-over instead, when both shots are
 * almost transparent: a linear mix showed the film background as a mid-grey
 * frame between a light and a dark shot (a test video).
 */
export const mixAt = (timeline, frame, valueOf, { handover = false } = {}) => {
  const shots = timeline.shots;
  if (!shots.length) return 0;
  for (let i = 1; i < shots.length; i++) {
    const s = shots[i];
    const start = s.from;
    const end = s.from + s.transitionFrames;
    if (frame >= start && frame < end) {
      const p = (frame - start) / Math.max(1, s.transitionFrames);
      const q = handover && s.transitionIn === "push" ? (p >= PUSH_HANDOVER ? 1 : 0) : p;
      return valueOf(shots[i - 1]) * (1 - q) + valueOf(s) * q;
    }
  }
  return valueOf(shotAt(timeline, frame));
};
