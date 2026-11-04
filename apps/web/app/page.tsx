import type { Metadata } from "next";
import Home from "../components/Home";
import { getJob } from "../lib/jobs";
import { appJsonLd, jobPageMetadata, pageMetadata } from "../lib/seo";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ job?: string }> }): Promise<Metadata> {
  // a shared result link reads as its own page (title, unfurl) without entering search results
  const { job } = await searchParams;
  if (job) {
    const found = getJob(job);
    if (found) return jobPageMetadata({ id: job, title: found.title, input: found.input });
  }
  return pageMetadata("home");
}

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd()) }} />
      <Home />
    </>
  );
}
