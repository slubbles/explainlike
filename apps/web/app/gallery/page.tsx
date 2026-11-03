import type { Metadata } from "next";
import Nav from "../../components/Nav";
import GalleryGrid from "../../components/GalleryGrid";
import { galleryItems } from "../../lib/gallery";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Examples · Explanimate" };

export default function Gallery() {
  const videos = galleryItems();
  return (
    <>
      <Nav />
      <main className="page">
        <section className="gallery all">
          <div className="wrap">
            <h1>Examples</h1>
            <p className="lead">Videos run about 85 to 175 seconds, at 1080p.</p>
            {videos.length > 0 ? (
              <GalleryGrid videos={videos} />
            ) : (
              <p className="muted">
                No example videos on this server yet.{" "}
                <a className="more" href="/">
                  Make one
                </a>
              </p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
