import { z } from "zod";
import { Architecture, COLOR_MEANING, lower, type ExplainSpec, type Progress } from "@explainlike/core";
import { sparkJson, type CostLedger } from "@explainlike/models";

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
    "- connections follow the direction requests/data flow (from caller to callee). Each one cites one file where that call happens.",
    "- walkthrough: the core flow of the product: the most common real user action, traced from the client through 4 to 7 connections in order. If the user gets something back (an answer, a page, a result), the last step brings it back to the client along a connection that already exists. Steps must reuse component ids. Each step label is used once; when the flow loops back to a part, say what is different ('ask again', 'send result'). Labels are plain verbs a newcomer understands ('send message', 'pick a bot', 'reply').",
    L.scaleItems ? `- scale: exactly ${L.scaleItems} risk(s) at ${L.scaleAt.join(" / ")} traffic. Each must be about a component in this design, explain WHY it breaks using what the code actually does, and give a concrete fix. Cite one file.` : "- scale: an empty array (this video stays on the core flow).",
    `- ${KEYWORD_RULE}`,
    `- icon: pick the closest name from this icon pack: ${icons}`,
    ...(L.brief.topic ? [`- What this is: ${L.brief.topic}. The walkthrough must show the thing it is known for (the handoff in an agent library, the cache hit in a CDN, the merge in a version control tool), not only a generic request and reply.`] : []),
    `Audience for wording later: ${L.audience}.`,
    ...(hints ? [hints] : []),
  ].join("\n");
}

export async function extractArchitecture(o: { ledger: CostLedger; digest: string; name: string; spec: ExplainSpec; icons: string; hints?: string; progress?: Progress }): Promise<Architecture> {
  o.progress?.({ stage: "plan", message: "mapping the architecture with Muse Spark" });
  return sparkJson({
    ledger: o.ledger, step: "architecture", schema: Architecture, name: "architecture", effort: "medium", maxTokens: 16000,
    messages: [
      { role: "system", content: archSystem(o.spec, o.icons, o.hints) },
      { role: "user", content: `Repository: ${o.name}\n\nDIGEST (secrets stripped):\n${o.digest}` },
    ],
  });
}

/** Deterministic guard: no box without evidence, ids and edges consistent, keywords short. */
export function validateArchitecture(arch: Architecture, files: string[], resolveIcon: (n: string) => string | undefined, fallbackIcon: (kind: string) => string): { arch: Architecture; issues: ArchIssue[] } {
  const issues: ArchIssue[] = [];
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
  return { arch: { ...arch, components: comps, connections: conns, walkthrough: { name: arch.walkthrough.name, steps }, scale }, issues };
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

const ReviewFix = Review.extend({ architecture: Architecture.describe("the full architecture with every issue fixed; unchanged when the verdict is ok") });

/**
 * One call reviews the map against the cited code and returns it corrected, so a flagged map costs
 * one round trip instead of a review and a separate rewrite. The reviewer sees the digest too, so it
 * can add a component the files show but the map missed.
 */
export async function reviewArchitecture(o: { ledger: CostLedger; arch: Architecture; evidence: string; digest: string; name: string; found?: ArchIssue[]; spec: ExplainSpec; icons: string; hints?: string; progress?: Progress }) {
  o.progress?.({ stage: "plan", message: "reviewing the architecture against the cited files" });
  const found = o.found?.length ? `\n\nA file check already found:\n${o.found.map((i, n) => `${n + 1}. [${i.target}] ${i.problem}`).join("\n")}` : "";
  return sparkJson({
    ledger: o.ledger, step: "architecture-review", schema: ReviewFix, name: "review", effort: "medium", maxTokens: 20000,
    messages: [
      { role: "system", content: `${REVIEWER}\nWrite the issues first, as full sentences that quote the code. Then return the full architecture with every issue fixed, keeping everything that was right. The architecture (not the issues) follows the same rules as the original map, including its component count and number of scale risks:\n${archSystem(o.spec, o.icons, o.hints)}` },
      { role: "user", content: `Repository: ${o.name}\n\nARCHITECTURE JSON:\n${JSON.stringify(o.arch)}${found}\n\nCITED FILE EXCERPTS:\n${o.evidence}\n\nDIGEST (secrets stripped):\n${o.digest}` },
    ],
  });
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
