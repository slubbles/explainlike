import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authEnabled, sessionUser } from "../lib/auth";
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

export default async function Page({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  // signed-in visitors land on their dashboard; shared ?job= links still open here
  const { job } = await searchParams;
  if (!job && authEnabled()) {
    const h = await headers();
    const user = await sessionUser(new Request("http://localhost/", { headers: new Headers(h) })).catch(() => null);
    if (user) redirect("/app");
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd()) }} />
      <Home />
    </>
  );
}
