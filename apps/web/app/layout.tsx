import type { Metadata } from "next";
import localFont from "next/font/local";
import Analytics from "../components/Analytics";
import "./globals.css";
import "./signin.css";

const sans = localFont({ src: "./fonts/InterVariable.woff2", variable: "--sans", weight: "100 900", display: "swap" });
const hand = localFont({ src: "../../../packages/render/assets/fonts/Excalifont-Regular.woff2", variable: "--hand", display: "swap" });

export const metadata: Metadata = {
  title: "Explanimate — whiteboard explainers from any repo, post or article",
  description:
    "Paste a GitHub repo, X post or article. Get a whiteboard explainer video and an editable board that opens in tldraw.com. Powered by Meta Muse models.",
};

// every page renders per request, so middleware's CSP nonce lands on the inline scripts Next emits
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${hand.variable}`}>
      <body>
        <Analytics />
        {children}
      </body>
    </html>
  );
}
