import type { Metadata } from "next";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ConfigBlock from "../../components/ConfigBlock";
import { MCP_SNIPPETS } from "../../lib/mcp";

export const metadata: Metadata = {
  title: "Docs · Explanimate",
  description:
    "Connect the Explanimate MCP server to your coding tool once, then ask for a whiteboard explainer video from inside your editor.",
};

const INSTALL = `git clone https://github.com/slubbles/explanimate && cd explanimate
pnpm install
cp .env.example .env   # add your keys (see below)`;

const ASK = `/explanimate how does this repo work
/explanimate explain what this repo is about https://github.com/milind-soni/OpenMausBot`;

export default function Docs() {
  return (
    <>
      <Nav />
      <main className="page">
        <section className="docs">
          <div className="wrap narrow">
            <h1>Use Explanimate in your coding tool</h1>
            <p className="lead">
              MCP is a standard way to plug extra tools into AI coding assistants. Connect Explanimate once and you can ask for a video from
              inside your editor.
            </p>

            <h2 id="what-you-need">What you need</h2>
            <ul>
              <li>
                <strong>Node 20 or newer, with pnpm.</strong> That is what the project itself runs on.
              </li>
              <li>
                <strong>ffmpeg on your PATH, and Chrome or Chromium installed.</strong> The renderer encodes with ffmpeg and checks the
                finished frames in Chrome.
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

            <h2 id="install">Install it</h2>
            <ol>
              <li>
                Clone the repo and install it. There is no build step: the server runs from source.
                <ConfigBlock body={INSTALL} lang="bash" file="Terminal" />
              </li>
              <li>
                Put your keys in <code>.env</code>. That file is for the command line; your coding tool also needs the keys in its own
                config below, because the server only reads its environment.
              </li>
            </ol>

            <h2 id="connect">Connect your tool</h2>
            <p>Replace /path/to/explanimate below with where you cloned the repo.</p>
            {MCP_SNIPPETS.map((s) => (
              <div key={s.id}>
                <h3 id={s.id}>{s.tool}</h3>
                <p>{s.note}</p>
                <ConfigBlock body={s.body} lang={s.lang} file={s.file} />
              </div>
            ))}

            <h2 id="ask">Ask for a video</h2>
            <p>Type one of these in your tool once the server is connected:</p>
            <ConfigBlock body={ASK} lang="text" file="Your coding tool" />
            <p>
              Say <strong>this repo</strong> without a link and it explains the folder you are in. You get back the paths of the mp4 and
              both boards; the files land in <code>{"~/explanimate-videos/<name>"}</code>.
            </p>
            <p>
              Behind the prompt are three tools, in plain words: <strong>explain</strong> starts a video, <strong>explain_status</strong>{" "}
              waits and reports progress until it is done, and <strong>explain_cancel</strong> stops a running one. A video takes a few
              minutes, so the agent checks back while it works.
            </p>

            <h2 id="trouble">If something is wrong</h2>
            <ul>
              <li>
                <strong>The tool does not show up.</strong> Save the config and restart the app; Claude Desktop needs a full quit and
                reopen.
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
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
