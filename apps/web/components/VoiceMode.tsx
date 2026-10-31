"use client";
import { useEffect, useRef, useState } from "react";
import { useVoice, type StartedJob, type VoiceStatus } from "../lib/voiceClient";

const SAY: Record<VoiceStatus, string> = {
  connecting: "Connecting…", listening: "Listening", thinking: "Thinking…", speaking: "Speaking · talk to interrupt", starting: "Starting your video…", error: "Voice stopped",
};

type Props = { typed?: string; voice: string; onJob: (job: StartedJob) => void; onEnd: () => void };

/** The voice chat panel: sits where the link box was, with a live transcript and one way out. */
export default function VoiceMode({ typed, voice, onJob, onEnd }: Props) {
  const { status, lines, error, close, type } = useVoice({ typed, voice, onJob });
  const [text, setText] = useState("");
  const end = () => { close(); onEnd(); };
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [lines]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") end(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="prompt voice" aria-label="Voice mode">
      <div className="vhead">
        <span className={`vdot ${status}`} aria-hidden />
        <span className="vstat" role="status">{SAY[status]}</span>
        <button type="button" className="btn" onClick={end}>End</button>
      </div>
      <div className="vlog" ref={log} aria-live="polite">
        {lines.length === 0 && <p className="vhint">Tell it what you want explained, who it's for, and how deep to go.</p>}
        {lines.map((l, i) => (
          <p key={i} className={`vline ${l.role}${l.live ? " live" : ""}`}><span className="who">{l.role === "user" ? "You" : "Explain Like"}</span>{l.text}</p>
        ))}
      </div>
      {/* spoken links and names get misheard: typing is always there as a fallback */}
      <form className="vtype" onSubmit={(e) => { e.preventDefault(); type(text); setText(""); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Or type a link or a correction" aria-label="Type a link or a correction" autoComplete="off" spellCheck={false} />
      </form>
      {error && <div className="err" role="alert">{error}</div>}
    </section>
  );
}
