"use client";
import { VOICES, type Form, shortLink, sourceKind } from "../lib/form";
import { fileUrl, secs, type Listed } from "../lib/client";
import { Arrow, Mic } from "./Icons";
import VoiceMode from "./VoiceMode";
import type { StartedJob } from "../lib/voiceClient";

const EXAMPLES = ["https://github.com/umami-software/umami", "https://x.com/karpathy/status/1977755427569111362", "https://blog.vllm.ai/2023/06/20/vllm.html", "how DNS works"];

type Props = { form: Form; set: (f: Partial<Form>) => void; go: () => void; busy: boolean; err: string; gallery: Listed[]; talking: boolean; talk: (on: boolean) => void; onVoiceJob: (job: StartedJob) => void };

export default function InputScreen({ form, set, go, busy, err, gallery, talking, talk, onVoiceJob }: Props) {
  const ready = !!form.input.trim() && !busy;
  return (
    <>
      <section className="hero">
        <h1>Any repo, post, article or topic,{" "}<br />explained on a <em>whiteboard</em>.</h1>
        <p className="lede">Paste a link, or just name a topic. Explain Like reads the code, the text or a few cited reputable sources, draws the system piece by piece, walks one real request through it, and narrates it, choosing the analogy, depth and pace that fit the topic. You get an mp4 plus editable .tldr and .excalidraw boards.</p>
        {talking ? <VoiceMode typed={form.input.trim() || undefined} voice={form.voice} onJob={onVoiceJob} onEnd={() => talk(false)} /> : (
        <form className="prompt" onSubmit={(e) => { e.preventDefault(); if (ready) go(); }}>
          <input className="field" type="text" maxLength={2048} aria-label="Link or topic to explain" aria-invalid={!!err} aria-describedby={err ? "input-err" : undefined} placeholder="Paste a link or name a topic"
            value={form.input} onChange={(e) => set({ input: e.target.value })} autoComplete="off" spellCheck={false} />
          <div className="pbar">
            <div className="group" role="radiogroup" aria-label="Voice">
              <span className="label">Voice</span>
              {VOICES.map((v) => <button type="button" role="radio" aria-checked={form.voice === v.id} key={v.id} className={`chip ${form.voice === v.id ? "on" : ""}`} onClick={() => set({ voice: v.id })}>{v.label}</button>)}
            </div>
            <div className="acts">
              <button type="button" className="mic" aria-label="Talk it through instead" title="Talk it through instead" onClick={() => talk(true)}><Mic /></button>
              <button className="send" type="submit" disabled={!ready} aria-busy={busy}>{busy ? "Starting…" : <>Explain it <Arrow /></>}</button>
            </div>
          </div>
        </form>
        )}
        {err && <div className="err" id="input-err" role="alert">{err}</div>}
        <div className="try"><span className="label">Try:</span>{EXAMPLES.map((x) => <button type="button" key={x} className="chip" onClick={() => set({ input: x })}>{shortLink(x)}</button>)}</div>
      </section>

      {gallery.length > 0 && (
        <section className="gallery">
          <h2>Examples</h2>
          <div className="grid">
            {gallery.map((j) => (
              <a className="card" key={j.id} href={`/?job=${j.id}`}>
                <div className="screen"><video src={`${fileUrl(j.id, j.mp4)}#t=${((j.durationSec ?? 30) * 0.55).toFixed(1)}`} preload="metadata" muted playsInline tabIndex={-1} /></div>
                <div className="t">{j.title ?? shortLink(j.input)}</div>
                <div className="m">{j.approach ? `${j.approach} · ` : ""}{secs(j.durationSec)} · {sourceKind(j.input)}</div>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="how">
        <div><b>Grounded</b>Every box on the board points at real files. A second Muse Spark pass checks each one against the code.</div>
        <div><b>Interactive</b>Tap a box to ask about it, render a deep dive on it, or ask what breaks at 10x traffic.</div>
        <div><b>Yours to edit</b>Download the .tldr and open it at tldraw.com to keep drawing. Open source, MIT.</div>
      </section>
      <footer>Powered by Meta Muse models · voice by Deepgram · drawn with rough.js and Excalifont</footer>
    </>
  );
}
