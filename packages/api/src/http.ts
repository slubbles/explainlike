import http from "node:http";
import { JobError, JobRunner, type JobRequest } from "./jobs.js";

export interface ApiServerOptions { runner?: JobRunner; port?: number }

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const MAX_BODY = 64 * 1024;

/**
 * A small JSON API on 127.0.0.1 only:
 *   POST   /v1/jobs       { input, out?, voice?, fresh?, ... }  -> 202 job
 *   GET    /v1/jobs                                              -> jobs, newest first
 *   GET    /v1/jobs/:id   (?wait=<seconds> blocks until done)    -> job, with file paths once done
 *   DELETE /v1/jobs/:id                                          -> cancels a running job
 * There is no login, so it never listens on a public address, and it refuses any other Host header
 * so a web page cannot reach it through DNS rebinding.
 */
export function createApiServer(o: ApiServerOptions = {}) {
  const runner = o.runner ?? new JobRunner();
  const server = http.createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(body, null, 1));
    };
    try {
      if (!LOCAL_HOST.test(req.headers.host ?? "")) return send(403, { error: "this API only answers on localhost" });
      // a browser page may not post jobs on the user's behalf
      if (req.headers.origin) return send(403, { error: "cross-origin requests are not accepted" });
      const url = new URL(req.url ?? "/", "http://localhost");
      const m = url.pathname.match(/^\/v1\/jobs(?:\/([a-f0-9]{12}))?\/?$/);
      if (url.pathname === "/health") return send(200, { ok: true, outRoot: runner.outRoot });
      if (!m) return send(404, { error: "not found" });
      const id = m[1];
      if (!id && req.method === "POST") {
        const body = await readJson(req);
        return send(202, runner.start(body as JobRequest));
      }
      if (!id && req.method === "GET") return send(200, runner.list());
      if (id && req.method === "GET") {
        const wait = Math.min(Math.max(Number(url.searchParams.get("wait") ?? 0) || 0, 0), 600);
        const job = await runner.wait(id, wait * 1000);
        return job ? send(200, job) : send(404, { error: "no such job" });
      }
      if (id && req.method === "DELETE") {
        const job = runner.cancel(id);
        return job ? send(200, job) : send(404, { error: "no such job" });
      }
      return send(405, { error: "method not allowed" });
    } catch (e) {
      if (e instanceof JobError) return send(e.status, { error: e.message });
      return send(500, { error: String((e as Error)?.message ?? e) });
    }
  });
  return {
    server, runner,
    listen: (port = o.port ?? 7311) => new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => resolve((server.address() as { port: number }).port));
    }),
    close: () => new Promise<void>((resolve) => { runner.close(); server.close(() => resolve()); }),
  };
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new JobError("request body too large", 413)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        if (!v || typeof v !== "object" || typeof v.input !== "string") throw new Error();
        resolve(v);
      } catch { reject(new JobError('send JSON like {"input": "https://github.com/owner/repo"}')); }
    });
    req.on("error", reject);
  });
}
