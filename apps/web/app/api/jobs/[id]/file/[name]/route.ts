import { jobFile } from "../../../../../../lib/jobs";
import { fileResponse } from "../../../../../../lib/serve";
import { withErrors } from "../../../../../../lib/route";
import { limitRequest } from "../../../../../../lib/guard";

export const runtime = "nodejs";
const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  jpg: "image/jpeg",
  png: "image/png",
  excalidraw: "application/json",
  tldr: "application/json",
  json: "application/json",
};

export const GET = withErrors("file.GET", async (req: Request, ctx: { params: Promise<{ id: string; name: string }> }) => {
  const limited = limitRequest(req, "file");
  if (limited) return limited;
  const { id, name } = await ctx.params;
  const f = jobFile(id, name);
  if (!f) return new Response("not found", { status: 404 });
  const headers: Record<string, string> = { "content-type": TYPES[name.split(".").pop() ?? ""] ?? "application/octet-stream" };
  if (new URL(req.url).searchParams.has("download")) headers["content-disposition"] = `attachment; filename="${name}"`;
  return fileResponse(req, f, headers);
});
