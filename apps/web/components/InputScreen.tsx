"use client";
import { FORMATS, LINK_MAX, VOICES, inputHint, type Form, shortLink } from "../lib/form";
import { trackEvent } from "../lib/analytics";
import type { GalleryItem } from "../lib/gallery";
import { MCP_SNIPPETS } from "../lib/mcp";
import type { Quota } from "./Home";
import Footer from "./Footer";
import GalleryGrid from "./GalleryGrid";
import { Arrow, Chevron, Mic } from "./Icons";
import VoiceMode from "./VoiceMode";
import { useEffect, useRef, useState } from "react";
import { voiceHost } from "../lib/voiceHost";
import type { StartedJob } from "../lib/voiceClient";

/** six videos fill the home grid, the way the mockup shows; more live behind Browse all */
const HOME_EXAMPLES = 6;
const EXAMPLES = ["https://github.com/umami-software/umami", "https://blog.vllm.ai/2023/06/20/vllm.html", "how DNS works"];
/** the connect panel shows the real Claude Code snippet, so it never drifts from the docs */
const CONNECT_SNIPPET = MCP_SNIPPETS.find((s) => s.id === "claude-code")?.body ?? "";

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

/** The prompt box the landing page and the dashboard share: same field, voice toggle, mic and send. */
export function PromptBox({
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
  // roving tabindex: one tab stop for the group, arrows move and pick (WAI-APG radio pattern)
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (dir: 1 | -1) => {
    const at = VOICES.findIndex((v) => v.id === form.voice);
    const next = VOICES[(at + dir + VOICES.length) % VOICES.length];
    set({ voice: next.id });
    radios.current[VOICES.indexOf(next)]?.focus();
  };
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
          {VOICES.map((v, i) => (
            <button
              type="button"
              role="radio"
              aria-checked={form.voice === v.id}
              key={v.id}
              className={`pill ${form.voice === v.id ? "on" : ""}`}
              tabIndex={form.voice === v.id ? 0 : -1}
              ref={(el) => {
                radios.current[i] = el;
              }}
              onClick={() => set({ voice: v.id })}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  move(1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  move(-1);
                }
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        {quota === "signin" ? (
          <p className="quota">Sign in to make a video.</p>
        ) : quota ? (
          <p className="quota">{quota.limit === null ? "Unlimited videos" : `${quota.left} of ${quota.limit} videos left today`}</p>
        ) : null}
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
      <div className="frow">
        <label className="pick">
          <span className="flab">Format</span>
          <select
            value={form.format}
            onChange={(e) => {
              set({ format: e.target.value as Form["format"] });
              trackEvent("format_select");
            }}
            aria-label="Format"
          >
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <Chevron />
        </label>
        <span className="fhint">Auto picks for you; anatomy is a tour of a repo&apos;s parts.</span>
      </div>
      {(hint.count || hint.over) && (
        <p className={`count${hint.over ? " over" : ""}`} id="input-hint" aria-live="polite">
          {hint.over ?? "Topics are a few words; links can be longer."} {hint.count && <span>{hint.count}</span>}
        </p>
      )}
    </form>
  );
}

export default function InputScreen({ form, set, go, busy, err, examples, talking, talk, onVoiceJob, quota }: Props) {
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
        <div className="wrap">
          <h1>
            Any repo. Any idea.
            <br />
            Explained in a video.
          </h1>
          <p className="sub">
            Paste a GitHub repo, an article, an X post or just a topic. Get back a narrated whiteboard video that shows how it works, plus
            the board to keep editing.
          </p>
          <div className="box">{box("hero")}</div>
          {err && (
            <div className="err" id="input-err" role="alert">
              {err}
            </div>
          )}
          <div className="chips">
            {EXAMPLES.map((x) => (
              <button type="button" key={x} className="chip" onClick={() => set({ input: x })}>
                {shortLink(x)}
              </button>
            ))}
          </div>
          <div className="win hero-win">
            <div className="wb" aria-hidden="true">
              <i />
              <i />
              <i />
              <span>rxi/microui · 1:24</span>
            </div>
            <img
              className="shot"
              src="/v4/microui-52-dark.jpg"
              alt="A finished whiteboard frame from an Explanimate video about rxi/microui"
              fetchPriority="high"
            />
            <div className="pl" aria-hidden="true">
              <span>❚❚</span>
              <span>0:52</span>
              <div className="tl">
                <b style={{ width: "62%" }} />
              </div>
              <span>1:24</span>
              <span>CC</span>
              <span>.mp4 · .tldr · .excalidraw</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap feat">
          <div className="t">
            <div className="k">Watch it build</div>
            <h2>Watch your video draw itself.</h2>
            <p>Every step runs in the open: read, plan, voice, draw, check. No black box, no guessing what it&apos;s doing.</p>
          </div>
          <div className="win" aria-hidden="true">
            <div className="wb">
              <i />
              <i />
              <i />
              <span>github.com/karpathy/minbpe</span>
            </div>
            <div className="split2">
              <div className="bsteps">
                <div>
                  <span className="dot done">✓</span>Read
                </div>
                <div>
                  <span className="dot done">✓</span>Plan
                </div>
                <div>
                  <span className="dot done">✓</span>Voice
                </div>
                <div className="now">
                  <span className="dot act" />
                  Draw<span className="pc">68%</span>
                </div>
                <div className="todo">
                  <span className="dot" />
                  Check
                </div>
                <div>
                  <div className="tl">
                    <b style={{ width: "68%" }} />
                  </div>
                </div>
              </div>
              <img src="/v4/minbpe-60-dark.jpg" alt="" loading="lazy" />
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap feat r">
          <div className="t">
            <div className="k">Go deeper</div>
            <h2>Tap any box. Get the next video.</h2>
            <p>
              Curious about one part? Tap it for a focused deep dive, or ask what breaks at 10x traffic. Each answer is a new short video.
            </p>
            <p className="fine">
              <b>Interactive on repos</b>: On a repo video, tap a box to ask what it does, render a deep dive on it, or ask what breaks at
              10x traffic.
            </p>
          </div>
          <div className="win deeper-win" aria-hidden="true">
            <div className="wb">
              <i />
              <i />
              <i />
              <span>rxi/microui</span>
            </div>
            <div className="deeper-shot">
              <img className="shot" src="/v4/microui-30-dark.jpg" alt="" loading="lazy" />
              <div className="hl hl-deeper" />
              <div className="pop pop-deeper">
                <div className="pop-title">ui core</div>
                <div className="o a">▶ Deep dive on this</div>
                <div className="o">What breaks at 10x traffic?</div>
                <div className="o">? Ask about it</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap feat">
          <div className="t">
            <div className="k">Keep editing</div>
            <h2>Your video is also a board.</h2>
            <p>Every video ships with .tldr and .excalidraw files. Open them, move boxes, add notes, and make the diagram your own.</p>
          </div>
          <div className="win board-win" aria-hidden="true">
            <div className="wb">
              <i />
              <i />
              <i />
              <span>tldraw.com · silk-road.tldr</span>
            </div>
            <div className="board-shot">
              <img className="shot" src="/v4/silk-road-dark.jpg" alt="" loading="lazy" />
              <div className="tool">
                <span>↖</span>
                <span className="a">▭</span>
                <span>○</span>
                <span>→</span>
                <span>✎</span>
                <span>T</span>
              </div>
              <div className="hl dash hl-board" />
            </div>
          </div>
        </div>
      </section>

      <section className="mcp">
        <div className="wrap">
          <div className="mcp-head">
            <div className="mcp-num">
              <span className="idx">01</span>&nbsp; MCP
            </div>
            <div>
              <div className="mcp-title">
                Explainers included
                <br />
                <span className="muted">Explanimate as a tool your agent can call</span>
              </div>
              <p className="mcp-copy">
                An MCP server that runs on your own machine. Type /explanimate in Claude Code, Cursor, Codex or Muse Code. It reads the repo
                you&apos;re in and hands back the video and both boards, right in the chat.
              </p>
              <a className="mcp-link" href="/docs" onClick={() => trackEvent("mcp_docs_view")}>
                MCP documentation →
              </a>
            </div>
          </div>
          <div className="mcp-panel">
            <div className="win mcp-win">
              <div className="mcp-conn">
                <div className="mcp-top">
                  <span>Connect</span>
                  <span className="dim mono">stdio · local</span>
                </div>
                <pre>{CONNECT_SNIPPET}</pre>
                <ul className="mcp-tools">
                  <li>✓ Claude Code</li>
                  <li>✓ Cursor</li>
                  <li>✓ Codex</li>
                  <li>✓ Muse Code</li>
                  <li>✓ Claude Desktop · VS Code</li>
                </ul>
                <p className="mcp-foot">Renders on your machine. Files land in ~/explanimate-videos/&lt;name&gt;.</p>
              </div>
              <div className="mcp-term">
                <div className="dim mono">~/explanimate</div>
                <div>
                  › <span className="acc">/explanimate</span> explain what this repo is about
                  <br />
                  <span className="dim">explain_status · drawing frames…</span>
                  <br />
                  <span className="ok">✓</span> explanimate-mcp.mp4 &nbsp;<span className="ok">✓</span> board.tldr &nbsp;
                  <span className="ok">✓</span> board.excalidraw
                </div>
                <div className="win" aria-hidden="true">
                  <img className="shot" src="/v4/ct.jpg" alt="" loading="lazy" />
                  <div className="pl">
                    <span>❚❚</span>
                    <div className="tl">
                      <b style={{ width: "40%" }} />
                    </div>
                    <span>1:16</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mcs">
            <div className="mc">
              <div className="mono">explain</div>
              <h4>Ask</h4>
              <p>Point it at a repo, a link, a topic or your current branch. It decides the style and length.</p>
            </div>
            <div className="mc">
              <div className="mono">explain_status</div>
              <h4>Follow along</h4>
              <p>A render takes a few minutes. The agent checks back and tells you where it is.</p>
            </div>
            <div className="mc">
              <div className="mono">explain_cancel</div>
              <h4>Stop</h4>
              <p>Change your mind and cancel. Anything already written stays in its folder.</p>
            </div>
            <div className="mc">
              <div className="mono">.mp4 · .tldr · .excalidraw</div>
              <h4>Everything back</h4>
              <p>The video and both boards, as paths you can open straight from the chat.</p>
            </div>
          </div>
        </div>
      </section>

      {examples.length > 0 && (
        <section className="gal">
          <div className="wrap">
            <div className="k">Gallery</div>
            <div className="gal-head">
              <h2>Press play on someone else&apos;s question.</h2>
              <a className="more" href="/gallery">
                Browse all
              </a>
            </div>
            <p className="gal-sub">Real videos made from real repos and topics. Pick one and see what you&apos;d get.</p>
            <GalleryGrid videos={examples.slice(0, HOME_EXAMPLES)} />
          </div>
        </section>
      )}

      <section>
        <div className="wrap cta">
          <h2>What do you want explained?</h2>
          <p className="sub">Browsing is free. Sign in with your email and make three videos a day.</p>
          <div className="box">{box("cta")}</div>
          <p className="note">Private and localhost links are blocked.</p>
        </div>
      </section>

      <Footer />
    </>
  );
}
