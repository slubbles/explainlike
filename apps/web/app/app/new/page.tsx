import VideoWorkspace from "../components/VideoWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "New video — Explanimate" };

/** The full editor: the prompt box (?prompt= pre-fills it), then progress and the result. The layout already gated the visit. */
export default async function NewPage({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const { prompt } = await searchParams;
  return (
    <>
      <h1 className="app-h1">New video</h1>
      <VideoWorkspace prompt={typeof prompt === "string" ? prompt.slice(0, 2048) : undefined} />
    </>
  );
}
