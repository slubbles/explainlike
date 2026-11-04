"use client";
import { useEffect, useRef, useState } from "react";

type Box = { x: number; y: number; w: number; h: number };
type Key = Box & { t: number; move: number };
export type Interactive = {
  width: number;
  height: number;
  duration: number;
  endAt: number;
  camera: Key[];
  nodes: { id: string; keyword: string; box: Box; t0: number }[];
};

// Same camera maths as the renderer's stage.js, so the tap targets sit on the drawn boxes.
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
function camera(K: Key[], t: number): Box {
  let cur: Box = K[0];
  for (let i = 1; i < K.length; i++) {
    const k = K[i];
    if (t < k.t) break;
    const p = k.move > 0 ? ease(Math.min(1, Math.max(0, (t - k.t) / k.move))) : 1;
    cur = { x: cur.x + (k.x - cur.x) * p, y: cur.y + (k.y - cur.y) * p, w: cur.w + (k.w - cur.w) * p, h: cur.h + (k.h - cur.h) * p };
  }
  return cur;
}

/** A tap target's label placement: near an edge the label flips inside the video instead of clipping off it. */
export function chipClass(b: { l: number; tp: number; w: number }): string {
  const c = ["hit"];
  if (b.tp < 18) c.push("below");
  if (b.l < 18 && b.l + b.w <= 82) c.push("rl");
  else if (b.l + b.w > 82 && b.l >= 18) c.push("rr");
  return c.join(" ");
}

export default function Player({
  src,
  map,
  selected,
  onPick,
  title,
  captions,
}: {
  src: string;
  map?: Interactive;
  selected?: string;
  onPick: (id: string) => void;
  title?: string;
  captions?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  // The first frame is an empty whiteboard. When the browser blocks autoplay, show a frame from the middle
  // instead, and go back to the start the first time it plays unless the viewer has moved the playhead.
  const preview = useRef(false);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const still = () => {
      if (v.paused && v.currentTime === 0 && v.duration) {
        preview.current = true;
        v.currentTime = v.duration * 0.55;
      }
    };
    const start = () => v.play().catch(() => (v.readyState >= 1 ? still() : v.addEventListener("loadedmetadata", still, { once: true })));
    if (v.readyState >= 1) start();
    else v.addEventListener("loadedmetadata", start, { once: true });
    return () => {
      v.removeEventListener("loadedmetadata", start);
      v.removeEventListener("loadedmetadata", still);
    };
  }, [src]);
  const onPlay = () => {
    const v = video.current;
    if (v && preview.current) {
      preview.current = false;
      v.currentTime = 0;
    }
  };
  const onSeeked = () => {
    const v = video.current;
    if (v && preview.current && Math.abs(v.currentTime - v.duration * 0.55) > 0.05) preview.current = false;
  };
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (video.current) setT(video.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  let boxes: { id: string; keyword: string; l: number; tp: number; w: number; h: number }[] = [];
  if (map && t < map.endAt) {
    const cam = camera(map.camera, t);
    const s = Math.min(map.width / cam.w, map.height / cam.h);
    const ox = (map.width - cam.w * s) / 2,
      oy = (map.height - cam.h * s) / 2;
    boxes = map.nodes
      .filter((n) => t >= n.t0 + 0.4)
      .map((n) => ({
        id: n.id,
        keyword: n.keyword,
        l: (((n.box.x - cam.x) * s + ox) / map.width) * 100,
        tp: (((n.box.y - cam.y) * s + oy) / map.height) * 100,
        w: ((n.box.w * s) / map.width) * 100,
        h: ((n.box.h * s) / map.height) * 100,
      }))
      .filter((b) => b.l < 100 && b.tp < 100 && b.l + b.w > 0 && b.tp + b.h > 0);
  }

  return (
    <div className="player">
      <video
        ref={video}
        src={src}
        controls
        playsInline
        preload="auto"
        onPlay={onPlay}
        onSeeked={onSeeked}
        aria-label={title ?? "Explainer video"}
      >
        {captions && <track kind="captions" src={captions} srcLang="en" label="English" default />}
      </video>
      {map && (
        <div className="overlay">
          {boxes.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-label={`Explain ${b.keyword}`}
              className={`${chipClass(b)}${selected === b.id ? " on" : ""}`}
              style={{ left: `${b.l}%`, top: `${b.tp}%`, width: `${b.w}%`, height: `${b.h}%` }}
              onClick={() => {
                video.current?.pause();
                onPick(b.id);
              }}
            >
              <span className="tipchip">Explain {b.keyword}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
