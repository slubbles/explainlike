"use client";
import { LEVELS, VOICES, type Form, levelLabel, shortLink, sourceKind } from "../lib/form";
import { fileUrl, secs, type Listed } from "../lib/client";
import { Arrow } from "./Icons";

const EXAMPLES = ["https://github.com/umami-software/umami", "https://x.com/karpathy/status/1977755427569111362", "https://blog.vllm.ai/2023/06/20/vllm.html"];

type Props = { form: Form; set: (f: Partial<Form>) => void; go: () => void; busy: boolean; err: string; gallery: Listed[] };

export default function InputScreen({ form, set, go, busy, err, gallery }: Props) {
  const ready = !!form.input.trim() && !busy;
  return (
    <>
      <section className="hero">
        <h1>Any repo, post or article,{" "}<br />explained on a <em>whiteboard</em>.</h1>
        <p className="lede">Paste a link. Metual reads the code or the text, draws the system piece by piece, walks one real request through it, and narrates it at your level. You get an mp4 and an editable .tldr board.</p>
        <form className="prompt" onSubmit={(e) => { e.preventDefault(); if (ready) go(); }}>
          <input className="field" type="text" aria-label="Link to explain" placeholder="github.com/owner/repo, an X post, or an article URL"
            value={form.input} onChange={(e) => set({ input: e.target.value })} autoComplete="off" spellCheck={false} />
          <div className="pbar">
            <div className="group" role="radiogroup" aria-label="Explain it like">
              <span className="label">Explain it like</span>
              {LEVELS.map((l) => <button type="button" role="radio" aria-checked={form.level === l.id} key={l.id} className={`chip ${form.level === l.id ? "on" : ""}`} onClick={() => set({ level: l.id })}>{l.label}</button>)}
            </div>
            <div className="sep" />
            <div className="group" role="radiogroup" aria-label="Voice">
              <span className="label">Voice</span>
              {VOICES.map((v) => <button type="button" role="radio" aria-checked={form.voice === v.id} key={v.id} className={`chip ${form.voice === v.id ? "on" : ""}`} onClick={() => set({ voice: v.id })}>{v.label}</button>)}
            </div>
            <button className="send" type="submit" disabled={!ready}>{busy ? "Drawing…" : <>Explain it <Arrow /></>}</button>
          </div>
        </form>
        {err && <div className="err" role="alert">{err}</div>}
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
                <div className="m">{levelLabel(j.level)} · {secs(j.durationSec)} · {sourceKind(j.input)}</div>
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
