import type { Metadata } from "next";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import CopyCode from "./CopyCode";
import { isValidCopyCode } from "../../lib/copy";
import { SITE_URL } from "../../lib/seo";
import styles from "./copy.module.css";

export const metadata: Metadata = {
  title: "Copy your sign-in code · Explanimate",
  description: "Your 6-digit Explanimate sign-in code, ready to copy and paste. Codes expire in 10 minutes.",
  alternates: { canonical: `${SITE_URL}/copy` },
  robots: { index: false, follow: true },
};

/** The email copy-link landing: ?c holds the code, copied on load and on tap. */
export default async function CopyPage({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  const { c } = await searchParams;
  const code = isValidCopyCode(c) ? c : null;
  return (
    <>
      <Nav />
      <main className={styles.page}>
        <div className={styles.wrap}>
          <div className={styles.crumb}>Sign-in code</div>
          {code ? (
            <>
              <h1>Your sign-in code</h1>
              <CopyCode code={code} />
              <p className={styles.hint}>Paste it on explanimate.co to finish signing in. It expires in 10 minutes.</p>
              <p className={styles.actions}>
                <a className={styles.back} href="/">
                  Back to explanimate.co
                </a>
              </p>
            </>
          ) : (
            <>
              <h1>That link isn&apos;t valid</h1>
              <p className={styles.lead}>
                This link is missing its 6-digit code, or the code got cut off. Ask for a new code and open the newest email.
              </p>
              <p className={styles.actions}>
                <a className={styles.primary} href="/">
                  Back to explanimate.co
                </a>
              </p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
