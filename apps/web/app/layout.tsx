import type { Metadata } from "next";
import localFont from "next/font/local";
import Analytics from "../components/Analytics";
import "./globals.css";
import "./signin.css";
import { gaMeasurementId } from "../lib/security";
import { SITE_URL, organizationJsonLd, pageMetadata, websiteJsonLd } from "../lib/seo";

const sans = localFont({ src: "./fonts/InterVariable.woff2", variable: "--sans", weight: "100 900", display: "swap" });
/* Code sets in Geist Mono where installed, else the platform monospace stack (see --mono). */

// the landing page is a client component, so its head lives here; /docs and /gallery override it
export const metadata: Metadata = { ...pageMetadata("home"), metadataBase: new URL(`${SITE_URL}/`) };

// every page renders per request, so middleware's CSP nonce lands on the inline scripts Next emits
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <Analytics measurementId={gaMeasurementId() ?? ""} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }} />
        {children}
      </body>
    </html>
  );
}
