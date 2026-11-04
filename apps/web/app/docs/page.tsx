import type { Metadata } from "next";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ConfigBlock from "../../components/ConfigBlock";
import DocsSearch from "./DocsSearch";
import DocsSpy from "./DocsSpy";
import { MCP_SNIPPETS } from "../../lib/mcp";
import { pageMetadata } from "../../lib/seo";
import styles from "./docs.module.css";

export const metadata: Metadata = pageMetadata("docs");

const INSTALL = `git clone https://github.com/slubbles/explanimate && cd explanimate
pnpm install
cp .env.example .env   # add your keys (see below)`;

const FIRST_RUN = `pnpm explanimate https://github.com/milind-soni/OpenMausBot --out ./out/openmausbot`;

const ASK = `/explanimate how does this repo work
/explanimate explain what this repo is about https://github.com/milind-soni/OpenMausBot`;

const FOLLOWUP = `pnpm explanimate "this repo" --from ./out/openmausbot --focus api-server
pnpm explanimate "this repo" --from ./out/openmausbot --what-if 10x`;

const WEB = `pnpm web    # http://localhost:3000`;

// the four tools on this page, in sidebar order
const TOOLS = ["claude-code", "cursor", "codex", "muse-code"]
  .map((id) => MCP_SNIPPETS.find((s) => s.id === id))
  .filter((s): s is (typeof MCP_SNIPPETS)[number] => !!s);

interface NavGroup {
  group: string;
  links: [string, string][];
}

const NAV: NavGroup[] = [
  {
    group: "Get started",
    links: [
      ["introduction", "Introduction"],
      ["quick-start", "Quick start"],
      ["first-video", "Make your first video"],
    ],
  },
  {
    group: "Use it",
    links: [
      ["repos", "Repos"],
      ["articles", "Articles and X posts"],
      ["topics", "Topics"],
      ["follow-ups", "Follow-ups"],
      ["boards", "Boards (.tldr, .excalidraw)"],
    ],
  },
  {
    group: "Coding tools",
    links: [
      ["coding-tools", "Use it in your coding tool"],
      ["claude-code", "Claude Code"],
      ["cursor", "Cursor"],
      ["codex", "Codex"],
      ["muse-code", "Muse Code"],
    ],
  },
  {
    group: "Reference",
    links: [
      ["cli-flags", "CLI flags"],
      ["configuration", "Configuration"],
      ["how-it-works", "How it works"],
      ["security", "Security"],
    ],
  },
];

interface TocEntry {
  id: string;
  label: string;
  sub?: boolean;
}

const TOC: TocEntry[] = [
  { id: "introduction", label: "Introduction" },
  { id: "quick-start", label: "Quick start" },
  { id: "first-video", label: "Make your first video" },
  { id: "repos", label: "Repos" },
  { id: "articles", label: "Articles and X posts" },
  { id: "topics", label: "Topics" },
  { id: "follow-ups", label: "Follow-ups" },
  { id: "boards", label: "Boards (.tldr, .excalidraw)" },
  { id: "coding-tools", label: "Use it in your coding tool" },
  { id: "what-you-need", label: "What you need" },
  { id: "install", label: "Install it" },
  { id: "claude-code", label: "Claude Code", sub: true },
  { id: "cursor", label: "Cursor", sub: true },
  { id: "codex", label: "Codex", sub: true },
  { id: "muse-code", label: "Muse Code", sub: true },
  { id: "ask", label: "Ask for a video" },
  { id: "what-comes-back", label: "What comes back" },
  { id: "troubleshooting", label: "If something is wrong" },
  { id: "cli-flags", label: "CLI flags" },
  { id: "configuration", label: "Configuration" },
  { id: "how-it-works", label: "How it works" },
  { id: "security", label: "Security" },
];

const SPY_IDS = TOC.map((t) => t.id);

const SEARCH_INDEX = [
  ...NAV.flatMap((g) => g.links.map(([id, label]) => ({ id, label, group: g.group }))),
  { id: "what-you-need", label: "What you need", group: "Coding tools" },
  { id: "install", label: "Install it", group: "Coding tools" },
  { id: "ask", label: "Ask for a video", group: "Coding tools" },
  { id: "what-comes-back", label: "What comes back", group: "Coding tools" },
  { id: "troubleshooting", label: "If something is wrong", group: "Coding tools" },
];

export default function Docs() {
  return (
    <>
      <Nav />
      <DocsSpy ids={SPY_IDS} />
      <main className={styles.page}>
        <div className={styles.layout}>
          <aside className={styles.side} aria-label="Docs sections">
            <DocsSearch index={SEARCH_INDEX} />
            {NAV.map((g) => (
              <div key={g.group}>
                <div className={styles.group}>{g.group}</div>
                {g.links.map(([id, label]) => (
                  <a key={id} href={`#${id}`} data-spy-link={id}>
                    {label}
                  </a>
                ))}
              </div>
            ))}
          </aside>

          <div className={styles.main}>
            <details className={styles.menu}>
              <summary aria-label="Docs sections">
                <span>Sections</span>
                <span aria-hidden="true">▾</span>
              </summary>
              <nav aria-label="Docs sections">
                {NAV.map((g) => (
                  <div key={g.group}>
                    <div className={styles.mgroup}>{g.group}</div>
                    {g.links.map(([id, label]) => (
                      <a key={id} href={`#${id}`}>
                        {label}
                      </a>
                    ))}
                  </div>
                ))}
              </nav>
            </details>

            <div className={styles.crumb}>Get started</div>
            <h1 id="introduction">Introduction</h1>
            <p className={styles.lead}>
              Give Explanimate a GitHub repo, an article, an X post, or just a topic. It gives you back a narrated whiteboard explainer
              video and the same drawing as editable boards.
            </p>
            <p>
              Use it on the web at <a href="/">explanimate.co</a>, from the command line, or from inside your coding tool. Every run
              produces the same set: an mp4 plus <code>.tldr</code> and <code>.excalidraw</code> boards you can open in{" "}
              <a href="https://www.tldraw.com">tldraw</a> or <a href="https://excalidraw.com">Excalidraw</a> and keep editing.
            </p>
            <p>Each video is made in four steps:</p>
            <ol>
              <li>
                <strong>Paste a link or a topic.</strong> A repo, an article, an X post, or just words.
              </li>
              <li>
                <strong>Muse plans the explanation.</strong> It reads the source, maps the architecture against the code, and writes the
                narration.
              </li>
              <li>
                <strong>The board draws itself in sync.</strong> The voice reads each scene while the hand-drawn board builds on the words
                being said.
              </li>
              <li>
                <strong>Take the video and the boards.</strong> An mp4 plus both boards, with a manifest of every check that ran.
              </li>
            </ol>

            <h2 id="quick-start">Quick start</h2>
            <p>You need Node 20+, pnpm, ffmpeg on your PATH and Chrome or Chromium. Clone the repo and install it:</p>
            <ConfigBlock body={INSTALL} lang="bash" file="Terminal" />
            <p>
              Planning uses Muse Spark through OpenRouter when <code>OPENROUTER_API_KEY</code> is set, else the Meta Model API (
              <code>MODEL_API_KEY</code>, still needed for doodle icons and the voiceover check). <code>DEEPGRAM_API_KEY</code> adds the
              voice; without it the video renders silent, with timed captions. Every setting is listed in <code>.env.example</code>, and
              every run prints what it spent.
            </p>

            <h2 id="first-video">Make your first video</h2>
            <p>The fastest way is the web app:</p>
            <ConfigBlock body={WEB} lang="bash" file="Terminal" />
            <p>
              Paste a link and watch it build through five open stages: read, plan, voice, draw, check. Or press the mic button and say what
              you want explained; the assistant talks back, then starts the video. When it is done you can tap any box to ask about it, or
              download the boards.
            </p>
            <p>The same video from the command line:</p>
            <ConfigBlock body={FIRST_RUN} lang="bash" file="Terminal" />
            <p>Results land in the output folder (default ./explanimate-out/&lt;name&gt;/):</p>
            <ul>
              <li>
                <code>&lt;name&gt;.mp4</code>: the 1920x1080 video, with narration and captions
              </li>
              <li>
                <code>&lt;name&gt;.tldr</code> and <code>&lt;name&gt;.excalidraw</code>: the drawing as boards you can keep editing
              </li>
              <li>
                <code>&lt;name&gt;.contact.jpg</code>: a sheet of frames for a quick look
              </li>
              <li>
                <code>manifest.json</code>: what was made, the check results and the spend
              </li>
            </ul>
            <div className={styles.note}>
              The plan and voiceover are cached in that folder, so running the same source again costs almost nothing. A repo&apos;s plan is
              also kept per commit, so the same commit asked the same way skips the planning calls too. Use <code>--fresh</code> to plan
              again.
            </div>

            <h2 id="repos">Repos</h2>
            <p>
              A repo becomes a system design walkthrough on one canvas. It builds the architecture piece by piece, walks one real request
              through it, then circles what breaks at 10x traffic and draws the fix.
            </p>
            <ul>
              <li>Every box is tied to real files in the repo.</li>
              <li>A second pass checks each box against the code before anything is drawn.</li>
              <li>
                Ask about the checkout itself (&quot;explain my current changes&quot;, &quot;what does this branch do&quot;) and the video
                explains the working changes: branch, diff, new files and recent commits.
              </li>
            </ul>

            <h2 id="articles">Articles and X posts</h2>
            <p>
              An article or X post becomes an annotated view of the source, quotes underlined, followed by small concept boards. Every point
              carries a word-for-word quote from the source, so what you hear is what it said.
            </p>

            <h2 id="topics">Topics</h2>
            <p>
              A plain topic with no link (&quot;how DNS works&quot;) is looked up on Wikipedia, and the article plus up to two reputable
              pages it cites are read. Every quote on screen comes from them, and the sources are named in the video, in{" "}
              <code>sources.md</code> and in the manifest.
            </p>

            <h2 id="follow-ups">Follow-ups</h2>
            <p>
              Curious about one part of a finished repo video? On the web, tap any box for a short explanation from the code, render a 15-20
              second deep dive on it, or ask what breaks at 10x traffic. Each answer is grounded in that box&apos;s evidence files.
            </p>
            <p>From the command line, follow-ups reuse an earlier run&apos;s diagram:</p>
            <ConfigBlock body={FOLLOWUP} lang="bash" file="Terminal" />
            <p>
              <code>--focus</code> takes a component id from that run&apos;s <code>architecture.json</code>; <code>--what-if</code> takes{" "}
              <code>10x</code> or <code>100x</code>, and every number in the clip is labelled as an assumption. The coding-tool connector
              has the same options as <code>followUpOf</code>, <code>focus</code> and <code>whatIf</code>.
            </p>

            <h2 id="boards">Boards (.tldr, .excalidraw)</h2>
            <p>
              Your video is also a board. Every run writes both a <code>.tldr</code> and an <code>.excalidraw</code>
              file, no flag needed. Open them at tldraw.com or excalidraw.com, move boxes, add notes, and make the diagram your own. Both
              boards are read back after rendering to make sure they open.
            </p>

            <h2 id="coding-tools">Use it in your coding tool</h2>
            <p className={styles.lead}>
              Ask for a video without leaving your editor. Add Explanimate once, then type /explanimate in the chat.
            </p>
            <p>
              Explanimate comes with an MCP server, a small program your coding tool can talk to. It runs on your own machine, reads the
              repo you&apos;re in, and answers with the paths to the video and both boards.
            </p>

            <h3 id="what-you-need">What you need</h3>
            <ul>
              <li>
                <strong>This repo cloned somewhere on your machine, with pnpm install done.</strong> There is no build step: the server runs
                from source.
              </li>
              <li>
                <strong>Node 20 or newer, ffmpeg on your PATH, and Chrome or Chromium installed.</strong> If Chrome is not in a standard
                place, point <code>EXPLANIMATE_CHROME</code> at its binary.
              </li>
              <li>
                <strong>A Meta Muse key (MODEL_API_KEY).</strong> The server tells you on startup if it is missing, and the run fails
                without it. Planning can use that key or an OpenRouter key (OPENROUTER_API_KEY).
              </li>
              <li>
                <strong>A Deepgram key (DEEPGRAM_API_KEY) for the narration.</strong> Without it the video renders silent, with timed
                captions.
              </li>
              <li>
                <strong>Backup keys, optional.</strong> When Meta is the provider and a call fails, planning falls back to OpenRouter if{" "}
                <code>OPENROUTER_API_KEY</code> is set; when Deepgram fails, the narration falls back to Cartesia if{" "}
                <code>CARTESIA_API_KEY</code> is set.
              </li>
            </ul>

            <h3 id="install">Install it</h3>
            <p>Clone the repo and install it, then put your keys in .env:</p>
            <ConfigBlock body={INSTALL} lang="bash" file="Terminal" />
            <div className={styles.note}>
              That file is for the command line. Your coding tool also needs the keys in its own config below, because the server only reads
              its environment. Replace <code>/path/to/explanimate</code> below with where you cloned the repo.
            </div>

            {TOOLS.map((s) => (
              <div key={s.id}>
                <h3 id={s.id}>{s.tool}</h3>
                <p>{s.note}</p>
                <ConfigBlock body={s.body} lang={s.lang} file={s.file} />
              </div>
            ))}

            <h3 id="ask">Ask for a video</h3>
            <p>Type one of these in your tool once the server is connected:</p>
            <ConfigBlock body={ASK} lang="text" file="Your coding tool" />
            <p>
              Say <strong>this repo</strong> without a link and it explains the folder you are in. Ask about &quot;this feature&quot;,
              &quot;my changes&quot; or &quot;this branch&quot; from your project folder and it explains the working changes instead.
            </p>

            <h3 id="what-comes-back">What comes back</h3>
            <p>
              You get back the paths of the mp4 and both boards; the files land in <code>{"~/explanimate-videos/<name>"}</code> unless you
              pass a different folder. Each new video costs a little on your own keys, usually well under $0.50.
            </p>
            <p>
              Behind the prompt are three tools, in plain words: <strong>explain</strong> starts a video, <strong>explain_status</strong>{" "}
              waits and reports progress until it is done, and <strong>explain_cancel</strong> stops a running one. A video takes a few
              minutes, so the agent checks back while it works. Anything already written stays in its folder.
            </p>

            <h3 id="troubleshooting">If something is wrong</h3>
            <ul>
              <li>
                <strong>The tool does not show up.</strong> Save the config and restart the app.
              </li>
              <li>
                <strong>It says MODEL_API_KEY is not set.</strong> The keys must be in the <code>env</code> part of your tool&apos;s config,
                not just in the repo <code>.env</code>, which the server does not read.
              </li>
              <li>
                <strong>Where did the video go?</strong> Each run writes to its own folder under <code>~/explanimate-videos</code>, unless
                you pass a different folder.
              </li>
              <li>
                <strong>The render fails about Chrome or ffmpeg.</strong> Install both, then try again. If Chrome is not in a standard
                place, point <code>EXPLANIMATE_CHROME</code> at its binary.
              </li>
            </ul>

            <h2 id="cli-flags">CLI flags</h2>
            <p>
              <code>
                pnpm explanimate &lt;github url | local repo folder | article url | x.com post url | &quot;a topic&quot;&gt; [options]
              </code>
            </p>
            <p>
              <code>pnpm explanimate --help</code> lists everything. The flags:
            </p>
            <div className={styles.subhead}>Output and voice</div>
            <dl className={styles.flags}>
              <div>
                <dt>--out &lt;dir&gt;</dt>
                <dd>Output folder (default ./explanimate-out/&lt;name&gt;).</dd>
              </div>
              <div>
                <dt>--name &lt;owner/repo&gt;</dt>
                <dd>Display name, useful for local folders.</dd>
              </div>
              <div>
                <dt>--voice deepgram|cartesia|silent</dt>
                <dd>Default: deepgram when DEEPGRAM_API_KEY is set, Cartesia when it fails and CARTESIA_API_KEY is set.</dd>
              </div>
              <div>
                <dt>--pack &lt;id|dir&gt;</dt>
                <dd>
                  Icon/component pack: a built-in id or a folder, repeatable. Default: all built-in packs, used only where they detect
                  something.
                </dd>
              </div>
              <div>
                <dt>--no-packs</dt>
                <dd>Only the base doodle icons.</dd>
              </div>
            </dl>
            <div className={styles.subhead}>Planning, rendering and checks</div>
            <dl className={styles.flags}>
              <div>
                <dt>--fresh</dt>
                <dd>Ignore the cached architecture and plan in the output folder.</dd>
              </div>
              <div>
                <dt>--workers &lt;n&gt;</dt>
                <dd>
                  Processes or threads drawing frames. EXPLANIMATE_RENDERER=skia|chrome picks the renderer (default skia);
                  EXPLANIMATE_ENCODER=nvenc|x264 forces the H.264 encoder.
                </dd>
              </div>
              <div>
                <dt>--no-qa</dt>
                <dd>Skip the Muse Transcribe voiceover check.</dd>
              </div>
              <div>
                <dt>--no-music</dt>
                <dd>No music bed (by default a quiet original bed sits 22 dB under the voice).</dd>
              </div>
              <div>
                <dt>--no-sfx</dt>
                <dd>No sound effects (by default soft, locally made pops and whooshes mark what is drawn).</dd>
              </div>
              <div>
                <dt>--vision-review</dt>
                <dd>Also show 8 rendered frames to Muse Spark for a look-over. Costs a little; off by default.</dd>
              </div>
              <div>
                <dt>--json</dt>
                <dd>Progress as JSON lines (for the web app).</dd>
              </div>
              <div>
                <dt>--allow-private</dt>
                <dd>Read links that resolve to private or localhost addresses. Local intranet only.</dd>
              </div>
            </dl>
            <div className={styles.subhead}>What the viewer wants</div>
            <dl className={styles.flags}>
              <div>
                <dt>--goal &lt;text&gt;</dt>
                <dd>What they want to understand.</dd>
              </div>
              <div>
                <dt>--audience &lt;text&gt;</dt>
                <dd>Who it is for.</dd>
              </div>
              <div>
                <dt>--depth overview|working|deep</dt>
                <dd>How deep to go.</dd>
              </div>
              <div>
                <dt>--format short|deep|anatomy</dt>
                <dd>Explanation format (default: the engine decides; anatomy tours a repo&apos;s parts).</dd>
              </div>
              <div>
                <dt>--also &lt;text&gt;</dt>
                <dd>Anything else to cover.</dd>
              </div>
            </dl>
            <div className={styles.subhead}>Follow-ups on an earlier repo run</div>
            <dl className={styles.flags}>
              <div>
                <dt>--from &lt;earlier out dir&gt;</dt>
                <dd>Reuse that run&apos;s diagram.</dd>
              </div>
              <div>
                <dt>--focus &lt;component id&gt;</dt>
                <dd>15-20 s deep dive on one box.</dd>
              </div>
              <div>
                <dt>--what-if 10x|100x</dt>
                <dd>What breaks if traffic grows (every number labelled as an assumption).</dd>
              </div>
            </dl>
            <p>
              <code>explanimate explain --from &lt;earlier out dir&gt; --component &lt;id&gt; [--json]</code> prints a text explanation of
              one box, grounded in its evidence files.
            </p>

            <h2 id="configuration">Configuration</h2>
            <p>
              Every setting lives in <code>.env</code> and is listed in <code>.env.example</code>. Keys stay on the server: nothing there is
              sent to the browser.
            </p>
            <div className={styles.subhead}>Keys</div>
            <dl className={styles.flags}>
              <div>
                <dt>OPENROUTER_API_KEY</dt>
                <dd>
                  When set, planning uses Muse Spark 1.3 through OpenRouter. Also the backup: when Meta is the provider and a call fails, it
                  is tried once on OpenRouter.
                </dd>
              </div>
              <div>
                <dt>MODEL_API_KEY</dt>
                <dd>
                  Meta Model API key. Used for Muse Spark when there is no OpenRouter key, and always for doodle icons and the voiceover
                  check.
                </dd>
              </div>
              <div>
                <dt>DEEPGRAM_API_KEY</dt>
                <dd>Deepgram key for the Aura voiceover, word timestamps and voice mode. Without it, videos render silent.</dd>
              </div>
              <div>
                <dt>CARTESIA_API_KEY</dt>
                <dd>When set, a scene Deepgram fails to voice is voiced by Cartesia Sonic instead.</dd>
              </div>
              <div>
                <dt>EXPLANIMATE_LLM_PROVIDER</dt>
                <dd>Pick the Muse Spark provider by hand: openrouter or meta. Unset: OpenRouter when its key is set.</dd>
              </div>
            </dl>
            <p>
              Old <code>EXPLAINLIKE_*</code> names from before the rename still work; an <code>EXPLANIMATE_*</code> name wins if both are
              set.
            </p>
            <div className={styles.subhead}>Spend guard and limits (web app)</div>
            <p>
              Every job spends API credits, so new jobs pause before a job could cross a cap: <code>EXPLANIMATE_META_CAP_USD</code> and{" "}
              <code>EXPLANIMATE_VOICE_CAP_USD</code> for lifetime spend, <code>EXPLANIMATE_DAILY_CAP_USD</code> per UTC day. A per-IP rate
              limit, an hourly video cap and a render queue apply on top. <code>/api/health</code> reports which fallbacks are configured,
              as booleans only, never keys.
            </p>
            <div className={styles.subhead}>Sign-in, paths and timeouts</div>
            <p>
              Sign-in by email code stays off unless <code>EXPLANIMATE_AUTH_ENABLED</code> is exactly <code>1</code>. When on, accounts get
              three videos a day by default, and the addresses in <code>EXPLANIMATE_ADMIN_EMAILS</code> can open the <code>/admin</code>{" "}
              portal. Paths and timeouts (jobs folder, gallery folder, Chrome binary, clone timeout) are optional overrides with working
              defaults.
            </p>

            <h2 id="how-it-works">How it works</h2>
            <ol>
              <li>
                <strong>Read.</strong> It takes a digest of the repo (file tree, manifests, entry points, configs; secret files are never
                opened) or the article&apos;s text. A plain topic is looked up on Wikipedia plus up to two reputable cited pages.
              </li>
              <li>
                <strong>Plan.</strong> Muse Spark maps the architecture, checks every box against real files, picks an approach and writes
                the scenes and narration.
              </li>
              <li>
                <strong>Voice.</strong> Deepgram Aura reads the script, and word timestamps let each box draw in on the word that names it.
              </li>
              <li>
                <strong>Draw.</strong> The scenes become one hand-drawn canvas with a moving camera. Skia draws the frames and streams them
                into ffmpeg (NVENC when a GPU is there, else libx264); headless Chrome is the fallback renderer.
              </li>
              <li>
                <strong>Check.</strong> Labels and arrows are checked against the camera before rendering, the finished frames are checked
                for cut-off words, overlaps and blank frames, both boards are read back, and the voiceover is transcribed back and compared
                with the script.
              </li>
            </ol>
            <p>
              The code is a pnpm workspace: <code>packages/</code> holds the engine and <code>apps/web</code> is the Next.js app. The deeper
              code guide is <a href="https://github.com/slubbles/explanimate/blob/main/docs/code-map.md">docs/code-map.md</a>.
            </p>

            <h2 id="security">Security</h2>
            <ul>
              <li>
                <strong>Private links are refused everywhere by default</strong> (CLI, web app, MCP server). <code>--allow-private</code>{" "}
                reads them anyway, for local intranet use only.
              </li>
              <li>
                <strong>Secret-looking files are never opened</strong> when a repo is read.
              </li>
              <li>
                <strong>API keys are read only in server code.</strong> The browser learns only public values: the Turnstile site key and
                the analytics id.
              </li>
              <li>
                <strong>Abuse and budget checks:</strong> per-IP rate limits, a per-account daily quota when sign-in is on, spend caps that
                pause new work, and prompt size caps.
              </li>
              <li>
                <strong>Admin answers 404, never 403,</strong> unless sign-in is on and the address is a listed admin.
              </li>
            </ul>
            <p>
              The full route-by-route table is{" "}
              <a href="https://github.com/slubbles/explanimate/blob/main/docs/security.md">docs/security.md</a>. Read{" "}
              <a href="https://github.com/slubbles/explanimate/blob/main/docs/deploy.md">docs/deploy.md</a> before putting the app anywhere
              public.
            </p>
          </div>

          <nav className={styles.toc} aria-label="On this page">
            <div className={styles.h}>≡ On this page</div>
            {TOC.map((t) => (
              <a key={t.id} href={`#${t.id}`} data-spy-link={t.id} className={t.sub ? styles.sub : undefined}>
                {t.label}
              </a>
            ))}
          </nav>
        </div>
      </main>
      <Footer />
    </>
  );
}
