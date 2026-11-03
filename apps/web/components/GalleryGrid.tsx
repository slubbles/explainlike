"use client";
import { useState } from "react";
import type { GalleryItem } from "../lib/gallery";

/** Example videos as cards: a real frame with a play button, which turns into the playing video in place. */
export default function GalleryGrid({ videos }: { videos: GalleryItem[] }) {
  const [playing, setPlaying] = useState<string>();
  return (
    <div className="grid">
      {videos.map((v) => (
        <div className="vid" id={v.id} key={v.id}>
          {playing === v.id ? (
            <div className="th">
              <video className="big" src={v.src} poster={v.poster} controls autoPlay playsInline aria-label={v.title} />
            </div>
          ) : (
            <button type="button" className="th" onClick={() => setPlaying(v.id)} aria-label={`Play ${v.title}`}>
              {v.poster ? (
                <img src={v.poster} alt="" loading="lazy" />
              ) : (
                <video src={`${v.src}#t=1`} muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true" />
              )}
              <span className="t" aria-hidden="true">
                {v.title}
              </span>
              <span className="play" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M3 1.5 L10 6 L3 10.5Z" fill="currentColor" />
                </svg>
              </span>
            </button>
          )}
          <div className="meta">
            <span>{v.title}</span>
            {v.source ? (
              <a href={v.source} target="_blank" rel="noreferrer">
                {v.kind}
              </a>
            ) : (
              <span>{v.kind}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
