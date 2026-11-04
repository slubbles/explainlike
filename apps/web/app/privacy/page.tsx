import type { Metadata } from "next";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata("privacy");

export default function Privacy() {
  return (
    <>
      <Nav />
      <main className="page">
        <section className="docs">
          <div className="wrap narrow">
            <h1>Privacy</h1>
            <p className="lead">What Explanimate keeps, what it sends elsewhere to make a video, and how to ask for deletion.</p>

            <h2 id="stored">What we store</h2>
            <ul>
              <li>
                <strong>Your email address</strong> when you sign in, plus your sign-in sessions. If you use Google sign-in we also keep the
                linked Google account id; we only request your basic profile and email address.
              </li>
              <li>
                <strong>The videos you generate and their inputs:</strong> the prompt or link you pasted and the video and boards made from
                it.
              </li>
              <li>
                <strong>Daily-limit usage counters,</strong> so the free quota can be enforced.
              </li>
              <li>
                <strong>Google Analytics usage data,</strong> such as which pages are visited.
              </li>
            </ul>

            <h2 id="shared">What goes to third parties</h2>
            <p>
              To make a video, your prompt and the fetched repo or link content are sent to AI model providers: the Meta Llama API, with
              OpenRouter as a fallback. Narration text goes to voice providers: Deepgram, with Cartesia as a fallback.
            </p>
            <p>We do not sell your data.</p>

            <h2 id="contact">Deletion and questions</h2>
            <p>
              To delete your account and data, or to ask anything about this policy, open an issue at{" "}
              <a className="more" href="https://github.com/slubbles/explanimate/issues">
                github.com/slubbles/explanimate/issues
              </a>
              .
            </p>
            <p>Last updated November 4, 2026.</p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
