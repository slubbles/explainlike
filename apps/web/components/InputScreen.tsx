"use client";
import { LINK_MAX, VOICES, inputHint, type Form, shortLink } from "../lib/form";
import type { GalleryItem } from "../lib/gallery";
import type { Quota } from "./Home";
import Footer from "./Footer";
import GalleryGrid from "./GalleryGrid";
import { Arrow, Mic } from "./Icons";
import VoiceMode from "./VoiceMode";
import { useEffect, useState } from "react";
import { voiceHost } from "../lib/voiceHost";
import type { StartedJob } from "../lib/voiceClient";

/** six videos fill the home grid, the way the mockup shows; more live behind See all */
const HOME_EXAMPLES = 6;
const EXAMPLES = [
  "https://github.com/umami-software/umami",
  "https://x.com/karpathy/status/1977755427569111362",
  "https://blog.vllm.ai/2023/06/20/vllm.html",
  "how DNS works",
];

export type Talk = false | "hero" | "cta";

type Props = {
  form: Form;
  set: (f: Partial<Form>) => void;
  go: () => void;
  busy: boolean;
  err: string;
  examples: GalleryItem[];
  /** which prompt box opened voice mode, so only that one shows it */
  talking: Talk;
  talk: (where: Talk) => void;
  onVoiceJob: (job: StartedJob) => void;
  quota: Quota;
};

/** The prompt box the hero and the closing CTA share: same field, voice toggle, mic and send. */
function PromptBox({
  form,
  set,
  go,
  busy,
  talk,
  quota,
}: {
  form: Form;
  set: (f: Partial<Form>) => void;
  go: () => void;
  busy: boolean;
  talk?: () => void;
  quota: Quota;
}) {
  const hint = inputHint(form.input);
  const ready = !!form.input.trim() && !busy && !hint.over;
  return (
    <form
      className="prompt"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) go();
      }}
    >
      <input
        className="field"
        type="text"
        maxLength={LINK_MAX}
        aria-label="Link or topic to explain"
        aria-describedby={hint.count || hint.over ? "input-hint" : undefined}
        aria-invalid={hint.over ? true : undefined}
        placeholder="Paste a link or name a topic"
        value={form.input}
        onChange={(e) => set({ input: e.target.value })}
        autoComplete="off"
        spellCheck={false}
      />
      <div className="prow">
        <div className="tog" role="radiogroup" aria-label="Voice">
          <span>Voice</span>
          {VOICES.map((v) => (
            <button
              type="button"
              role="radio"
              aria-checked={form.voice === v.id}
              key={v.id}
              className={`pill ${form.voice === v.id ? "on" : ""}`}
              onClick={() => set({ voice: v.id })}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="pacts">
          {talk && (
            <button type="button" className="mic" aria-label="Talk it through instead" title="Talk it through instead" onClick={talk}>
              <Mic />
            </button>
          )}
          <button className="send" type="submit" disabled={!ready} aria-busy={busy}>
            {busy ? (
              "Starting…"
            ) : (
              <>
                Explain it <Arrow />
              </>
            )}
          </button>
        </div>
      </div>
      {(hint.count || hint.over) && (
        <p className={`count${hint.over ? " over" : ""}`} id="input-hint" aria-live="polite">
          {hint.over ?? "Topics are a few words; links can be longer."} {hint.count && <span>{hint.count}</span>}
        </p>
      )}
      {quota === "signin" ? (
        <p className="quota">Sign in to make a video.</p>
      ) : quota ? (
        <p className="quota">
          {quota.left} of {quota.limit} videos left today
        </p>
      ) : null}
    </form>
  );
}

export default function InputScreen({ form, set, go, busy, err, examples, talking, talk, onVoiceJob, quota }: Props) {
  const board = examples[0];
  // voice runs on localhost only; elsewhere the mic is hidden instead of failing after a click
  const [canTalk, setCanTalk] = useState(false);
  useEffect(() => setCanTalk(voiceHost(location.hostname)), []);
  const box = (where: "hero" | "cta") =>
    talking === where ? (
      <VoiceMode typed={form.input.trim() || undefined} voice={form.voice} onJob={onVoiceJob} onEnd={() => talk(false)} />
    ) : (
      <PromptBox form={form} set={set} go={go} busy={busy} talk={canTalk ? () => talk(where) : undefined} quota={quota} />
    );
  return (
    <>
      <section className="hero">
        <div className="bg" aria-hidden="true">
          <img src="/hero.jpg" alt="" fetchPriority="high" />
        </div>
        <div className="fade" aria-hidden="true" />
        <div className="in">
          <h1>
            Any repo, post, article or topic, <br />
            explained on a <span className="hand">whiteboard</span>.
          </h1>
          <p className="sub">
            Paste a link, or just name a topic. <br />
            You get an mp4 plus editable .tldr and .excalidraw boards.
          </p>
          <div className="box">{box("hero")}</div>
          {err && (
            <div className="err" id="input-err" role="alert">
              {err}
            </div>
          )}
          <div className="chips">
            <span className="try">Try:</span>
            {EXAMPLES.map((x) => (
              <button type="button" key={x} className="chip" onClick={() => set({ input: x })}>
                {shortLink(x)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="blk">
        <div className="wrap center">
          <h2>How it works</h2>
          <p className="lead">Muse Spark reads the source first and picks how to explain it.</p>
          {board && (
            <div className="stage">
              {board.poster ? (
                <img src={board.poster} alt={`A finished frame from ${board.title}`} loading="lazy" />
              ) : (
                <video src={`${board.src}#t=1`} muted playsInline preload="metadata" aria-label={`A finished frame from ${board.title}`} />
              )}
            </div>
          )}
          <div className="steps5">
            <div>
              <b>Read</b>
              <p>It takes a digest of the repo or the article&apos;s text.</p>
            </div>
            <div>
              <b>Plan</b>
              <p>Muse Spark maps the architecture and checks every box against real files.</p>
            </div>
            <div>
              <b>Voice</b>
              <p>Deepgram Aura reads the script.</p>
            </div>
            <div>
              <b>Draw</b>
              <p>The scenes become one hand-drawn SVG canvas with a moving camera.</p>
            </div>
            <div>
              <b>Check</b>
              <p>The frames and both boards are checked.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <h2>What it does</h2>
          <div className="three">
            <div className="fcard">
              <svg
                className="ic"
                viewBox="0 0 44 44"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M8 10 L30 9.5 L30.5 26 L8.5 26.5 Z" />
                <path d="M19 27 L19.5 35 M13 35 L26 35" />
                <path d="M32 18 l6 -0.5" />
              </svg>
              <b>Grounded</b>
              <p>Every box on the board points at real files. A second Muse Spark pass checks each one against the code.</p>
            </div>
            <div className="fcard">
              <svg
                className="ic"
                viewBox="0 0 44 44"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M7 9 L27 8.5 L27.5 22 L7.5 22.5 Z" />
                <path d="M24 18 L36 30 L30 30.5 L33 37" />
              </svg>
              <b>Interactive</b>
              <p>Tap a box to ask about it, render a deep dive on it, or ask what breaks at 10x traffic.</p>
            </div>
            <div className="fcard">
              <svg
                className="ic"
                viewBox="0 0 44 44"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M10 34 L12 27 L29 9.5 L35 15.5 L18 32.5 Z" />
                <path d="M26 13 l6 6" />
                <path d="M9 38 L36 37.5" />
              </svg>
              <b>Yours to edit</b>
              <p>Download the .tldr and open it at tldraw.com to keep drawing. Open source, MIT.</p>
            </div>
          </div>
        </div>
      </section>

      {examples.length > 0 && (
        <section className="blk" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="ghead">
              <div>
                <h2>Examples</h2>
                <p className="lead">Videos run about 85 to 175 seconds, at 1080p.</p>
              </div>
              {examples.length > HOME_EXAMPLES && (
                <a className="more" href="/gallery">
                  See all {examples.length}
                </a>
              )}
            </div>
            <GalleryGrid videos={examples.slice(0, HOME_EXAMPLES)} />
          </div>
        </section>
      )}

      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="facts">
            <div>
              <b>.mp4</b>
              <p>The 1920x1080 video, with narration and captions.</p>
            </div>
            <div>
              <b>.tldr and .excalidraw</b>
              <p>The drawing as boards you can keep editing.</p>
            </div>
            <div>
              <b>.contact.jpg</b>
              <p>A sheet of frames for a quick look.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <h2>Use it in your coding tool</h2>
          <p className="lead">
            MCP is a standard way to plug extra tools into AI coding assistants. Connect Explanimate once and you can ask for a video from
            inside your editor.
          </p>
          <div className="tools">
            <span className="chip">Claude Code</span>
            <span className="chip">Cursor</span>
            <span className="chip">Codex</span>
            <span className="chip">Muse Code</span>
            <span className="chip">Claude Desktop</span>
            <span className="chip">VS Code Copilot</span>
          </div>
          <div className="ask">
            <code>/explanimate how does this repo work</code>
            <p>You get back an mp4 plus .tldr and .excalidraw boards, saved on your machine.</p>
          </div>
          <a className="btn solid" style={{ marginTop: 24 }} href="/docs">
            Set it up
          </a>
        </div>
      </section>

      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="cta">
            <h2>Paste a link, or just name a topic.</h2>
            <p className="lead">You get an mp4 plus editable .tldr and .excalidraw boards.</p>
            <div className="box">{box("cta")}</div>
            <p className="note">Private and localhost links are blocked.</p>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
