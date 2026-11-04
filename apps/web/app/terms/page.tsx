import type { Metadata } from "next";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import { pageMetadata } from "../../lib/seo";
import styles from "../legal.module.css";

export const metadata: Metadata = pageMetadata("terms");

export default function Terms() {
  return (
    <>
      <Nav />
      <main className={styles.page}>
        <div className={styles.wrap}>
          <div className={styles.crumb}>Legal</div>
          <h1>Terms</h1>
          <p className={styles.lead}>Short and plain: this is a free hackathon project, offered as is.</p>

          <h2 id="service">The service</h2>
          <ul>
            <li>
              <strong>Explanimate is free and provided as is, with no warranty.</strong> It is a hackathon project, not a commercial
              product.
            </li>
            <li>
              <strong>Daily limits apply</strong> to how many videos you can make.
            </li>
            <li>
              <strong>Don&apos;t abuse it:</strong> don&apos;t overload the service, work around the limits, or submit content you
              don&apos;t have the rights to use.
            </li>
            <li>
              <strong>Generated videos may contain mistakes.</strong> They are AI-made explainers; check anything important against the
              source.
            </li>
            <li>
              <strong>We may change or stop the service</strong> at any time.
            </li>
          </ul>

          <h2 id="contact">Contact</h2>
          <p>
            Questions about these terms? Open an issue at{" "}
            <a href="https://github.com/slubbles/explanimate/issues">github.com/slubbles/explanimate/issues</a>.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
