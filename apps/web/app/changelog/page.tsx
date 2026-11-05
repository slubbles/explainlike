import type { Metadata } from "next";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import { pageMetadata } from "../../lib/seo";
import styles from "../legal.module.css";

export const metadata: Metadata = pageMetadata("changelog");

export default function Changelog() {
  return (
    <>
      <Nav />
      <main className={styles.page}>
        <div className={styles.wrap}>
          <div className={styles.crumb}>Changelog</div>
          <h1>Changelog</h1>
          <p className={styles.lead}>What shipped in Explanimate, newest last. Built from October 31, 2026.</p>
          <h2 id="shipped">Shipped</h2>
          <ul>
            <li>
              <strong>October 31:</strong> First videos: a narrated whiteboard drawn from a GitHub repo, saved as a tldraw board too.
            </li>
            <li>
              <strong>November 1:</strong> Muse Spark picks how to explain each topic, checks its map against the code, and polishes the narration.
            </li>
            <li>
              <strong>November 1:</strong> Plain topics, the command line, a local API and an MCP server for coding tools.
            </li>
            <li>
              <strong>November 1:</strong> Chart, timeline and map cut-ins, captions, music and sound effects.
            </li>
            <li>
              <strong>November 1:</strong> Boards export to both tldraw and Excalidraw, with a check on each.
            </li>
            <li>
              <strong>November 3:</strong> A queue, so new videos wait for a free slot instead of being turned away.
            </li>
            <li>
              <strong>November 3:</strong> Example videos on the home page and in the gallery.
            </li>
            <li>
              <strong>November 4:</strong> Choose Short, Deep or Anatomy, a tour of a repo&apos;s parts.
            </li>
            <li>
              <strong>November 4:</strong> Sign in with Google, GitHub or an email code, plus a dashboard for your videos.
            </li>
            <li>
              <strong>November 4:</strong> New look for the home page, docs and gallery, and privacy and terms pages.
            </li>
            <li>
              <strong>November 5:</strong> Faster renders, a fairer queue, and a failed video gives its daily slot back.
            </li>
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
