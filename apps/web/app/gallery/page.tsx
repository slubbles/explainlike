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
          <h1>Examples</h1>
          {videos.length > 0 ? <GalleryGrid videos={videos} /> : <p className="muted">No example videos on this server yet. <a className="back" href="/">Make one</a></p>}
        </section>
      </main>
    </>
  );
}
