import type { Metadata } from "next";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import { pageMetadata } from "../../lib/seo";
import styles from "../legal.module.css";

export const metadata: Metadata = pageMetadata("pricing");

export default function Pricing() {
  return (
    <>
      <Nav />
      <main className={styles.page}>
        <div className={styles.wrap}>
          <div className={styles.crumb}>Pricing</div>
          <h1>Pricing</h1>
          <p className={styles.lead}>Free to try. No paid plans yet.</p>
          <h2 id="free">Free while it&apos;s a hackathon project</h2>
          <ul>
            <li>
              <strong>Browsing is free.</strong> Watch every video in the <a href="/gallery">examples</a> without an account.
            </li>
            <li>
              <strong>Sign in to make videos.</strong> Use Google, GitHub or a code sent to your email.
            </li>
            <li>
              <strong>3 videos a day per account.</strong> A video that fails doesn&apos;t count.
            </li>
            <li>
              <strong>No paid plans yet.</strong> There is nothing to buy and no card to enter.
            </li>
          </ul>
          <h2 id="self-host">Run it yourself</h2>
          <p>
            Explanimate is open source under the MIT license. Clone it from{" "}
            <a href="https://github.com/slubbles/explanimate" target="_blank" rel="noreferrer">
              GitHub
            </a>{" "}
            and run it with your own keys, with no daily limit.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
