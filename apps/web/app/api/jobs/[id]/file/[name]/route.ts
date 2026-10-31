import fs from "node:fs";
import { jobFile } from "../../../../../../lib/jobs";

export const runtime = "nodejs";
const TYPES: Record<string, string> = { mp4: "video/mp4", jpg: "image/jpeg", png: "image/png", excalidraw: "application/json", tldr: "application/json", json: "application/json" };

export async function GET(req: Request, ctx: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await ctx.params;
  const f = jobFile(id, name);
  if (!f) return new Response("not found", { status: 404 });
  const size = fs.statSync(f).size;
  const type = TYPES[name.split(".").pop() ?? ""] ?? "application/octet-stream";
  const dl = new URL(req.url).searchParams.has("download");
  const headers: Record<string, string> = { "content-type": type, "accept-ranges": "bytes" };
  if (dl) headers["content-disposition"] = `attachment; filename="${name}"`;
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Number(range[2]) : size - 1;
    const stream = fs.createReadStream(f, { start, end }) as any;
    return new Response(stream, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(fs.createReadStream(f) as any, { headers: { ...headers, "content-length": String(size) } });
}
