"use client";
import { useEffect, useRef, useState } from "react";
import { trackEvent } from "../lib/analytics";
import type { GalleryItem } from "../lib/gallery";

/** A duration in seconds as m:ss, for the card corner. Nothing without a real number. */
const dur = (s?: number) =>
  typeof s === "number" && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : undefined;

/** Example videos as cards: a real frame with a play button, which turns into the playing video in place. */
export default function GalleryGrid({ videos }: { videos: GalleryItem[] }) {
  const [playing, setPlaying] = useState<string>();
  const playRefs = useRef(new Map<string, HTMLButtonElement>());
  // back to the thumbnail, with focus where the viewer left it
  const stop = (id: string) => {
    setPlaying(undefined);
    setTimeout(() => playRefs.current.get(id)?.focus(), 0);
  };
  // Esc closes the video from anywhere: focus may sit outside the card or inside the native
  // video controls, where a key handler on the card itself would never hear it
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop(playing);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [playing]);
  return (
    <div className="grid">
      {videos.map((v) => (
        <div className="vid" id={v.id} key={v.id}>
          {playing === v.id ? (
            <div className="th">
              <video className="big" src={v.src} poster={v.poster} controls autoPlay playsInline aria-label={v.title}>
                {v.captions && <track kind="captions" src={v.captions} srcLang="en" label="English" />}
              </video>
              <button type="button" className="stop" onClick={() => stop(v.id)} aria-label={`Stop playing ${v.title}`}>
                Stop
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="th"
              ref={(el) => {
                if (el) playRefs.current.set(v.id, el);
                else playRefs.current.delete(v.id);
              }}
              onClick={() => {
                setPlaying(v.id);
                trackEvent("gallery_play");
              }}
              aria-label={`Play ${v.title}`}
            >
              {v.poster ? (
                <img src={v.poster} alt="" loading="lazy" />
              ) : (
                <video src={`${v.src}#t=1`} muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true" />
              )}
              <span className="play" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M3 1.5 L10 6 L3 10.5Z" fill="currentColor" />
                </svg>
              </span>
            </button>
          )}
          <div className="meta">
            <span>
              {v.title}
              {v.source ? (
                <a className="tag" href={v.source} target="_blank" rel="noreferrer">
                  {v.kind}
                </a>
              ) : (
                <span className="tag">{v.kind}</span>
              )}
            </span>
            {dur(v.durationSec) && <span className="dur">{dur(v.durationSec)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
