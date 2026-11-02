"use client";
import { useState } from "react";
import type { GalleryItem } from "../lib/gallery";

/** Example videos as cards: a still with a play button, which turns into the playing video in place. */
export default function GalleryGrid({ videos }: { videos: GalleryItem[] }) {
  const [playing, setPlaying] = useState<string>();
  return (
    <div className="grid">
      {videos.map((v) => (
        <div className="card" id={v.id} key={v.id}>
          {playing === v.id ? (
            <div className="screen"><video src={v.src} poster={v.poster} controls autoPlay playsInline aria-label={v.title} /></div>
          ) : (
            <button type="button" className="screen still" onClick={() => setPlaying(v.id)} aria-label={`Play ${v.title}`}>
              {v.poster ? <img src={v.poster} alt="" loading="lazy" /> : <video src={`${v.src}#t=1`} preload="metadata" muted playsInline tabIndex={-1} />}
              <span className="play" aria-hidden><svg width="18" height="18" viewBox="0 0 18 18"><path d="M5 3.5v11l9-5.5z" fill="currentColor" /></svg></span>
            </button>
          )}
          <div className="t">{v.title}</div>
          <div className="m">{v.durationSec ? `${Math.round(v.durationSec)} s · ` : ""}{v.source ? <a href={v.source} target="_blank" rel="noreferrer">{v.kind}</a> : v.kind}</div>
        </div>
      ))}
    </div>
  );
}