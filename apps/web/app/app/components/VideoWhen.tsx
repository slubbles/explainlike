"use client";
import { when } from "../../../lib/videos";

/** A video's made date in the viewer's time zone; the client render replaces the server one. */
export default function VideoWhen({ ts }: { ts: number }) {
  return <span suppressHydrationWarning>{when(ts)}</span>;
}
