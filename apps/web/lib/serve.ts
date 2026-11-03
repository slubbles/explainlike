import fs from "node:fs";

/**
 * A file on disk as an HTTP response, with byte ranges so a browser can stream a video and seek in it.
 * A range past the end of the file is answered 416; a range that runs over the end is cut at the end.
 */
export function fileResponse(req: Request, file: string, headers: Record<string, string>): Response {
  const size = fs.statSync(file).size;
  const base = { ...headers, "accept-ranges": "bytes" };
  const m = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    // "bytes=-500" is the last 500 bytes
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...base, "content-range": `bytes */${size}` } });
    return new Response(fs.createReadStream(file, { start, end }) as unknown as ReadableStream, {
      status: 206,
      headers: { ...base, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(fs.createReadStream(file) as unknown as ReadableStream, { headers: { ...base, "content-length": String(size) } });
}
