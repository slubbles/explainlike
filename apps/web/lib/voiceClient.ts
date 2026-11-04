"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { micError } from "./voiceHost";
import type { Turn } from "./voice";
import { greeting } from "./voice";

export type VoiceStatus = "connecting" | "listening" | "thinking" | "speaking" | "starting" | "error";
export type Line = { role: "user" | "assistant"; text: string; live?: boolean };
export type StartedJob = { id: string; input: string; goal: string; audience: string; depth: string; also: string };

// Deepgram listens in the browser (short-lived token); everything that thinks or holds a key is on our server
const LISTEN =
  "wss://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&interim_results=true&endpointing=500&utterance_end_ms=1200&vad_events=true&keyterm=GitHub";

const log = (...a: unknown[]) => console.info("[voice]", ...a);

/**
 * The voice chat: the mic streams to Deepgram, a finished turn goes to /api/voice/turn (Muse Spark on our server),
 * and each sentence of the reply plays through /api/voice/speak (Deepgram Aura via our server).
 * Talking while it speaks or thinks stops it, and what you say joins your last turn.
 */
export function useVoice(o: { typed?: string; voice: string; onJob: (job: StartedJob) => void }) {
  const [status, setStatus] = useState<VoiceStatus>("connecting");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState("");
  const r = useRef({
    turns: [] as Turn[],
    finals: "",
    interim: "",
    ws: null as WebSocket | null,
    rec: null as MediaRecorder | null,
    mic: null as MediaStream | null,
    abort: null as AbortController | null,
    queue: [] as HTMLAudioElement[],
    playing: null as HTMLAudioElement | null,
    reply: [] as string[],
    spoken: 0,
    streamDone: true,
    job: null as StartedJob | null,
    closed: false,
    run: 0,
  });
  const opts = useRef(o);
  opts.current = o;

  const setLive = useCallback(
    (text: string) =>
      setLines((ls) => {
        const rest = ls[ls.length - 1]?.live ? ls.slice(0, -1) : ls;
        return text ? [...rest, { role: "user", text, live: true }] : rest;
      }),
    [],
  );
  const addLine = useCallback(
    (l: Line) =>
      setLines((ls) => [...(ls[ls.length - 1]?.live ? ls.slice(0, -1) : ls), l, ...(ls[ls.length - 1]?.live ? [ls[ls.length - 1]] : [])]),
    [],
  );
  const growAssistant = useCallback(
    (s: string, fresh: boolean) =>
      setLines((ls) => {
        const live = ls[ls.length - 1]?.live ? ls[ls.length - 1] : undefined;
        const body = live ? ls.slice(0, -1) : ls;
        const last = body[body.length - 1];
        const next =
          !fresh && last?.role === "assistant"
            ? [...body.slice(0, -1), { ...last, text: `${last.text} ${s}` }]
            : [...body, { role: "assistant" as const, text: s }];
        return live ? [...next, live] : next;
      }),
    [],
  );

  /** the reply so far becomes part of the conversation: only what was actually voiced if it was cut off */
  const settleReply = useCallback((cut: boolean) => {
    const s = r.current;
    const said = (cut ? s.reply.slice(0, s.spoken) : s.reply).join(" ").trim();
    if (said) s.turns.push({ role: "assistant", content: said + (cut && s.spoken < s.reply.length ? " …" : "") });
    s.reply = [];
    s.spoken = 0;
  }, []);

  const finish = useCallback(() => {
    const s = r.current;
    if (s.playing || s.queue.length || !s.streamDone) return;
    if (s.job) {
      const j = s.job;
      s.job = null;
      close();
      opts.current.onJob(j);
      return;
    }
    settleReply(false);
    if (!s.closed) setStatus("listening");
  }, []);

  const playNext = useCallback(() => {
    const s = r.current;
    const a = s.queue.shift();
    s.playing = a ?? null;
    if (!a) return finish();
    setStatus(s.job ? "starting" : "speaking");
    s.spoken++;
    a.onended = a.onerror = () => {
      if (s.playing === a) {
        s.playing = null;
        playNext();
      }
    };
    a.play().catch(() => {
      if (s.playing === a) {
        s.playing = null;
        playNext();
      }
    });
  }, [finish]);

  const say = useCallback(
    (text: string, fresh: boolean) => {
      const s = r.current;
      s.reply.push(text);
      growAssistant(text, fresh);
      const a = new Audio(`/api/voice/speak?text=${encodeURIComponent(text)}`);
      a.preload = "auto";
      s.queue.push(a);
      if (!s.playing) playNext();
    },
    [growAssistant, playNext],
  );

  /** you started talking: stop the voice and the pending reply */
  const interrupt = useCallback(() => {
    const s = r.current;
    if (!s.playing && !s.queue.length && s.streamDone) return;
    log("barge-in");
    s.abort?.abort();
    s.abort = null;
    s.streamDone = true;
    for (const a of [s.playing, ...s.queue])
      if (a) {
        a.onended = a.onerror = null;
        a.pause();
        a.removeAttribute("src");
        a.load();
      }
    s.playing = null;
    s.queue = [];
    settleReply(true);
    setStatus("listening");
  }, [settleReply]);

  const runTurn = useCallback(async () => {
    const s = r.current;
    const ctl = new AbortController();
    s.abort = ctl;
    s.streamDone = false;
    setStatus("thinking");
    let fresh = true;
    try {
      const res = await fetch("/api/voice/turn", {
        method: "POST",
        signal: ctl.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turns: s.turns, typed: opts.current.typed, voice: opts.current.voice }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({})))?.error ?? `turn failed (${res.status})`);
      const reader = res.body.getReader(),
        dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = block.match(/^event: (.*)$/m)?.[1],
            data = JSON.parse(block.match(/^data: (.*)$/m)?.[1] ?? "{}");
          if (ev === "say") {
            log("assistant:", data.text);
            say(data.text, fresh);
            fresh = false;
          } else if (ev === "job") {
            log("job:", JSON.stringify(data));
            s.job = data;
            setStatus("starting");
          } else if (ev === "error") throw new Error(data.message);
          else if (ev === "done") log("turn usd", data.usd);
        }
      }
    } catch (e) {
      if (ctl.signal.aborted) return;
      setError(e instanceof Error ? e.message : "something went wrong");
      setStatus("error");
    }
    if (s.abort === ctl) {
      s.abort = null;
      s.streamDone = true;
      finish();
    }
  }, [say, finish]);

  /** one thing you said (or typed) goes to the assistant */
  const submit = useCallback(
    (said: string) => {
      const s = r.current;
      const text = said.replace(/\s+/g, " ").trim();
      if (!text || s.closed) return;
      interrupt();
      log("you:", text);
      // a turn cut off before any reply joins the next thing you say
      const last = s.turns[s.turns.length - 1];
      if (last?.role === "user") {
        last.content += ` ${text}`;
        setLines((ls) => {
          const i = ls.map((l) => l.role).lastIndexOf("user");
          return ls.map((l, k) => (k === i ? { ...l, text: last.content } : l));
        });
      } else {
        s.turns.push({ role: "user", content: text });
        addLine({ role: "user", text });
      }
      runTurn();
    },
    [addLine, interrupt, runTurn],
  );

  const endTurn = useCallback(() => {
    const s = r.current;
    const text = `${s.finals} ${s.interim}`;
    s.finals = "";
    s.interim = "";
    setLive("");
    submit(text);
  }, [setLive, submit]);

  const close = useCallback(() => {
    const s = r.current;
    if (s.closed) return;
    s.closed = true;
    s.abort?.abort();
    for (const a of [s.playing, ...s.queue])
      if (a) {
        a.onended = a.onerror = null;
        a.pause();
      }
    s.playing = null;
    s.queue = [];
    try {
      if (s.rec?.state !== "inactive") s.rec?.stop();
    } catch {
      /* already stopped */
    }
    try {
      if (s.ws?.readyState === WebSocket.OPEN) s.ws.send(JSON.stringify({ type: "CloseStream" }));
      s.ws?.close();
    } catch {
      /* already closed */
    }
    s.mic?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    const s = r.current;
    // each mount is its own session (dev mode mounts twice); a stale one cleans up after itself
    const run = ++s.run;
    s.closed = false;
    const stale = () => s.run !== run || s.closed;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new TypeError("no mediaDevices");
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (stale()) return mic.getTracks().forEach((t) => t.stop());
        s.mic = mic;
        const t = await fetch("/api/voice/token", { method: "POST" }).then((x) => x.json());
        if (stale()) return mic.getTracks().forEach((t) => t.stop());
        if (!t.token) throw new Error(t.error ?? "no voice token");
        const ws = new WebSocket(LISTEN, ["bearer", t.token]);
        s.ws = ws;
        ws.onopen = () => {
          const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
          const rec = new MediaRecorder(s.mic!, mime ? { mimeType: mime } : undefined);
          s.rec = rec;
          rec.ondataavailable = (e) => {
            if (e.data.size && ws.readyState === WebSocket.OPEN) ws.send(e.data);
          };
          rec.start(250);
          setStatus("listening");
          const hi = greeting(opts.current.typed);
          s.streamDone = true;
          say(hi, true);
        };
        ws.onmessage = (m) => {
          const d = JSON.parse(String(m.data));
          if (d.type === "Results") {
            const text: string = d.channel?.alternatives?.[0]?.transcript ?? "";
            if (text.trim()) interrupt();
            if (d.is_final) {
              if (text.trim()) s.finals = `${s.finals} ${text}`.trim();
              s.interim = "";
            } else s.interim = text;
            setLive(`${s.finals} ${s.interim}`.trim());
            if (d.speech_final && s.finals) endTurn();
          } else if (d.type === "UtteranceEnd" && (s.finals || s.interim)) endTurn();
        };
        ws.onclose = (e) => {
          if (!s.closed) {
            setError(`listening stopped (${e.code})`);
            setStatus("error");
          }
        };
      } catch (e) {
        if (stale()) return;
        setError(micError(e));
        setStatus("error");
      }
    })();
    return close;
  }, []);

  return { status, lines, error, close, type: submit };
}
