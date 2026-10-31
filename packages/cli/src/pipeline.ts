import fs from "node:fs";
import path from "node:path";
import { getLevel, getTheme, type Architecture, type Level, type Progress, type SceneAudio, type ScenePlan, type SourceDoc } from "@metual/core";
import { CostLedger, museTranscribe } from "@metual/models";
import { ingestRepo } from "@metual/ingest";
import { extractArchitecture, validateArchitecture, evidencePack, reviewArchitecture, reviseArchitecture, planRepoScenes, kindColor } from "@metual/planner";
import { pickVoice, wordOverlap, DeepgramVoice, type VoiceProvider } from "@metual/voice";
import { loadIconPack, mergePacks, iconCatalog, resolveIcon, compose, captureFrames, mixNarration, encodeMp4, contactSheet, toExcalidraw, type IconPack, type SourceShot } from "@metual/render";

export interface RunOptions {
  input: string;
  level?: Level;
  theme?: string;
  out?: string;
  name?: string;
  voice?: string;
  iconPacks?: string[];
  fresh?: boolean;
  workers?: number;
  qa?: boolean;
  progress?: Progress;
}

const FALLBACK_ICON: Record<string, string> = {
  client: "browser", edge: "globe", api: "server", worker: "gear", db: "database", "object-storage": "bucket", cache: "cache", queue: "queue",
  search: "search", auth: "lock", "third-party": "cloud", ai: "brain", realtime: "bolt", cron: "clock", cdn: "globe", analytics: "chart", email: "mail", ci: "gear",
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export function detectKind(input: string): "repo" | "x-post" | "article" {
  if (/^(https?:\/\/)?(www\.)?(x|twitter)\.com\/[^/]+\/status\/\d+/i.test(input)) return "x-post";
  if (/^(https?:\/\/)?(www\.)?github\.com\//i.test(input) || fs.existsSync(input)) return "repo";
  return "article";
}

export async function runMetual(o: RunOptions) {
  const level = getLevel(o.level ?? "new");
  const theme = getTheme(o.theme);
  const ledger = new CostLedger();
  // every progress event carries the running cost (the cost meter in the CLI and web app)
  let voiceRef: VoiceProvider | undefined;
  const spend = () => {
    const meta = ledger.total, voice = voiceRef instanceof DeepgramVoice ? voiceRef.usd : 0;
    return { meta: Number(meta.toFixed(4)), voice: Number(voice.toFixed(4)), total: Number((meta + voice).toFixed(4)) };
  };
  const P: Progress = (e) => o.progress?.({ ...e, usd: spend() });
  const t0 = Date.now();
  const pack: IconPack = o.iconPacks?.length ? mergePacks([loadIconPack(), ...o.iconPacks.map((d) => loadIconPack(d))]) : loadIconPack();
  const kind = detectKind(o.input);
  const cacheJson = <T>(file: string, make: () => Promise<T>): Promise<T> => {
    if (!o.fresh && fs.existsSync(file)) return Promise.resolve(JSON.parse(fs.readFileSync(file, "utf8")));
    return make().then((v) => { fs.writeFileSync(file, JSON.stringify(v, null, 1)); return v; });
  };

  let plan: ScenePlan & { repairs?: string[] };
  let arch: Architecture | undefined;
  let doc: SourceDoc;
  let shot: SourceShot | undefined;
  let out: string;
  let sourceLabel: string;
  const notes: string[] = [];

  if (kind === "repo") {
    P({ stage: "ingest", message: "reading the repository", pct: 2 });
    const r = await ingestRepo(o.input);
    doc = r;
    const name = o.name ?? r.title;
    sourceLabel = o.name ? `github.com/${o.name}` : r.url.replace(/^https?:\/\//, "");
    out = o.out ?? path.resolve("metual-out", slug(name) + "-" + level.id);
    fs.mkdirSync(out, { recursive: true });
    notes.push(`digest: ${r.digest.files.length} files, ${r.digest.text.length} chars; ${r.digest.skippedSecret.length} secret-looking files never opened`);
    const resolve = (n: string) => resolveIcon(pack, n);
    const fb = (k: string) => FALLBACK_ICON[k] ?? "box";
    arch = await cacheJson(path.join(out, "architecture.json"), async () => {
      P({ stage: "architecture", message: "Muse Spark is mapping the architecture", pct: 8 });
      let a = await extractArchitecture({ ledger, digest: r.digest.text, name, level: level.id as Level, icons: iconCatalog(pack), progress: P });
      let v = validateArchitecture(a, r.digest.files, resolve, fb);
      P({ stage: "review", message: "second pass: checking every box against the code", pct: 20 });
      const rev = await reviewArchitecture({ ledger, arch: v.arch, evidence: evidencePack(v.arch, r.digest.read), level: level.id as Level, progress: P });
      notes.push(`review verdict: ${rev.verdict}; ${rev.issues.length} issues; validator: ${v.issues.length} fixes`);
      if (rev.verdict === "revise" && rev.issues.length) {
        P({ stage: "review", message: `fixing ${rev.issues.length} review issues`, pct: 26 });
        a = await reviseArchitecture({ ledger, arch: v.arch, issues: [...rev.issues, ...v.issues], digest: r.digest.text, name, level: level.id as Level, icons: iconCatalog(pack), progress: P });
        v = validateArchitecture(a, r.digest.files, resolve, fb);
      }
      fs.writeFileSync(path.join(out, "review.json"), JSON.stringify({ review: rev, validator: v.issues }, null, 1));
      return v.arch;
    });
    plan = await cacheJson(path.join(out, "plan.json"), () => {
      P({ stage: "plan", message: "writing the scene plan", pct: 32 });
      return planRepoScenes({ ledger, arch: arch!, level: level.id as Level, progress: P });
    });
  } else {
    const { ingestConcept } = await import("@metual/ingest");
    const { planConceptScenes } = await import("@metual/planner");
    P({ stage: "ingest", message: kind === "x-post" ? "reading the post" : "reading the article", pct: 2 });
    const tmpOut = o.out ?? path.resolve("metual-out", "tmp-" + Date.now());
    fs.mkdirSync(tmpOut, { recursive: true });
    const c = await ingestConcept(o.input, tmpOut);
    doc = c.doc;
    out = o.out ?? path.resolve("metual-out", slug(o.name ?? doc.title) + "-" + level.id);
    if (out !== tmpOut) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.rmSync(out, { recursive: true, force: true }); fs.renameSync(tmpOut, out); }
    sourceLabel = doc.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60);
    plan = await cacheJson(path.join(out, "plan.json"), () => {
      P({ stage: "plan", message: "Muse Spark is planning the explainer", pct: 15 });
      return planConceptScenes({ ledger, doc, level: level.id as Level, icons: iconCatalog(pack), progress: P });
    });
    P({ stage: "plan", message: "finding the quoted lines on the page", pct: 30 });
    const quotes = plan.scenes.flatMap((s) => s.highlights.map((h) => h.quote));
    shot = await c.locate(quotes, path.join(out, "source.png"));
  }

  // ---------- voice ----------
  let voice: VoiceProvider = pickVoice(o.voice);
  voiceRef = voice;
  P({ stage: "voice", message: voice.id === "silent" ? "no voice: timing captions at speaking pace" : "recording the voiceover (Deepgram Aura)", pct: 36 });
  const audioDir = path.join(out, "audio");
  const audio: SceneAudio[] = [];
  const queue = [...plan.scenes];
  await Promise.all([0, 1, 2, 3].map(async () => {
    for (let s = queue.shift(); s; s = queue.shift()) audio.push(await voice.synthesize(s.id, s.narration, audioDir));
  }));
  audio.sort((a, b) => plan.scenes.findIndex((s) => s.id === a.sceneId) - plan.scenes.findIndex((s) => s.id === b.sceneId));

  // ---------- compose + render ----------
  P({ stage: "compose", message: "laying out the canvas", pct: 44 });
  const { film, sketch, timeline } = await compose({
    plan, audio, theme, level, pack, sourceLabel, arch, shot,
    colorOf: (c) => kindColor(c.kind) as any,
  });
  fs.writeFileSync(path.join(out, "film.json"), JSON.stringify({ ...film, fonts: undefined, elements: film.elements.length }, null, 1));
  const base = slug(o.name ?? plan.title) || "metual";
  const exc = toExcalidraw(sketch, { background: theme.background, ink: theme.ink, muted: theme.colors.gray, edgeLabel: theme.edgeLabel });
  const excFile = path.join(out, `${base}.excalidraw`);
  fs.writeFileSync(excFile, JSON.stringify(exc));

  const frames = path.join(out, "frames");
  fs.rmSync(frames, { recursive: true, force: true });
  P({ stage: "render", message: "drawing frames", pct: 48 });
  const cap = await captureFrames(film, frames, { workers: o.workers, onProgress: (d, t) => P({ stage: "render", message: `drawing frames ${d}/${t}`, pct: 48 + Math.round((d / t) * 42) }) });
  let narration: string | undefined;
  if (audio.some((a) => a.file)) {
    narration = path.join(out, "narration.wav");
    mixNarration(audio.filter((a) => a.file).map((a) => ({ file: a.file!, at: timeline.find((t) => t.id === a.sceneId)!.start + 0.3 })), film.duration, narration);
  }
  P({ stage: "encode", message: "encoding the mp4", pct: 92 });
  const mp4 = path.join(out, `${base}.mp4`);
  await encodeMp4(frames, film.fps, mp4, narration);
  const sheet = path.join(out, `${base}.contact.jpg`);
  await contactSheet(mp4, sheet, Math.max(2, Math.ceil(film.duration / 40)));
  fs.copyFileSync(cap.html, path.join(out, "stage.html"));
  fs.rmSync(frames, { recursive: true, force: true });

  // ---------- QA: Muse Transcribe listens to the final voiceover ----------
  let qa: Record<string, unknown> | undefined;
  if (narration && o.qa !== false) {
    P({ stage: "qa", message: "Muse Transcribe is checking the voiceover", pct: 96 });
    try {
      const script = plan.scenes.map((s) => s.narration).join(" ");
      const tr = await museTranscribe({ ledger, step: "voice-qa", wav: fs.readFileSync(narration), durationSec: film.duration, keywords: (arch?.components ?? []).map((c) => c.keyword) });
      qa = { overlap: Number(wordOverlap(script, tr.transcript).toFixed(3)), transcript: tr.transcript };
    } catch (e) { qa = { error: String(e).slice(0, 300) }; }
  }

  const voiceUsd = voice instanceof DeepgramVoice ? voice.usd : 0;
  const manifest = {
    tool: "metual", input: o.input, kind, level: level.id, theme: theme.id, title: plan.title, durationSec: Number(film.duration.toFixed(1)),
    outputs: { mp4, excalidraw: excFile, contactSheet: sheet, plan: path.join(out, "plan.json"), architecture: arch ? path.join(out, "architecture.json") : undefined },
    scenes: timeline, repairs: plan.repairs ?? [], notes, qa,
    cost: { metaUsd: Number(ledger.total.toFixed(4)), byModel: ledger.byModel(), entries: ledger.entries, voiceUsd: Number(voiceUsd.toFixed(4)), voice: voice.id },
    seconds: Math.round((Date.now() - t0) / 1000),
  };
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 1));
  P({ stage: "done", message: "done", pct: 100 });
  return manifest;
}
