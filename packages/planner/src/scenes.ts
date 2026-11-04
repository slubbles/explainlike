import { findPlace } from "@explanimate/core/places";
import { z } from "zod";
import {
  ScenePlan,
  RepoPlanWire,
  ConceptPlanWire,
  PLAIN_LANGUAGE,
  PLAIN_HEADINGS,
  plainSlips,
  stiffLines,
  practitionerTerm,
  figurative,
  coverageSeconds,
  parseFigure,
  parseDated,
  figureInQuote,
  lower,
  norm,
  tidySpeech,
  wordCount,
  quoteInSource,
  phraseAt,
  spokenWords,
  walkCues,
  missingArticles,
  grammarSlips,
  soundsLikeKeywords,
  shortHeading,
  type Architecture,
  type ExplainSpec,
  type Progress,
  type NoteItem,
  type Scene,
  type SourceDoc,
  promptFacts,
  type FactsManifest,
} from "@explanimate/core";
import { sparkJson, type CostLedger } from "@explanimate/models";
import { SHAPES, WHAT_IF, analogyRule, shapeFor, type Shape } from "./shapes.js";
import { checkBeats, beatAnchors, boardBeats, readmePromises, type BeatReport } from "./beats.js";
import {
  checkFormatBeats,
  checkHookQuestion,
  checkManifestNumbers,
  checkPayoffAnswersHook,
  checkScenePurpose,
  checkVisualReasoning,
  formatRule,
  scoreRubric,
  shouldRejectRubric,
} from "./quality.js";

/** Plain words are literal words: the newcomer test kept passing narration that swapped jargon for a riddle. */
const PLAIN =
  "Plain words mean the literal thing in everyday words, not a figure of speech: never call a model 'a brain', its saved weights 'memory', or a step 'magic', and never squeeze a term into a made-up phrase ('fast focus math'); say what it is ('the saved model weights', 'attention, the math that decides which earlier words matter').";

const STYLE = [
  "Style of the video: a friend drawing on a whiteboard while explaining over coffee to a smart person who doesn't write code (docs/explaining-playbook.md).",
  PLAIN_LANGUAGE,
  "Narration is spoken; write it for the ear: short sentences, concrete, no filler ('in this video', 'let's dive in', 'robust', 'seamless', 'leverage' are banned).",
  "The first line states the concrete problem or payoff for the viewer in plain words, within about 8 seconds: a question, a line that says 'you', or a surprising number. No warm-up, no title read-out.",
  "Every narration sentence is complete and grammatical: each verb agrees with its subject, and articles (a, an, the) are not dropped.",
  "Real names, explained. Call each part by its keyword, which is its real name (agent-browser CLI, the daemon, Chrome DevTools Protocol), and the first time it is said, say what it is in one plain clause in the same sentence: 'the daemon, a program that keeps running in the background'. Never invent a nickname for a part and never swap its name for an analogy. Name the familiar tools people already use next to it: 'an AI agent, like Claude Code or Cursor'. A code name that is not a part (a library or file name such as SQLite) is said only when it helps, with what it is. Any other technical term (an acronym, 'api', 'driver', 'harness') gets the same one-clause explanation, and a term the newcomer does not need is left out. Never 'called X'.",
  "Problem before fix: before a part or a feature, say in one line what is hard or annoying without it.",
  "Never call a part or the AI agent a 'helper', 'buddy' or 'sidekick' ('That helper is an AI agent' is wrong); name it ('the AI agent, like Claude Code').",
  "Give every sentence its own visual: about one new beat every sentence, so the picture changes every 3 to 5 seconds.",
  PLAIN,
  "The viewer is 'you' where it's natural; the parts are 'the daemon', 'the command line', not 'your daemon', 'your command line'. Never call them 'the guest', 'the user' or 'the customer', even inside the analogy ('you walk up to the counter', not 'the guest walks up').",
  "No two scenes or two sentences in a row open with the same words.",
  "Each part gets its why, and the why comes first: say what would be slow, hard or impossible without it, then the part that fixes it ('Opening a fresh browser for every command would be slow. So behind it runs the daemon...'). A line that only says which part hands what to which ('the CLI sends it to the daemon, which sends it to Chrome') explains nothing; say what each hop is for.",
  "Every sentence has its own subject and verb and sounds like something a person says aloud: never a label-like line ('The agent-browser CLI starts every job.'), never a garbled phrase ('for you user to use').",
  "After a part's full name is said, the next sentence calls it 'it' or a short name ('the CLI'), never the full name again.",
  "Start a sentence on a part with 'the' ('The daemon keeps...'), never on its bare name ('Daemon keeps...', 'Agent-browser CLI starts...').",
  `${PLAIN_HEADINGS} Headings are lowercase and the narration of that scene says their words (the viewer reads the heading while hearing it).`,
  "Keywords 1 to 3 lowercase words.",
  "One new thing per sentence, and each sentence long enough to watch it being drawn (no two-word sentences).",
  "Short lines, one idea each: about 5 to 14 words a line, a new visual every 3 to 5 seconds; cut every sentence the story does not need.",
  "Every sentence moves the story. Never announce what comes next instead of saying it: 'you'll meet', 'you'll see', 'you'll find', 'then you've got', 'let's take a look', 'basically', 'it's special' and 'it's important' are banned.",
  "If the video uses an everyday analogy, keep that one analogy from the hook to the end; never switch to a second one.",
  "At most one short, dry aside in the whole video, the kind a friendly engineer makes at the whiteboard ('which, to be fair, is most of programming'). Never a joke about people, never more than one sentence.",
  "Close on a one-sentence takeaway for 'you', then a one-sentence retrace of what happened; never a list of steps.",
].join("\n");

/**
 * The voice to match, shown rather than described: the approved agent-browser script, a Fireship and
 * a Crayon Capital opening. Rules alone kept producing lines that were grammatical but not speech
 * ("the agent-browser CLI starts every job"); examples carry the rhythm the rules cannot.
 */
export const VOICE_EXAMPLES = [
  "Examples of the voice to match. Match their rhythm and plainness; never copy their facts unless they are true of this source.",
  "1. An approved explainer of a command-line tool (one line per visual):",
  "  What if your AI could really click around the web?",
  "  Not guess what a page says. Actually open it, read it, and press the button.",
  "  That's agent-browser: a command-line tool that lets an AI agent, like Claude Code or Cursor, drive a real Chrome browser.",
  "  Your agent doesn't need a special API. It just types commands, the way you would.",
  "  Those commands go to the agent-browser CLI, a small program written in Rust, so it starts fast.",
  "  But opening a fresh browser for every command would be slow. So behind it runs the daemon: a background process that keeps the browser open between commands.",
  "  Now the clever part. Your agent can't see the screen. So it asks for a snapshot.",
  "  A snapshot is the page as a short text list: every box and button, each with a tag called a ref.",
  "  So it can say: fill e3 with your email, click e2. No guessing where things are.",
  "  And the password? Save it in the auth vault, and the AI never sees it.",
  "2. Fireship, Docker in 100 seconds (problem before the fix):",
  "  Docker, a tool that packages software into containers that run reliably in any environment. But what is a container, and why do you need one?",
  "  Imagine you built an app that runs on some weird flavor of Linux. You want to share it with your friend, but he has an entirely different system.",
  "  So the problem becomes: how do we replicate the environment our software needs on any machine?",
  "3. Crayon Capital, on TSMC (concrete before abstract):",
  "  Right now, somewhere in Taiwan, a machine the size of a school bus is printing circuits thinner than a strand of DNA.",
  "  Every iPhone, every AI chip, every modern fighter jet depends on what comes out of that building.",
  "What they share: every sentence has a clear subject doing something; a part is named once with what it is, then called 'it'; each part arrives because of a problem said first; the real command or output is said aloud as the example.",
].join("\n");

/** Components in the order one request meets them, then the parts the request never touches. */
export function journeyOrder(arch: Architecture): { path: string[]; side: string[] } {
  const ids = new Set(arch.components.map((c) => c.id));
  const path: string[] = [];
  for (const st of arch.walkthrough.steps) for (const id of [st.from, st.to]) if (ids.has(id) && !path.includes(id)) path.push(id);
  return { path, side: arch.components.map((c) => c.id).filter((id) => !path.includes(id)) };
}

/**
 * What the video may cover beyond the core flow, held to the README: a side part the request never
 * passes through stays only when the README's opening (what a reader meets first) names it, and a scale
 * risk stays only when the README says its fix. Without this a dashboard deep in the docs, or a guessed
 * load problem, got a scene of its own. A repo with no README keeps everything.
 */
const FIX_FILLER = /^(with|from|that|this|them|then|each|every|more|less|into|over|than|when|only|instead|before|after|using|their)$/;
export function groundToReadme(arch: Architecture, readme: string, head = 12_000): { arch: Architecture; dropped: string[] } {
  if (!readme.trim()) return { arch, dropped: [] };
  const top = ` ${norm(readme.slice(0, head))} `,
    all = ` ${norm(readme)} `;
  const { side } = journeyOrder(arch);
  const named = (c: Architecture["components"][number]) =>
    [c.keyword, c.name].some((k) => norm(k).length > 2 && top.includes(` ${norm(k)} `));
  const drop = new Set(arch.components.filter((c) => side.includes(c.id) && !named(c)).map((c) => c.id));
  // every content word of the fix appears somewhere in the README ("reuse", "contexts"), so the fix is the README's, not a guess
  const said = (fix: string) =>
    norm(fix)
      .split(" ")
      .filter((w) => w.length > 3 && !FIX_FILLER.test(w))
      .every((w) => all.includes(` ${w} `) || all.includes(` ${w.replace(/s$/, "")} `));
  const scale = arch.scale.filter((r) => !drop.has(r.component) && said(r.fix));
  const dropped = [
    ...arch.components.filter((c) => drop.has(c.id)).map((c) => `side part "${c.keyword}" left out: the README's opening never names it`),
    ...arch.scale
      .filter((r) => !scale.includes(r))
      .map((r) => `scale risk "${r.problem}" left out: the README never says its fix ("${r.fix}")`),
  ];
  if (!dropped.length) return { arch, dropped };
  return {
    arch: {
      ...arch,
      components: arch.components.filter((c) => !drop.has(c.id)),
      connections: arch.connections.filter((c) => !drop.has(c.from) && !drop.has(c.to)),
      scale,
    },
    dropped,
  };
}

// ---------------------------------------------------------------------------
// Repo: tell one request's journey on one evolving canvas (docs/explaining-playbook.md).
// ---------------------------------------------------------------------------
/** The anatomy tour: the parts layer by layer, each beat owning, handing on, and justified, on one traced request. */
const ANATOMY_TOUR = [
  "Anatomy tour: visit the parts layer by layer in the order above: the entry point where one request comes in first, then the core engine, data and storage, infra and deploy, tests and CI where the map has them.",
  "Each layer scene is one part beat: say what the part owns, what it hands to the next part, and why it exists (what would be slow, hard or impossible without it).",
  "The walkthrough traces ONE request end to end through actual file paths and `symbols` from the code; name the file or symbol at each hop. The recap closes on the whole map lit up along that traced path, naming the parts in order.",
].join(" ");
function repoSystem(arch: Architecture, L: ExplainSpec, lo: number, hi: number, manifest?: FactsManifest): string {
  const shape = shapeFor(L.brief.approach);
  const S = SHAPES[shape];
  const { path, side } = journeyOrder(arch);
  const kw = (id: string) => `${id} ("${arch.components.find((c) => c.id === id)?.keyword}")`;
  const name = (id: string) => arch.components.find((c) => c.id === id)?.keyword ?? id;
  const steps = arch.walkthrough.steps.map((s) => `${name(s.from)} to ${name(s.to)} (${s.label})`).join("; ");
  // no analogy unless the brief chose one: a default picture became a running travel metaphor ("your ride", "too many riders")
  const analogy = L.brief.analogy;
  return [
    "You write the scene plan for a short whiteboard explainer of one repository. The renderer draws one evolving architecture canvas.",
    "Goal: a newcomer finishes the video able to say what this project is and how one request flows through it. That flow is the video.",
    STYLE,
    VOICE_EXAMPLES,
    L.voice,
    formatRule(L.format),
    ...(L.format === "anatomy" ? [ANATOMY_TOUR] : []),
    "The hook asks one question the viewer can't answer yet and never answers it in its first line; the recap answers it in plain words for 'you'.",
    "Every layer, walkthrough, scale and notes scene advances the mechanism (because/therefore), shows evidence (a real command, file, row, or number), or poses the next question; a scene that only lists parts is cut.",
    "Show one specific mechanism drawing (the actual hops and what each hop knows, not labels that would work on any topic) plus failure or evidence visuals.",
    ...(manifest?.length
      ? [
          `Numbers come only from this facts manifest (value plus source); any other number is cut. Stars are adoption only, benchmarks are phrased as "the project claims", line counts as "about N lines": ${JSON.stringify(promptFacts(manifest))}`,
        ]
      : []),
    analogyRule(shape, analogy),
    "Scene order and rules:",
    `1. one 'hook' scene, 3 or 4 sentences, shown big on screen as it is spoken. ${S.hook} Whatever the shape, right after the hook line say what this project is, who it's for and why they'd care, in plain everyday words with no jargon, like '${arch.one_liner}'; someone who doesn't write code and hears only that knows what the thing is for and whether it's for them. add_components empty.`,
    `2. 'layer' scenes, one part or a few at a time, adding exactly these components in this order, at most ${L.perScene} per scene: ${path.map(kw).join(", ")}. ${S.spine} Say each added component's keyword out loud, in add_components order.`,
    `3. one 'walkthrough' scene right after them: the core flow told once, end to end, as one short story. Tell these steps in order, each as a natural sentence about who does what to the example, in everyday words, and name the part each step reaches by its keyword: the board moves to that part when you say it. The words in brackets only say what happens; they are not words to recite, so say the action the way a person would ('the chat window loads the saved model') and never turn a bracket into a noun ('the send cdp instruction', 'the drive page move', 'the return result step'). Call each part by its keyword, the name on screen that the layer scenes already said; its analogy role may ride along ('the demo app, your front desk, sends the message') but never stands in for it, since a viewer cannot map a new role name to a box, with articles and verb endings as speech needs: ${steps}. Say what happens and why it matters, the way you'd tell a friend; never a chain of handoffs ('A passes it to B, B passes it to C'): each sentence says what that hop does for you. The trip back may be one sentence that names only where it lands ('the list comes back to your AI agent'), not every part it passes again. When the README shows how the product is really driven (the commands typed and what they print, like a snapshot's rows), the walkthrough follows that real example: say the real command aloud as the example ('it types snapshot'), say what comes back ('a short list where the email box is e3'), and what that lets it do next. Good: 'Your AI agent says click the login button, and the daemon clicks it in Chrome.' Good: 'You type a question, and the counter sends the message to the manager.' Bad: 'The cli sends a cdp command to the client.' Bad: 'Step one is send message.' Never number the steps out loud. Follow one concrete example from the repo the whole way (a real input like the words 'hello world', a real message, a real file) and say what it looks like after each step, the way Caleb follows one 2 TB model from disk to GPU. End with the concrete thing the user gets back (e.g. 'a working fix in your chat'), not 'an answer'. Give it a heading of 2 to 4 lowercase words that the narration actually says, naming this moment rather than labelling it. About ${Math.round(L.wordsPerScene * 1.6)} words. add_components empty. Each hop carries its why in the same sentence or the next: what would go wrong or be slow without it ('so the AI can point at e3 instead of guessing'), never a bare chain of 'X sends it to Y, which sends it to Z'.`,
    side.length
      ? `4. then 'layer' scene(s) for the side parts the request does not pass through: ${side.map(kw).join(", ")}. Keep them short: as few scenes as fit (at most ${L.perScene} parts per scene), one short clause per part (its keyword and plain job), opening with one tie-back to the journey that says why these parts exist (the problem they solve). Do not repeat the same opener for each part.`
      : "4. (no side parts)",
    arch.scale.length
      ? `5. ${arch.scale.length} short 'scale' scene(s), one per scale risk, in the given order: what breaks at that traffic level and why (problem keyword), then the fix (fix keyword), in 2 short plain sentences ('The fix is ...'). callouts: [{target: component id, text: problem keyword, color: red}, {target: component id, text: fix keyword, color: green}].`
      : "5. no 'scale' scenes.",
    ...notesRules(L.notes),
    `6. one closing scene of kind 'recap': ${S.recap ? S.close : "First the walkthrough's payoff: what this system can do for you now that the first small version could not, in one sentence."} It answers 'so what does it do for me?' in one or two plain sentences, then retells what happened in one short literal sentence (not a list of steps), naming the parts by keyword in this order: ${path.map((id) => `"${arch.components.find((c) => c.id === id)?.keyword}"`).join(", ")}. About ${recapWords(path.length)} words; never re-explain a part.`,
    `Headings: ${S.headings}`,
    `Keep the hook and the layer scenes brief enough that the walkthrough starts before the halfway mark of the whole narration, counted in words. Each scene's narration is about ${L.wordsPerScene} words (the hook can be shorter). There is no set length. At ${L.tempo.wps} words per second this repo's parts come to roughly ${lo} to ${hi} seconds; shorter is right if the story is told, never pad.`,
    "Only say two parts talk to each other ('the poll input feeds the ui core') when the connections list joins them; otherwise tell the hop through the part between them.",
    "Leave add_connections, board_nodes, board_edges, highlights empty (the renderer derives them). callouts empty except in scale scenes. items empty except in notes scenes.",
    "Never state a traffic, user, latency or cost number as a fact about this app: the repo does not tell you its real load. Numbers only appear as clearly labelled assumptions.",
    "Proofread every sentence aloud: a/an and singular/plural agree with the noun, no half-finished phrases. Headings are on screen, never spoken as if they were a part.",
    "title: the product name in lowercase. subtitle: the one-line tagline under the name, 3 to 6 lowercase words saying what it does for you ('ai clicks real web pages').",
    ...BEAT_RULES,
  ].join("\n");
}

/** How a repo plan pairs every narration line with what the screen shows (docs/explaining-playbook.md, "Visuals"). */
export const BEAT_RULES = [
  "Per-line visuals. Every scene has 'beats', one per narration line (a line is one or two short sentences). The beats' lines joined with spaces are the scene's narration, word for word: write the beats, then copy their lines into narration.",
  "Each beat picks the visual that best shows that line, and puts on screen only words the line says, so the viewer reads them as they hear them:",
  "- board: stay on the diagram while the line draws or points at a part (focus: that component id, or empty). Use it on the line that names each new part in a layer scene; in the walkthrough, alternate board lines with terminal, output and browser cards for what is typed, read back and done.",
  "- kinetic: 2 to 8 words of the line in big hand lettering (text), for a claim, a problem or a punchline.",
  "- chips: 2 to 4 names said in the line as labelled chips (items), like ['Claude Code', 'Cursor', 'Codex'], to tie a part to tools people already use. Never a logo.",
  "- terminal: the exact command (text) copied from the README, like 'agent-browser open example.com'; items: up to 3 output lines copied from the README, or empty. The line says the command or a word of it.",
  "- output: what a command hands back (text: what it is, like 'snapshot'; items: 2 to 5 rows as the README shows them, like 'button \"Submit\" [ref=e2]'); focus: the row to circle.",
  "- browser: a page being driven (text: the address; items: 2 to 4 page elements, like 'email box', 'button submit'; focus: the element clicked).",
  "- number: one figure the line says, made concrete (text: '1 command', '7 steps'); only numbers the source states, or 'one'.",
  "- contrast: before and after, or problem and fix (items: exactly [before, after], each 2 to 5 words the line says).",
  "- doodle: one labelled sketch (text: the label, words the line says; focus: a plain noun for the picture, like 'robot' or 'browser').",
  "- title: only the hook's first beat, the title card while the hook line is said.",
  "anchor: 1 to 4 consecutive words of the line, copied exactly, where the visual appears (usually the first word it shows).",
  "Mix them the way a good YouTube explainer does: never the same visual three lines running (board excepted), a new visual every 3 to 5 seconds, and at least four different card types across the video. The hook: title, then 2 or 3 card lines (a contrast or kinetic for the problem, chips naming the AI agents people use, a terminal with the one command). Scale and notes lines may use number or contrast. The recap ends on one payoff sentence, shown as kinetic.",
  "Write lines that earn those cards: when the walkthrough says the agent asks for something, say the real command aloud ('it types snapshot') on a terminal line; when it says what comes back, describe the rows ('a short list: the email box is e3, the button is e2') on an output line with the README's rows; when it says the page is clicked or filled, a browser line; when a part fixes a problem or keeps a promise (the LLM never sees passwords), a contrast line with the problem and the fix. A terminal line says every word of its command after the program name ('fill e3', 'snapshot'), or it is not shown.",
  "Kinetic is the seasoning: at most about one card in three is kinetic; prefer a card that shows the thing.",
  "Never invent a command, an output row or a number: copy them from the README excerpt. Leave a beat's unused fields empty.",
];

const Critique = z.object({
  undefined_terms: z
    .array(z.object({ term: z.string(), scene: z.string() }))
    .describe("terms a newcomer would not know, used without a plain-words explanation at their first use"),
  odd_phrases: z
    .array(z.object({ phrase: z.string(), scene: z.string() }))
    .describe("figures of speech or squeezed made-up phrases that stand in for a real thing and would puzzle a newcomer, quoted exactly"),
  purpose: z
    .string()
    .describe(
      "what this project is and why someone would use it, in one sentence, as you understood it from the opening; empty if the opening never told you",
    ),
  hard_sentences: z
    .array(z.object({ sentence: z.string(), scene: z.string(), why: z.string() }))
    .describe(
      "sentences a smart person who doesn't write code would stumble on, quoted exactly: jargon; component names instead of what happens; circular lines that explain a part with itself ('the browser link drives it in the web browser'); a step label said as a noun ('you get the read result'); vague pointers ('that step', 'it' with no clear thing); a forced metaphor (a trip, a ride, riders); 'your' stuck on every part; anything awkward, stiff or too long to say aloud the way a person talks casually, with why in a few words",
    ),
  who_for: z
    .string()
    .describe("who this project is for and why they'd care, as you understood it from the opening; empty if the opening never told you"),
  flow_clear: z.boolean().describe("true if a newcomer could retell how one request goes from the user to the result"),
  flow_problem: z.string().describe("what is missing from the flow, or empty"),
});
export type Critique = z.infer<typeof Critique>;

/** Who every line is graded for: the brief's audience, held to the plain-language bar of a friend who doesn't code. */
export const plainListener = (audience: string) =>
  `a smart friend who doesn't write code, hearing a video made for ${audience}; every sentence has to make sense to you`;

/** Model check: read the narration as a newcomer would, graded against the plain-language standard. */
async function critiquePlan(ledger: CostLedger, plan: ScenePlan, audience: string): Promise<Critique> {
  const script = plan.scenes.map((s) => `[${s.id}] ${s.narration}`).join("\n");
  return sparkJson({
    ledger,
    step: "plan-check",
    schema: Critique,
    name: "critique",
    effort: "low",
    maxTokens: 6000,
    messages: [
      {
        role: "system",
        content: `You are ${plainListener(audience)}. You hear this explainer narration once, in order. Grade it against this standard:\n${PLAIN_LANGUAGE}\nList every term you would not know (an acronym, product, protocol or internal name) that is used without a plain-words explanation at or before its first use. Words everyone knows (app, browser, website, AI, chat, file, password) do not count; a part the narration explains in plain words counts as explained. Also quote, as odd phrases, any figure of speech or squeezed made-up phrase that stands in for a real thing and would make you stop and wonder what it literally means (a model called 'a brain', saved weights called 'memory', 'fast focus math'). Quote, as hard sentences, every sentence you would stumble on or that sounds odd read aloud: jargon, a component name where you wanted to hear what happens, a circular line that explains a part with itself, a step label said as a noun, a vague 'that step', a forced metaphor, 'your' on every part, a stiff or awkward phrase, a sentence too long to follow by ear, or an abstract claim with no example; say why in a few words. A good line sounds like someone talking casually: direct and short. Say in one sentence what this project is and why someone would use it, from the opening alone, and who it is for and why they'd care; leave either empty if the opening never told you. Then say whether you could now retell how one request goes from the user to the result, and if not, what is missing. Be strict but fair; at most 8 terms and 8 hard sentences.`,
      },
      { role: "user", content: script },
    ],
  });
}

const words4 = (s: string) =>
  norm(s)
    .split(" ")
    .filter((w) => w.length >= 4 && !/^(that|with|from|into|your|this|their|which|where|every)$/.test(w));

/** Words a recap needs to name every part on the walk with a short clause each. */
export const recapWords = (parts: number) => 14 + 5 * parts;
/** How many journey parts a recap has to name, in order: most of them, and never fewer than three. */
export const recapNeeds = (parts: number) => Math.min(parts, Math.max(3, Math.ceil(parts * 0.6)));

/**
 * How many of the journey parts the recap names in the journey's order: the longest run of parts whose
 * first mention comes after the one before (a part said again later does not break the order).
 */
export function recapInOrder(narration: string, keywords: string[]): number {
  const r = ` ${norm(narration)} `;
  // a part counts when a whole word of its name is said (plurals and possessives count); a bare prefix does not
  const atWord = (x: string) => {
    for (const v of [` ${x} `, ` ${x}s `, ` ${x}'s `]) {
      const i = r.indexOf(v);
      if (i >= 0) return i;
    }
    return -1;
  };
  const at = keywords
    .map((k) => {
      const full = r.indexOf(` ${norm(k)} `);
      if (full >= 0) return full;
      const parts = words4(k)
        .map(atWord)
        .filter((i) => i >= 0);
      return parts.length ? Math.min(...parts) : -1;
    })
    .filter((i) => i >= 0);
  const best: number[] = [];
  at.forEach((p, i) => {
    best[i] = 1 + Math.max(0, ...at.slice(0, i).map((q, j) => (q < p ? best[j] : 0)));
  });
  return Math.max(0, ...best);
}

/**
 * A recap built from the walkthrough when the plan has none: each run of steps from one part, in order,
 * so every part on the walk is named in the order the viewer met it. The polish turns it into speech.
 */
export function retellTrip(arch: Architecture): string {
  const kw = (id: string) => arch.components.find((c) => c.id === id)?.keyword ?? id;
  const runs: { from: string; to: string[] }[] = [];
  for (const st of arch.walkthrough.steps) {
    const last = runs[runs.length - 1];
    if (last && last.from === st.from) {
      if (!last.to.includes(st.to)) last.to.push(st.to);
    } else runs.push({ from: st.from, to: [st.to] });
  }
  if (!runs.length) return "";
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0]);
  const hops = runs.map((r) => `from the ${kw(r.from)} to ${list(r.to.map((t) => `the ${kw(t)}`))}`);
  const lead = ["It goes", "Then it goes", "And finally it goes"];
  const said = hops.map((h, i) => `${i === hops.length - 1 && i > 0 ? lead[2] : lead[Math.min(i, 1)]} ${h}.`);
  return `Here's everything you just saw. ${said.join(" ")}`;
}

/**
 * Step labels said as nouns ("the send cdp instruction", "performs the drive page move"): the sound of
 * narration reciting the map instead of telling what happens.
 */
export function labelEchoes(narration: string, arch: Architecture): string[] {
  const t = ` ${norm(narration)} `;
  const out: string[] = [];
  for (const st of arch.walkthrough.steps) {
    const l = norm(st.label).replace(/[.*+?^${}()|[\]\\]/g, "");
    if (!l) continue;
    const m = new RegExp(
      `(?:(?:the|a|an) ${l} (?:step|move|instruction|action|stage|command|call|task)s?|(?:performs?|completes?|does|handles?) the ${l}${l.includes(" ") ? `|(?:the|a|an|that|this) ${l}(?! (?:to|into|from|in|on|for|and|with)\\b)` : ""})\\b`,
    ).exec(t);
    if (m) out.push(m[0].trim());
  }
  return out;
}

/**
 * Deterministic story check (docs/explaining-playbook.md): what the hook says, that the core flow is
 * narrated hop by hop and early, that the analogy shows up, and that the recap retells the trip.
 */
export function checkStory(plan: ScenePlan, arch: Architecture, analogy = "", shape?: Shape): string[] {
  const issues: string[] = [];
  const sc = plan.scenes;
  const kwOf = (id: string) => arch.components.find((c) => c.id === id)?.keyword ?? id;
  const { path } = journeyOrder(arch);
  const hook = sc.find((s) => s.kind === "hook");
  if (!hook || sc[0] !== hook) issues.push("the video must open with a 'hook' scene saying what this is and why you'd care");
  // a journey hook names the client and what it drives in its "That's <name>: ..." line, by design
  const hookSaid = hook
    ? shape === "journey"
      ? sentencesIn(hook.narration)
          .filter((t) => !/^that(?:'|\u2019)?s\b/i.test(t.trim()))
          .join(" ")
      : hook.narration
    : "";
  const parts = arch.components.filter((c) => hook && norm(hookSaid).includes(norm(c.keyword)));
  if (hook) {
    const line = hookLine(hook.narration);
    const n = wordCount(line);
    if (n > 14)
      issues.push(
        `the hook's first sentence has ${n} words; state the concrete problem or payoff in one line of at most 14 words, spoken within about 8 seconds`,
      );
    if (!/[?]\s*$/.test(line) && !/\b(you|your|you're|you'll|you'd|yours)\b/i.test(line) && !/\d/.test(line))
      issues.push(
        `${hook.id}: the hook opens on "${line.slice(0, 70)}"; open on the concrete problem or payoff for the viewer instead: a question, a line that says "you", or a surprising number`,
      );
    if (/^(hi|hello|welcome|today|in this video|this is|meet|let'?s)\b/i.test(line))
      issues.push(`the hook opens with "${line.split(/\s+/).slice(0, 3).join(" ")}"; open on a question or a surprising claim instead`);
    // a journey opens on what this lets you do: the 'What if ...?' question, or another question about your payoff
    const payoffQuestion = /\?\s*$/.test(line) && /\b(you|your|you're|you'll|you'd|yours)\b/i.test(line);
    if (shape === "journey" && !WHAT_IF.test(line) && !payoffQuestion)
      issues.push(
        `${hook.id}: the hook line "${line}" should be the 'What if ...?' question shown under the tagline ('What if your AI could really click around the web?'), or another question about what this lets you do`,
      );
    if (
      shape === "journey" &&
      plan.title &&
      !new RegExp(`\\bthat(?:'|\u2019)?s ${escapeRe(plan.title.toLowerCase())}\\b`).test(hook.narration.toLowerCase())
    )
      issues.push(
        `${hook.id}: after the 'What if' line and the contrast lines, say "That's ${plan.title}: " and what it is in one plain clause, naming tools people know ('That's agent-browser: a command-line tool that lets an AI agent, like Claude Code or Cursor, drive a real Chrome browser.')`,
      );
    if (n === wordCount(hook.narration))
      issues.push("the hook is a single sentence; after the hook line, say what this is, the stakes and the analogy");
  }
  if (hook && parts.length > 1)
    issues.push(
      `the hook names parts (${parts.map((c) => c.keyword).join(", ")}) before the story starts; say what it is in plain words instead`,
    );
  if (analogy) {
    const aw = words4(analogy);
    const told = ` ${sc
      .filter((s) => s.kind === "hook" || s.kind === "layer" || s.kind === "walkthrough")
      .map((s) => norm(s.narration))
      .join(" ")} `;
    // the analogy counts when its words are really said: one long word, or two of its words
    const said = (w: string) => told.includes(` ${w} `) || told.includes(` ${w}s `);
    const full = aw.filter(said);
    if (aw.length && !full.some((w) => w.length >= 5) && full.length < 2)
      issues.push(`the everyday analogy (${analogy}) never appears in the hook or the journey`);
  }
  const wi = sc.findIndex((s) => s.kind === "walkthrough");
  if (wi < 0 && arch.walkthrough.steps.length) issues.push("there is no 'walkthrough' scene telling the core flow end to end");
  if (wi >= 0) {
    const w = norm(sc[wi].narration);
    const ws = spokenWords(sc[wi].narration);
    const missing: string[] = [];
    // a step is told by its label or, in plain words, by naming the part it reaches: the same cue the board follows
    const cues = walkCues(ws, arch),
      steps = arch.walkthrough.steps;
    // the trip back may be told in one sentence naming where it lands: a hop reversing an earlier one is
    // told when the client the trip ends at is named after the last hop that was told
    const goingBack = (i: number) =>
      steps.slice(0, i).some((x) => x.from === steps[i].to && x.to === steps[i].from) || i === steps.length - 1;
    const lastFwd = Math.max(-1, ...cues.filter((k, i) => k >= 0 && !goingBack(i)));
    const end = steps.length ? kwOf(steps[steps.length - 1].to) : "";
    const homeTold = !!end && lastFwd >= 0 && phraseAt(ws, end, lastFwd + 1) >= 0;
    cues.forEach((k, i) => {
      if (k < 0 && !(homeTold && goingBack(i) && steps.slice(i).every((_, j) => cues[i + j] >= 0 || goingBack(i + j)))) {
        const st = steps[i];
        missing.push(`${kwOf(st.from)} to ${kwOf(st.to)} (${st.label})`);
      }
    });
    if (missing.length)
      issues.push(
        `the walkthrough must tell each step in order, naming the part it reaches; missing or out of order: ${missing.join(", ")}`,
      );
    for (const e of labelEchoes(sc[wi].narration, arch))
      issues.push(`the walkthrough says "${e}", a step label turned into a noun; say what happens in plain words instead`);
    if (/\bstep (one|two|three|1|2|3)\b/.test(w))
      issues.push("the walkthrough reads like a numbered list ('step one is ...'); tell it as a story where each part does its step");
    const before = sc.slice(0, wi);
    const late = path.filter((id) => !before.some((s) => s.add_components.includes(id)));
    if (late.length) issues.push(`parts on the journey are drawn after the walkthrough: ${late.map(kwOf).join(", ")}`);
    const deep = before.filter((s) => s.kind === "scale" || s.kind === "notes");
    if (deep.length) issues.push("scale or list scenes come before the core flow; they belong after it");
    const total = sc.reduce((n, s) => n + wordCount(s.narration), 0);
    const pre = before.reduce((n, s) => n + wordCount(s.narration), 0);
    if (total && pre / total > 0.55)
      issues.push(`the core flow starts ${Math.round((pre / total) * 100)}% of the way in; it should start before the halfway mark`);
  }
  const recap = sc.find((s) => s.kind === "recap");
  if (recap && path.length) {
    if (recapInOrder(recap.narration, path.map(kwOf)) < recapNeeds(path.length))
      issues.push(`the recap must retell the trip, saying the journey parts in order: ${path.map(kwOf).join(", ")}`);
  }
  if (recap) {
    const first = recap.narration.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
    if (!/\b(you|your|you're|you'll|you'd|yours)\b/i.test(first))
      issues.push(
        `${recap.id}: the recap opens on "${first.slice(0, 70)}"; open with what it does for you: a one-sentence payoff for the viewer, then the retrace`,
      );
  }
  return [...issues, ...undrawnLinks(plan, arch), ...speechIssues(plan, arch, analogy)];
}

/**
 * A sentence that names two parts one after the other ("the poll input feeds the rebuild widgets")
 * tells the viewer they talk to each other; the board has to draw that arrow. Plain lists ("a and b")
 * are not links.
 */
// a label where the arrow's source fetches from its target, and the verbs that tell the opposite way
const PULL = /^(read|reads|fetch|fetches|pull|pulls|poll|polls|load|loads|query|queries|get|gets|watch|watches|subscribe|subscribes)\b/i;
const PUSH = / (hands|hand|sends|send|gives|give|passes|pass|pushes|push|feeds|feed|emits|emit|delivers|deliver|streams|stream) /;
export function undrawnLinks(plan: ScenePlan, arch: Architecture): string[] {
  const linked = (a: string, b: string) => arch.connections.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
  const out: string[] = [];
  for (const s of plan.scenes) {
    if (s.kind !== "layer" && s.kind !== "walkthrough" && s.kind !== "recap") continue;
    for (const sent of s.narration.split(/(?<=[.!?;])\s+/)) {
      const t = ` ${norm(sent)} `;
      const hits = arch.components
        .flatMap((c) => {
          const k = ` ${norm(c.keyword)} `;
          const at: { id: string; kw: string; i: number; end: number }[] = [];
          if (k.trim())
            for (let i = t.indexOf(k); i >= 0; i = t.indexOf(k, i + 1)) at.push({ id: c.id, kw: c.keyword, i, end: i + k.length - 1 });
          return at;
        })
        .sort((a, b) => a.i - b.i)
        .filter((h, i, all) => !all.some((o, j) => j !== i && o.i <= h.i && o.end >= h.end && o.end - o.i > h.end - h.i));
      for (let i = 1; i < hits.length; i++) {
        const [a, b] = [hits[i - 1], hits[i]];
        if (a.id === b.id) continue;
        const between = t
          .slice(a.end, b.i)
          .trim()
          .replace(/\b(the|a|an|your)\b/g, "")
          .trim();
        if (linked(a.id, b.id)) {
          // the board's arrow says b pulls from a; narration that has a push to b tells it backwards
          const pull = arch.connections.find((e) => e.from === b.id && e.to === a.id && PULL.test(e.label));
          const forward = arch.connections.some((e) => e.from === a.id && e.to === b.id);
          if (pull && !forward && PUSH.test(` ${between} `)) {
            const msg = `${s.id}: says the ${a.kw} ${between.split(" ")[0]} to the ${b.kw}, but the ${b.kw} ${pull.label} from the ${a.kw}; tell it in the board's direction`;
            if (!out.includes(msg)) out.push(msg);
          }
          continue;
        }
        if (/^(and|or|plus|nor)?$/.test(between)) continue;
        const msg = `${s.id}: says the ${a.kw} and the ${b.kw} talk directly, but the board draws no arrow between them; tell the hop through the part that really sits between them`;
        if (!out.includes(msg)) out.push(msg);
      }
    }
  }
  return out;
}

// phrases that announce instead of explain (docs/explaining-playbook.md, "No filler")
const FILLER =
  /\b(you'?ll (meet|see|find|notice)|then you'?ve got|let'?s (take a look|dive in|get into it)|in this video|basically|it'?s (special|important|worth noting)|without further ado|as you can see|delve\w*|deep dive|game[ -]?changer|supercharge\w*|at the end of the day|needless to say|it goes without saying|in a nutshell)\b/gi;
export function fillerIn(text: string): string[] {
  return [...new Set([...text.replace(/[’‘]/g, "'").matchAll(FILLER)].map((m) => m[0].toLowerCase()))];
}

/** The hook's first sentence, which the board shows as big kinetic type while it is spoken. */
export function hookLine(narration: string): string {
  return narration.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
}

/** Parts that really are the viewer's own, so "your" fits them ("your AI agent", "your app"). */
const VIEWERS = /\b(ai|agent|agents|app|apps|account|accounts|computer|phone|you|user|users|code|project|site|website)\b/;
const sentencesIn = (t: string) =>
  t
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Lines a person would not say aloud, which grammar rules miss: a garbled pronoun ("for you user to
 * use"), a sentence that opens on a part's bare name ("Agent-browser CLI starts every job"), a part
 * re-introduced with "that" right after it was named, and a long part name said again in the very next
 * sentence where "it" belongs.
 */
/** Cute stand-ins for a real part or tool: the video names the thing itself. */
const NICKNAMES =
  /\b(?:(?:your|my|our|that|this|the|a) (?:little )?(?:ai )?helpers?|helpers you (?:know|use)|buddy|buddies|sidekicks?|robot friend)\b/i;
const kwsHave = (arch: Architecture, w: string) => arch.components.some((c) => c.keyword.toLowerCase().includes(w.toLowerCase()));

export function spokenSlips(narration: string, arch: Architecture, plan?: ScenePlan, repeats = true): string[] {
  const out: string[] = [];
  const all = ` ${norm((plan?.scenes ?? []).map((x) => x.narration).join(" ") || narration)} `;
  const garble = /\b(?:(?:you|your) (?:user|users|viewer|viewers|customer|customers)|for you \w+ to (?:use|do|get|see))\b/i.exec(narration);
  if (garble)
    out.push(`"${garble[0]}" is garbled; say who does what in a whole sentence ('so you can use it', 'your AI agent types a command')`);
  const nick = NICKNAMES.exec(narration);
  if (nick && !kwsHave(arch, nick[0]))
    out.push(`"${nick[0]}" is a made-up nickname; say the real name ('your AI agent', 'Claude Code') or "it"`);
  const kws = arch.components.map((c) => c.keyword.toLowerCase()).filter((k) => k.length > 2);
  const sents = sentencesIn(narration);
  sents.forEach((sent, i) => {
    const t = norm(sent);
    for (const k of kws) {
      const nk = norm(k);
      // a capitalised product (Chrome, Postgres) opens a sentence fine; a part said elsewhere as "the k" does not
      if (t.startsWith(`${nk} `) && all.includes(` the ${nk} `))
        out.push(`"${sent.trim()}" opens on the bare name "${k}"; say "the ${k}" and give the sentence a real verb about what it does`);
      if (new RegExp(`^that ${escapeRe(nk)}\\b`).test(t))
        out.push(`"${sent.trim()}" re-introduces "${k}" with "that" right after naming it; fold it into the sentence before, or say "it"`);
      // a long name twice running: "the agent-browser CLI ... The agent-browser CLI ..."
      if (repeats && /[\s-]/.test(k) && i > 0 && ` ${norm(sents[i - 1])} `.includes(` ${nk} `) && ` ${t} `.includes(` ${nk} `))
        out.push(`"${k}" is said in two sentences in a row; the second time say "it" or a short name`);
    }
  });
  return [...new Set(out)];
}

/**
 * Lines that would not sound like a person talking: a missing article ("will run agent"), the same
 * sentence opener over and over, or a scene heading read out as if it were a part ("next it reaches
 * save then work").
 */
export function speechIssues(plan: ScenePlan, arch: Architecture, analogy = ""): string[] {
  const issues: string[] = [];
  const known = [...arch.components.map((c) => c.keyword), ...arch.walkthrough.steps.map((x) => x.label)].map((k) => k.toLowerCase());
  const metaphor = pictureWords(analogy, arch);
  for (const s of plan.scenes) {
    const miss = missingArticles(s.narration);
    if (miss.length) issues.push(`${s.id}: missing article in ${miss.map((m) => `"${m}"`).join(", ")}; say "the" or "a" before the noun`);
    for (const g of grammarSlips(s.narration, { metaphor })) issues.push(`${s.id}: ${g}`);
    const filler = fillerIn(s.narration);
    if (filler.length) issues.push(`${s.id}: filler ${filler.map((f) => `"${f}"`).join(", ")}; say the thing itself instead`);
    for (const sent of s.narration
      .split(/(?<=[.!?])\s+/)
      .map((x) => x.trim())
      .filter(Boolean)) {
      const n = wordCount(sent);
      if (n > 20)
        issues.push(
          `${s.id}: "${sent.length > 90 ? `${sent.slice(0, 90)}…` : sent}" has ${n} words; split it into short lines of one idea each`,
        );
    }
    // the plain-language bar a program can check: box names are judged on the map, so they pass here
    for (const p of plainSlips(s.narration, known)) issues.push(`${s.id}: ${p}`);
    for (const x of stiffLines(s.narration)) issues.push(`${s.id}: ${x}`);
    const hj = practitionerTerm(
      s.heading
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => !known.some((k) => k.split(" ").includes(w)))
        .join(" "),
    );
    if (hj) issues.push(`${s.id}: the heading "${s.heading}" uses "${hj}"; give it 2 to 4 everyday words the narration says`);
    if ((s.kind === "walkthrough" || s.kind === "recap") && /\b(that|this) step\b/i.test(s.narration))
      issues.push(`${s.id}: says "${/\b(that|this) step\b/i.exec(s.narration)![0]}"; name what actually happened instead`);
    const fig = figurative(s.heading, known);
    if (fig)
      issues.push(
        `${s.id}: the heading "${s.heading}" uses "${fig}", a metaphor; say plainly what the scene is about ('where it starts', 'what runs the page', 'when lots of jobs come in')`,
      );
    if (!analogy)
      for (const sent of s.narration.split(/(?<=[.!?])\s+/)) {
        const f = figurative(sent, known);
        if (f) issues.push(`${s.id}: "${sent.trim()}" uses "${f}", a travel metaphor; say literally what happens`);
      }
    const yours = arch.components
      .map((c) => c.keyword.toLowerCase())
      .filter((k) => k && !VIEWERS.test(k) && ` ${norm(s.narration)} `.includes(` your ${norm(k)} `));
    if (yours.length)
      issues.push(
        `${s.id}: says ${yours.map((k) => `"your ${k}"`).join(", ")}; call the part "the ${yours[0]}", and keep "your" for what's really the viewer's (your AI agent, your email)`,
      );
    for (const x of spokenSlips(s.narration, arch, plan, s.kind !== "recap")) issues.push(`${s.id}: ${x}`);
    if (s.kind === "recap" && s.narration.split(/(?<=[.!?])\s+/).filter(Boolean).length > 4)
      issues.push(
        `${s.id}: the recap runs ${s.narration.split(/(?<=[.!?])\s+/).filter(Boolean).length} sentences; say what it does for you, then retrace the trip, in a few short sentences`,
      );
    if (
      (s.kind === "hook" || s.kind === "walkthrough" || s.kind === "recap") &&
      !/\b(you|your|you're|you'd|you'll|yours)\b/i.test(s.narration)
    )
      issues.push(`${s.id}: never talks to the viewer; say it in second person ('you', 'your')`);
  }
  // the same sentence opener three times over reads like a template, not a person talking
  const openers = new Map<string, number>();
  for (const sent of plan.scenes.flatMap((x) => x.narration.split(/(?<=[.!?])\s+/))) {
    const k = norm(sent).split(" ").slice(0, 3).join(" ");
    if (k.split(" ").length === 3) openers.set(k, (openers.get(k) ?? 0) + 1);
  }
  for (const [k, n] of openers) if (n >= 3) issues.push(`${n} sentences open with '${k}'; vary them`);
  // the same opener twice in a row, across scenes or within one, already sounds like a template
  const opener = (t: string) => norm(t).split(" ").slice(0, 2).join(" ");
  plan.scenes.forEach((s, i) => {
    const prev = plan.scenes[i - 1];
    if (prev && opener(s.narration).split(" ").length === 2 && opener(s.narration) === opener(prev.narration))
      issues.push(`${prev.id} and ${s.id} both open with '${opener(s.narration)}'; vary them`);
    const sents = s.narration.split(/(?<=[.!?])\s+/);
    for (let k = 1; k < sents.length; k++)
      if (opener(sents[k]).split(" ").length === 2 && opener(sents[k]) === opener(sents[k - 1]))
        issues.push(`${s.id}: two sentences in a row open with '${opener(sents[k])}'; vary them`);
    // the viewer is "you" all the way through
    const third = s.narration.match(/\bthe (guest|user|customer|visitor|viewer)s?\b/i);
    if (third) issues.push(`${s.id}: says "${third[0]}" for the viewer; keep it "you"`);
    // a code name in front of the plain name ("called React Web")
    const code = s.narration.match(/\bcalled (the )?[A-Z][\w-]*( [A-Z][\w-]*)*/);
    if (code)
      issues.push(`${s.id}: "${code[0]}" puts a code name up front; use the plain name, and add the code name after it only if it helps`);
  });
  // a part is explained once; "the regex bpe, a smart chopping method" again in the recap slows it down
  const defined = new Set<string>();
  for (const s of plan.scenes) {
    const text = s.narration.toLowerCase().replace(/[’‘]/g, "'");
    for (const c of arch.components) {
      const k = c.keyword.toLowerCase();
      if (!k) continue;
      const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, (a|an|that's|that is|which is|the) `, "g");
      // "the host app, the ui core fills…" lists the next part in a chain; it does not explain the first
      const names = arch.components.map((o) => o.keyword.toLowerCase()).filter(Boolean);
      const says = [...text.matchAll(re)].some((m) => m[1] !== "the" || !names.some((n) => text.startsWith(n, m.index! + m[0].length)));
      if (!says) continue;
      if (defined.has(k)) issues.push(`${s.id}: "${c.keyword}" is explained again; say what it is only the first time, then just its name`);
      defined.add(k);
    }
  }
  const keywords = new Set(arch.components.map((c) => norm(c.keyword)));
  const labels = new Set(arch.walkthrough.steps.map((x) => norm(x.label)));
  const an = norm(analogy);
  for (const s of plan.scenes) {
    if (s.kind !== "layer" && s.kind !== "walkthrough" && s.kind !== "scale") continue;
    const h = norm(s.heading)
      .replace(/\s*cont$/, "")
      .trim();
    // "the front desk" said aloud is a normal noun phrase; "save then work" said as a place is not
    // "follow one click" is the walkthrough heading the plan prompt asks for, and it reads as an action, not a place
    if (s.kind === "walkthrough" && /^follow\b/.test(h)) continue;
    if (
      h.split(" ").length < 2 ||
      /^(the|a|an|one|your|our|this|that)\b/.test(h) ||
      keywords.has(h) ||
      labels.has(h) ||
      (an && an.includes(h))
    )
      continue;
    if (` ${norm(s.narration)} `.includes(` ${h} `))
      issues.push(`${s.id}: the heading "${h}" is spoken as if it were a part; name the actual part or say it in plain words`);
  }
  return issues;
}

const Polish = z.object({
  scenes: z.array(z.object({ id: z.string(), narration: z.string() })),
  renames: z.array(z.object({ id: z.string(), keyword: z.string() })),
});

/** Words of the borrowed picture ("cook tickets", "kitchen") that the map itself never uses, so said bare they stand in for a part. */
export function pictureWords(analogy: string, arch: Architecture): string[] {
  const used = norm(
    [
      ...arch.components.flatMap((c) => [c.keyword, c.name, c.what]),
      ...arch.connections.map((c) => c.label),
      ...arch.walkthrough.steps.map((c) => c.label),
    ].join(" "),
  );
  const have = new Set(used.split(" ").flatMap((w) => [w, w.replace(/s$/, "")]));
  // nouns only: "from drawing" or "into everything" are ordinary speech
  const words = norm(analogy)
    .split(" ")
    .filter(
      (w) =>
        w.length >= 4 &&
        !/(ing|ed)$/.test(w) &&
        !/^(every|some|any|no)thing$/.test(w) &&
        !/^(that|this|with|from|then|than|each|every|whole|whoever|does|into|your|their|what|when|where|which|simple|short|loop|order)$/.test(
          w,
        ),
    );
  return [...new Set(words)].filter((w) => !have.has(w) && !have.has(w.replace(/s$/, "")));
}

/** The phrases a scene's narration must keep, in the order it says them, so the board stays in sync. */
export function syncPhrases(s: Scene, arch: Architecture): string[] {
  const ws = spokenWords(s.narration);
  const cands = [
    ...arch.components.map((c) => c.keyword),
    ...(s.items ?? []).map((i) => i.text),
    ...(s.board_nodes ?? []).map((n) => n.keyword),
    ...beatAnchors(s),
  ];
  const hits = cands.map((p) => ({ p, at: phraseAt(ws, p) })).filter((x) => x.at >= 0);
  // the walkthrough also keeps whatever told each step (a part named a second time on the way back counts too)
  if (s.kind === "walkthrough") {
    const kw = (id: string) => arch.components.find((c) => c.id === id)?.keyword ?? "";
    walkCues(ws, arch).forEach((k, i) => {
      const st = arch.walkthrough.steps[i];
      if (k >= 0) hits.push({ p: phraseAt(ws, st.label, k) === k ? st.label : kw(st.to), at: k });
    });
  }
  const seen = new Set<string>();
  return hits
    .sort((a, b) => a.at - b.at)
    .filter((x) => !seen.has(`${x.at} ${x.p}`) && !!seen.add(`${x.at} ${x.p}`))
    .map((x) => x.p);
}

/** True when a rewrite still says every sync phrase in order and stays close to the original length. */
export const keepsSync = (orig: string, next: string, phrases: string[]): boolean => !syncProblem(orig, next, phrases);

/** Why a rewrite would cost the board its cues, in words the rewriter can act on; undefined when it is fine. */
export function syncProblem(orig: string, next: string, phrases: string[], room = 0): string | undefined {
  const a = wordCount(orig),
    b = wordCount(next),
    most = Math.max(Math.floor(a * 1.25), room);
  if (b > most) return `it had ${b} words, over the ${most} allowed; drop names a newcomer can do without instead of explaining them all`;
  if (b < a * 0.8) return `it had ${b} words, under the ${Math.ceil(a * 0.8)} needed`;
  if (soundsLikeKeywords(next)) return "it read like a list of names, not sentences";
  const ws = spokenWords(next);
  let at = 0;
  for (const p of phrases) {
    const k = phraseAt(ws, p, at);
    if (k < 0) return `it lost "${p}" or moved it out of order; keep the must_say phrases`;
    at = k + 1;
  }
  return undefined;
}

const NO_RENAMES = true;
const okKeyword = (k: string) => /^[a-z][a-z ]{1,30}$/.test(k) && k.trim().split(/\s+/).length <= 3;

/**
 * Narration polish: one Muse Spark rewrite so every line sounds like a person explaining at a
 * whiteboard (grammatical, articles, contractions, varied openers), with awkward part names turned into
 * plain ones. A scene keeps its rewrite only when the board can still sync to it; any speech problems
 * left get one more try.
 */
export async function polishNarration(o: {
  ledger: CostLedger;
  plan: ScenePlan;
  arch: Architecture;
  analogy?: string;
  audience: string;
  progress?: Progress;
}): Promise<{ plan: ScenePlan; renames: { id: string; keyword: string }[]; rewritten: number; kept: string[]; issues: string[] }> {
  o.progress?.({ stage: "plan", message: "polishing the narration" });
  const sys = [
    "You rewrite narration for a whiteboard explainer video so it sounds like a friend talking, the way Crayon Capital or Caleb Writes Code explain systems: short natural sentences, a little warmth, no jargon left unexplained.",
    `Audience: ${o.audience}, but every line must make sense to a smart friend who doesn't write code.`,
    PLAIN_LANGUAGE,
    "Rules for every scene:",
    "- Grammatical spoken English: articles before nouns ('the guest sends a message to the manager'), subject and verb agree, contractions where a person would use them (it's, you'd, that's, doesn't).",
    "- Vary how sentences start; never open three sentences the same way.",
    "- Keep the meaning, the facts and the order of events exactly. Add nothing new and drop nothing.",
    "- Keep each scene within 10% of its word count.",
    "- Each scene lists 'must_say': phrases the board syncs to. Say each one, in that order, with its words in that order. You may put 'the', 'a' or 'your' between its words and change verb endings ('send message' -> 'sends the message'), nothing else.",
    "- Never read a scene heading aloud as if it were a part of the system.",
    "- A step's verb is the sentence's only verb for that action; never pair it with a synonym ('files and saves', 'presents and shows').",
    "- Keep every part's real name exactly as given in 'parts' (agent-browser CLI, the daemon): never swap it for a nickname or an analogy. Drop 'called X'.",
    "- Any technical word left ('api', 'driver', 'harness', a database or framework name) gets a few plain words saying what it is, the first time it's said.",
    `- ${PLAIN}`,
    "- The viewer is 'you' all the way through; never 'the guest', 'the user' or 'the customer'.",
    "- No two scenes, and no two sentences in a row, open with the same words.",
    "- Every sentence is a whole sentence with its own subject and verb; no fragments like 'It's incremental counts that update tallies.' 'a' and 'an' go only before one thing ('a load of pieces', never 'a ready loads of').",
    "- Say what a part is only the first time it's named; after that, just its name. The recap never re-explains a part.",
    "- No filler that announces instead of explains: never 'you'll meet', 'you'll see', 'you'll find', 'then you've got', 'let's take a look', 'basically', 'it's special'.",
    "- The hook scene's first sentence is shown on screen word by word: keep it a question (a 'What if ...?' when it is one) or one surprising claim of at most 14 words, and keep it the first sentence.",
    "- Every sentence has a clear subject doing something, said the way a person talks: no label-like lines ('The agent-browser CLI starts every job.'), no garbled phrases ('for you user to use').",
    "- Parts are 'the daemon', never 'your daemon'; 'your' is for what is really the viewer's (your AI agent, your email).",
    "- After a part's full name, the next sentence says 'it' or a short name, not the full name again. Never open a sentence on a part's bare name ('Daemon keeps...'): say 'The daemon keeps...'.",
    "- Each part's why comes before it: what would be slow or hard without it, then the part. A line that only says which part hands what to which gets the reason it matters.",
    VOICE_EXAMPLES,
    "Part names: 'parts' lists every part's real name. Keep them all; 'renames' is always an empty list.",
    "Return every scene id with its rewritten narration.",
  ].join("\n");
  const payload = (p: ScenePlan) =>
    JSON.stringify({
      analogy: o.analogy ?? "",
      parts: o.arch.components.map((c) => ({ id: c.id, name: c.keyword, what: c.what })),
      scenes: p.scenes.map((s) => ({
        id: s.id,
        kind: s.kind,
        heading: s.heading,
        words: wordCount(s.narration),
        must_say: syncPhrases(s, o.arch),
        narration: s.narration,
      })),
    });
  const ask = (msgs: { role: "system" | "user" | "assistant"; content: string }[], step: string) =>
    sparkJson({
      ledger: o.ledger,
      step,
      schema: Polish,
      name: "narration_polish",
      effort: "minimal",
      maxTokens: 8000,
      hedge: true,
      messages: msgs,
    });
  const apply = (base: ScenePlan, out: z.infer<typeof Polish>, renames: Map<string, string>) => {
    const kept: string[] = [];
    let rewritten = 0;
    const scenes = base.scenes.map((s) => {
      const next = out.scenes.find((x) => x.id === s.id)?.narration?.trim();
      const want = syncPhrases(s, o.arch).map((p) => {
        const c = o.arch.components.find((x) => x.keyword === p);
        return c && renames.has(c.id) ? renames.get(c.id)! : p;
      });
      if (next && keepsSync(s.narration, next, want)) {
        rewritten++;
        return { ...s, narration: tidySpeech(next) };
      }
      kept.push(s.id);
      return s;
    });
    return { plan: { ...base, scenes }, kept, rewritten };
  };
  const msgs: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: sys },
    { role: "user", content: payload(o.plan) },
  ];
  // polish only improves wording: an empty answer gets one more try, then the plan goes on as written
  const out = await ask(msgs, "narration-polish")
    .catch(() => ask(msgs, "narration-polish-again"))
    .catch((e: unknown) => {
      o.progress?.({ stage: "plan", message: "narration polish failed; keeping the narration as written" });
      return e instanceof Error ? e : new Error(String(e));
    });
  if (out instanceof Error)
    return {
      plan: o.plan,
      renames: [],
      rewritten: 0,
      kept: o.plan.scenes.map((x) => x.id),
      issues: [`narration polish skipped: ${out.message}`, ...speechIssues(o.plan, o.arch, o.analogy)],
    };
  const taken = new Set(o.arch.components.map((c) => c.keyword));
  const renames = new Map<string, string>();
  // real names stay (docs/explaining-playbook.md): a rename the model sends anyway is ignored
  for (const r of NO_RENAMES ? [] : out.renames) {
    const k = r.keyword.trim().toLowerCase();
    const c = o.arch.components.find((x) => x.id === r.id);
    if (c && okKeyword(k) && !taken.has(k) && k !== c.keyword) {
      renames.set(c.id, k);
      taken.add(k);
    }
  }
  // a rename only stands if no scene that said the old name kept its old narration
  let res = apply(o.plan, out, renames);
  const renamed = (r: Map<string, string>): Architecture => ({
    ...o.arch,
    components: o.arch.components.map((c) => (r.has(c.id) ? { ...c, keyword: r.get(c.id)! } : c)),
  });
  const dropBadRenames = () => {
    for (const [id] of [...renames]) {
      const old = o.arch.components.find((c) => c.id === id)!.keyword;
      if (res.plan.scenes.some((s) => phraseAt(spokenWords(s.narration), old) >= 0)) renames.delete(id);
    }
  };
  dropBadRenames();
  let issues = speechIssues(res.plan, renamed(renames), o.analogy);
  if (issues.length || res.kept.length) {
    o.progress?.({
      stage: "plan",
      message: `narration polish: ${issues.length} issue(s), ${res.kept.length} scene(s) kept as is; one more try`,
    });
    const again = await ask(
      [
        ...msgs,
        { role: "assistant", content: JSON.stringify(out) },
        {
          role: "user",
          content: `Fix these and return all scenes again (same renames):\n${[...issues, ...res.kept.map((id) => `${id}: the rewrite dropped a must_say phrase, changed its order, or changed the length by more than 20%`)].map((x, i) => `${i + 1}. ${x}`).join("\n")}`,
        },
      ],
      "narration-polish-retry",
    ).catch(() => undefined);
    if (again) {
      const second = apply(o.plan, again, renames);
      // per scene, prefer the retry when it passed, else the first rewrite
      const scenes = o.plan.scenes.map((s, i) => (second.kept.includes(s.id) ? res.plan.scenes[i] : second.plan.scenes[i]));
      const kept = res.kept.filter((id) => second.kept.includes(id));
      res = { plan: { ...o.plan, scenes }, kept, rewritten: scenes.length - kept.length };
      dropBadRenames();
      issues = speechIssues(res.plan, renamed(renames), o.analogy);
    }
  }
  return {
    plan: res.plan,
    renames: [...renames].map(([id, keyword]) => ({ id, keyword })),
    rewritten: res.rewritten,
    kept: res.kept,
    issues,
  };
}

export async function planRepoScenes(o: {
  ledger: CostLedger;
  arch: Architecture;
  spec: ExplainSpec;
  readme?: string;
  source?: string;
  manifest?: FactsManifest;
  progress?: Progress;
}): Promise<
  ScenePlan & {
    repairs: string[];
    check: { first: string[]; final: string[]; revised: boolean };
    renames: { id: string; keyword: string }[];
    polish: { rewritten: number; kept: string[]; issues: string[] };
    beats: BeatReport;
    ear: string[];
    rubric: { total: number; issues: string[] };
  }
> {
  const L = o.spec;
  const [lo, hi] = coverageSeconds(L, {
    components: o.arch.components.length,
    steps: o.arch.walkthrough.steps.length,
    scale: o.arch.scale.length,
  });
  o.progress?.({ stage: "plan", message: "writing the scene plan" });
  const compact = {
    product: o.arch.product,
    one_liner: o.arch.one_liner,
    components: o.arch.components.map((c) => ({ id: c.id, name: c.name, kind: c.kind, layer: c.layer, keyword: c.keyword, what: c.what })),
    connections: o.arch.connections.map((c) => `${c.from}>${c.to} (${c.label})`),
    walkthrough: { name: o.arch.walkthrough.name, steps: o.arch.walkthrough.steps.map((s) => `${s.from}>${s.to} (${s.label})`) },
    scale: o.arch.scale.map((s) => ({
      component: s.component,
      at: s.at,
      problem: s.problem,
      why: s.why,
      fix: s.fix,
      fix_detail: s.fix_detail,
    })),
  };
  const sys = repoSystem(o.arch, L, lo, hi, o.manifest);
  const user = `${promiseRule(readmePromises(o.readme ?? ""))}${JSON.stringify(compact)}${o.readme ? `\n\nREADME excerpt (copy commands, output rows and numbers from here only; the Features list is for why-lines about parts and steps already in the video, like a safety promise the README makes, never a new part or scene):\n${o.readme}` : ""}`;
  const promises = readmePromises(o.readme ?? "");
  const ask = (extra: { role: "assistant" | "user"; content: string }[] = []) =>
    sparkJson({
      ledger: o.ledger,
      step: extra.length ? "scene-plan-revise" : "scene-plan",
      schema: ScenePlan,
      wire: RepoPlanWire,
      name: "scene_plan",
      effort: "low",
      maxTokens: 14000,
      hedge: true,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }, ...extra],
    });
  const raw = await ask();
  let plan = repairRepoPlan(raw, o.arch, L);
  // the newcomer check and the narration polish both read the same draft, so they run side by side;
  // what the check found is then looked for in the polished narration, which is what the viewer hears
  const polish = (p: ScenePlan & { repairs: string[] }) =>
    polishNarration({ ledger: o.ledger, plan: p, arch: o.arch, analogy: L.brief.analogy, audience: L.audience, progress: o.progress });
  const critique = (p: ScenePlan) => critiquePlan(o.ledger, p, L.audience).catch(() => undefined);
  const renamedArch = (r: { id: string; keyword: string }[]): Architecture => ({
    ...o.arch,
    components: o.arch.components.map((c) => ({ ...c, keyword: r.find((x) => x.id === c.id)?.keyword ?? c.keyword })),
  });
  const source = `${o.source ?? ""}\n${o.readme ?? ""}`;
  const beatsOf = (p: ScenePlan) => checkBeats(p, { arch: o.arch, source, wps: L.tempo.wps });
  const found = (p: ScenePlan, arch: Architecture, c: Critique | undefined) => [
    ...checkStory(p, arch, L.brief.analogy, shapeFor(L.brief.approach)),
    ...checkHookQuestion(p),
    ...checkPayoffAnswersHook(p),
    ...checkScenePurpose(p, arch),
    ...checkFormatBeats(p, L.format, arch, L.tempo.wps),
    ...checkVisualReasoning(p, L.format, arch),
    ...(o.manifest ? checkManifestNumbers(p, o.manifest, arch) : []),
    ...beatsOf(p).report.issues,
    ...(c?.undefined_terms ?? []).filter((t) => said(p, t.term)).map((t) => termIssue(t)),
    ...(c?.odd_phrases ?? []).filter((t) => said(p, t.phrase)).map((t) => oddIssue(t)),
    ...(c && !c.purpose.trim()
      ? [
          "a newcomer could not tell what this project is or why they would use it; right after the hook line, say it in one plain sentence with no jargon",
        ]
      : []),
    ...(c && !(c.who_for ?? "").trim()
      ? [
          "a newcomer could not tell who this is for or why they'd care; right after the hook line, say who it's for and what it does for them, in plain words",
        ]
      : []),
    ...(c?.hard_sentences ?? []).filter((t) => said(p, t.sentence)).map((t) => hardIssue(t)),
    ...(c && !c.flow_clear ? [`a newcomer could not retell the flow: ${c.flow_problem}`] : []),
    ...promiseIssues(p, promises),
  ];
  let [pol, crit] = await Promise.all([polish(plan), critique(plan)]);
  let arch = renamedArch(pol.renames);
  const first = found(pol.plan, arch, crit);
  let rubric = scoreRubric(pol.plan, { arch, manifest: o.manifest, format: L.format, wps: L.tempo.wps });
  let final = [...first, ...rubric.issues],
    revised = false,
    story = pol.plan;
  if (first.some(structural) || shouldRejectRubric(rubric)) {
    // the board itself is wrong, or the rubric rejects a weak script: the whole plan is redone once
    const why = shouldRejectRubric(rubric) ? `, rubric ${rubric.total}/10` : "";
    o.progress?.({ stage: "plan", message: `self-check: ${final.length} issue(s)${why}, revising the plan once` });
    plan = repairRepoPlan(
      await ask([
        { role: "assistant", content: JSON.stringify(raw) },
        {
          role: "user",
          content: `A newcomer test of this plan found these problems. Return the full corrected plan, keeping what works:\n${final.map((x, i) => `${i + 1}. ${x}`).join("\n")}`,
        },
      ]),
      o.arch,
      L,
    );
    revised = true;
    [pol, crit] = await Promise.all([polish(plan), critique(plan)]);
    arch = renamedArch(pol.renames);
    story = pol.plan;
    rubric = scoreRubric(story, { arch, manifest: o.manifest, format: L.format, wps: L.tempo.wps });
    final = [...found(story, arch, crit), ...rubric.issues];
  }
  const fixed = await fixWording({
    ledger: o.ledger,
    plan: story,
    arch,
    issues: final,
    audience: L.audience,
    analogy: L.brief.analogy,
    shape: shapeFor(L.brief.approach),
    progress: o.progress,
  });
  story = fixed.plan;
  final = fixed.issues;
  revised = revised || fixed.changed;
  // a last listen for lines no rule names: garbled, subjectless or stiff sentences get rewritten one by one
  const ear = await speechCheck({ ledger: o.ledger, plan: story, arch, audience: L.audience, progress: o.progress });
  if (ear.changed.length) {
    const was = new Set(checkStory(story, arch, L.brief.analogy, shapeFor(L.brief.approach)));
    story = ear.plan;
    final = [...checkStory(story, arch, L.brief.analogy, shapeFor(L.brief.approach)), ...final.filter((x) => !was.has(x))];
    revised = true;
  }
  // every rewrite above may have moved a line: the beats are cut again from the final narration and checked
  const b = beatsOf(story);
  rubric = scoreRubric({ ...story, scenes: b.plan.scenes }, { arch, manifest: o.manifest, format: L.format, wps: L.tempo.wps });
  return {
    ...plan,
    scenes: b.plan.scenes,
    check: { first, final, revised },
    renames: pol.renames,
    polish: { rewritten: pol.rewritten, kept: pol.kept, issues: pol.issues },
    beats: b.report,
    ear: ear.notes,
    rubric: { total: rubric.total, issues: rubric.issues },
  };
}

const Ear = z.object({
  lines: z
    .array(
      z.object({
        scene: z.string().describe("scene id"),
        sentence: z.string().describe("the sentence, copied exactly"),
        problem: z.string().describe("what is wrong, in a few words"),
        rewrite: z
          .string()
          .describe(
            "the same sentence said the way a person would say it aloud, same facts, about the same length, keeping every name it had",
          ),
      }),
    )
    .describe(
      "only sentences that are ungrammatical, garbled, missing a subject, stiff, or a bare chain of handoffs; empty when every line sounds natural",
    ),
});

/**
 * The grammar and natural-speech gate: one small call reads the narration as a listener and names the
 * sentences no native speaker would say aloud; each is replaced by its rewrite only when the board
 * still syncs to the scene and the rewrite adds no slip of its own (reject and rewrite, never guess).
 */
/**
 * What a speech fix must keep: each part name and cut-in the scene says, once, in order. Card anchors and
 * step labels are not held (the cards are cut again from the new words, and a step is also told by the
 * part it reaches), so a garbled label like "and label buttons" can be rewritten.
 */
export function earPhrases(s: Scene, arch: Architecture): string[] {
  const ws = spokenWords(s.narration);
  const cands = [
    ...arch.components.map((c) => c.keyword),
    ...(s.items ?? []).map((i) => i.text),
    ...(s.board_nodes ?? []).map((n) => n.keyword),
  ];
  const seen = new Set<string>();
  return cands
    .map((p) => ({ p: p.toLowerCase(), at: phraseAt(ws, p) }))
    .filter((x) => x.at >= 0 && !seen.has(x.p) && !!seen.add(x.p))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.p);
}

/** Why a walkthrough rewrite would lose one of its steps' cues; undefined when every step is still told. */
function walkLoss(orig: string, next: string, s: Scene, arch: Architecture): string | undefined {
  if (s.kind !== "walkthrough") return undefined;
  const told = (t: string) => walkCues(spokenWords(t), arch).filter((k) => k >= 0).length;
  return told(next) < told(orig) ? "it dropped a step of the walkthrough; keep every part the trip passes" : undefined;
}

export async function speechCheck(o: {
  ledger: CostLedger;
  plan: ScenePlan;
  arch: Architecture;
  audience: string;
  progress?: Progress;
}): Promise<{ plan: ScenePlan; changed: string[]; notes: string[] }> {
  o.progress?.({ stage: "plan", message: "listening for lines that don't sound spoken" });
  const out = await sparkJson({
    ledger: o.ledger,
    step: "speech-check",
    schema: Ear,
    name: "speech_check",
    effort: "minimal",
    maxTokens: 3000,
    messages: [
      {
        role: "system",
        content: [
          `You are a strict editor of spoken English for explainer videos, listening as ${plainListener(o.audience)}.`,
          "Flag only sentences a native speaker would not say aloud: broken grammar, a missing subject or verb, garbled words ('for you user to use'), a label-like line with no real content ('The agent-browser CLI starts every job.'), 'your' stuck on a part of the system ('your daemon'), a long part name repeated from the sentence before, or a bare chain of handoffs that never says why ('the CLI sends it to the daemon, which sends it to Chrome').",
          "For each, give a rewrite: one natural sentence (two short ones at most) with the same facts, about the same length, keeping every part name the scene needs (a name already said in the sentence before may become 'it') and every command it had. A cute stand-in for a real thing ('your helper', 'buddy') is a slip too: say the real name. Problem before fix where it helps. Never add a fact.",
          VOICE_EXAMPLES,
          "Leave good sentences alone; an empty list is the normal answer for clean narration.",
        ].join("\n"),
      },
      { role: "user", content: o.plan.scenes.map((s) => `[${s.id}] ${s.narration}`).join("\n") },
    ],
  }).catch(() => undefined);
  const notes: string[] = [],
    changed: string[] = [];
  if (!out) return { plan: o.plan, changed, notes: ["speech check skipped"] };
  const scenes = o.plan.scenes.map((s) => {
    let narration = s.narration;
    for (const l of out.lines.filter((x) => x.scene === s.id)) {
      const at = narration.indexOf(l.sentence.trim());
      const next = l.rewrite.trim();
      if (at < 0 || !next || next === l.sentence.trim()) continue;
      const cand = tidySpeech(narration.slice(0, at) + next + narration.slice(at + l.sentence.trim().length));
      const one = { ...o.plan, scenes: [{ ...s, narration: cand }] };
      const before = speechIssues({ ...o.plan, scenes: [{ ...s, narration }] }, o.arch).length;
      const why =
        syncProblem(narration, cand, earPhrases({ ...s, narration }, o.arch), Math.ceil(wordCount(narration) * 1.25)) ??
        walkLoss(narration, cand, s, o.arch) ??
        (speechIssues(one, o.arch).length > before ? "the rewrite added a speech slip" : undefined);
      if (why) {
        notes.push(`${s.id}: kept "${l.sentence.trim()}" (${l.problem}); rewrite rejected: ${why}`);
        continue;
      }
      notes.push(`${s.id}: "${l.sentence.trim()}" -> "${next}" (${l.problem})`);
      narration = cand;
    }
    if (narration !== s.narration) changed.push(s.id);
    return narration === s.narration ? s : { ...s, narration };
  });
  return { plan: { ...o.plan, scenes }, changed, notes };
}

/**
 * Wording problems get small rewrites of the scenes involved, even when a structural one is left, and
 * whatever the second look still finds gets one more round. A rewrite the board could not use is sent
 * back with the reason, and a flagged term the narration no longer says is settled without asking.
 */
export async function fixWording(o: {
  ledger: CostLedger;
  plan: ScenePlan;
  arch: Architecture;
  issues: string[];
  audience: string;
  analogy?: string;
  shape?: Shape;
  progress?: Progress;
}): Promise<{ plan: ScenePlan; issues: string[]; changed: boolean }> {
  let story = o.plan,
    final = o.issues,
    changed = false,
    notUsed: string[] = [];
  for (let round = 1; round <= FIX_ROUNDS; round++) {
    const todo = final.filter((x) => !structural(x));
    if (!todo.length) break;
    o.progress?.({ stage: "plan", message: `self-check: ${todo.length} issue(s), fixing the narration${round > 1 ? " again" : ""}` });
    const fix = await fixNarration({
      ledger: o.ledger,
      plan: story,
      arch: o.arch,
      issues: [...todo, ...notUsed],
      audience: o.audience,
      step: round > 1 ? `narration-fix-${round}` : undefined,
    });
    changed = changed || fix.changed.length > 0;
    story = fix.plan;
    notUsed = fix.rejected.map((r) => `[${r.id}] your last rewrite of this scene was not used: ${r.why}`);
    const asked = todo.filter((x) => x.startsWith("a newcomer") || (x.startsWith('"') && said(story, termOf(x))));
    const left = asked.length
      ? await recheckTerms(o.ledger, story, asked, o.audience, round > 1 ? `plan-recheck-${round}` : undefined)
      : [];
    final = [...checkStory(story, o.arch, o.analogy, o.shape), ...left];
  }
  return { plan: story, issues: final, changed };
}

/** Rounds of narration fix and second look after the newcomer check: each is two small calls. */
const FIX_ROUNDS = 3;
const termOf = (issue: string) => /^"(.+?)" \(/.exec(issue)?.[1] ?? "";
const termIssue = (t: { term: string; scene: string }) =>
  `"${t.term}" (${t.scene}) is used without a plain-words explanation; explain it in the same sentence or drop it`;
const hardIssue = (t: { sentence: string; scene: string; why: string }) =>
  `"${t.sentence}" (${t.scene}) would lose someone who doesn't write code (${t.why}); say it the way you'd tell a friend, casual, direct and short: what actually happens and why it matters, in everyday words, with no metaphor and no part explained by its own name`;
const oddIssue = (t: { phrase: string; scene: string }) =>
  `"${t.phrase}" (${t.scene}) is a figure of speech a newcomer would stumble on; say the literal thing in plain words`;
const said = (p: ScenePlan, term: string) => p.scenes.some((s) => ` ${norm(s.narration)} `.includes(` ${norm(term)} `));

/** Self-check problems only a new plan fixes: what the scenes draw, or in what order. The rest are wording. */
export const structural = (issue: string) =>
  /^(the video must open with a 'hook' scene|there is no 'walkthrough' scene|parts on the journey are drawn after|scale or list scenes come before|the core flow starts |no chips line in the first scenes)/.test(
    issue,
  );

/**
 * One small Muse Spark rewrite of just the scenes the self-check flagged. A scene keeps its rewrite only
 * when the board can still sync to it, so a fix never costs the drawing its cues.
 */
export async function fixNarration(o: {
  ledger: CostLedger;
  plan: ScenePlan;
  arch: Architecture;
  issues: string[];
  audience: string;
  step?: string;
}): Promise<{ plan: ScenePlan; changed: string[]; rejected: { id: string; why: string }[] }> {
  const named = o.plan.scenes.filter((s) => o.issues.some((x) => x.includes(s.id)));
  // a problem that names no scene (the same opener three times, the flow as a whole) may need any of them
  const scope = o.issues.some((x) => !o.plan.scenes.some((s) => x.includes(s.id))) ? o.plan.scenes : named;
  const out = await sparkJson({
    ledger: o.ledger,
    step: o.step ?? "narration-fix",
    schema: Polish,
    name: "narration_fix",
    effort: "minimal",
    maxTokens: 5000,
    messages: [
      {
        role: "system",
        content: [
          "You fix specific problems in a whiteboard explainer's narration. The viewer hears every scene once, in order.",
          `Audience: ${o.audience}, but every line must make sense to a smart friend who doesn't write code.`,
          PLAIN_LANGUAGE,
          "- Change only what the problems need; keep everything else word for word, including facts and their order.",
          "- Each scene lists 'must_say': phrases the board syncs to. Keep each one, in that order, with its words in that order ('the', 'a' or 'your' may go between its words, verb endings may change).",
          "- Keep each scene between 80% and 125% of its word count; a recap may grow to its 'words' to retell the trip.",
          `- ${PLAIN}`,
          "- A term explained in plain words: a few words right where it's first said ('the font atlas, one image holding every letter').",
          "- When explaining every flagged term would make the scene too long, drop the ones a newcomer can do without: a product, service or library name ('D1', 'better-auth', 'Worker') becomes what it does ('a small cloud database', 'the sign-in code'). A must_say phrase is never dropped; explain it instead.",
          "- Only say two parts talk to each other when the connections list joins them; otherwise tell the hop through the part between them.",
          "- Return only the scenes you changed, by id, with their full narration; renames stays empty.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          problems: o.issues,
          parts: o.arch.components.map((c) => ({ id: c.id, name: c.keyword, what: c.what })),
          connections: o.arch.connections.map(
            (c) =>
              `${o.arch.components.find((x) => x.id === c.from)?.keyword ?? c.from} > ${o.arch.components.find((x) => x.id === c.to)?.keyword ?? c.to} (${c.label})`,
          ),
          context: o.plan.scenes.map((s) => `[${s.id}] ${s.narration}`).join("\n"),
          scenes: scope.map((s) => ({
            id: s.id,
            kind: s.kind,
            words:
              s.kind === "recap" ? Math.max(wordCount(s.narration), recapWords(journeyOrder(o.arch).path.length)) : wordCount(s.narration),
            must_say: syncPhrases(s, o.arch),
            narration: s.narration,
          })),
        }),
      },
    ],
  }).catch(() => undefined);
  const changed: string[] = [],
    rejected: { id: string; why: string }[] = [];
  const scenes = o.plan.scenes.map((s) => {
    const next = out?.scenes.find((x) => x.id === s.id)?.narration?.trim();
    if (!next || next === s.narration || !scope.includes(s)) return s;
    const why = syncProblem(
      s.narration,
      next,
      syncPhrases(s, o.arch),
      s.kind === "recap" ? recapWords(journeyOrder(o.arch).path.length) : 0,
    );
    if (why) {
      rejected.push({ id: s.id, why });
      return s;
    }
    changed.push(s.id);
    return { ...s, narration: tidySpeech(next) };
  });
  return { plan: { ...o.plan, scenes }, changed, rejected };
}

const Recheck = z.object({
  open: z.array(z.string()).describe("the numbers of the problems still there, as written"),
});
/** A quick second look at the terms and flow the newcomer check flagged: which are still unexplained. */
async function recheckTerms(
  ledger: CostLedger,
  plan: ScenePlan,
  issues: string[],
  audience: string,
  step = "plan-recheck",
): Promise<string[]> {
  const r = await sparkJson({
    ledger,
    step,
    schema: Recheck,
    name: "recheck",
    effort: "minimal",
    maxTokens: 1500,
    messages: [
      {
        role: "system",
        content: `You are ${plainListener(audience)}. You hear this explainer narration once, in order. For each numbered problem, decide whether it is still there in the narration below: a term counts as explained when plain words say what it is at or before its first use, and a quoted sentence is fixed when the narration no longer says it or says it in short everyday words you follow. Return the numbers still there.`,
      },
      {
        role: "user",
        content: `${issues.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nNarration:\n${plan.scenes.map((s) => `[${s.id}] ${s.narration}`).join("\n")}`,
      },
    ],
  }).catch(() => undefined);
  if (!r) return issues;
  return issues.filter((_, i) => r.open.some((n) => n.trim().replace(/\.$/, "") === String(i + 1)));
}

/** The README's safety promise, told once as a problem-then-fix contrast line. */
function promiseRule(ps: { feature: string; sentence: string }[]): string {
  if (!ps.length) return "";
  return `Safety promise the README makes (tell it once, in the walkthrough or a side scene, as a contrast line: the risk in one sentence, then the promise in the README's words in the next, naming the feature that keeps it, and claim nothing about how it works that the README does not say): ${ps.map((x) => `${x.feature}: "${x.sentence}"`).join("; ")}\n\n`;
}

/** A README safety promise the narration never says. */
export function promiseIssues(p: ScenePlan, ps: { feature: string; sentence: string }[]): string[] {
  const said = norm(p.scenes.map((s) => s.narration).join(" "));
  return ps
    .filter((x) => {
      const key = norm(x.sentence)
        .split(" ")
        .filter((w) => w.length > 3 && !["never", "without", "longer", "your"].includes(w));
      return key.filter((w) => said.includes(w.replace(/s$/, ""))).length < Math.min(2, key.length);
    })
    .map(
      (x) =>
        `the README promises "${x.sentence}" (${x.feature}); say it once as a contrast line, the risk first (an AI that types your password could leak it), then the promise`,
    );
}

function notesRules(slots: { after: string; heading: string; brief: string }[]): string[] {
  if (!slots.length) return [];
  return [
    "Extra 'notes' scenes (whiteboard lists). Place each right after the scene named, use the heading given, and fill items:",
    ...slots.map((n) => `- notes "${n.heading}" after the ${n.after} scene(s): ${n.brief}`),
    'Each item text is 2 to 7 lowercase words that read as a phrase; keep commas and "or" in a list. The narration reads the items in order and adds the reasoning. icon from the same icon names as the components.',
  ];
}

const HEDGE = /\b(assum|estimat|rough|ballpark|guess|hypothetical|let's say|say we|imagine|suppose)/i;
const NUMBER = /(^|[^a-z0-9])\d/i;

/** Ground and label list items: targets must exist, any number is an estimate, evidence is a real file. */
export function validateNotes(
  items: NoteItem[],
  o: { ids?: Set<string>; files?: Set<string>; evidenceOf?: (id: string) => string; source?: string },
): { items: NoteItem[]; repairs: string[] } {
  const repairs: string[] = [];
  const out: NoteItem[] = [];
  for (const it0 of items.slice(0, 6)) {
    const it = { ...it0, text: lower(it0.text).split(/\s+/).slice(0, 7).join(" ") };
    if (o.source !== undefined) {
      // post/article: the item must be backed by a verbatim quote
      if (!quoteInSource(it.evidence, o.source)) {
        repairs.push(`note "${it.text}" dropped: quote not in source`);
        continue;
      }
      it.target = "";
    } else {
      if (it.target && !o.ids?.has(it.target)) {
        repairs.push(`note "${it.text}": unknown target ${it.target}`);
        it.target = "";
      }
      // a standalone number ("50k", "~4", "10x"), not a name like d1 or r2
      const hasNumber = NUMBER.test(it.text);
      if (hasNumber && !it.estimate) {
        it.estimate = true;
        repairs.push(`note "${it.text}" marked as estimate`);
      }
      // the tag is for assumed numbers; on a plain claim it would read as doubt about the code itself
      if (!hasNumber && it.estimate) {
        it.estimate = false;
        repairs.push(`note "${it.text}": estimate tag dropped (no number)`);
      }
      if (it.evidence && !o.files?.has(it.evidence)) it.evidence = it.target && o.evidenceOf ? o.evidenceOf(it.target) : "";
      if (!it.estimate && !it.evidence && it.target && o.evidenceOf) it.evidence = o.evidenceOf(it.target);
    }
    out.push(it);
  }
  return { items: out, repairs };
}

/** Deterministic checker + repair, so the renderer can trust the plan. */
export function repairRepoPlan(plan: ScenePlan, arch: Architecture, L: { perScene: number }): ScenePlan & { repairs: string[] } {
  const repairs: string[] = [];
  const ids = new Set(arch.components.map((c) => c.id));
  const seen = new Set<string>();
  const scenes: Scene[] = [];
  const blank = (s: Partial<Scene>): Scene => ({
    id: "",
    kind: "layer",
    heading: "",
    narration: "",
    add_components: [],
    add_connections: [],
    board_nodes: [],
    board_edges: [],
    highlights: [],
    callouts: [],
    items: [],
    ...s,
  });
  const files = new Set(arch.components.flatMap((c) => c.evidence));
  const evidenceOf = (id: string) => arch.components.find((c) => c.id === id)?.evidence[0] ?? "";
  for (const s0 of plan.scenes) {
    const s = { ...s0, heading: shortHeading(s0.heading) };
    if (s.kind === "layer") {
      const add = s.add_components.filter((id) => {
        if (!ids.has(id)) {
          repairs.push(`unknown component ${id} removed`);
          return false;
        }
        if (seen.has(id)) {
          repairs.push(`${id} added twice`);
          return false;
        }
        return true;
      });
      add.forEach((id) => seen.add(id));
      if (!add.length) {
        repairs.push(`empty layer scene "${s.heading}" dropped`);
        continue;
      }
      if (add.length > L.perScene) {
        // split: keep sentences with the components they mention
        // too few sentences to go round: fall back to clauses, so no line is ever spoken twice
        const parts = Math.ceil(add.length / L.perScene);
        let pieces: string[] = s.narration.match(/[^.!?]+[.!?]*/g) ?? [s.narration];
        if (pieces.length < parts) pieces = s.narration.split(/(?<=[.!?,;:])\s+/);
        const tidy = (t: string) => {
          const x = t.trim().replace(/[,;:]$/, ".");
          return x ? x[0].toUpperCase() + x.slice(1) : x;
        };
        let used = 0;
        for (let i = 0; i < add.length; i += L.perScene) {
          const chunk = add.slice(i, i + L.perScene);
          const n1 = Math.min(pieces.length, Math.max(used + 1, Math.round(((i + chunk.length) / add.length) * pieces.length)));
          const own = pieces.slice(used, n1).join(" ").trim();
          used = Math.max(used, n1);
          const said =
            own ||
            chunk
              .map((id) => {
                const c = arch.components.find((x) => x.id === id)!;
                return `The ${c.keyword}: ${c.what}`;
              })
              .join(" ");
          scenes.push(
            blank({
              ...s,
              id: `${s.id}-${i}`,
              heading: i ? s.heading + " cont." : s.heading,
              add_components: chunk,
              narration: own ? tidy(said) : said,
            }),
          );
        }
        repairs.push(`layer scene "${s.heading}" split`);
        continue;
      }
      scenes.push(blank({ ...s, add_components: add, add_connections: [], callouts: [], items: [] }));
    } else if (s.kind === "notes") {
      const v = validateNotes(s.items ?? [], { ids, files, evidenceOf });
      repairs.push(...v.repairs);
      if (!v.items.length) {
        repairs.push(`empty notes scene "${s.heading}" dropped`);
        continue;
      }
      let narration = s.narration;
      if (v.items.some((i) => i.estimate) && !HEDGE.test(narration)) {
        narration = "Rough estimates, not measurements of the real app. " + narration;
        repairs.push(`hedged numbers in "${s.heading}"`);
      }
      scenes.push(blank({ ...s, narration, items: v.items, add_components: [], add_connections: [], callouts: [] }));
    } else scenes.push(blank({ ...s, add_components: [], add_connections: [], items: [] }));
  }
  // any component never added gets its own layer scene: journey parts before the walkthrough, side parts after it
  const { path, side } = journeyOrder(arch);
  const missing = arch.components.filter((c) => !seen.has(c.id));
  if (missing.length) {
    for (const group of [path, side]) {
      const miss = missing.filter((c) => group.includes(c.id));
      for (let i = 0; i < miss.length; i += L.perScene) {
        const chunk = miss.slice(i, i + L.perScene);
        scenes.push(
          blank({
            id: `extra-${chunk[0].id}`,
            kind: "layer",
            heading: chunk
              .map((c) => c.keyword)
              .join(" + ")
              .split(" ")
              .slice(0, 4)
              .join(" "),
            narration: chunk.map((c) => `The ${c.keyword}: ${c.what}`).join(" "),
            add_components: chunk.map((c) => c.id),
          }),
        );
      }
    }
    repairs.push(`added ${missing.length} missing components`);
  }
  if (!scenes.some((s) => s.kind === "walkthrough") && arch.walkthrough.steps.length) {
    scenes.push(
      blank({
        id: "walk",
        kind: "walkthrough",
        heading: "follow one request",
        narration: `Let's follow one request: ${arch.walkthrough.name}. ${retellTrip(arch)}`,
      }),
    );
    repairs.push("walkthrough added");
  }
  // story order (docs/explaining-playbook.md): hook, the journey's parts in the order the request meets them,
  // the walkthrough, side parts, then any deep beats, then the recap
  const rank = (s: Scene): number => {
    if (s.kind === "hook") return 0;
    if (s.kind === "layer") {
      const k = Math.min(...s.add_components.map((id) => path.indexOf(id)).filter((k) => k >= 0));
      return isFinite(k) ? 1 + k / 100 : 3;
    }
    if (s.kind === "walkthrough") return 2;
    if (s.kind === "recap") return 9;
    return 5;
  };
  const before = scenes.map((s) => s.id).join();
  scenes.splice(
    0,
    scenes.length,
    ...scenes
      .map((s, i) => ({ s, i }))
      .sort((x, y) => rank(x.s) - rank(y.s) || x.i - y.i)
      .map((x) => x.s),
  );
  if (scenes.map((s) => s.id).join() !== before) repairs.push("scenes put in story order");
  // connections: draw each as soon as both ends exist
  const present = new Set<string>();
  const drawn = new Set<string>();
  for (const s of scenes) {
    s.add_components.forEach((id) => present.add(id));
    for (const e of arch.connections) {
      const k = `${e.from}>${e.to}`;
      if (!drawn.has(k) && present.has(e.from) && present.has(e.to)) {
        s.add_connections.push(k);
        drawn.add(k);
      }
    }
  }
  if (!scenes.some((s) => s.kind === "hook")) {
    scenes.unshift(
      blank({ id: "hook", kind: "hook", heading: lower(arch.product).split(/\s+/).slice(0, 4).join(" "), narration: arch.one_liner }),
    );
    repairs.push("hook added");
  }
  // scale scenes must map 1:1 to scale risks, in order
  const scaleScenes = scenes.filter((s) => s.kind === "scale");
  arch.scale.forEach((r, i) => {
    let s = scaleScenes[i];
    if (!s) {
      s = blank({
        id: `scale-${i}`,
        kind: "scale",
        heading: `at ${r.at}`,
        narration: `At ${r.at} traffic, ${tidySpeech(r.why)} The fix: ${r.fix_detail}`,
      });
      const rec = scenes.findIndex((x) => x.kind === "recap");
      scenes.splice(rec < 0 ? scenes.length : rec, 0, s);
      repairs.push("scale scene added");
    }
    s.callouts = [
      { target: r.component, text: r.problem, color: "red" },
      { target: r.component, text: r.fix, color: "green" },
    ];
  });
  for (const extra of scaleScenes.slice(arch.scale.length)) {
    scenes.splice(scenes.indexOf(extra), 1);
    repairs.push("extra scale scene dropped");
  }
  if (!scenes.some((s) => s.kind === "recap")) {
    scenes.push(blank({ id: "recap", kind: "recap", heading: "start to finish", narration: retellTrip(arch) || arch.one_liner }));
    repairs.push("recap added");
  }
  scenes.forEach((s, i) => {
    s.id = `s${String(i + 1).padStart(2, "0")}-${s.kind}`;
    s.narration = tidySpeech(s.narration);
  });
  return { title: lower(plan.title || arch.product), subtitle: lower(plan.subtitle || ""), scenes, repairs };
}

// ---------------------------------------------------------------------------
// X posts and articles: annotated source + concept boards, every node quoted.
// ---------------------------------------------------------------------------
export async function planConceptScenes(o: {
  ledger: CostLedger;
  doc: SourceDoc;
  spec: ExplainSpec;
  icons: string;
  progress?: Progress;
}): Promise<ScenePlan & { repairs: string[]; rubric: { total: number; issues: string[] } }> {
  const L = o.spec;
  // no set length: as many boards as the core needs, with six boards as the ceiling
  const [, hi] = coverageSeconds(L, { components: 0, steps: 0, scale: 0, boards: 6 });
  o.progress?.({ stage: "plan", message: "breaking the source into concepts" });
  // a topic is not always best told as "here are four boxes": the shape decides how the boards are framed
  const shape = shapeFor(L.brief.approach);
  const S = SHAPES[shape];
  const frame = {
    journey: "Tell the boards as a process: each board is the next thing that happens, in the order it happens.",
    build:
      "Build the mechanism up: the first board is the smallest piece that already works, and each board after it adds the part that the last one needed.",
    fault: "Each board is one thing that goes wrong in the viewer's own experience, then what actually happens instead.",
  }[shape];
  const sys = [
    o.doc.kind === "topic"
      ? `You explain the topic "${o.doc.title}" in a whiteboard explainer video, using only the numbered sources below (an encyclopedia article and the references it cites). Cover the core of what the viewer asked, not every detail in the sources.`
      : `You turn a dense ${o.doc.kind === "x-post" ? "X post" : "article"} into a whiteboard explainer video.`,
    STYLE,
    L.voice,
    formatRule(L.format),
    "The hook asks one question the viewer can't answer yet and never answers it in its first line; the recap answers it.",
    "Every board, notes, and cut-in scene advances the mechanism, shows evidence from the source, or poses the next question.",
    "Scenes:",
    o.doc.kind === "topic" ? `1. 'hook': ${S.hook}` : `1. 'hook': the one question this source answers, in plain words. ${S.hook}`,
    `${o.doc.kind === "topic" ? "2. optionally one 'source' scene, and only when the source's own words carry weight (a standard, a study, a spec): the reader sees a card with the sources' text (say where it comes from, e.g. 'the standard says'). When the viewer just wants to see how the thing works, skip it and start the boards." : "2. 'source' scene(s): the reader sees the real post/article screenshot"}. highlights: 2 to 4 phrases (2 to 10 words) copied VERBATIM from the source text, each with a 1 to 3 word note and a color (red = problem/claim to question, orange = key idea, green = result/fix, blue = actor/entity). Narration explains why those phrases matter.`,
    `3. as many 'board' scenes as the core idea needs, usually 2 to 5 and never more than 6. ${frame} Each is a fresh mini diagram of one idea with 2 to ${Math.max(3, L.perScene + 1)} board_nodes and edges between them, drawn left to right in reading order. Every board node's evidence is an exact quote (3 to 12 words) from the source that justifies it (it is printed under the node, so pick the most telling words). count is 1, or 3 to 9 when the node means 'many of these' (8 GPUs, many workers, lots of docs): it becomes an icon grid. callouts: at most 1 per board, circling the node that matters most (target = board node id, text 1 to 3 words). Use colors semantically. icon from: ${o.icons}`,
    "Optionally one 'notes' scene (after the source scene) when the source lists concrete things (features, steps, numbers, stack): 3 to 6 items, text 2 to 7 words, evidence an exact quote, target empty, estimate false (a number the author states is their claim, not our estimate). icon from the same list.",
    ...cutInRules(L.style, o.icons),
    S.recap ? "4. 'recap': the whole idea in two sentences, what to remember." : `4. no 'recap' scene. ${S.close}`,
    `Headings: ${S.headings}`,
    `Each narration about ${L.wordsPerScene} words at ${L.tempo.wps} words/sec. There is no set length: stop once the core of ${o.doc.kind === "topic" ? "what was asked" : "the source"} is covered, never pad, and stay under ${hi} seconds. Leave out side details that do not help answer the hook. Do not claim anything the source does not say; ${o.doc.kind === "topic" ? "every fact must come from the sources (no outside facts)." : "say 'the author claims' when it is a claim."}`,
    "Leave add_components, add_connections empty. callouts only on boards. items only in notes, chart, timeline and map scenes.",
    o.doc.kind === "topic"
      ? "title: under 6 lowercase words. subtitle: the source sites, lowercase."
      : "title: under 6 lowercase words. subtitle: who wrote it, lowercase.",
  ].join("\n");
  const user = `SOURCE (${o.doc.kind}) by ${o.doc.author ?? "unknown"}: ${o.doc.title}\nURL: ${o.doc.url}\n\nTEXT:\n${o.doc.text.slice(0, 30000)}`;
  let plan = await sparkJson({
    ledger: o.ledger,
    step: "concept-plan",
    schema: ScenePlan,
    wire: ConceptPlanWire,
    name: "scene_plan",
    effort: "low",
    maxTokens: 9000,
    hedge: true,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  });
  let { plan: fixed, dropped, unsaid } = validateConcept(plan, o.doc.text);
  let rubric = scoreRubric(fixed, { arch: NO_ARCH, format: L.format, wps: L.tempo.wps, source: o.doc.text });
  // a cut-in that lost too many rows to stand is dropped whole, so even one bad row is worth a re-plan then
  const cutIns = (p: ScenePlan) => p.scenes.filter((s) => s.kind === "chart" || s.kind === "timeline" || s.kind === "map").length;
  if (dropped.length > 2 || cutIns(fixed) < cutIns(plan) || shouldRejectRubric(rubric)) {
    const why = shouldRejectRubric(rubric) ? `; rubric ${rubric.total}/10` : "";
    o.progress?.({ stage: "plan", message: `re-planning: ${dropped.length} quotes were not in the source${why}` });
    plan = await sparkJson({
      ledger: o.ledger,
      step: "concept-plan-revise",
      schema: ScenePlan,
      wire: ConceptPlanWire,
      name: "scene_plan",
      effort: "low",
      maxTokens: 9000,
      hedge: true,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
        { role: "assistant", content: JSON.stringify(plan) },
        {
          role: "user",
          content: `These rows failed the source check (a quote not copied verbatim, a chart or timeline quote that does not state its number or date, or a map place that is not a real country or city named in its quote). Replace each with an exact copied phrase that does, or remove it:\n${dropped.join("\n")}${rubric.issues.length ? `\n\nWeak-script rubric (${rubric.total}/10):\n${rubric.issues.join("\n")}` : ""}\nReturn the full corrected plan.`,
        },
      ],
    });
    ({ plan: fixed, dropped, unsaid } = validateConcept(plan, o.doc.text));
    rubric = scoreRubric(fixed, { arch: NO_ARCH, format: L.format, wps: L.tempo.wps, source: o.doc.text });
  }
  // a dropped row still named next to a kept one ("from china through persia to rome") needs a real rewrite of that scene
  const retold: string[] = [];
  for (const u of unsaid) {
    const sc = fixed.scenes.find((x) => x.id === u.id)!;
    const out = await sparkJson({
      ledger: o.ledger,
      step: "cut-in-retell",
      schema: z.object({ narration: z.string() }),
      name: "narration",
      effort: "minimal",
      maxTokens: 2000,
      messages: [
        {
          role: "system",
          content:
            "Rewrite this narration for a whiteboard explainer so it no longer mentions the removed items, which are not shown on screen. Keep everything else, the voice and the length; say each shown item's name as it is now said.",
        },
        { role: "user", content: JSON.stringify({ narration: sc.narration, removed: u.names, shown: sc.items.map((it) => it.text) }) },
      ],
    }).catch(() => undefined);
    const next = out?.narration.trim() ?? "";
    const r = wordCount(next) / Math.max(1, wordCount(sc.narration));
    if (next && r > 0.6 && r < 1.3 && !u.names.some((n) => new RegExp(`\\b${n}\\b`, "i").test(next))) {
      sc.narration = tidySpeech(next);
      retold.push(`${u.id}: narration retold without ${u.names.join(", ")}`);
    } else retold.push(`${u.id}: narration still names dropped ${u.names.join(", ")}`);
  }
  // broken sentences ("Bandits harsh deserts make travel costly") get one small rewrite of just those scenes
  const slips = conceptSlips(fixed);
  if (slips.length) {
    o.progress?.({ stage: "plan", message: `fixing ${slips.length} broken sentence(s)` });
    const f = await fixNarration({ ledger: o.ledger, plan: fixed, arch: NO_ARCH, issues: slips, audience: L.audience });
    fixed = { ...fixed, scenes: f.plan.scenes };
    const left = conceptSlips(fixed);
    retold.push(
      `speech: ${slips.length} problem(s), ${f.changed.length} scene(s) rewritten, ${left.length} left${left.length ? `: ${left.join("; ")}` : ""}`,
    );
  }
  rubric = scoreRubric(fixed, { arch: NO_ARCH, format: L.format, wps: L.tempo.wps, source: o.doc.text });
  return {
    ...fixed,
    repairs: [...dropped.map((d) => `dropped unquoted: ${d}`), ...retold],
    rubric: { total: rubric.total, issues: rubric.issues },
  };
}

const LineCards = z.object({
  lines: z.array(
    z.object({
      n: z.number().int().describe("the line number given"),
      visual: z.enum(["board", "kinetic", "chips", "number", "contrast", "doodle"]),
      text: z
        .string()
        .describe(
          "kinetic: 2 to 6 words of the line, copied exactly; number: the figure as said ('2 million'); doodle: a 1 to 3 word label said in the line; otherwise empty",
        ),
      items: z
        .array(z.string())
        .describe(
          "chips: 2 to 4 names said in the line; contrast: exactly [before, after], each 2 to 5 words the line says; otherwise empty",
        ),
      focus: z.string().describe("doodle: a plain noun for the picture ('ship', 'server'); otherwise empty"),
    }),
  ),
});

/**
 * Line cards for a topic or article video: one small call picks, for each sentence, whether the scene's
 * own visual carries it (board) or a full-frame card does (big words, names, a figure, a before and
 * after, a doodle). The same deterministic check as a repo plan then keeps only cards whose words are
 * said in their line and figures the sources state; a failed call leaves the plan as it was.
 */
export async function planConceptBeats(o: {
  ledger: CostLedger;
  plan: ScenePlan;
  source: string;
  wps?: number;
  progress?: Progress;
}): Promise<{ plan: ScenePlan; report?: BeatReport }> {
  const carded = o.plan.scenes.filter((s) => s.kind !== "recap" && s.kind !== "outro");
  const lines = carded.flatMap((s) => sentencesIn(s.narration).map((line) => ({ id: s.id, kind: s.kind, line })));
  if (lines.length < 3) return { plan: o.plan };
  o.progress?.({ stage: "plan", message: "choosing a visual for each line" });
  const out = await sparkJson({
    ledger: o.ledger,
    step: "line-cards",
    schema: LineCards,
    name: "line_cards",
    effort: "minimal",
    maxTokens: 4000,
    messages: [
      {
        role: "system",
        content: [
          "You pick the visual for each narration line of a whiteboard explainer, the way a good YouTube explainer cuts away from its main picture.",
          "board: stay on the scene's own picture (the default; use it on most lines that describe the map, chart or page shown). kinetic: a short claim or punchline in big words. chips: 2 to 4 names the line says. number: one figure the line says. contrast: a before and after, or problem and fix, the line says. doodle: one labelled sketch of a thing the line names.",
          "Put on screen only words the line says. About a third of lines get a card; never the same card type three lines running; at most one kinetic in three cards. The hook's first line is board.",
        ].join("\n"),
      },
      { role: "user", content: lines.map((l, i) => `${i}. [${l.kind}] ${l.line}`).join("\n") },
    ],
  }).catch(() => undefined);
  if (!out) {
    // the line cards never came back: every line stays on its picture instead of going without a visual
    const scenes = o.plan.scenes.map((s) => (carded.includes(s) ? { ...s, beats: boardBeats(s.narration) } : s));
    const b = checkBeats({ ...o.plan, scenes }, { arch: NO_ARCH, source: o.source, wps: o.wps });
    return { plan: b.plan, report: b.report };
  }
  const pick = new Map(out.lines.map((x) => [x.n, x]));
  let n = 0;
  const scenes = o.plan.scenes.map((s) => {
    if (!carded.includes(s)) return s;
    const beats = sentencesIn(s.narration).map((line, k) => {
      const p = pick.get(n++);
      const first = s.kind === "hook" && k === 0;
      const anchor = line.split(/\s+/).slice(0, 3).join(" ");
      return {
        line,
        anchor,
        visual: !p || first ? ("board" as const) : p.visual,
        text: p?.text ?? "",
        items: p?.items ?? [],
        focus: p?.focus ?? "",
      };
    });
    return { ...s, beats };
  });
  const b = checkBeats({ ...o.plan, scenes }, { arch: NO_ARCH, source: o.source, wps: o.wps });
  return { plan: b.plan, report: b.report };
}

/**
 * A plan cached before a speech check existed can still carry the slip that check now catches: one small
 * rewrite of just the flagged scenes, so a re-render from cache fixes it and re-voices only those scenes.
 * A clean plan costs nothing.
 */
export async function respeak(o: {
  ledger: CostLedger;
  plan: ScenePlan;
  arch?: Architecture;
  audience: string;
}): Promise<{ plan: ScenePlan; changed: string[]; note?: string }> {
  const slips = conceptSlips(o.plan);
  if (!slips.length) return { plan: o.plan, changed: [] };
  const f = await fixNarration({ ledger: o.ledger, plan: o.plan, arch: o.arch ?? NO_ARCH, issues: slips, audience: o.audience });
  const left = conceptSlips(f.plan);
  return {
    ...f,
    note: `speech recheck: ${slips.length} problem(s), ${f.changed.length ? `${f.changed.join(", ")} rewritten` : "nothing rewritten"}, ${left.length} left${left.length ? `: ${left.join("; ")}` : ""}`,
  };
}

const NO_ARCH: Architecture = {
  product: "",
  one_liner: "",
  components: [],
  connections: [],
  walkthrough: { name: "", steps: [] },
  scale: [],
};
/** What a topic or article video's narration trips on: missing articles and broken sentences, per scene. */
export function conceptSlips(plan: ScenePlan): string[] {
  return plan.scenes.flatMap((s) => {
    const miss = missingArticles(s.narration).map((m) => `missing article in "${m}"; say "the" or "a" before the noun`);
    const all = [...miss, ...grammarSlips(s.narration)];
    return all.map((g) => `${s.id}: ${g}`);
  });
}

export function validateConcept(
  plan: ScenePlan,
  source: string,
): { plan: ScenePlan; dropped: string[]; unsaid: { id: string; names: string[] }[] } {
  const dropped: string[] = [];
  const unsaid: { id: string; names: string[] }[] = [];
  const kw = (s: string) => lower(s).split(/\s+/).slice(0, 3).join(" ");
  const scenes = plan.scenes
    .map((s, i) => {
      const highlights = s.highlights
        .filter((h) => (quoteInSource(h.quote, source) ? true : (dropped.push(`highlight "${h.quote}"`), false)))
        .map((h) => ({ ...h, note: kw(h.note) }));
      const board_nodes = s.board_nodes
        .filter((n) => (quoteInSource(n.evidence, source) ? true : (dropped.push(`node ${n.keyword}: "${n.evidence}"`), false)))
        .map((n) => ({ ...n, keyword: kw(n.keyword) }));
      const ok = new Set(board_nodes.map((n) => n.id));
      const board_edges = s.board_edges.filter((e) => ok.has(e.from) && ok.has(e.to));
      const callouts =
        s.kind === "board"
          ? (s.callouts ?? [])
              .filter((c) => ok.has(c.target))
              .slice(0, 1)
              .map((c) => ({ ...c, text: kw(c.text) }))
          : [];
      const items =
        s.kind === "notes"
          ? validateNotes(s.items ?? [], { source }).items
          : s.kind === "chart" || s.kind === "timeline" || s.kind === "map"
            ? validateCutIn(s.kind, s.items ?? [], source, dropped)
            : [];
      for (const n of board_nodes) n.count = Math.max(1, Math.min(9, Math.round(n.count ?? 1)));
      const id = `s${String(i + 1).padStart(2, "0")}-${s.kind}`;
      // the voice and the heading say only what is drawn: "three stations" with two on screen, or a dropped place, would not match
      let { narration, heading } = s;
      if (s.kind === "chart" || s.kind === "timeline" || s.kind === "map") {
        const r = retellCutIn({ narration, heading, kind: s.kind }, s.items ?? [], items);
        ({ narration, heading } = r);
        if (r.left.length) unsaid.push({ id, names: r.left });
      }
      return {
        ...s,
        id,
        narration: tidySpeech(narration),
        heading: shortHeading(heading),
        highlights,
        board_nodes,
        board_edges,
        callouts,
        items,
        add_components: [],
        add_connections: [],
      };
    })
    .filter(
      (s) =>
        !(s.kind === "board" && s.board_nodes.length < 2) &&
        !(s.kind === "source" && !s.highlights.length && !s.narration) &&
        !(s.kind === "notes" && s.items.length < 2) &&
        !((s.kind === "chart" || s.kind === "map") && s.items.length < 2) &&
        !(s.kind === "timeline" && s.items.length < 3),
    );
  return {
    plan: { ...plan, title: lower(plan.title), subtitle: lower(plan.subtitle), scenes },
    dropped,
    unsaid: unsaid.filter((u) => scenes.some((s) => s.id === u.id)),
  };
}

const COUNT = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** What a cut-in row is called aloud: the place for a map, the label words for a bar, the date for a timeline. */
const rowName = (kind: string, it: NoteItem) =>
  kind === "map"
    ? it.target
    : kind === "chart"
      ? it.text.replace(/[-+$€£]?\d[\d,.]*\s*(%|[a-z]+)?/gi, "").trim()
      : (parseDated(it.text)?.when ?? "");

/**
 * When the source check drops rows from a cut-in, the narration and heading are rewritten to match what
 * is drawn: a count of the old rows becomes the new count, and a sentence about a dropped row goes.
 * `left` lists dropped names still said in a sentence that also talks about a kept row.
 */
export function retellCutIn(
  s: { narration: string; heading: string; kind: string },
  before: NoteItem[],
  after: NoteItem[],
): { narration: string; heading: string; left: string[] } {
  const keptText = new Set(after.map((it) => lower(it.text)));
  const gone = before
    .filter((it) => !keptText.has(lower(it.text).split(/\s+/).slice(0, 5).join(" ")) && !keptText.has(lower(it.text)))
    .map((it) => lower(rowName(s.kind, it)))
    .filter((n) => n.length > 1);
  if (before.length === after.length && !gone.length) return { ...s, left: [] };
  const kept = after.map((it) => lower(rowName(s.kind, it))).filter((n) => n.length > 1);
  const recount = (t: string) => {
    if (before.length === after.length || before.length > 10) return t;
    // only the word ("three"), never digits, which in a chart are the figures themselves
    return t.replace(new RegExp(`\\b${COUNT[before.length]}\\b`, "gi"), (m) => {
      const to = COUNT[after.length];
      return m[0] === m[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to;
    });
  };
  const says = (sent: string, name: string) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(sent);
  const left: string[] = [];
  const sents = s.narration
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((sent) => {
      const bad = gone.filter((g) => says(sent, g));
      if (!bad.length) return true;
      if (kept.some((k) => says(sent, k))) {
        left.push(...bad);
        return true;
      }
      return false;
    });
  return { narration: recount(sents.join(" ")), heading: recount(s.heading), left: [...new Set(left)] };
}

/** Explainer style adds news-style cut-ins; the whiteboard style keeps to boards. Both only use what the source states. */
export function cutInRules(style: ExplainSpec["style"], icons: string): string[] {
  if (style !== "explainer") return ["No 'chart', 'timeline' or 'map' scenes."];
  return [
    "Cut-ins: add a 'chart', 'timeline' or 'map' scene where it shows the point better than a diagram, right after the board it belongs to, and only from figures and places the source states. Usually one cut-in, at most two.",
    `- 'chart': 2 to 6 quantities of the same kind and unit, compared. items: text is 1 to 4 lowercase label words then the number exactly as the source writes it ('chrome 65%', 'root servers 13'); evidence is an exact quote (5 to 20 words) from the source that contains that number; color orange for the bar the narration is about, blue for the rest; icon from: ${icons}; target empty; estimate false. Heading names what is compared. Narration says which bar matters and what it means; never read every number out.`,
    "- 'timeline': 3 to 6 dated events, oldest first. items: text is the date as the source writes it then 2 to 6 lowercase words ('1983 dns is invented'); evidence an exact quote containing that date; color blue, green for the latest; icon from the same list; target empty; estimate false. Narration tells the turn the dates show, not a list of years.",
    "- 'map': only when where it happened is part of the point (a place of origin, a spread, a route, a border). 2 to 6 real countries or cities the source names. items: target is the place's common English name ('france', 'geneva', 'united states'); text is 2 to 5 lowercase words saying what happened there ('geneva web is born'); evidence an exact quote (5 to 20 words) from the source that names the place; color orange for the place the narration is about, blue for the rest; icon from the same list; estimate false. Narration says why the places matter, not a list of names.",
    "Never estimate, round or convert a number for a cut-in; leave the cut-in out when the source gives no figures.",
  ];
}

/**
 * Whether a quote names a place: the name itself, or a word grown from it the way the source would say it
 * ("chinese" for china, "persian" for persia, "roman" for rome). Any part of "merv, turkmenistan" counts.
 */
export function namesPlace(quote: string, names: string[]): boolean {
  const words = quote
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter(Boolean);
  return names
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean)
    .some((n) => {
      if (
        ` ${words.join(" ")} `.includes(
          ` ${n
            .split(/[^a-z']+/)
            .filter(Boolean)
            .join(" ")} `,
        )
      )
        return true;
      if (/\s/.test(n)) return false;
      const stem = n.replace(/[aeiouy]+$/, "");
      return (
        stem.length >= 3 &&
        words.some((w) => w.startsWith(stem) && w.length > stem.length && /^(n|an|ian|ese|ic|ish|s|'s)$/.test(w.slice(stem.length)))
      );
    });
}

/** Map rows: a real place (in the Natural Earth gazetteer) that the quoted source sentence names, each place once. */
function validateMap(items: NoteItem[], source: string, dropped: string[]): NoteItem[] {
  const seen = new Set<string>();
  const fold = (x: string) =>
    x
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  return items
    .map((it) => ({
      ...it,
      text: lower(it.text).split(/\s+/).slice(0, 5).join(" "),
      target: lower(it.target).replace(/^the\s+/, ""),
      estimate: false,
    }))
    .filter((it) => {
      const p = findPlace(it.target);
      const why = !p
        ? "not a place on the map"
        : !quoteInSource(it.evidence, source)
          ? "quote not in the source"
          : !namesPlace(fold(it.evidence), it.target.split(",").map(fold))
            ? "the quote does not name it"
            : seen.has(p.iso + p.name)
              ? "the same place twice"
              : "";
      if (why) dropped.push(`map "${it.target}": ${why}`);
      else seen.add(p!.iso + p!.name);
      return !why;
    })
    .slice(0, 6);
}

/** Chart and timeline rows: the quote must be in the source and state the row's number or date. Bars share one unit; dates go oldest first. */
export function validateCutIn(kind: "chart" | "timeline" | "map", items: NoteItem[], source: string, dropped: string[]): NoteItem[] {
  if (kind === "map") return validateMap(items, source, dropped);
  const ok = items
    .map((it) => ({ ...it, text: lower(it.text), target: "", estimate: false }))
    .filter((it) => {
      // a timeline row is checked by its year, so "jan 5, 1985" needs 1985 in the quote, not just a 5
      const fig = kind === "chart" ? parseFigure(it.text)?.shown : /\d{3,4}/.exec(parseDated(it.text)?.when ?? "")?.[0];
      const why = !fig
        ? "no figure"
        : !quoteInSource(it.evidence, source)
          ? "quote not in the source"
          : !figureInQuote(fig, it.evidence)
            ? "the quote does not state it"
            : "";
      if (why) dropped.push(`${kind} "${it.text}": ${why}`);
      return !why;
    });
  if (kind === "timeline") return ok.sort((a, b) => parseDated(a.text)!.key - parseDated(b.text)!.key).slice(0, 6);
  // bars in different units cannot share an axis: keep the unit most rows use
  const count = new Map<string, number>();
  for (const it of ok) {
    const u = parseFigure(it.text)!.unit;
    count.set(u, (count.get(u) ?? 0) + 1);
  }
  const top = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
  return ok.filter((it) => parseFigure(it.text)!.unit === top).slice(0, 6);
}

export const estimateSeconds = (text: string) => Math.max(2.5, wordCount(text) / 2.6);
export { z };
