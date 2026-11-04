"use client";
import { useState } from "react";
import { VOICES, type Form } from "../lib/form";
import type { Quota } from "../app/page";
import { Arrow, Chevron } from "./Icons";

/** The compact form above a job: change the link or voice and draw again. On a phone result page it folds to one line until you tap Change. The button only turns blue once the link or voice differs from the video shown. */
export default function JobBar({
  form,
  set,
  go,
  busy,
  fold,
  quiet,
  quota,
}: {
  form: Form;
  set: (f: Partial<Form>) => void;
  go: () => void;
  busy: boolean;
  fold?: boolean;
  quiet?: boolean;
  quota: Quota;
}) {
  const [open, setOpen] = useState(false);
  const ready = !!form.input.trim() && !busy;
  return (
    <>
      <form
        className={`jobbar${fold && !open ? " fold" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) go();
        }}
      >
        <input
          className="in"
          type="text"
          maxLength={2048}
          aria-label="Link or topic to explain"
          value={form.input}
          onChange={(e) => set({ input: e.target.value })}
          spellCheck={false}
          autoComplete="off"
          onFocus={() => setOpen(true)}
        />
        <button type="button" className="btn edit" onClick={() => setOpen(true)}>
          Change
        </button>
        <div className="opts">
          <label className="pick">
            <span className="sr">Voice</span>
            <select value={form.voice} onChange={(e) => set({ voice: e.target.value })} disabled={busy}>
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <Chevron />
          </label>
          <button className={`go${quiet ? " quiet" : ""}`} type="submit" disabled={!ready}>
            {busy ? (
              "Drawing…"
            ) : (
              <>
                Explain it <Arrow size={15} />
              </>
            )}
          </button>
        </div>
      </form>
      {quota === "signin" ? (
        <p className="quota">Sign in to make a video.</p>
      ) : quota ? (
        <p className="quota">
          {quota.left} of {quota.limit} videos left today
        </p>
      ) : null}
    </>
  );
}
