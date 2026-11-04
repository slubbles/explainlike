import {
  FORMATS,
  codeFactsIn,
  digitNumbers,
  manifestHas,
  norm,
  wordCount,
  type Architecture,
  type ExplainFormat,
  type FactsManifest,
  type Scene,
  type ScenePlan,
} from "@explanimate/core";

/** First sentence of a narration, the line the hook rule grades. */
export function firstSentence(narration: string): string {
  return narration.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
}

/** Prompt line pinning the plan to its format beats. */
export function formatRule(format: ExplainFormat): string {
  if (format === "short")
    return "Format: short (45-60s), four beats: hook and stakes 5-8s (one question the viewer can't answer yet, never answered in its first line), core mechanism 20-25s, failure case or concrete example 10-15s, payoff 5-8s answering the hook. Add beats, not runtime.";
  if (format === "anatomy")
    return "Format: anatomy (90-150s) for repos, a guided tour of the project's parts layer by layer: hook question, entry point where one request comes in, core engine, data and storage, infra and deploy, then the payoff on the whole map lit up along the traced path. Each part beat states what it owns, what it hands to the next part, and why it exists. One real request is traced end to end through actual file paths and `symbols`; a tour without that traced path is cut. Add beats, not runtime.";
  return "Format: deep (90-120s) for repos and code, six beats: problem, mental model, mechanism, code trace or worked example (a real command, file, or output row), failure case or tradeoff, payoff answering the hook. Add beats, not runtime; never drop the code trace to fit short.";
}

/** The hook asks one question the viewer can't answer yet and never answers it in its first line. */
export function checkHookQuestion(plan: ScenePlan): string[] {
  const hook = plan.scenes.find((s) => s.kind === "hook");
  if (!hook) return ["the video must open with a 'hook' scene asking the question the payoff answers"];
  const issues: string[] = [];
  if (plan.scenes[0] !== hook) issues.push("the hook must open the video; the question comes first");
  const first = firstSentence(hook.narration);
  if (!/\?\s*$/.test(first))
    issues.push(`${hook.id}: the hook must ask a question the viewer can't answer yet; open on a question ending with '?'`);
  else if (/\b(because|therefore|so that|which is|that is)\b/i.test(first))
    issues.push(`${hook.id}: the hook never answers it in its first line; ask the question without giving the answer`);
  return issues;
}

const HOOK_STOP = new Set(
  "a,an,the,and,or,but,so,to,of,in,on,at,for,with,by,from,it,its,is,are,was,be,this,that,these,those,you,your,yours,we,they,them,their,our,my,me,just,then,than,as,if,into,out,up,do,does,can,will,would,has,have,had,not,no,all,any,one,like,what,which,who,how,when,where,there,here,now,also,very".split(
    ",",
  ),
);
const stem = (w: string) => w.replace(/es$/, "").replace(/s$/, "");
const contentWords = (s: string) =>
  norm(s)
    .split(" ")
    .filter((w) => w.length >= 4 && !HOOK_STOP.has(w))
    .map(stem);

/** The payoff answers the hook: it shares the question's key words. */
export function checkPayoffAnswersHook(plan: ScenePlan): string[] {
  const hook = plan.scenes.find((s) => s.kind === "hook");
  const payoff = [...plan.scenes].reverse().find((s) => s.kind === "recap" || s.kind === "outro");
  if (!hook) return ["the video needs a hook question for the payoff to answer"];
  if (!payoff) return ["the video needs a payoff (recap) that answers the hook"];
  const have = new Set(contentWords(firstSentence(hook.narration)));
  const shared = contentWords(payoff.narration).filter((w) => have.has(w));
  if (!shared.length)
    return [`${payoff.id}: the payoff must answer the hook ("${firstSentence(hook.narration).slice(0, 60)}"); share its key words`];
  return [];
}

const CAUSAL =
  /\b(because|therefore|so that|without|would be|lets|makes|means|fixes|solves|needs|why|how|when|since|until|unless|but|yet|however|then|next|forwards?|sends?|goes)\b/i;
/** A part beat says what it hands to the next part: the verbs that carry work across a hop. */
const HANDOFF =
  /\b(hand|pass|sends?|sent|gives?|gave|forward|deliver|emit|returns?|calls?|invok|fetch|feed|writ|read|stor|load|save|takes?|took|bring|carri|rout)\w*\b/i;
const EVIDENCE_WORDS = /\b(for example|for instance|trace|fails|breaks|error|measured|shows|e\.g\.|queue|lost)\b/i;

function mentionsPart(narration: string, arch: Architecture): boolean {
  const t = ` ${norm(narration)} `;
  return arch.components.some((c) => {
    const k = norm(c.keyword);
    return k.length > 2 && t.includes(` ${k} `);
  });
}

function advancesMechanism(s: Scene, arch: Architecture): boolean {
  if (!CAUSAL.test(s.narration)) return false;
  return arch.components.length === 0 || mentionsPart(s.narration, arch) || s.add_components.length > 0;
}

function showsEvidence(s: Scene): boolean {
  if ((s.items ?? []).length > 0 || (s.callouts ?? []).length > 0 || (s.highlights ?? []).length > 0) return true;
  if (codeFactsIn(s.narration).length > 0) return true;
  if ((s.beats ?? []).some((b) => ["terminal", "output", "number", "contrast", "browser"].includes(b.visual))) return true;
  return EVIDENCE_WORDS.test(s.narration);
}

/** A layer listing two or more parts with no why, no evidence, and no question. */
export function isInventoryScene(s: Scene, arch: Architecture): boolean {
  if (s.add_components.length < 2) return false;
  return !advancesMechanism(s, arch) && !showsEvidence(s) && !/\?/.test(s.narration);
}

/** Every scene advances the mechanism, shows evidence, or poses the next question (hook/recap exempt). */
export function checkScenePurpose(plan: ScenePlan, arch: Architecture): string[] {
  const issues: string[] = [];
  for (const s of plan.scenes) {
    if (s.kind === "hook" || s.kind === "recap" || s.kind === "outro") continue;
    if (advancesMechanism(s, arch) || showsEvidence(s) || /\?/.test(s.narration)) continue;
    if (isInventoryScene(s, arch))
      issues.push(
        `${s.id}: component inventory (${s.add_components.length} parts listed) without advancing the mechanism, showing evidence, or posing the next question; cut it or tie it to the spine`,
      );
    else
      issues.push(
        `${s.id}: lists parts without advancing the mechanism, showing evidence, or posing the next question; cut it or tie it to the spine`,
      );
  }
  return issues;
}

/** Side parts that never touch the request path don't serve the spine and are dropped. */
export function dropUntiedSides(arch: Architecture): { arch: Architecture; dropped: string[] } {
  const ids = new Set(arch.components.map((c) => c.id));
  const path: string[] = [];
  for (const st of arch.walkthrough.steps) for (const id of [st.from, st.to]) if (ids.has(id) && !path.includes(id)) path.push(id);
  const onPath = new Set(path);
  const tied = (id: string) => arch.connections.some((e) => (e.from === id && onPath.has(e.to)) || (e.to === id && onPath.has(e.from)));
  const drop = new Set(arch.components.filter((c) => !onPath.has(c.id) && !tied(c.id)).map((c) => c.id));
  const dropped = [...drop].map((id) => {
    const c = arch.components.find((x) => x.id === id)!;
    return `side part "${c.keyword}" left out: it never touches the request path`;
  });
  if (!drop.size) return { arch, dropped: [] };
  return {
    arch: {
      ...arch,
      components: arch.components.filter((c) => !drop.has(c.id)),
      connections: arch.connections.filter((e) => !drop.has(e.from) && !drop.has(e.to)),
      scale: arch.scale.filter((r) => !drop.has(r.component)),
    },
    dropped,
  };
}

function hasEvidenceContent(s: Scene): boolean {
  if ((s.beats ?? []).some((b) => ["terminal", "output", "number", "contrast", "browser"].includes(b.visual))) return true;
  if ((s.callouts ?? []).length > 0) return true;
  return EVIDENCE_WORDS.test(s.narration);
}

/** How many walkthrough parts the text names in the order one request meets them. */
export function pathPartsInOrder(narration: string, arch: Architecture): number {
  const ids = new Set(arch.components.map((c) => c.id));
  const path: string[] = [];
  for (const st of arch.walkthrough.steps) for (const id of [st.from, st.to]) if (ids.has(id) && !path.includes(id)) path.push(id);
  const t = ` ${norm(narration)} `;
  const at = path
    .map((id) => {
      const k = norm(arch.components.find((c) => c.id === id)?.keyword ?? "");
      return k.length > 2 ? t.indexOf(` ${k} `) : -1;
    })
    .filter((i) => i >= 0);
  const best: number[] = [];
  at.forEach((p, i) => {
    best[i] = 1 + Math.max(0, ...at.slice(0, i).map((q, j) => (q < p ? best[j] : 0)));
  });
  return Math.max(0, ...best);
}

/** The plan covers its format beats within the format's runtime. */
export function checkFormatBeats(plan: ScenePlan, format: ExplainFormat, arch: Architecture, wps = 2.6): string[] {
  const issues: string[] = [];
  const dur = (s: Scene) => wordCount(s.narration) / wps;
  const total = plan.scenes.reduce((n, s) => n + dur(s), 0);
  const [lo, hi] = FORMATS[format].seconds;
  if (total < lo || total > hi) issues.push(`the ${format} format runs ${lo}-${hi}s; this plan runs ${Math.round(total)}s`);
  const hook = plan.scenes.find((s) => s.kind === "hook");
  const payoff = [...plan.scenes].reverse().find((s) => s.kind === "recap" || s.kind === "outro");
  if (format === "short") {
    if (hook) {
      const d = dur(hook);
      if (d < 5 || d > 8) issues.push(`${hook.id}: the hook and stakes beat runs 5-8s; this hook runs ${d.toFixed(1)}s`);
    } else issues.push("the short format needs a hook and stakes beat (5-8s)");
    if (!plan.scenes.some((s) => ["layer", "walkthrough", "board"].includes(s.kind)))
      issues.push("the short format needs a core mechanism beat (20-25s)");
    if (!plan.scenes.some((s) => s.kind === "scale" || s.kind === "notes" || hasEvidenceContent(s)))
      issues.push("the short format needs a failure case or concrete example (10-15s); add a scale scene or a worked example");
    if (payoff) {
      const d = dur(payoff);
      if (d < 5 || d > 8) issues.push(`${payoff.id}: the payoff beat runs 5-8s; this payoff runs ${d.toFixed(1)}s`);
    } else issues.push("the short format needs a payoff beat (5-8s)");
  } else if (format === "anatomy") {
    if (!hook) issues.push("the anatomy format needs a hook question opening the tour");
    const layers = plan.scenes.filter((s) => s.kind === "layer");
    if (layers.length < 2)
      issues.push(
        "the anatomy format tours the parts layer by layer (entry point, core, data, infra); this plan has fewer than 2 layer scenes",
      );
    for (const s of layers) {
      if (!HANDOFF.test(s.narration))
        issues.push(
          `${s.id}: each part beat states what it owns, what it hands to the next part, and why it exists; this one never says what it hands on`,
        );
      if (codeFactsIn(s.narration).length === 0)
        issues.push(
          `${s.id}: each part beat cites at least one file path or \`symbol\` from the facts manifest; this one names no file or symbol`,
        );
    }
    const traced = plan.scenes.some(
      (s) => s.kind === "walkthrough" && codeFactsIn(s.narration).length > 0 && pathPartsInOrder(s.narration, arch) >= 2,
    );
    if (!traced)
      issues.push(
        "the anatomy format anchors the tour on one request traced end to end; add a walkthrough naming real file paths and `symbols` along the path",
      );
    if (!payoff) issues.push("the anatomy format needs a payoff beat (recap) lighting the whole map along the traced path");
    else if (pathPartsInOrder(payoff.narration, arch) < 2)
      issues.push(`${payoff.id}: the final beat shows the whole map lit up along the traced path; retell it naming the parts in order`);
  } else {
    if (!hook) issues.push("the deep format needs a problem beat (hook)");
    if (!plan.scenes.some((s) => s.kind === "layer" || s.kind === "board"))
      issues.push("the deep format needs a mental model beat (layer)");
    if (!plan.scenes.some((s) => s.kind === "walkthrough" || s.kind === "board"))
      issues.push("the deep format needs a mechanism beat (walkthrough)");
    const trace = plan.scenes.some(
      (s) =>
        s.kind === "walkthrough" &&
        (codeFactsIn(s.narration).length > 0 || (s.beats ?? []).some((b) => b.visual === "terminal" || b.visual === "output")),
    );
    if (!trace) issues.push("the deep format needs a code trace or worked example; show a real command, file, or output");
    if (!plan.scenes.some((s) => s.kind === "scale" || (s.kind === "notes" && /fail|tradeoff|trade-off|limit|break/i.test(s.narration))))
      issues.push("the deep format needs a failure case or tradeoff; add a scale scene");
    if (!payoff) issues.push("the deep format needs a payoff beat (recap)");
  }
  return issues;
}

const ADOPTION = /\b(adoption|popular|community|used by|trusted|loved|downloads?|teams use)\b/i;
const CLAIMED = /\b(claims?|says?|according to|README)\b/i;

/** Numbers come only from the manifest; stars need adoption context, benchmarks need "claims", lines stay approximate. */
export function checkManifestNumbers(plan: ScenePlan, manifest: FactsManifest, arch?: Architecture): string[] {
  const issues: string[] = [];
  const counts = new Set<number>();
  if (arch) {
    counts.add(arch.components.length);
    counts.add(arch.walkthrough.steps.length);
  }
  for (const s of plan.scenes) {
    for (const n of digitNumbers(s.narration)) {
      if (n.value <= 1 || counts.has(n.value)) continue;
      if (s.kind === "scale" && (n.value === 10 || n.value === 100)) continue;
      const anchor = manifestHas(manifest, n.value);
      if (!anchor) {
        issues.push(`${s.id}: states ${n.raw} with no manifest entry; cut it or add {value, source_url, retrieved_at, commit}`);
        continue;
      }
      if (anchor.kind === "stars" && !ADOPTION.test(s.narration))
        issues.push(`${s.id}: states ${n.raw} stars without adoption context; stars tell adoption, not why it works`);
      if (anchor.kind === "benchmark" && !CLAIMED.test(s.narration))
        issues.push(`${s.id}: states benchmark ${n.raw} as fact; say "the project claims ..."`);
    }
    if (/\d[\d,]*\s*lines\b/i.test(s.narration) && !/\b(about|around|roughly|approximately)\b/i.test(s.narration))
      issues.push(`${s.id}: line counts are approximate; say "about N lines" with the method`);
  }
  return [...new Set(issues)];
}

/** Real anchors per minute: manifest numbers plus code facts (`symbols`, file paths). */
export function anchorDensity(
  plan: ScenePlan,
  manifest: FactsManifest,
  wps = 2.6,
): { anchors: number; minutes: number; perMinute: number } {
  let anchors = 0;
  for (const s of plan.scenes) {
    for (const n of digitNumbers(s.narration)) if (n.value > 1 && manifestHas(manifest, n.value)) anchors++;
    anchors += codeFactsIn(s.narration).length;
  }
  const minutes = plan.scenes.reduce((n, s) => n + wordCount(s.narration), 0) / wps / 60 || 0;
  return { anchors, minutes, perMinute: minutes ? anchors / minutes : 0 };
}

const GENERIC_LABEL = new Set(
  "input,inputs,output,outputs,process,step,steps,data,system,systems,server,servers,client,clients,user,users,app,apps,service,services,thing,things,part,parts,box,boxes".split(
    ",",
  ),
);

export interface VisualMoments {
  mechanism: number;
  evidence: number;
  total: number;
  generic: string[];
}

/** Specific mechanism drawings plus failure/evidence visuals; labels alone don't count. */
export function countVisualMoments(plan: ScenePlan, arch: Architecture): VisualMoments {
  let mechanism = 0,
    evidence = 0;
  const generic: string[] = [];
  const namesPart = (t: string) => {
    const low = ` ${norm(t)} `;
    return arch.components.some((c) => {
      const k = norm(c.keyword);
      return k.length > 2 && low.includes(` ${k} `);
    });
  };
  for (const s of plan.scenes) {
    let mech = false;
    if (["layer", "walkthrough", "board"].includes(s.kind)) {
      const focus = (s.beats ?? []).some((b) => b.visual === "board" && b.focus && arch.components.some((c) => c.id === b.focus));
      const nodes = (s.board_nodes ?? []).length >= 2 && (s.board_edges ?? []).length >= 1;
      if (focus || nodes) {
        if (nodes) {
          const kws = (s.board_nodes ?? []).map((n) => n.keyword);
          if (kws.length && kws.every((k) => GENERIC_LABEL.has(norm(k)))) {
            generic.push(
              `${s.id}: diagram is too generic (labels ${kws.join(", ")} would work on any topic); show the actual hops and what each knows`,
            );
          } else if (namesPart(s.narration) || CAUSAL.test(s.narration)) mech = true;
          else if ((s.board_nodes ?? []).some((n) => ` ${norm(s.narration)} `.includes(` ${norm(n.keyword)} `))) mech = true;
          else generic.push(`${s.id}: diagram labels alone don't count; the narration must name what the drawing shows`);
        } else if (namesPart(s.narration) && CAUSAL.test(s.narration)) mech = true;
        else generic.push(`${s.id}: board labels alone don't count; show the causal step the narration names`);
      }
    }
    let ev = false;
    if ((s.beats ?? []).some((b) => ["terminal", "output", "number", "contrast", "browser"].includes(b.visual))) ev = true;
    if (s.kind === "scale" && (s.callouts ?? []).length > 0) ev = true;
    if (["notes", "chart", "timeline", "map"].includes(s.kind) && (s.items ?? []).length > 0) ev = true;
    if (mech) mechanism++;
    if (ev) evidence++;
  }
  return { mechanism, evidence, total: mechanism + evidence, generic };
}

/** Short needs 2 visual moments, deep 3, anatomy 4, including one specific mechanism drawing. */
export function checkVisualReasoning(plan: ScenePlan, format: ExplainFormat, arch: Architecture): string[] {
  const c = countVisualMoments(plan, arch);
  const need = FORMATS[format].visuals;
  const issues = [...c.generic];
  if (c.mechanism < 1)
    issues.push(`the ${format} format needs one specific mechanism drawing that shows the causal chain; labels alone don't count`);
  if (c.total < need)
    issues.push(`the ${format} format needs ${need} visual reasoning moments (mechanism plus failure/evidence); this plan has ${c.total}`);
  return issues;
}

export interface RubricScore {
  hook: 0 | 1 | 2;
  causal: 0 | 1 | 2;
  anchors: 0 | 1 | 2;
  visual: 0 | 1 | 2;
  payoff: 0 | 1 | 2;
  total: number;
  issues: string[];
}

export interface RubricOpts {
  arch: Architecture;
  manifest?: FactsManifest;
  format: ExplainFormat;
  wps?: number;
  /** concept videos: source text grounding numbers, boards, and quotes when no repo manifest exists */
  source?: string;
}

/** Five-criterion rubric (hook, causal chain, anchors, visual reasoning, payoff), 0-2 each. */
export function scoreRubric(plan: ScenePlan, o: RubricOpts): RubricScore {
  const wps = o.wps ?? 2.6;
  const issues: string[] = [];
  let hook: 0 | 1 | 2;
  const hookScene = plan.scenes.find((s) => s.kind === "hook");
  if (!hookScene || plan.scenes[0] !== hookScene) {
    hook = 0;
    issues.push("hook 0/2: the video must open with a hook scene asking the question");
  } else {
    const first = firstSentence(hookScene.narration);
    const words = wordCount(first);
    const isQ = /\?\s*$/.test(first);
    const answered = /\b(because|therefore|so that)\b/i.test(first);
    const generic = /^(hi|hello|welcome|today|in this video|this is|meet|let's)\b/i.test(first);
    if (isQ && !answered && words <= 14 && !generic) hook = 2;
    else if (isQ || /\b(you|your)\b/i.test(first) || /\d/.test(first)) {
      hook = 1;
      issues.push(`hook 1/2: open on a short question (at most 14 words) the viewer can't answer yet; got "${first.slice(0, 60)}"`);
    } else {
      hook = 0;
      issues.push(`hook 0/2: open on a question, not "${first.slice(0, 60)}"`);
    }
  }
  const purpose = checkScenePurpose(plan, o.arch);
  const inventories = plan.scenes.filter((s) => isInventoryScene(s, o.arch)).length;
  let causal: 0 | 1 | 2;
  if (!purpose.length && !inventories) causal = 2;
  else if (purpose.length <= 2 && inventories <= 1) {
    causal = 1;
    issues.push(`causal chain 1/2: ${purpose[0] ?? "one beat lists parts"}`);
  } else {
    causal = 0;
    issues.push(`causal chain 0/2: ${purpose.length} beats list parts without because/therefore; ${purpose[0] ?? ""}`);
  }
  const manifest = o.manifest ?? [];
  let anchors: 0 | 1 | 2;
  if (manifest.length) {
    const density = anchorDensity(plan, manifest, wps);
    const mIssues = checkManifestNumbers(plan, manifest, o.arch);
    if (density.perMinute >= 2 && !mIssues.length) anchors = 2;
    else if (density.perMinute >= 1 && mIssues.length <= 1) {
      anchors = 1;
      issues.push(`anchors 1/2: ${density.perMinute.toFixed(1)}/min (need 2+); ${mIssues[0] ?? "add code facts"}`);
    } else {
      anchors = 0;
      issues.push(`anchors 0/2: ${density.perMinute.toFixed(1)}/min (need 2+); ${mIssues[0] ?? "no verifiable anchors"}`);
    }
  } else if (o.source) {
    const srcNums = new Set(
      o.source
        .replace(/,/g, "")
        .split(/[^0-9.]+/)
        .filter(Boolean),
    );
    let n = 0;
    for (const s of plan.scenes) {
      for (const d of digitNumbers(s.narration)) if (d.value > 1 && srcNums.has(String(d.value))) n++;
      n += (s.board_nodes ?? []).length + (s.highlights ?? []).length + (s.items ?? []).length;
    }
    const minutes = plan.scenes.reduce((t, s) => t + wordCount(s.narration), 0) / wps / 60 || 0;
    const perMin = minutes ? n / minutes : 0;
    if (perMin >= 2) anchors = 2;
    else if (perMin >= 1) {
      anchors = 1;
      issues.push(`anchors 1/2: ${perMin.toFixed(1)}/min (need 2+); ground more boards and numbers in the source`);
    } else {
      anchors = 0;
      issues.push(`anchors 0/2: ${perMin.toFixed(1)}/min (need 2+); no numbers, boards, or quotes from the source`);
    }
  } else {
    const density = anchorDensity(plan, manifest, wps);
    if (density.perMinute >= 2) anchors = 2;
    else if (density.perMinute >= 1) {
      anchors = 1;
      issues.push(`anchors 1/2: ${density.perMinute.toFixed(1)}/min (need 2+); add code facts`);
    } else {
      anchors = 0;
      issues.push(`anchors 0/2: ${density.perMinute.toFixed(1)}/min (need 2+); no verifiable anchors`);
    }
  }
  const vis = countVisualMoments(plan, o.arch);
  const need = FORMATS[o.format].visuals;
  let visual: 0 | 1 | 2;
  if (vis.mechanism >= 1 && vis.total >= need && !vis.generic.length) visual = 2;
  else if (vis.mechanism >= 1 && vis.total >= need - 1) {
    visual = 1;
    issues.push(`visual reasoning 1/2: ${vis.total}/${need} moments; ${vis.generic[0] ?? "add evidence"}`);
  } else {
    visual = 0;
    issues.push(
      `visual reasoning 0/2: ${vis.total}/${need} moments, ${vis.mechanism} mechanism; ${vis.generic[0] ?? "labels alone don't count"}`,
    );
  }
  const payScene = [...plan.scenes].reverse().find((s) => s.kind === "recap" || s.kind === "outro");
  let payoff: 0 | 1 | 2;
  if (!payScene) {
    payoff = 0;
    issues.push("payoff 0/2: no recap answering the hook");
  } else {
    const shares = !checkPayoffAnswersHook(plan).length;
    const you = /\b(you|your)\b/i.test(payScene.narration);
    const isQ = /\?/.test(payScene.narration);
    if (shares && you && !isQ) payoff = 2;
    else if (shares || you) {
      payoff = 1;
      issues.push(
        `payoff 1/2: the recap must answer the hook for "you"; ${!shares ? "it shares no key words with the hook" : "it never says you"}`,
      );
    } else {
      payoff = 0;
      issues.push("payoff 0/2: the recap answers neither the hook nor the viewer");
    }
  }
  return { hook, causal, anchors, visual, payoff, total: hook + causal + anchors + visual + payoff, issues };
}

/** Weak scripts are rejected for one bounded rewrite: under 7/10 or any criterion at zero. */
export function shouldRejectRubric(s: RubricScore): boolean {
  return s.total < 7 || [s.hook, s.causal, s.anchors, s.visual, s.payoff].includes(0);
}

/**
 * A script with no verifiable anchors or no causal chain is not fixed by rewording: the whole plan
 * is regenerated instead (up to the plan retry limit), because only a new draft can trace the
 * request through real files or tie the parts to the mechanism.
 */
export function shouldRegeneratePlan(s: RubricScore): boolean {
  return s.anchors === 0 || s.causal === 0;
}

/** The better of two rubric scores: the higher total wins, and fewer open issues break a tie. */
export function isBetterRubric(next: RubricScore, best: RubricScore): boolean {
  return next.total > best.total || (next.total === best.total && next.issues.length < best.issues.length);
}
