import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  getTheme,
  formatCap,
  estimateFilmSeconds,
  resolveLook,
  titleForPlan,
  trimPlanToCap,
  looksLikeTopic,
  isThisFeatureQuestion,
  isVagueQuestion,
  narrationLanguage,
  specFromBrief,
  withLegacyDir,
  userCacheDir,
  copyeditPlan,
  buildFactsManifest,
  DEFAULT_BRIEF,
  type Ask,
  type Brief,
  type ExplainSpec,
  type Architecture,
  type Progress,
  type SceneAudio,
  type ScenePlan,
  type SourceDoc,
  type SourceKind,
  type FactsManifest,
} from "@explanimate/core";
import { CostLedger, museTranscribe } from "@explanimate/models";
import { ingestRepo, collectWorkingChanges, formatWorkingChanges } from "@explanimate/ingest";
import {
  planBrief,
  extractArchitecture,
  validateArchitecture,
  evidencePack,
  reviewArchitecture,
  fixArchitecture,
  planRepoScenes,
  respeak,
  planFocus,
  planWhatIf,
  kindColor,
  checkBeats,
  fixNarration,
  readmeExcerpt,
  groundToReadme,
  dropUntiedSides,
} from "@explanimate/planner";
import { pickVoice, wordOverlap, voiceUsd, type VoiceProvider } from "@explanimate/voice";
import {
  captionMismatches,
  loadIconPack,
  mergePacks,
  builtinPackIds,
  detectComponents,
  packHints,
  type DetectedComponent,
  iconCatalog,
  resolveIcon,
  compose,
  renderFilm,
  mixNarration,
  sfxCues,
  contactSheet,
  frameCheck,
  checkTldr,
  checkExcalidraw,
  toExcalidraw,
  toTldraw,
  type IconPack,
  type SourceShot,
} from "@explanimate/render";

export interface RunOptions {
  input: string;
  out?: string;
  name?: string;
  /** only explain this subfolder inside the repo, e.g. "packages/cli" */
  path?: string;
  /** "dark" renders on a black board; otherwise the brief picks the look */
  look?: "dark" | "default";
  voice?: string;
  /** extra icon/component packs: built-in ids (cloudflare, cloud-generic) or folders. Default: every built-in pack, used only where it detects something */
  packs?: string[];
  fresh?: boolean;
  workers?: number;
  qa?: boolean;
  /** also send a handful of rendered frames to Muse Spark for a look-over (costs money; off by default) */
  visionReview?: boolean;
  /** what the viewer said they want: goal, audience, depth, anything else to cover */
  ask?: Ask;
  /** false: no music bed under the voice */
  music?: boolean;
  /** false: no sound effects (soft pops as parts are drawn, whooshes as the dot moves) */
  sfx?: boolean;
  progress?: Progress;
  /** follow-up clips reuse an earlier repo run's architecture.json from this folder */
  from?: string;
  /** 15-20 s deep dive on one component id (needs `from`) */
  focus?: string;
  /** "what if traffic grew 10x?" scale scenes on the existing diagram (needs `from`) */
  whatIf?: "10x" | "100x";
}

const FALLBACK_ICON: Record<string, string> = {
  client: "browser",
  edge: "globe",
  api: "server",
  worker: "gear",
  db: "database",
  "object-storage": "bucket",
  cache: "cache",
  queue: "queue",
  search: "search",
  auth: "lock",
  "third-party": "cloud",
  ai: "brain",
  realtime: "bolt",
  cron: "clock",
  cdn: "globe",
  analytics: "chart",
  email: "mail",
  ci: "gear",
};

/**
 * Plans are shared across output folders per repo commit: the same repo at the same commit, asked the
 * same way, by the same planner code, gets the same brief, architecture and scene plan for $0.
 * EXPLANIMATE_PLAN_CACHE=0 or --fresh skips reading it.
 */
export const PLAN_CACHE = process.env.EXPLANIMATE_PLAN_CACHE_DIR ?? userCacheDir("plans");
/** default output folder, resolved when a run starts: an existing pre-rename folder is still used. */
const defaultOutRoot = () => withLegacyDir(path.resolve("explanimate-out"), path.resolve("explainlike-out"));
let engineId: string | undefined;
/** a fingerprint of the planner and core sources, so a prompt change never reuses an old plan */
function plannerFingerprint(): string {
  if (engineId) return engineId;
  const h = crypto.createHash("sha256");
  for (const pkg of ["planner", "core"]) {
    const dir = fileURLToPath(new URL(`../../${pkg}/src/`, import.meta.url));
    if (!fs.existsSync(dir)) {
      h.update(`${pkg}:missing`);
      continue;
    }
    for (const f of fs
      .readdirSync(dir)
      .filter((x) => x.endsWith(".ts"))
      .sort())
      h.update(f).update(fs.readFileSync(path.join(dir, f)));
  }
  return (engineId = h.digest("hex").slice(0, 16));
}
export function planCacheDir(o: { url: string; commit: string; ask?: Ask; path?: string }): string | undefined {
  // only a pushed commit is a stable key; a local folder may have uncommitted edits
  if (process.env.EXPLANIMATE_PLAN_CACHE === "0" || !/^https?:\/\//.test(o.url) || !/^[0-9a-f]{40}$/.test(o.commit)) return undefined;
  const base = [o.url.replace(/\.git$/, "").toLowerCase(), o.commit, o.ask ?? null, plannerFingerprint()];
  const key = crypto
    .createHash("sha256")
    .update(JSON.stringify(o.path ? [...base, o.path] : base))
    .digest("hex")
    .slice(0, 24);
  return path.join(PLAN_CACHE, key);
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

const EMPTY_ARCH: Architecture = {
  product: "",
  one_liner: "",
  components: [],
  connections: [],
  walkthrough: { name: "", steps: [] },
  scale: [],
};

export function detectKind(input: string): SourceKind {
  if (/^(https?:\/\/)?(www\.)?(x|twitter)\.com\/[^/]+\/status\/\d+/i.test(input)) return "x-post";
  if (/^(https?:\/\/)?(www\.)?github\.com\//i.test(input) || fs.existsSync(input)) return "repo";
  return looksLikeTopic(input) ? "topic" : "article";
}

export async function runExplanimate(o: RunOptions) {
  const ledger = new CostLedger();
  // every progress event carries the running cost (the cost meter in the CLI and web app)
  // eslint-disable-next-line prefer-const -- assigned once where the voice is built, read by the spend closure
  let voiceRef: VoiceProvider | undefined;
  const spend = () => {
    const meta = ledger.total,
      voice = voiceRef ? voiceUsd(voiceRef) : 0;
    return { meta: Number(meta.toFixed(4)), voice: Number(voice.toFixed(4)), total: Number((meta + voice).toFixed(4)) };
  };
  const P: Progress = (e) => o.progress?.({ ...e, usd: spend() });
  const t0 = Date.now();
  // wall-clock per stage (start and length, seconds from the run's start), so a slow stage shows up in the manifest
  const stages: { stage: string; at: number; seconds: number }[] = [];
  const timed = async <T>(stage: string, f: () => Promise<T> | T): Promise<T> => {
    const a = Date.now();
    try {
      return await f();
    } finally {
      stages.push({ stage, at: Number(((a - t0) / 1000).toFixed(1)), seconds: Number(((Date.now() - a) / 1000).toFixed(1)) });
    }
  };
  const extra = (o.packs ?? builtinPackIds()).map((d) => loadIconPack(d));
  const pack: IconPack = mergePacks([loadIconPack(), ...extra]);
  let detected: DetectedComponent[] = [];
  let input = o.input;
  let ask = o.ask;
  let kind = detectKind(input);
  let shared: string | undefined;
  // a rewrite of the cached plan: --fresh, or working changes that moved on since the plan was made
  let fresh = !!o.fresh;
  // a cached plan gets the newest speech check too; only a scene it rewrites is voiced again
  const recheckSpeech = async (a?: Architecture) => {
    const r = await respeak({ ledger, plan: plan!, arch: a, audience: spec.audience });
    if (r.note) notes.push(r.note);
    // a rewrite can bring back a slip the planner had tidied, so the copyedit runs on whatever is voiced
    const ce = copyeditPlan(r.plan);
    if (ce.changed.length) notes.push(`copyedit: ${ce.changed.join(", ")} tidied`);
    if (r.changed.length || ce.changed.length) {
      plan = ce.plan;
      writeAtomic(path.join(out, "plan.json"), JSON.stringify(plan, null, 1));
    }
  };
  const cacheJson = <T>(file: string, make: () => Promise<T>): Promise<T> => {
    // a crashed run restarted with the same --out picks up every paid step it already finished,
    // and a new folder for a repo commit that was planned before picks up the shared plan
    const sharedFile = shared && path.join(shared, path.basename(file));
    for (const f of fresh ? [] : [file, sharedFile]) {
      if (!f || !fs.existsSync(f)) continue;
      try {
        const v = JSON.parse(fs.readFileSync(f, "utf8"));
        if (f !== file) {
          writeAtomic(file, JSON.stringify(v, null, 1));
          notes.push(`reused ${path.basename(file)} planned earlier for this commit`);
        }
        return Promise.resolve(v);
      } catch {
        /* half-written by a crash: make it again */
      }
    }
    return make().then((v) => {
      writeAtomic(file, JSON.stringify(v, null, 1));
      if (sharedFile) {
        fs.mkdirSync(shared!, { recursive: true });
        writeAtomic(sharedFile, JSON.stringify(v));
      }
      return v;
    });
  };

  let plan: ScenePlan & { repairs?: string[] };
  let arch: Architecture | undefined;
  let beatSource = "";
  let doc: SourceDoc;
  let shot: SourceShot | undefined;
  let out: string;
  let sourceLabel: string;
  let repoDir: string | undefined;
  const notes: string[] = [];
  // the engine decides how to explain: approach, depth, tempo and look come from Muse Spark's brief
  let spec: ExplainSpec = specFromBrief(DEFAULT_BRIEF, undefined, kind);
  // a bare working-changes question ("explain my current changes") is about this checkout
  if (!fs.existsSync(input) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    if (isThisFeatureQuestion(input)) {
      ask = { ...ask, goal: ask?.goal ? `${ask.goal} (${input.trim()})` : input.trim() };
      input = process.cwd();
      kind = detectKind(input);
    } else if (isVagueQuestion(input)) {
      throw new Error(
        `Tell me what to explain: a GitHub repo link, a folder, an article link, or a topic in words (like "how DNS works"). "${input.trim().slice(0, 80)}" is not enough to go on.`,
      );
    }
  }
  // a vague goal ("explain", "?") asks for nothing specific: make the general explainer
  if (ask?.goal && isVagueQuestion(ask.goal)) {
    notes.push(`the question ("${ask.goal.trim().slice(0, 80)}") asks for nothing specific; making the general explainer`);
    const { goal: _goal, ...rest } = ask;
    ask = Object.values(rest).some(Boolean) ? rest : undefined;
  }
  // a non-English question is narrated in its language when the voice speaks it, else in English
  const voiceModel =
    o.voice === "silent"
      ? "silent"
      : o.voice === "deepgram" || (!o.voice && process.env.DEEPGRAM_API_KEY)
        ? (process.env.EXPLANIMATE_VOICE ?? "aura-2-arcas-en")
        : "silent";
  const lang = narrationLanguage(ask, voiceModel);
  if (lang.note) notes.push(lang.note);
  const decide = async (file: string, kindOf: SourceKind, name: string, text: string) => {
    const b = await timed("brief", () => cacheJson<Brief>(file, () => planBrief({ ledger, kind: kindOf, name, text, ask, progress: P })));
    spec = specFromBrief(b, ask, kindOf);
    if (lang.instruction) spec = { ...spec, voice: `${spec.voice} ${lang.instruction}` };
    notes.push(`brief: ${b.approach}, ${b.depth} (${spec.format}), ${b.complexity} -> ${spec.tempo.id} tempo, ${b.look}; ${b.why}`);
  };

  if (kind === "repo") {
    P({ stage: "ingest", message: "reading the repository", pct: 2 });
    const r = await timed("ingest", () => ingestRepo(input, { subpath: o.path }));
    doc = r;
    if (!o.focus && !o.whatIf) shared = planCacheDir({ url: r.url, commit: r.commit ?? "", ask, path: r.subpath });
    const name = o.name ?? r.title;
    // a repo URL shows itself; a local checkout shows --name or its folder name, never the path on this machine
    sourceLabel = /^https?:\/\//.test(r.url)
      ? r.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\.git$/, "") + (r.subpath ? `/${r.subpath}` : "")
      : o.name
        ? `github.com/${o.name}` + (r.subpath ? `/${r.subpath}` : "")
        : r.title;
    out = o.out ?? path.join(defaultOutRoot(), slug(name));
    fs.mkdirSync(out, { recursive: true });
    if (r.subpath) notes.push(`scoped to folder "${r.subpath}": only its files are read and explained`);
    notes.push(
      `digest: ${r.digest.files.length} files${r.digest.truncated ? " (list capped; the repo has more)" : ""}, ${r.digest.text.length} chars; ${r.digest.skippedSecret.length} secret-looking files never opened`,
    );
    // a working-changes question makes the branch's diff the video's subject, ahead of the repo itself
    let src = r.digest.text;
    const featureGoal = ask?.goal && isThisFeatureQuestion(ask.goal) ? ask.goal : undefined;
    if (featureGoal && r.repoDir && !o.focus && !o.whatIf) {
      const wc = collectWorkingChanges(r.repoDir);
      if (!wc) notes.push(`"${name}" is not a git checkout, so there is no branch or diff to show; explaining its files instead`);
      else if (!wc.hasChanges && !wc.commits.length)
        notes.push(`no working changes and no recent commits on "${wc.branch}"; explaining the repo as it stands`);
      else {
        const section = formatWorkingChanges(wc, featureGoal);
        src = `${section}\n\n${r.digest.text}`;
        notes.push(
          wc.hasChanges
            ? `explaining the working changes on branch "${wc.branch}"${wc.base ? ` (against ${wc.base})` : ""}: ${wc.stats.length} file(s)${wc.statsTruncated ? "+" : ""}, ${wc.untracked.length} new file(s)${wc.untrackedTruncated ? "+" : ""}, ${wc.commits.length} commit(s)`
            : `no uncommitted changes on "${wc.branch}"; explaining its latest ${wc.commits.length} commit(s)`,
        );
        // working changes change: a plan cached for other changes must not be reused
        const key = crypto.createHash("sha1").update(section).digest("hex");
        const keyFile = path.join(out, ".changes-key");
        if (!fs.existsSync(keyFile) || fs.readFileSync(keyFile, "utf8") !== key) {
          fresh = true;
          writeAtomic(keyFile, key);
        }
      }
    }
    detected = detectComponents(extra, r.digest.files, (f) => r.digest.read(f, 60_000));
    if (detected.length) notes.push(`packs detected: ${detected.map((d) => `${d.pack}/${d.component.id}`).join(", ")}`);
    const hints = packHints(detected);
    const readmeFile = r.digest.files.find((f) => /^readme(\.md|\.markdown|\.txt)?$/i.test(f));
    const readme = () => (readmeFile ? readmeExcerpt(r.digest.read(readmeFile, 200_000)) : "");
    const resolve = (n: string) => resolveIcon(pack, n);
    const fb = (k: string) => FALLBACK_ICON[k] ?? "box";
    beatSource = `${src}\n${readme()}`;
    if (o.focus || o.whatIf) {
      // follow-up clip: same diagram as the earlier run, new scenes
      const archFile = path.join(o.from ?? out, "architecture.json");
      if (!fs.existsSync(archFile)) throw new Error(`follow-up clips need an earlier run: ${archFile} not found (pass --from <out dir>)`);
      arch = JSON.parse(fs.readFileSync(archFile, "utf8")) as Architecture;
      const briefFile = path.join(o.from ?? out, "brief.json");
      if (fs.existsSync(briefFile)) spec = specFromBrief(JSON.parse(fs.readFileSync(briefFile, "utf8")), ask, "repo");
      // a re-run of the same follow-up into the same folder reuses its plan, so re-rendering costs nothing
      const key = o.focus ? `focus:${o.focus}` : `what-if:${o.whatIf}`;
      const done = path.join(out, "follow-up.json");
      const prev =
        fs.existsSync(done) && !o.fresh
          ? (JSON.parse(fs.readFileSync(done, "utf8")) as { key: string; plan: typeof plan; arch: Architecture })
          : undefined;
      if (prev?.key === key) {
        plan = prev.plan;
        arch = prev.arch;
      } else if (o.focus) {
        const c = arch.components.find((x) => x.id === o.focus);
        if (!c) throw new Error(`no component "${o.focus}"; try one of: ${arch.components.map((x) => x.id).join(", ")}`);
        const near = new Set([c.id, ...arch.connections.flatMap((x) => (x.from === c.id ? [x.to] : x.to === c.id ? [x.from] : []))]);
        const sub = { ...arch, components: arch.components.filter((x) => near.has(x.id)), connections: [], scale: [] };
        const evidence = evidencePack(sub as Architecture, r.digest.read, 14000);
        plan = await planFocus({ ledger, arch, id: c.id, evidence, audience: spec.audience, progress: P });
        arch = { ...arch, scale: [] };
      } else {
        const w = await planWhatIf({
          ledger,
          arch,
          factor: o.whatIf!,
          evidence: evidencePack({ ...arch, scale: [] }, r.digest.read, 20000),
          audience: spec.audience,
          progress: P,
        });
        arch = w.arch;
        plan = w.plan;
      }
      plan = copyeditPlan(plan).plan;
      fs.writeFileSync(path.join(out, "plan.json"), JSON.stringify(plan, null, 1));
      fs.writeFileSync(path.join(out, "architecture.json"), JSON.stringify(arch, null, 1));
      fs.writeFileSync(done, JSON.stringify({ key, plan, arch }));
    } else {
      await decide(path.join(out, "brief.json"), "repo", name, src);
      arch = await timed("architecture", () =>
        cacheJson(path.join(out, "architecture.json"), async () => {
          P({ stage: "architecture", message: "Muse Spark is mapping the architecture", pct: 8 });
          const a = await extractArchitecture({ ledger, digest: src, name, spec, icons: iconCatalog(pack), hints, progress: P });
          const check = (x: Architecture) => validateArchitecture(x, r.digest.files, resolve, fb, r.digest.read);
          let v = check(a);
          P({ stage: "review", message: "second pass: checking every box against the code", pct: 20 });
          // the review sees what the file check could not fix (action names, arrows against the code) and fixes it in the same call
          // a review that times out twice keeps the file-checked map rather than failing the whole run
          const kept = {
            verdict: "ok" as const,
            issues: [] as { target: string; problem: string; fix: string }[],
            changes: { upsert: 0, removed: 0, walkthrough: false, scale: false },
            architecture: v.arch,
          };
          const rev = await reviewArchitecture({
            ledger,
            arch: v.arch,
            evidence: evidencePack(v.arch, r.digest.read),
            digest: src,
            name,
            found: [...v.issues, ...v.open],
            spec,
            icons: iconCatalog(pack),
            hints,
            progress: P,
          }).catch((e: Error) => (notes.push(`review skipped (${e.message.slice(0, 120)}); the file-checked map is kept`), kept));
          notes.push(
            `review verdict: ${rev.verdict}; ${rev.issues.length} issues; ${rev.changes.upsert} item(s) changed or added, ${rev.changes.removed} dropped${rev.changes.walkthrough ? ", walkthrough redone" : ""}${rev.changes.scale ? ", scale redone" : ""}; validator: ${v.issues.length} fixes, ${v.open.length} open`,
          );
          const first = [...v.issues, ...v.open];
          if (rev.verdict === "revise" || first.length) v = check(rev.architecture);
          // what is still wrong after the review gets one short call aimed at just those problems
          let fixed: Awaited<ReturnType<typeof fixArchitecture>> | undefined;
          if (v.open.length) {
            const open = v.open;
            fixed = await fixArchitecture({
              ledger,
              arch: v.arch,
              open,
              read: r.digest.read,
              spec,
              icons: iconCatalog(pack),
              hints,
              progress: P,
            }).catch((e: Error) => (notes.push(`map fix skipped (${e.message.slice(0, 120)})`), undefined));
            if (fixed) v = check(fixed.architecture);
            notes.push(
              `map fix: ${open.length} problem(s) sent, ${v.open.length} left${v.open.length ? `: ${v.open.map((i) => i.problem).join("; ")}` : ""}`,
            );
          }
          v.issues.unshift(...first);
          fs.writeFileSync(
            path.join(out, "review.json"),
            JSON.stringify(
              { review: { verdict: rev.verdict, issues: rev.issues }, fix: fixed?.issues ?? [], validator: v.issues, open: v.open },
              null,
              1,
            ),
          );
          // a box the model drew from a detected pack component gets that pack's icon, so the same block always looks the same
          for (const c of v.arch.components) {
            const d = detected.find(
              (x) =>
                x.component.kind === c.kind &&
                (c.evidence.some((e) => x.evidence.includes(e)) || c.name.toLowerCase().includes(x.component.name.toLowerCase())),
            );
            if (d && resolve(d.component.icon)) c.icon = resolve(d.component.icon)!;
          }
          return v.arch;
        }),
      );
      // the video covers the core and what the README puts up front; the rest of the map waits for a follow-up
      if (readmeFile) {
        const g = groundToReadme(arch!, r.digest.read(readmeFile, 200_000));
        arch = g.arch;
        if (g.dropped.length) notes.push(`scope: ${g.dropped.join("; ")}`);
      }
      {
        const u = dropUntiedSides(arch!);
        arch = u.arch;
        if (u.dropped.length) notes.push(`scope: ${u.dropped.join("; ")}`);
      }
      let commitDate: string | undefined;
      try {
        commitDate = execFileSync("git", ["-C", r.repoDir!, "log", "-1", "--format=%ci"], { encoding: "utf8" }).trim();
      } catch {
        /* local folder without git history: the manifest skips the commit date */
      }
      const manifest: FactsManifest = buildFactsManifest({
        repoUrl: r.url,
        commit: r.commit,
        commitDate,
        readme: readme(),
        digestText: src,
        files: r.digest.files,
        read: (p, max) => r.digest.read(p, max),
        subpath: r.subpath,
      });
      writeAtomic(path.join(out, "facts.json"), JSON.stringify(manifest, null, 1));
      notes.push(`facts: ${manifest.length} anchors (numbers the script may state)`);
      plan = await timed("scene plan", () =>
        cacheJson(path.join(out, "plan.json"), () => {
          P({ stage: "plan", message: "writing the scene plan", pct: 32 });
          return planRepoScenes({
            ledger,
            arch: arch!,
            spec,
            readme: readme(),
            source: src,
            manifest,
            progress: P,
            read: (p, max) => r.digest.read(p, max),
          });
        }),
      );
      await recheckSpeech(arch);
      // the speech check may have reworded a line: each line's visual is cut and checked again against what is said
      const beats = checkBeats(plan, { arch: arch!, source: `${src}\n${readme()}`, wps: spec.tempo.wps });
      plan = { ...plan, scenes: beats.plan.scenes };
      if (beats.report.beats)
        notes.push(
          `line visuals: ${beats.report.beats} lines, ${beats.report.cards} cards, about ${beats.report.perMinute} changes a minute (${Object.entries(
            beats.report.types,
          )
            .map(([k, n]) => `${k} ${n}`)
            .join(
              ", ",
            )})${beats.report.repairs.length ? `; fixed: ${beats.report.repairs.join("; ")}` : ""}${beats.report.issues.length ? `; open: ${beats.report.issues.join("; ")}` : ""}`,
        );
      const chk = (plan as { check?: { first: string[]; final: string[]; revised: boolean } }).check;
      // plain part names chosen by the narration polish are what the board shows and the voice says
      const pol = plan as { renames?: { id: string; keyword: string }[]; polish?: { rewritten: number; kept: string[]; issues: string[] } };
      if (pol.renames?.length)
        arch = {
          ...arch!,
          components: arch!.components.map((c) => ({ ...c, keyword: pol.renames!.find((r) => r.id === c.id)?.keyword ?? c.keyword })),
        };
      if (pol.polish)
        notes.push(
          `narration polish: ${pol.polish.rewritten} scene(s) rewritten${pol.polish.kept.length ? `, kept as planned: ${pol.polish.kept.join(", ")}` : ""}${pol.renames?.length ? `; renamed ${pol.renames.map((r) => `${r.id} -> "${r.keyword}"`).join(", ")}` : ""}; speech check: ${pol.polish.issues.length ? pol.polish.issues.join("; ") : "clean"}`,
        );
      const ear = (plan as { ear?: string[] }).ear;
      if (ear?.length) notes.push(`speech gate: ${ear.join("; ")}`);
      if (chk)
        notes.push(
          `plan self-check: ${chk.first.length} issue(s)${chk.revised ? `, revised once, ${chk.final.length} left` : ""}${chk.final.length ? `: ${chk.final.join("; ")}` : ""}`,
        );
      const rub = (plan as { rubric?: { total: number; issues: string[] } }).rubric;
      if (rub) notes.push(`rubric: ${rub.total}/10${rub.issues.length ? `: ${rub.issues.join("; ")}` : ""}`);
    }
    repoDir = r.repoDir;
  } else {
    const { ingestConcept, ingestTopic } = await import("@explanimate/ingest");
    const { planConceptScenes, planConceptBeats } = await import("@explanimate/planner");
    P({
      stage: "ingest",
      message: kind === "x-post" ? "reading the post" : kind === "topic" ? "finding reputable sources on the topic" : "reading the article",
      pct: 2,
    });
    const tmpOut = o.out ?? path.join(defaultOutRoot(), "tmp-" + Date.now());
    fs.mkdirSync(tmpOut, { recursive: true });
    const c = kind === "topic" ? await ingestTopic(input) : await ingestConcept(input, tmpOut);
    doc = c.doc;
    beatSource = doc.text;
    out = o.out ?? path.join(defaultOutRoot(), slug(o.name ?? doc.title));
    if (out !== tmpOut) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.rmSync(out, { recursive: true, force: true });
      fs.renameSync(tmpOut, out);
    }
    sourceLabel = doc.sources
      ? `sources: ${doc.sources.map((x) => x.site).join(", ")}`.slice(0, 80)
      : doc.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60);
    if (doc.sources) {
      fs.writeFileSync(
        path.join(out, "sources.md"),
        `# Sources for "${doc.title}"\n\n${doc.sources.map((x, i) => `${i + 1}. [${x.title}](${x.url}) (${x.site})`).join("\n")}\n`,
      );
      notes.push(`read ${doc.sources.length} source(s): ${doc.sources.map((x) => x.url).join(", ")}`);
    }
    await decide(path.join(out, "brief.json"), kind, doc.title, doc.text);
    plan = await cacheJson(path.join(out, "plan.json"), async () => {
      P({ stage: "plan", message: "Muse Spark is planning the explainer", pct: 15 });
      const p = await planConceptScenes({ ledger, doc, spec, icons: iconCatalog(pack), progress: P });
      // line cards cut away from the map or chart on the lines that earn one
      const cards = await planConceptBeats({ ledger, plan: p, source: doc.text, wps: spec.tempo.wps, progress: P });
      return { ...p, scenes: cards.plan.scenes };
    });
    await recheckSpeech();
    // a speech fix may have reworded a line: each line's card is cut and checked again against what is said
    // (a plan with no beats at all gets one board beat per line, so one-visual-per-line always holds)
    {
      const beats = checkBeats(plan, {
        arch: { product: "", one_liner: "", components: [], connections: [], walkthrough: { name: "", steps: [] }, scale: [] },
        source: doc.text,
        wps: spec.tempo.wps,
      });
      plan = { ...plan, scenes: beats.plan.scenes };
      notes.push(
        `line visuals: ${beats.report.beats} lines, ${beats.report.cards} cards (${Object.entries(beats.report.types)
          .map(([k, n]) => `${k} ${n}`)
          .join(", ")})${beats.report.repairs.length ? `; fixed: ${beats.report.repairs.join("; ")}` : ""}`,
      );
      const rubC = (plan as { rubric?: { total: number; issues: string[] } }).rubric;
      if (rubC) notes.push(`rubric: ${rubC.total}/10${rubC.issues.length ? `: ${rubC.issues.join("; ")}` : ""}`);
    }
    P({ stage: "plan", message: "finding the quoted lines on the page", pct: 30 });
    const quotes = plan.scenes.flatMap((s) => s.highlights.map((h) => h.quote));
    shot = await c.locate(quotes, path.join(out, "source.png"));
  }

  // the job name wins over the planned title: it is the title card and the manifest title
  const named = titleForPlan(plan.title, o.name);
  if (named !== plan.title) {
    plan = { ...plan, title: named };
    writeAtomic(path.join(out, "plan.json"), JSON.stringify(plan, null, 1));
  }
  // a narration past the format's hard cap gets one rewrite aimed at length, then a deterministic
  // trim; the line visuals are cut again from whatever is voiced
  await timed("length cap", async () => {
    const cap = formatCap(spec.format);
    if (estimateFilmSeconds(plan, spec.tempo.wps, spec.tempo.tail) <= cap) return;
    const over = Math.ceil(estimateFilmSeconds(plan, spec.tempo.wps, spec.tempo.tail) - cap);
    const replan = await fixNarration({
      ledger,
      plan,
      arch: arch ?? EMPTY_ARCH,
      issues: [
        `the narration runs about ${over} seconds over the ${cap} second cap for a ${spec.format} video; shorten every scene until the whole narration fits, keeping one idea per sentence and every name it says`,
      ],
      audience: spec.audience,
      step: "length-cap",
    }).catch(() => undefined);
    if (replan?.changed.length) {
      plan = { ...plan, scenes: replan.plan.scenes };
      notes.push(`length cap: ${replan.changed.join(", ")} rewritten to fit ${cap}s`);
    }
    const t = trimPlanToCap(plan, cap, spec.tempo.wps, spec.tempo.tail);
    if (t.trimmed.length) {
      plan = { ...plan, scenes: t.plan.scenes };
      notes.push(`length cap: ${t.trimmed.join(", ")} trimmed to fit ${cap}s`);
    }
    if (replan?.changed.length || t.trimmed.length) {
      const beats = checkBeats(plan, { arch: arch ?? EMPTY_ARCH, source: beatSource, wps: spec.tempo.wps });
      plan = { ...plan, scenes: beats.plan.scenes };
      writeAtomic(path.join(out, "plan.json"), JSON.stringify(plan, null, 1));
    }
  });
  if (o.look === "dark" && spec.look !== "chalk-dark") {
    spec = { ...spec, look: resolveLook(o.look, spec.look) };
    notes.push("look: dark board requested (--look dark)");
  }
  const theme = getTheme(spec.look);

  // ---------- voice ----------
  const voice: VoiceProvider = pickVoice(o.voice);
  voiceRef = voice;
  P({
    stage: "voice",
    message:
      voice.id === "silent"
        ? "no voice: timing captions at speaking pace"
        : `recording the voiceover (${voice.id === "cartesia" ? "Cartesia Sonic" : "Deepgram Aura"})`,
    pct: 36,
  });
  const audioDir = path.join(out, "audio");
  const audio: SceneAudio[] = [];
  const queue = [...plan.scenes];
  // scenes are independent, so they are recorded 8 at a time (the provider retries a rate limit)
  await timed("voice", () =>
    Promise.all(
      [...Array(8).keys()].map(async () => {
        for (let s = queue.shift(); s; s = queue.shift()) audio.push(await voice.synthesize(s.id, s.narration, audioDir));
      }),
    ),
  );
  audio.sort((a, b) => plan.scenes.findIndex((s) => s.id === a.sceneId) - plan.scenes.findIndex((s) => s.id === b.sceneId));
  // the voice is the ground truth: if it still runs past the cap, trim and re-voice the cut scenes
  {
    const cap = formatCap(spec.format);
    const real = audio.reduce((t, a) => t + a.duration, 0) + plan.scenes.length * (0.3 + spec.tempo.tail) + 4.2;
    if (real > cap) {
      const t = trimPlanToCap(plan, cap - 2, spec.tempo.wps, spec.tempo.tail);
      if (t.trimmed.length) {
        plan = { ...plan, scenes: t.plan.scenes };
        const beats = checkBeats(plan, { arch: arch ?? EMPTY_ARCH, source: beatSource, wps: spec.tempo.wps });
        plan = { ...plan, scenes: beats.plan.scenes };
        writeAtomic(path.join(out, "plan.json"), JSON.stringify(plan, null, 1));
        for (const id of t.trimmed) {
          const s = plan.scenes.find((x) => x.id === id)!;
          audio[audio.findIndex((a) => a.sceneId === id)] = await voice.synthesize(id, s.narration, audioDir);
        }
        notes.push(
          `length cap: the voice ran ${real.toFixed(0)}s past the ${cap}s cap, so ${t.trimmed.join(", ")} was trimmed and re-voiced`,
        );
      }
    }
  }

  // ---------- compose + render ----------
  P({ stage: "compose", message: "laying out the canvas", pct: 44 });
  const { film, sketch, timeline, pace, placement } = await timed("compose", () =>
    compose({
      plan,
      audio,
      theme,
      spec,
      pack,
      sourceLabel,
      arch,
      shot,
      colorOf: (c) => kindColor(c.kind) as any,
    }),
  );
  P({
    stage: "compose",
    message: `pacing: ${pace.cutsPerMin} cuts a minute, shortest hold ${pace.shortestHold} s (${pace.tempo})`,
    pct: 46,
  });
  // nothing is drawn until every ring, arrow and label sits where it should
  fs.writeFileSync(path.join(out, "placement.json"), JSON.stringify(placement, null, 1));
  P({
    stage: "compose",
    message: `placement: ${placement.fixed.length} fixed in ${placement.passes} pass(es), ${placement.warnings.length} warning(s), ${placement.issues.length} left`,
    pct: 47,
  });
  // small slips (text a little under the minimum, a sliver past the edge) are noted; only a broken layout stops the video
  if (placement.warnings.length)
    notes.push(
      `placement warnings: ${placement.warnings
        .slice(0, 6)
        .map((i) => `${i.t}s ${i.what}`)
        .join("; ")}${placement.warnings.length > 6 ? `; and ${placement.warnings.length - 6} more` : ""}`,
    );
  if (!placement.ok)
    throw new Error(
      `placement check failed after ${placement.passes} fix passes and the fallback (see placement.json): ${placement.issues
        .slice(0, 6)
        .map((i) => `${i.t}s ${i.what}`)
        .join("; ")}${placement.issues.length > 6 ? `; and ${placement.issues.length - 6} more` : ""}`,
    );
  // captions must spell out exactly what the voice says
  const bad = captionMismatches(film, plan.scenes);
  if (bad.length)
    throw new Error(
      `captions do not match the narration in ${bad.map((b) => `${b.scene}: said "${b.said}" but shown "${b.shown}"`).join("; ")}`,
    );
  fs.writeFileSync(path.join(out, "film.json"), JSON.stringify({ ...film, fonts: undefined, elements: film.elements.length }, null, 1));
  const base = slug(o.name ?? plan.title) || "explanimate";
  // the editable boards: a .tldr for tldraw.com and an .excalidraw for excalidraw.com, each checked after writing
  const tldrFile = path.join(out, `${base}.tldr`),
    excalidrawFile = path.join(out, `${base}.excalidraw`);
  fs.writeFileSync(
    tldrFile,
    JSON.stringify(
      await toTldraw(sketch, {
        colorNames: Object.fromEntries(Object.entries(theme.colors).map(([k, v]) => [v.toLowerCase(), k])),
        darkIcons: true,
        name: o.name ?? plan.title,
      }),
    ),
  );
  fs.writeFileSync(
    excalidrawFile,
    JSON.stringify(
      toExcalidraw(sketch, { background: theme.background, ink: theme.ink, muted: theme.colors.gray, edgeLabel: theme.edgeLabel }),
    ),
  );
  // read back what landed on disk, so the check sees exactly what the user opens
  const boardCheck = [
    checkTldr(JSON.parse(fs.readFileSync(tldrFile, "utf8")), sketch),
    checkExcalidraw(JSON.parse(fs.readFileSync(excalidrawFile, "utf8")), sketch),
  ];
  fs.writeFileSync(path.join(out, "board-check.json"), JSON.stringify(boardCheck, null, 1));
  const badBoards = boardCheck.filter((c) => !c.ok);
  if (badBoards.length)
    throw new Error(
      `board check failed (see board-check.json): ${badBoards.map((c) => `${c.format}: ${c.problems.slice(0, 4).join("; ")}`).join(" | ")}`,
    );

  // interactive player: where each architecture box is on screen over time (same camera keys the stage uses)
  if (arch) {
    const ids = new Set(arch.components.map((c) => c.id));
    const interactive = {
      width: film.width,
      height: film.height,
      duration: film.duration,
      endAt: film.end?.t0 ?? film.duration,
      camera: film.camera,
      nodes: sketch.nodes
        .filter((n) => ids.has(n.id) && !n.board)
        .map((n) => ({ id: n.id, keyword: n.keyword, box: n.box, t0: n.t0 ?? 0 })),
    };
    fs.writeFileSync(path.join(out, "interactive.json"), JSON.stringify(interactive));
  }

  const frames = path.join(out, "frames");
  fs.rmSync(frames, { recursive: true, force: true });
  // frames run to gigabytes: never leave them behind when a later step fails
  const scratch = [frames, path.join(out, "frame-check")];
  try {
    let narration: string | undefined;
    if (audio.some((a) => a.file)) {
      narration = path.join(out, "narration.wav");
      mixNarration(
        audio.filter((a) => a.file).map((a) => ({ file: a.file!, at: timeline.find((t) => t.id === a.sceneId)!.start + 0.3 })),
        film.duration,
        narration,
      );
    }
    // ---------- QA: Muse Transcribe listens to the voiceover while the frames are drawn ----------
    // it only needs narration.wav, which is final before the first frame, so it adds no wall-clock time
    const qaRun: Promise<Record<string, unknown> | undefined> =
      narration && o.qa !== false
        ? timed("voice qa", async () => {
            P({ stage: "qa", message: "Muse Transcribe is checking the voiceover", pct: 48 });
            try {
              const script = plan.scenes.map((s) => s.narration).join(" ");
              const tr = await museTranscribe({
                ledger,
                step: "voice-qa",
                wav: fs.readFileSync(narration!),
                durationSec: film.duration,
                keywords: (arch?.components ?? []).map((c) => c.keyword),
              });
              return { overlap: Number(wordOverlap(script, tr.transcript).toFixed(3)), transcript: tr.transcript };
            } catch (e) {
              return { error: String(e).slice(0, 300) };
            }
          })
        : Promise.resolve(undefined);
    // ffmpeg encodes each frame as soon as it is drawn, instead of waiting for all of them
    const mp4 = path.join(out, `${base}.mp4`);
    P({ stage: "render", message: "drawing frames", pct: 48 });
    const rendered = await timed("render frames", () =>
      renderFilm(film, frames, mp4, {
        workers: o.workers,
        audio: narration,
        music: o.music,
        cues: o.sfx === false ? [] : sfxCues(film),
        onProgress: (d, t) => P({ stage: "render", message: `drawing frames ${d}/${t}`, pct: 48 + Math.round((d / t) * 42) }),
      }),
    );
    const cap = rendered.cap;
    notes.push(`renderer: ${rendered.renderer}, ${rendered.codec}${rendered.fellBack ? ` (${rendered.fellBack})` : ""}`);
    const covering = cap.captions.filter((c) => c.overlapPx > 0);
    if (covering.length)
      notes.push(
        `${covering.length} caption(s) could not find fully free space: ${covering.map((c) => `${c.t0.toFixed(1)}s "${c.text}"`).join(", ")}`,
      );
    // ffmpeg finishes the last frames while the frame check runs
    const encoded = rendered.encoded;
    encoded.catch(() => {});
    // look at the picture itself: where every word, ring and caption actually landed, frame by frame
    P({ stage: "render", message: "checking the rendered frames", pct: 91 });
    // the contact sheet reads the finished mp4, so it is made while the frame check looks at the frames
    const sheet = path.join(out, `${base}.contact.jpg`);
    const sheetRun = encoded.then(() => timed("contact sheet", () => contactSheet(mp4, sheet, Math.max(2, Math.ceil(film.duration / 40)))));
    sheetRun.catch(() => {});
    const fc = await timed("frame check", () =>
      frameCheck(film, { workDir: path.join(out, "frame-check"), frameDir: frames, visionFrames: o.visionReview ? 8 : 0, ledger }),
    );
    fs.rmSync(path.join(out, "frame-check"), { recursive: true, force: true });
    fs.writeFileSync(path.join(out, "frame-check.json"), JSON.stringify(fc, null, 1));
    notes.push(
      `frame check: ${fc.atRest} of ${fc.samples} sampled frames at rest, ${fc.issues.length} issue(s)${
        fc.issues.length
          ? `: ${fc.issues
              .slice(0, 4)
              .map((i) => `${i.t}s ${i.rule} ${i.detail}`)
              .join("; ")}`
          : ""
      }`,
    );
    if (fc.vision)
      notes.push(`vision review: ${fc.vision.reduce((n, f) => n + f.problems.length, 0)} problem(s) across ${fc.vision.length} frames`);
    P({ stage: "encode", message: "encoding the mp4", pct: 92 });
    await timed("encode tail", () => encoded);
    await sheetRun;
    fs.copyFileSync(cap.html, path.join(out, "stage.html"));
    const qa = await qaRun;

    const voiceCost = voiceUsd(voice);
    const manifest = {
      tool: "explanimate",
      input: o.input,
      kind,
      path: doc.subpath,
      sources: doc.sources,
      brief: spec.brief,
      tempo: spec.tempo,
      pace,
      repoDir,
      followUp: o.focus ? { focus: o.focus } : o.whatIf ? { whatIf: o.whatIf } : undefined,
      look: theme.id,
      packs: {
        loaded: extra.map((p) => p.id),
        detected: detected.map((d) => ({ pack: d.pack, id: d.component.id, name: d.component.name, evidence: d.evidence })),
      },
      title: plan.title,
      durationSec: Number(film.duration.toFixed(1)),
      outputs: {
        mp4,
        tldr: tldrFile,
        excalidraw: excalidrawFile,
        contactSheet: sheet,
        plan: path.join(out, "plan.json"),
        architecture: arch ? path.join(out, "architecture.json") : undefined,
      },
      scenes: timeline,
      repairs: plan.repairs ?? [],
      notes,
      qa,
      boardCheck: boardCheck.map((c) => ({ format: c.format, ok: c.ok, ...c.counts })),
      frameCheck: { ok: fc.ok, samples: fc.samples, issues: fc.issues.length, file: path.join(out, "frame-check.json") },
      // captions that found no fully free spot (empty when every caption clears the drawing)
      captionsCovering: cap.captions.filter((c) => c.overlapPx > 0),
      cost: {
        metaUsd: Number(ledger.total.toFixed(4)),
        byModel: ledger.byModel(),
        entries: ledger.entries,
        voiceUsd: Number(voiceCost.toFixed(4)),
        voice: voice.id,
      },
      seconds: Math.round((Date.now() - t0) / 1000),
      stages,
    };
    writeAtomic(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 1));
    P({ stage: "done", message: "done", pct: 100 });
    return manifest;
  } finally {
    for (const d of scratch) fs.rmSync(d, { recursive: true, force: true });
  }
}

/** Write via a temp file and a rename, so a crash never leaves a half-written cache or manifest. */
function writeAtomic(file: string, data: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
