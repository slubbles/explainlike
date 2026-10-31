const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOOPBACK = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/;

const hostname = (h: string) => h.trim().replace(/^\[(.*)\](:\d+)?$/, "[$1]").replace(/^([^[\]]*?)(:\d+)?$/, "$1").toLowerCase();

/**
 * Voice mode runs on this machine only. Next adds its own forwarding headers, so every host and every address in the
 * chain must be loopback: a tunnel or proxy brings in a public host or the caller's real address and is refused.
 */
export function localOnly(req: Request): Response | undefined {
  const hosts = [req.headers.get("host"), ...(req.headers.get("x-forwarded-host") ?? "").split(",")].filter((h): h is string => !!h?.trim()).map(hostname);
  const ips = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = hosts.length > 0 && hosts.every((h) => LOCAL_HOSTS.has(h)) && ips.every((ip) => LOOPBACK.test(ip)) && !req.headers.get("forwarded");
  return ok ? undefined : Response.json({ error: "voice mode only runs on localhost" }, { status: 403 });
}
