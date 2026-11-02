import { TYPES, galleryFile } from "../../../../lib/gallery";
import { fileResponse } from "../../../../lib/serve";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const f = galleryFile(name);
  if (!f) return new Response("not found", { status: 404 });
  return fileResponse(req, f, { "content-type": TYPES[name.split(".").pop()!.toLowerCase()], "cache-control": "public, max-age=3600" });
}
