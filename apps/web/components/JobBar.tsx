"use client";
import { LEVELS, VOICES, type Form } from "../lib/form";
import { Arrow, Chevron } from "./Icons";

/** The compact form above a job: change the link, level or voice and draw again. */
export default function JobBar({ form, set, go, busy }: { form: Form; set: (f: Partial<Form>) => void; go: () => void; busy: boolean }) {
  const ready = !!form.input.trim() && !busy;
  return (
    <form className="jobbar" onSubmit={(e) => { e.preventDefault(); if (ready) go(); }}>
      <input className="in" type="text" aria-label="Link to explain" value={form.input} onChange={(e) => set({ input: e.target.value })} spellCheck={false} autoComplete="off" />
      <div className="opts">
        <label className="pick"><span className="sr">Explain it like</span>
          <select value={form.level} onChange={(e) => set({ level: e.target.value })} disabled={busy}>{LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select><Chevron />
        </label>
        <label className="pick"><span className="sr">Voice</span>
          <select value={form.voice} onChange={(e) => set({ voice: e.target.value })} disabled={busy}>{VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select><Chevron />
        </label>
        <button className="go" type="submit" disabled={!ready}>{busy ? "Drawing…" : <>Explain it <Arrow size={15} /></>}</button>
      </div>
    </form>
  );
}
