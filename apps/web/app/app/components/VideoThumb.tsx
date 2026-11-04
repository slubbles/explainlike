import { jobFile } from "../../../lib/jobs";
import type { UserVideo } from "../../../lib/videos";

/** A video's thumbnail: its saved still, else a frame from the mp4, else a plain tile. Only files really on disk are used. */
export default function VideoThumb({ video, link }: { video: UserVideo; link?: string }) {
  const poster = video.poster && jobFile(video.id, video.poster) ? `/api/jobs/${video.id}/file/${video.poster}` : undefined;
  const mp4 = video.files.mp4 && jobFile(video.id, video.files.mp4) ? `/api/jobs/${video.id}/file/${video.files.mp4}` : undefined;
  const body =
    poster != null ? (
      <img src={poster} alt="" loading="lazy" />
    ) : mp4 != null ? (
      <video src={`${mp4}#t=2`} muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true" />
    ) : (
      <span className="app-vtile">No preview</span>
    );
  return link ? (
    <a className="app-thumb" href={link} aria-label={`Open ${video.title}`}>
      {body}
    </a>
  ) : (
    <span className="app-thumb">{body}</span>
  );
}
