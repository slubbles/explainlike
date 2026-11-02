import { z } from "zod";
import { Architecture, Component, Connection, ScaleRisk, COLOR_MEANING, lower, type ExplainSpec, type Progress } from "@explanimate/core";
import { sparkJson, type CostLedger } from "@explanimate/models";

export interface ArchIssue { target: string; problem: string }

const KEYWORD_RULE = "Every keyword, label, problem and fix field is 1 to 3 lowercase words, the words a teacher would write on a whiteboard (e.g. 'edge cache', 'ingest api', 'clickhouse').";

function archSystem(L: ExplainSpec, icons: string, hints = "") {
  return [
    "You map the REAL architecture of a software repository for a whiteboard explainer video.",
    "Ground rules (a reviewer will reject anything that breaks them):",
    "- Only include a component if a file in the digest proves it exists. `evidence` lists 1 to 3 exact repo-relative file paths copied from the digest (from the tree, manifests, libraries->files, env->files or excerpt headers). Never invent paths.",
    "- Use the real technology names found in the code (e.g. 'ClickHouse', 'Postgres via Prisma', 'Redis', 'Kafka'), not generic ones.",
    `- ${L.minComponents} to ${L.maxComponents} components. Merge minor helpers into the component they serve. Always include who/what starts requests (users, a browser, a tracker script, a CLI) as a client component.`,
    "- Optional infrastructure (enabled by an env var or config flag) is fine to include; say 'optional' in `what`.",
    "- one_liner: what this project is and why someone would use it, in one plain sentence a newcomer to the field follows, with no jargon ('a small kit that lets you train your own chat assistant from scratch on one rented computer').",
    "- Keywords and step labels use everyday words the newcomer already knows ('chat window', 'saved model', 'text library', 'send question'); a term only practitioners know (a shard, an inference engine, a forward pass, a daemon) goes in `name` or `what`, never in a keyword or a step label.",
    "- A component's keyword names what the part IS, as a noun a teacher would point at ('ui core', 'command list', 'sdl window'), never what it does ('rebuild widgets', 'poll input'); the doing goes on the arrows.",
    "- When the core flow hands a named data structure from one part to another (a command list, a job queue, a render buffer, an event log) and the code gives it its own type, draw it as its own component; it is often what the design is known for.",
    "- connections follow the direction requests/data flow (from caller to callee). Each one cites one file where that call happens. If A's code includes or imports B and B never calls A, the arrow is A>B, even when data comes back: say 'read commands' from A's side, not 'emit commands' from B's.",
    "- walkthrough: the core flow of the product: the most common real user action, traced from the client through 4 to 7 connections in order. If the user gets something back (an answer, a page, a result), the last step brings it back to the client along a connection that already exists. Steps must reuse component ids. Each step label is used once; when the flow loops back to a part, say what is different ('ask again', 'send result'). Labels are plain verbs a newcomer understands ('send message', 'pick a bot', 'reply'), saying what happens to the thing being followed, not repeating the name of the part it reaches (to a part called 'saved vocab', say 'store merges', not 'save vocab').",
    L.scaleItems ? `- scale: exactly ${L.scaleItems} risk(s) at ${L.scaleAt.join(" / ")} traffic. Each must be about a component in this design, explain WHY it breaks using what the code actually does, and give a concrete fix. Cite one file.` : "- scale: an empty array (this video stays on the core flow).",
    `- ${KEYWORD_RULE}`,
    `- icon: pick the closest name from this icon pack: ${icons}`,
    ...(L.brief.topic ? [`- What this is: ${L.brief.topic}. The walkthrough must show the thing it is known for (the handoff in an agent library, the cache hit in a CDN, the merge in a version control tool), not only a generic request and reply.`] : []),
    `Audience for wording later: ${L.audience}.`,
    ...(hints ? [hints] : []),
  ].join("\n");
}

/**
 * The map as sent to the API: the same fields with hard limits, so a long answer cannot run on. The
 * prompt already asks for these sizes; the limits make them binding.
 */
export function archWire(L: Pick<ExplainSpec, "maxComponents" | "scaleItems">) {
  const w = wireParts(L);
  return Architecture.extend({
    product: z.string().max(80),
    one_liner: z.string().max(200),
    components: w.components,
    connections: w.connections,
    walkthrough: z.object({ name: z.string().max(80), steps: w.steps }),
    scale: w.scale,
  });
}

function wireParts(L: Pick<ExplainSpec, "maxComponents" | "scaleItems">) {
  const conn = Connection.extend({ label: z.string().max(40), evidence: z.string().max(160) });
  return {
    components: z.array(Component.extend({ name: z.string().max(80), keyword: z.string().max(40), what: z.string().max(200), evidence: z.array(z.string().max(160)).max(3) })).max(L.maxComponents),
    connections: z.array(conn).max(L.maxComponents + 4),
    steps: z.array(conn).max(7),
    scale: z.array(ScaleRisk.extend({ why: z.string().max(300), fix_detail: z.string().max(300) })).max(Math.max(0, L.scaleItems)),
  };
}

/**
 * One call maps the repo. Its time is almost all reasoning: at medium effort the same microui digest took
 * 50 to 98 s (5.3k to 11.1k reasoning tokens at about 120 tokens/s, no retries), at low effort 35 to 42 s
 * with the same file check passing. Low effort plus the review and the targeted fix keeps the map right;
 * the time limit means a stuck call costs one more quick try, never a hang.
 */
export async function extractArchitecture(o: { ledger: CostLedger; digest: string; name: string; spec: ExplainSpec; icons: string; hints?: string; progress?: Progress; effort?: "low" | "medium"; timeoutMs?: number }): Promise<Architecture> {
  o.progress?.({ stage: "architecture", message: "mapping the architecture with Muse Spark" });
  const a = await sparkJson({
    ledger: o.ledger, step: "architecture", schema: Architecture, wire: archWire(o.spec), name: "architecture", effort: o.effort ?? "low", maxTokens: 10000, timeoutMs: o.timeoutMs ?? 90_000,
    messages: [
      { role: "system", content: archSystem(o.spec, o.icons, o.hints) },
      { role: "user", content: `Repository: ${o.name}\n\nDIGEST (secrets stripped):\n${o.digest}` },
    ],
  });
  // the API may not hold to every limit; the walkthrough and the evidence lists are cut to them here
  return { ...a, components: a.components.map((c) => ({ ...c, evidence: c.evidence.slice(0, 3) })), walkthrough: { ...a.walkthrough, steps: a.walkthrough.steps.slice(0, 7) } };
}

/**
 * Deterministic guard: no box without evidence, ids and edges consistent, keywords short, part names
 * that are things rather than actions, and arrows that agree with who calls whom in the code. `open`
 * lists what it found but could not fix itself, for a targeted model fix.
 */
export function validateArchitecture(arch: Architecture, files: string[], resolveIcon: (n: string) => string | undefined, fallbackIcon: (kind: string) => string, read?: (p: string, max?: number) => string): { arch: Architecture; issues: ArchIssue[]; open: ArchIssue[] } {
  const issues: ArchIssue[] = [];
  const open: ArchIssue[] = [];
  const set = new Set(files);
  const byBase = new Map<string, string[]>();
  for (const f of files) { const b = f.split("/").pop()!; (byBase.get(b) ?? byBase.set(b, []).get(b)!).push(f); }
  const fixPath = (p: string): string | undefined => {
    const q = p.replace(/^\.?\//, "").replace(/^[^/]+:\s*/, "").trim();
    if (set.has(q)) return q;
    const suffix = files.filter((f) => f.endsWith("/" + q));
    if (suffix.length === 1) return suffix[0];
    const base = byBase.get(q.split("/").pop()!);
    if (base?.length === 1) return base[0];
    // directories count as evidence if they contain tracked files
    const dir = files.find((f) => f.startsWith(q.replace(/\/$/, "") + "/"));
    return dir ? q.replace(/\/$/, "") + "/" : undefined;
  };
  const kw = (s: string) => lower(s).replace(/[^a-z0-9+#./\- ]/g, "").split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
  const comps: Architecture["components"] = [];
  const ids = new Set<string>();
  for (const c of arch.components) {
    const ev = [...new Set(c.evidence.map(fixPath).filter((x): x is string => !!x))];
    if (!ev.length) { issues.push({ target: c.id, problem: `dropped: no evidence file exists (${c.evidence.join(", ")})` }); continue; }
    if (ids.has(c.id)) { issues.push({ target: c.id, problem: "duplicate id dropped" }); continue; }
    ids.add(c.id);
    comps.push({ ...c, evidence: ev, keyword: kw(c.keyword), icon: resolveIcon(c.icon) ?? fallbackIcon(c.kind) });
  }
  const edgeKey = new Set<string>();
  const conns = [];
  for (const e of arch.connections) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) { issues.push({ target: `${e.from}>${e.to}`, problem: "connection to a missing component dropped" }); continue; }
    const k = `${e.from}>${e.to}`;
    if (edgeKey.has(k)) continue;
    edgeKey.add(k);
    const ev = fixPath(e.evidence) ?? comps.find((c) => c.id === e.from)!.evidence[0];
    conns.push({ ...e, label: kw(e.label), evidence: ev });
  }
  const said = new Set<string>();
  const steps = arch.walkthrough.steps.filter((s) => ids.has(s.from) && ids.has(s.to)).map((s) => {
    // a label said twice reads as the same step twice; the repeat of a loop says "again"
    let label = kw(s.label);
    if (said.has(label) && label.split(" ").length < 3) { issues.push({ target: "walkthrough", problem: `repeated step "${label}" renamed "${label} again"` }); label += " again"; }
    said.add(label);
    return { ...s, label, evidence: fixPath(s.evidence) ?? "" };
  });
  // walkthrough steps must be drawable: add the connection if the model forgot it
  for (const s of steps) if (!edgeKey.has(`${s.from}>${s.to}`) && !edgeKey.has(`${s.to}>${s.from}`)) {
    edgeKey.add(`${s.from}>${s.to}`); conns.push({ ...s, evidence: s.evidence || comps.find((c) => c.id === s.from)!.evidence[0] });
  }
  const scale = arch.scale.filter((r) => ids.has(r.component)).map((r) => ({ ...r, problem: kw(r.problem), fix: kw(r.fix), evidence: fixPath(r.evidence) ?? comps.find((c) => c.id === r.component)!.evidence[0] }));
  if (scale.length < arch.scale.length) issues.push({ target: "scale", problem: "scale risk on a missing component dropped" });
  // part names are things: "rebuild widgets" or "poll input" read aloud as a place sounds broken
  const labels = new Set([...conns, ...steps].map((e) => e.label));
  const taken = new Set(comps.map((c) => c.keyword));
  for (const c of comps) {
    if (!actionName(c.keyword, labels)) continue;
    const plain = kw(c.name.replace(/\(.*?\)/g, " ").replace(/\s+(via|with|using|on|in|for)\s.*$/i, ""));
    if (plain && !actionName(plain, labels) && !taken.has(plain)) {
      issues.push({ target: c.id, problem: `part name "${c.keyword}" is an action, renamed "${plain}" from its name` });
      taken.delete(c.keyword); taken.add(plain); c.keyword = plain;
    } else open.push({ target: c.id, problem: `part name "${c.keyword}" says what it does, not what it is; give it a 1 to 3 word noun name (what the part is, like "ui core" or "command list")` });
  }
  // arrows follow the code: an arrow from A to B where B's files import A's (and not the other way) is backwards
  let out = conns;
  if (read) {
    const uses = callsBetween(comps, files, read);
    const has = (a: string, b: string) => out.some((e) => e.from === a && e.to === b);
    const against = (a: string, b: string) => uses(b, a) && !uses(a, b);
    out = out.filter((e) => {
      if (!against(e.from, e.to)) return true;
      if (has(e.to, e.from)) { issues.push({ target: `${e.from}>${e.to}`, problem: `dropped "${e.label}": ${e.to}'s code calls ${e.from}, not the other way, and that arrow is already drawn` }); return false; }
      open.push({ target: `${e.from}>${e.to}`, problem: `arrow "${e.label}" points the wrong way: ${e.to}'s files import ${e.from}'s, and ${e.from} never calls ${e.to}; draw it ${e.to}>${e.from} with a label saying what ${e.to} does` });
      return true;
    });
    steps.forEach((st, i) => {
      if (!against(st.from, st.to)) return;
      // the answer to a call is fine when it is worded as an answer, not as a push ("emit commands")
      const replyOk = /^(return|returns|hand back|hands back|answer|reply|replies|give back|gives back|report|reports)\b/.test(st.label) || (i === steps.length - 1 && !PUSH.test(st.label));
      if (!replyOk) open.push({ target: "walkthrough", problem: `step ${i + 1} ${st.from}>${st.to} "${st.label}" runs against the code: ${st.to} calls ${st.from}, so ${st.from} does not push to it; make it ${st.to}>${st.from} with a label from ${st.to}'s side (e.g. "read commands"), or word it as the answer to ${st.to}'s call ("return ...")` });
    });
    if (!steps.every((st) => out.some((e) => (e.from === st.from && e.to === st.to) || (e.from === st.to && e.to === st.from)))) out = conns;
  }
  // the video follows someone doing something; without a client part there is no one to start the flow
  if (comps.length && !comps.some((c) => c.kind === "client")) open.push({ target: steps[0]?.from ?? comps[0].id, problem: "no client part: add who starts the core flow (a user, a browser, a CLI, the app that calls the library) as a component of kind client, citing the file where it starts, and begin the walkthrough from it" });
  return { arch: { ...arch, components: comps, connections: out, walkthrough: { name: arch.walkthrough.name, steps }, scale }, issues, open };
}

const PUSH = /^(emit|emits|send|sends|push|pushes|notify|notifies|dispatch|dispatches|post|posts|fire|fires|trigger|triggers|call|calls|tell|tells)\b/;
// verbs a part name starts with when the model named it by what it does; nouns that double as verbs (queue, cache, store, map) are left out
const ACTION = /^(rebuild|build|draw|poll|emit|send|render|handle|process|fetch|save|parse|run|read|write|make|create|update|get|show|display|feed|push|pull|sync|serve|route|manage|compute|generate|validate|scan|watch|listen|dispatch|convert|transform|compile|encode|decode|collect|gather|forward|deliver|paint|present|receive|call|execute|evaluate|merge|split|tokenize|train|predict|answer|reply|notify|lookup|look|find|pick|choose|check|track|queue|store|load|cache)\b/;
const NOUNISH = /^(queue|store|cache|check|track|load|build|run|lookup|answer|reply|display|look)$/;
/** True when a part name reads as an action: it starts with a verb (and is not a lone noun-verb like "cache"), or it is an arrow label. */
export function actionName(k: string, labels: Set<string> = new Set()): boolean {
  if (labels.has(k)) return true;
  const w = k.split(" ");
  if (w.length === 1) return ACTION.test(k) && !NOUNISH.test(k) && !/^(rendering|router|renderer)$/.test(k);
  return ACTION.test(k) && !/^(build|run|check|track|load|queue|store|cache|display|lookup) (tool|tools|system|step|server|service|script|config|list|table|file|files|layer|manager|worker|workers|queue|store|cache|db|database|api|engine|pipeline|log|logs|panel|page|window)$/.test(k);
}

const CODE = /\.(c|h|cc|cpp|hpp|cxx|m|mm|go|rs|py|js|jsx|mjs|cjs|ts|tsx|java|kt|swift|rb|php|cs|scala|lua|zig|dart|ex|exs|vue|svelte)$/;
/**
 * Who calls whom, read from include and import lines: uses(a, b) is true when one of a's code files
 * imports one of b's. Files the two parts share say nothing about direction, so they are left out.
 */
export function callsBetween(comps: Pick<Component, "id" | "evidence">[], files: string[], read: (p: string, max?: number) => string): (a: string, b: string) => boolean {
  const codeOf = new Map<string, string[]>();
  for (const c of comps) codeOf.set(c.id, [...new Set(c.evidence.flatMap((e) => (e.endsWith("/") ? files.filter((f) => f.startsWith(e)).slice(0, 40) : [e])).filter((f) => CODE.test(f)))]);
  const stem = (f: string) => f.replace(/\.[^./]+$/, "");
  const targets = new Map<string, string[]>();
  const importsOf = (f: string) => {
    if (targets.has(f)) return targets.get(f)!;
    const t = read(f, 60000);
    const specs = [...t.matchAll(/^\s*#\s*(?:include|import)\s*["<]([^">]+)[">]|\bfrom\s+['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s*\(?\s*['"]([^'"]+)['"]|^\s*from\s+([\w.]+)\s+import\b|^\s*import\s+([\w.]+)|^\s*use\s+(?:crate::)?([\w:]+)|^\s*mod\s+(\w+)\s*;/gm)].map((m) => m.slice(1).find(Boolean)!);
    const dir = f.split("/").slice(0, -1).join("/");
    const out: string[] = [];
    for (const raw of specs) {
      const sp = raw.replace(/::/g, "/").replace(/^\.\//, "");
      const rel = raw.startsWith(".") ? normPath(`${dir}/${raw}`) : "";
      const dotted = /^[\w.]+$/.test(raw) && raw.includes(".") && !/\.\w{1,4}$/.test(raw) ? raw.replace(/\./g, "/") : "";
      for (const g of files) {
        if (g === f || !CODE.test(g)) continue;
        const s = stem(g);
        if ((rel && (s === stem(rel) || s === `${rel}/index` || g === rel)) || (!rel && (g.endsWith(`/${sp}`) || g === sp || s.endsWith(`/${stem(sp)}`) || s === stem(sp) || (dotted && (s.endsWith(dotted) || s.endsWith(`${dotted}/__init__`)))))) out.push(g);
      }
    }
    targets.set(f, out);
    return out;
  };
  return (a, b) => {
    const from = codeOf.get(a) ?? [];
    const to = new Set((codeOf.get(b) ?? []).filter((f) => !from.includes(f)));
    return !!to.size && from.some((f) => !to.has(f) && importsOf(f).some((g) => to.has(g)));
  };
}

function normPath(p: string): string {
  const out: string[] = [];
  for (const seg of p.split("/")) { if (seg === "..") out.pop(); else if (seg && seg !== ".") out.push(seg); }
  return out.join("/");
}

const Review = z.object({
  verdict: z.enum(["ok", "revise"]),
  issues: z.array(z.object({
    target: z.string().describe("component id, connection 'from>to', 'walkthrough' or 'scale'"),
    problem: z.string().describe("one or two full sentences quoting the code that shows the problem"),
    fix: z.string().describe("one full sentence saying what to change"),
  })),
});

/** Evidence pack: the start of every cited file, so the reviewer judges claims against code, not vibes. */
export function evidencePack(arch: Architecture, read: (p: string, max?: number) => string, budget = 30000): string {
  const paths = [...new Set([...arch.components.flatMap((c) => c.evidence), ...arch.connections.map((c) => c.evidence), ...arch.scale.map((s) => s.evidence)])].filter((p) => !p.endsWith("/"));
  const per = Math.max(500, Math.floor(budget / Math.max(1, paths.length)));
  let out = "";
  for (const p of paths) { const t = read(p, per); if (t) out += `### ${p}\n${t}\n\n`; if (out.length > budget) break; }
  return out;
}

const REVIEWER = "You are a strict staff engineer reviewing an architecture map that will be shown to thousands of developers. Compare every component, connection, walkthrough step and scale risk against the cited file excerpts. Flag: components whose cited files do not support them, wrong technology names, wrong direction of data flow, missing major components that the files clearly show (e.g. a database client that is imported but not drawn), walkthrough steps that the code does not do, scale risks that are generic or not grounded in this code. Return verdict 'ok' only if a skeptical maintainer of this repo would sign off. Max 10 issues, most important first.";

const ReviewPatch = Review.extend({
  upsert_components: z.array(Component).describe("components to add, or to replace whole when an id already exists; empty when no component changes"),
  remove_components: z.array(z.string()).describe("ids of components to drop"),
  upsert_connections: z.array(Connection).describe("connections to add, or to replace whole when the same from and to already exist"),
  remove_connections: z.array(z.string()).describe("'from>to' of connections to drop"),
  walkthrough_steps: z.array(Connection).describe("the full new list of walkthrough steps when any step changes; empty to keep the steps as they are"),
  scale: z.array(ScaleRisk).describe("the full new list of scale risks when any risk changes; empty to keep them as they are"),
});
export type ReviewPatch = z.infer<typeof ReviewPatch>;

/** The review as sent to the API: the same limits as the map, and at most 10 issues of a sentence or two. */
export function reviewWire(L: Pick<ExplainSpec, "maxComponents" | "scaleItems">) {
  const w = wireParts(L);
  return ReviewPatch.extend({
    issues: z.array(z.object({ target: z.string().max(80), problem: z.string().max(300), fix: z.string().max(300) })).max(10),
    upsert_components: w.components,
    remove_components: z.array(z.string().max(80)).max(L.maxComponents),
    upsert_connections: w.connections,
    remove_connections: z.array(z.string().max(160)).max(L.maxComponents + 4),
    walkthrough_steps: w.steps,
    scale: w.scale,
  });
}

/** Applies a review's changes to the map: whole-item replace by id (or from>to), removals, and full lists for the walkthrough and scale. */
export function applyReviewPatch(arch: Architecture, p: Omit<ReviewPatch, "verdict" | "issues">): Architecture {
  const gone = new Set(p.remove_components);
  const comps = arch.components.filter((c) => !gone.has(c.id)).map((c) => p.upsert_components.find((u) => u.id === c.id) ?? c);
  for (const u of p.upsert_components) if (!comps.some((c) => c.id === u.id)) comps.push(u);
  const key = (c: { from: string; to: string }) => `${c.from}>${c.to}`;
  const cut = new Set(p.remove_connections.map((k) => k.replace(/\s+/g, "")));
  const conns = arch.connections.filter((c) => !cut.has(key(c))).map((c) => p.upsert_connections.find((u) => key(u) === key(c)) ?? c);
  for (const u of p.upsert_connections) if (!conns.some((c) => key(c) === key(u))) conns.push(u);
  return {
    ...arch,
    components: comps,
    connections: conns,
    walkthrough: { ...arch.walkthrough, steps: p.walkthrough_steps.length ? p.walkthrough_steps : arch.walkthrough.steps },
    scale: p.scale.length ? p.scale : arch.scale,
  };
}

/**
 * One call reviews the map against the cited code and returns only the changes its issues need, so a
 * flagged map costs one round trip, and a map that is mostly right is not rewritten (and re-reasoned)
 * whole. The reviewer sees the digest too, so it can add a component the files show but the map missed.
 */
export async function reviewArchitecture(o: { ledger: CostLedger; arch: Architecture; evidence: string; digest: string; name: string; found?: ArchIssue[]; spec: ExplainSpec; icons: string; hints?: string; progress?: Progress; effort?: "minimal" | "low" | "medium"; timeoutMs?: number }) {
  o.progress?.({ stage: "review", message: "reviewing the architecture against the cited files" });
  const found = o.found?.length ? `\n\nA file check already found:\n${o.found.map((i, n) => `${n + 1}. [${i.target}] ${i.problem}`).join("\n")}` : "";
  const r = await sparkJson({
    // the time limit bounds a run of long reasoning (microui: 38 s at 4.2k reasoning tokens); a stuck call gets one quicker try
    ledger: o.ledger, step: "architecture-review", schema: ReviewPatch, wire: reviewWire(o.spec), name: "review", effort: o.effort ?? "low", maxTokens: 14000, timeoutMs: o.timeoutMs ?? 75_000,
    messages: [
      { role: "system", content: `${REVIEWER}\nWrite the issues first, as full sentences that quote the code. Then return only the changes that fix them: each changed or new component or connection whole, the ids of ones to drop, and the full walkthrough steps or scale list only if they change. Leave everything that was right out of the changes. Every issue you list has a matching change. Changed and new items follow the same rules as the original map, and the result keeps its component count and number of scale risks:\n${archSystem(o.spec, o.icons, o.hints)}` },
      { role: "user", content: `Repository: ${o.name}\n\nARCHITECTURE JSON:\n${JSON.stringify(o.arch)}${found}\n\nCITED FILE EXCERPTS:\n${o.evidence}\n\nDIGEST (secrets stripped):\n${o.digest}` },
    ],
  });
  return { verdict: r.verdict, issues: r.issues, architecture: applyReviewPatch(o.arch, r), changes: { upsert: r.upsert_components.length + r.upsert_connections.length, removed: r.remove_components.length + r.remove_connections.length, walkthrough: r.walkthrough_steps.length > 0, scale: r.scale.length > 0 } };
}

/**
 * Targeted fix: only the problems the file check could not fix itself, with only the cited files of
 * the parts involved, so it costs a short call instead of a second full review.
 */
export async function fixArchitecture(o: { ledger: CostLedger; arch: Architecture; open: ArchIssue[]; read: (p: string, max?: number) => string; spec: ExplainSpec; icons: string; hints?: string; progress?: Progress }) {
  o.progress?.({ stage: "review", message: `fixing ${o.open.length} map problem(s) the file check found` });
  const ids = new Set(o.open.flatMap((i) => (i.target === "walkthrough" ? o.arch.walkthrough.steps.flatMap((s) => [s.from, s.to]) : i.target.split(">"))));
  const evidence = evidencePack({ ...o.arch, components: o.arch.components.filter((c) => ids.has(c.id)), connections: [], scale: [] }, o.read, 12000);
  const r = await sparkJson({
    ledger: o.ledger, step: "architecture-fix", schema: ReviewPatch, wire: reviewWire(o.spec), name: "review", effort: "low", maxTokens: 8000, timeoutMs: 60_000,
    messages: [
      { role: "system", content: `You fix specific problems in an architecture map for a whiteboard explainer. Fix exactly the listed problems and nothing else: return each changed component or connection whole, ids to drop, and the full walkthrough steps only if a step changes. Keep every id and the component count. verdict is 'revise'; list one issue per problem you fixed.\n${archSystem(o.spec, o.icons, o.hints)}` },
      { role: "user", content: `ARCHITECTURE JSON:\n${JSON.stringify(o.arch)}\n\nPROBLEMS:\n${o.open.map((i, n) => `${n + 1}. [${i.target}] ${i.problem}`).join("\n")}\n\nCITED FILE EXCERPTS:\n${evidence}` },
    ],
  });
  return { issues: r.issues, architecture: applyReviewPatch(o.arch, r) };
}

export const kindColor = (kind: string): keyof typeof COLOR_MEANING => {
  switch (kind) {
    case "client": return "blue";
    case "edge": case "cdn": return "orange";
    case "api": case "worker": case "realtime": case "cron": return "purple";
    case "db": case "object-storage": case "search": case "analytics": return "teal";
    case "cache": return "pink";
    case "queue": return "orange";
    case "auth": return "green";
    case "ai": return "orange";
    default: return "gray";
  }
};
