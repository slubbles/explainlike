import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sans = localFont({ src: "../../../packages/render/assets/fonts/Nunito-Variable.ttf", variable: "--sans", weight: "200 1000" });
const hand = localFont({ src: "../../../packages/render/assets/fonts/Excalifont-Regular.ttf", variable: "--hand" });

export const metadata: Metadata = {
  title: "metual — whiteboard explainers from any repo, post or article",
  description: "Paste a GitHub repo, X post or article. Get a whiteboard explainer video and an editable board that opens in tldraw.com. Powered by Meta Muse models.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${hand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
