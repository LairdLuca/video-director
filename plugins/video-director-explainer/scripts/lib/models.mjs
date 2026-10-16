// Voice runtime and models: where they are, how they are checked and fetched.
// Node only, no dependencies. Every model file has a pinned size and sha256.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { IS_WIN, slash, writeJson } from "./common.mjs";

const KOKORO_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0";
const WHISPER_REPO = "https://huggingface.co/Systran/faster-whisper-small/resolve";
export const WHISPER_REVISION = "536b0662742c02347bc0e980a01041f333bce120";

/** The pinned model files. `group` is the folder they live in under modelsDir. */
export const MODEL_FILES = [
  {
    group: "kokoro",
    name: "kokoro-v1.0.onnx",
    size: 325532387,
    sha256: "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5",
    url: `${KOKORO_URL}/kokoro-v1.0.onnx`,
  },
  {
    group: "kokoro",
    name: "voices-v1.0.bin",
    size: 28214398,
    sha256: "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
    url: `${KOKORO_URL}/voices-v1.0.bin`,
  },
  {
    group: "whisper-small",
    name: "config.json",
    size: 2370,
    sha256: "b55496ac7940a7ae47d2c01eab40edfd8701feec1229d9cce3b40014383fb828",
    url: `${WHISPER_REPO}/${WHISPER_REVISION}/config.json`,
  },
  {
    group: "whisper-small",
    name: "model.bin",
    size: 483546902,
    sha256: "3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671",
    url: `${WHISPER_REPO}/${WHISPER_REVISION}/model.bin`,
  },
  {
    group: "whisper-small",
    name: "tokenizer.json",
    size: 2203239,
    sha256: "fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab",
    url: `${WHISPER_REPO}/${WHISPER_REVISION}/tokenizer.json`,
  },
  {
    group: "whisper-small",
    name: "vocabulary.txt",
    size: 459861,
    sha256: "34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913",
    url: `${WHISPER_REPO}/${WHISPER_REVISION}/vocabulary.txt`,
  },
];

export const fileId = (f) => `${f.group}/${f.name}`;

export const MANIFEST = "models.json";

/** The venv's Python. */
export const venvPython = (runtimeDir) =>
  IS_WIN ? path.join(runtimeDir, "Scripts", "python.exe") : path.join(runtimeDir, "bin", "python");

/** Environment for the voice step's Python: no hub calls, no telemetry. */
export const voiceEnv = () => ({
  ...process.env,
  HF_HUB_OFFLINE: "1",
  HF_HUB_DISABLE_TELEMETRY: "1",
  DO_NOT_TRACK: "1",
});

export const sha256File = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (d) => hash.update(d))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });

const sizeOf = (file) => {
  try {
    return statSync(file).size;
  } catch {
    return -1;
  }
};

/** Files under `root` named like a pinned file and of the same size (depth-limited walk). */
export const findCandidates = (root, maxDepth = 8) => {
  const found = new Map(MODEL_FILES.map((f) => [fileId(f), []]));
  const byName = new Map();
  for (const f of MODEL_FILES) byName.set(f.name, [...(byName.get(f.name) ?? []), f]);
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth < maxDepth && e.name !== "node_modules" && !e.name.startsWith(".")) {
        walk(p, depth + 1);
      } else if (e.isFile() && byName.has(e.name)) {
        for (const f of byName.get(e.name)) if (sizeOf(p) === f.size) found.get(fileId(f)).push(p);
      }
    }
  };
  walk(path.resolve(root), 0);
  return found;
};

/**
 * Where the models of a modelsDir are: the manifest written by
 * "runtime.mjs models" if there is one, else the standard layout
 * (<modelsDir>/kokoro, <modelsDir>/whisper-small), else a search by name
 * and size. Sizes are checked here; hashes only by "runtime.mjs models".
 */
export const locateModels = (modelsDir) => {
  const paths = {};
  const manifest = path.join(modelsDir, MANIFEST);
  if (existsSync(manifest)) {
    try {
      Object.assign(paths, JSON.parse(readFileSync(manifest, "utf8")).files ?? {});
    } catch {
      /* rebuilt below */
    }
  }
  // Folders the manifest points to that are gone (seen in a test: models
  // found with --from in a folder deleted later; doctor said "missing" only)
  const goneFolders = [...new Set(Object.values(paths).filter(Boolean).map((p) => slash(path.dirname(p))))].filter((d) => !existsSync(d));
  let search = null;
  for (const f of MODEL_FILES) {
    const id = fileId(f);
    if (paths[id] && sizeOf(paths[id]) === f.size) continue;
    const standard = path.join(modelsDir, f.group, f.name);
    if (sizeOf(standard) === f.size) {
      paths[id] = slash(standard);
      continue;
    }
    search ??= existsSync(modelsDir) ? findCandidates(modelsDir) : new Map();
    paths[id] = search.get(id)?.[0] ? slash(search.get(id)[0]) : null;
  }
  const missing = MODEL_FILES.filter((f) => !paths[fileId(f)]).map(fileId);
  const whisperDir = paths["whisper-small/model.bin"] ? slash(path.dirname(paths["whisper-small/model.bin"])) : null;
  // faster-whisper loads its files from one folder
  const split = Boolean(whisperDir) && MODEL_FILES.filter((f) => f.group === "whisper-small" && paths[fileId(f)])
    .some((f) => slash(path.dirname(paths[fileId(f)])) !== whisperDir);
  return {
    missing,
    goneFolders,
    split,
    kokoroModel: paths["kokoro/kokoro-v1.0.onnx"],
    kokoroVoices: paths["kokoro/voices-v1.0.bin"],
    whisperDir,
    files: paths,
  };
};

export const writeManifest = (modelsDir, files) =>
  writeJson(path.join(modelsDir, MANIFEST), {
    about: "Model files of the voice step, each checked against its pinned sha256",
    checked: new Date().toISOString(),
    whisperRevision: WHISPER_REVISION,
    files,
  });

/** Download one pinned file to `dest`, checking size and sha256 before it gets its name. */
export const download = async (f, dest, log = console.log) => {
  mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  rmSync(part, { force: true });
  const res = await fetch(f.url, { redirect: "follow", headers: { "user-agent": "video-director-explainer-setup" } });
  if (!res.ok || !res.body) throw new Error(`${f.url}: HTTP ${res.status}`);
  const hash = createHash("sha256");
  const out = createWriteStream(part);
  let got = 0;
  let shown = 0;
  const t0 = Date.now();
  for await (const chunk of res.body) {
    hash.update(chunk);
    got += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
    const pct = Math.floor((got / f.size) * 10);
    if (f.size > 20e6 && pct > shown) {
      shown = pct;
      log(`  ${fileId(f)}: ${pct * 10}%`);
    }
  }
  await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
  const digest = hash.digest("hex");
  if (got !== f.size || digest !== f.sha256) {
    rmSync(part, { force: true });
    throw new Error(`${fileId(f)}: size ${got} sha256 ${digest}, expected ${f.size} ${f.sha256}; file removed`);
  }
  renameSync(part, dest);
  return { bytes: got, seconds: (Date.now() - t0) / 1000 };
};
