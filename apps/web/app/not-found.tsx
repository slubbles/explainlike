import type { Metadata } from "next";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "Page not found · Explanimate",
  description: "This page does not exist. Make a whiteboard explainer from any repo, post, article or topic instead.",
  // a 404 has no single URL, so clear the home canonical inherited from the root layout
  alternates: { canonical: undefined },
  robots: { index: false, follow: true },
};

/** The branded 404: same nav and footer as every page, and a way back to making a video. */
export default function NotFound() {
  return (
    <>
      <Nav />
      <main className={styles.page}>
        <div className={styles.wrap}>
          <div className={styles.crumb}>404</div>
          <h1>Page not found</h1>
          <p className={styles.lead}>This page does not exist, or the link is out of date.</p>
          <p className={styles.actions}>
            <a className={styles.primary} href="/">
              Make an explainer
            </a>
            <a className={styles.secondary} href="/gallery">
              See examples
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
