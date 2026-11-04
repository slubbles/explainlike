import type { Metadata } from "next";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import GalleryGrid from "../../components/GalleryGrid";
import { galleryItems } from "../../lib/gallery";
import { pageMetadata } from "../../lib/seo";
import styles from "./gallery.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMetadata("gallery");

export default function Gallery() {
  const videos = galleryItems();
  return (
    <>
      <Nav />
      <main className={styles.page}>
        <div className={styles.wrap}>
          <div className={styles.crumb}>Gallery</div>
          <h1>Examples</h1>
          <p className={styles.lead}>Real videos made from real repos and topics. Videos run about 85 to 175 seconds, at 1080p.</p>
          {videos.length > 0 ? (
            <GalleryGrid videos={videos} />
          ) : (
            <p className={styles.empty}>
              No example videos on this server yet. <a href="/">Make one</a>
            </p>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
