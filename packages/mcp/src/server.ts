import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JobError, JobRunner, type Job } from "@explanimate/api";

export const DEFAULT_WAIT_SEC = Number(process.env.EXPLANIMATE_MCP_WAIT_SEC ?? 50);

const fmtTime = (s?: number) => (s == null ? "?" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const money = (n?: number) => `$${(n ?? 0).toFixed(3)}`;

/** What the agent reads back: plain sentences first, then the job as JSON for anything it wants to parse. */
function report(job: Job) {
  let text: string;
  if (job.state === "done") {
    const o = job.outputs ?? {};
    text = [
      `Done: "${job.title ?? "explainer"}", ${fmtTime(job.durationSec)} long${job.approach ? `, explained with a ${job.approach} approach` : ""}.`,
      job.why ? `Why that approach: ${job.why}` : "",
      `Video: ${o.mp4}`,
      `tldraw board: ${o.tldr} (open it at tldraw.com)`,
      `Excalidraw board: ${o.excalidraw} (open it at excalidraw.com)`,
      `Spend: ${money(job.usd?.meta)} Meta models, ${money(job.usd?.voice)} voice.`,
    ]
      .filter(Boolean)
      .join("\n");
  } else if (job.state === "running") {
    text = `Still working (${job.pct}%: ${job.message}). Call explain_status with jobId "${job.id}" to wait for the video.`;
  } else if (job.state === "cancelled") {
    text = `Job ${job.id} was cancelled.`;
  } else {
    text = `The video could not be made: ${job.error ?? "unknown error"}`;
  }
  return {
    content: [
      { type: "text" as const, text },
      { type: "text" as const, text: JSON.stringify(job, null, 1) },
    ],
    isError: job.state === "error",
  };
}

const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

const waitSeconds = z
  .number()
  .int()
  .min(0)
  .max(600)
  .optional()
  .describe(
    `How long to wait for the video before answering with progress instead (default ${DEFAULT_WAIT_SEC}). Renders take a few minutes.`,
  );

export function createExplanimateServer(runner = new JobRunner()) {
  const server = new McpServer(
    { name: "explanimate", version: "0.1.0" },
    {
      instructions:
        "Explanimate turns a GitHub repo, an X post, an article, a local folder or a plain topic into a narrated whiteboard explainer video (mp4) plus editable .tldr and .excalidraw boards, saved on this machine. Call explain with the link, then explain_status until it is done, then tell the user where the files are.",
    },
  );

  type Extra = { _meta?: { progressToken?: string | number }; sendNotification: (n: any) => Promise<void>; signal: AbortSignal };

  /** Wait on a job while forwarding its stages as MCP progress notifications (when the client asked for them). */
  async function follow(id: string, sec: number, extra: Extra) {
    const token = extra._meta?.progressToken;
    let last = -1,
      lastMsg = "";
    const onUpdate = (j: Job) => {
      if (token === undefined || j.id !== id || j.message === lastMsg) return;
      // progress must grow with every notification, even when a stage repeats a percentage
      last = Math.max(j.pct, last + 0.01);
      lastMsg = j.message;
      void extra
        .sendNotification({
          method: "notifications/progress",
          params: { progressToken: token, progress: Number(last.toFixed(2)), total: 100, message: j.message },
        })
        .catch(() => {});
    };
    runner.on("update", onUpdate);
    const now = runner.get(id);
    if (now) onUpdate(now);
    try {
      const aborted = new Promise<undefined>((r) => extra.signal.addEventListener("abort", () => r(undefined), { once: true }));
      await Promise.race([runner.wait(id, sec * 1000), aborted]);
      return runner.get(id);
    } finally {
      runner.off("update", onUpdate);
    }
  }

  server.registerTool(
    "explain",
    {
      title: "Make an explainer video",
      description:
        'Make a narrated, hand-drawn whiteboard explainer video of a GitHub repo, an X post, an article, a local repo folder, or a plain topic ("how DNS works": it reads and cites a few reputable pages about it). To explain the current checkout\'s working changes, pass the project folder as `source` and the question ("what does this branch do") as `question`. The engine reads the source and decides the explaining style, depth and length itself. Writes an mp4, a .tldr (tldraw) and an .excalidraw board to a folder on this machine and returns their paths. Uses the Meta Model API and Deepgram keys from the environment, so each new video costs a little (usually well under $0.50); re-running the same source into the same folder reuses the cached plan.',
      inputSchema: {
        source: z
          .string()
          .min(1)
          .describe(
            "A GitHub repo URL, an x.com post URL, an article URL, an absolute path to a local repo folder, or a topic in a few words ('how DNS works') when there is no link.",
          ),
        outDir: z
          .string()
          .optional()
          .describe("Folder to write the files to. Default: ~/explanimate-videos/<name> (or $EXPLANIMATE_OUT_DIR)."),
        voice: z
          .enum(["deepgram", "silent"])
          .optional()
          .describe("deepgram narrates (default when DEEPGRAM_API_KEY is set); silent keeps captions only."),
        fresh: z.boolean().optional().describe("Re-plan from scratch instead of reusing a plan cached in outDir or for this repo commit."),
        followUpOf: z
          .string()
          .optional()
          .describe("For a follow-up clip on a finished repo video: that video's output folder. Use with focus or whatIf."),
        focus: z
          .string()
          .optional()
          .describe("Follow-up: a component id from that video's architecture.json, for a short deep dive on one box."),
        whatIf: z.enum(["10x", "100x"]).optional().describe("Follow-up: what breaks if traffic grows by this much."),
        question: z
          .string()
          .max(500)
          .optional()
          .describe(
            'What the user wants to understand, in their words, e.g. "how a chat message reaches the bot\'s tools". Leave it out for a general explainer. For "this feature / my changes / this branch" questions, pass the project folder as `source`.',
          ),
        audience: z.string().max(500).optional().describe('Who the video is for, if the user said, e.g. "a new contributor".'),
        depth: z
          .enum(["overview", "working", "deep"])
          .optional()
          .describe("How deep to go, if the user said. Default: the engine decides."),
        alsoCover: z.string().max(500).optional().describe("Anything else the user wants covered."),
        waitSeconds,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (a, extra) => {
      try {
        const job = runner.start({
          input: a.source,
          out: a.outDir,
          voice: a.voice,
          fresh: a.fresh,
          from: a.followUpOf,
          focus: a.focus,
          whatIf: a.whatIf,
          goal: a.question,
          audience: a.audience,
          depth: a.depth,
          also: a.alsoCover,
        });
        return report((await follow(job.id, a.waitSeconds ?? DEFAULT_WAIT_SEC, extra as Extra)) ?? job);
      } catch (e) {
        return fail(e instanceof JobError ? e.message : `could not start: ${(e as Error)?.message ?? e}`);
      }
    },
  );

  server.registerTool(
    "explain_status",
    {
      title: "Check on an explainer video",
      description:
        "Wait for an explain job and report its progress, or the file paths once it is done. Without jobId it reports the latest job.",
      inputSchema: { jobId: z.string().optional().describe("The id explain returned."), waitSeconds },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (a, extra) => {
      const id = a.jobId ?? runner.list()[0]?.id;
      if (!id || !runner.get(id))
        return fail(a.jobId ? `no job ${a.jobId} in this session` : "no explain job has been started in this session");
      return report((await follow(id, a.waitSeconds ?? DEFAULT_WAIT_SEC, extra as Extra))!);
    },
  );

  server.registerTool(
    "explain_cancel",
    {
      title: "Cancel an explainer video",
      description: "Stop a running explain job. Files already written stay in its folder.",
      inputSchema: { jobId: z.string().describe("The id explain returned.") },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (a) => {
      const j = runner.cancel(a.jobId);
      return j ? report(j) : fail(`no job ${a.jobId} in this session`);
    },
  );

  server.registerPrompt(
    "explanimate",
    {
      title: "Explanimate",
      description:
        "Turn a repo, X post or article into a whiteboard explainer video. Example: /explanimate explain what this repo is about https://github.com/owner/repo",
      argsSchema: {
        request: z
          .string()
          .describe('What to explain, with the link or local folder, e.g. "explain what this repo is about https://github.com/owner/repo"'),
      },
    },
    ({ request }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Make an Explanimate video for this request: ${request}`,
              "",
              '1. Find the source in the request: a GitHub repo URL, an x.com post URL, an article URL, or a local repo folder (use the current project folder if I say "this repo" without a link). With no link at all, use the topic itself in a few words ("how DNS works"). If I ask about "this feature", "my changes", "current changes", "this branch" or "what we are working on", use my current project folder as the source and pass my question as `question`, so the video explains the working changes (branch, diff, new files, recent commits).',
              '2. Call the explain tool with it as `source`. If I asked about something specific ("what this repo is about" is general, "how auth works" is specific), pass that as `question`; pass `audience` or `depth` only if I said them.',
              "3. If it says it is still working, call explain_status with the jobId until it is done.",
              "4. Tell me in two or three plain sentences what the video covers, then give me the paths of the mp4, the .tldr and the .excalidraw files.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  return { server, runner };
}
