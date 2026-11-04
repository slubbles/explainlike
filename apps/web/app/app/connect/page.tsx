import ConfigBlock from "../../../components/ConfigBlock";
import { MCP_SNIPPETS } from "../../../lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Connect · Explanimate" };

const ASK = `/explanimate how does this repo work
/explanimate explain what this repo is about https://github.com/milind-soni/OpenMausBot`;

/** The MCP setup: what the server needs, one copy-paste block per coding tool, and how to ask. The layout already gated the visit. */
export default function ConnectPage() {
  return (
    <>
      <h1 className="app-h1">Connect your coding tool</h1>
      <p className="app-lead">
        Explanimate runs on your own machine as an MCP server. Connect it once, then type /explanimate in your editor and get the video plus
        both boards back in the chat.
      </p>

      <div className="app-grid">
        <div className="app-c">
          <div className="app-chead">
            <span>What you need</span>
          </div>
          <div className="app-rows">
            <div className="app-row">
              <span className="k">Machine</span>
              <span className="v">Node 20 or newer with pnpm, ffmpeg on your PATH, and Chrome or Chromium installed.</span>
            </div>
            <div className="app-row">
              <span className="k">Model key</span>
              <span className="v">
                A Meta Muse key (<code>MODEL_API_KEY</code>) for the planning, or an OpenRouter key (<code>OPENROUTER_API_KEY</code>).
              </span>
            </div>
            <div className="app-row">
              <span className="k">Voice key</span>
              <span className="v">
                A Deepgram key (<code>DEEPGRAM_API_KEY</code>) for the narration. Without it the video renders silent, with timed captions.
              </span>
            </div>
            <div className="app-row">
              <span className="k">The repo</span>
              <span className="v">
                Clone <code>https://github.com/slubbles/explanimate</code> and run <code>pnpm install</code>. There is no build step: the
                server runs from source.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="app-grid">
        <div className="app-c">
          <div className="app-chead">
            <span>Connect your tool</span>
          </div>
          <p className="app-note" style={{ marginBottom: 8 }}>
            Replace /path/to/explanimate below with where you cloned the repo.
          </p>
          {MCP_SNIPPETS.map((s) => (
            <div key={s.id} id={s.id} style={{ marginTop: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{s.tool}</h2>
              <p className="app-note" style={{ marginTop: 8 }}>
                {s.note}
              </p>
              <ConfigBlock body={s.body} lang={s.lang} file={s.file} />
            </div>
          ))}
        </div>
      </div>

      <div className="app-grid">
        <div className="app-c">
          <div className="app-chead">
            <span>Ask for a video</span>
          </div>
          <p className="app-note" style={{ marginBottom: 8 }}>
            Type one of these in your tool once the server is connected. Say <strong>this repo</strong> without a link and it explains the
            folder you are in. Files land in <code>{"~/explanimate-videos/<name>"}</code>.
          </p>
          <ConfigBlock body={ASK} lang="text" file="Your coding tool" />
          <p className="app-note" style={{ marginTop: 12 }}>
            Behind the prompt are three tools: <strong>explain</strong> starts a video, <strong>explain_status</strong> waits and reports
            progress until it is done, and <strong>explain_cancel</strong> stops a running one. Stuck? The <a href="/docs#trouble">docs</a>{" "}
            cover what usually goes wrong.
          </p>
        </div>
      </div>
    </>
  );
}
