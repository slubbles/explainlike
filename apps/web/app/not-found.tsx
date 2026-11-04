import type { Metadata } from "next";
import Nav from "../components/Nav";
import Footer from "../components/Footer";

export const metadata: Metadata = {
  title: "Page not found · Explanimate",
  description: "This page does not exist. Make a whiteboard explainer from any repo, post, article or topic instead.",
  robots: { index: false, follow: true },
};

/** The branded 404: same nav and footer as every page, and a way back to making a video. */
export default function NotFound() {
  return (
    <>
      <Nav />
      <main className="page">
        <section className="gallery all">
          <div className="wrap">
            <h1>Page not found</h1>
            <p className="lead">This page does not exist, or the link is out of date.</p>
            <p>
              <a className="more" href="/">
                Make an explainer
              </a>{" "}
              ·{" "}
              <a className="more" href="/gallery">
                See examples
              </a>
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
