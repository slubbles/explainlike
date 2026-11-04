/** Hosts voice mode answers on; the server's `localOnly` check (lib/local.ts) is the real gate. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Whether this page's host can use voice mode, so the mic only shows where it works. */
export const voiceHost = (hostname: string) => LOCAL_HOSTS.has(hostname.toLowerCase()) || /^127\.\d+\.\d+\.\d+$/.test(hostname);

/** A plain sentence for a microphone or voice start failure, instead of a raw DOMException message. */
export function micError(e: unknown): string {
  const name = e instanceof Error || (typeof e === "object" && e && "name" in e) ? String((e as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone access was blocked. Allow it in the browser's site settings and try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Microphone unavailable: no microphone was found.";
  if (name === "NotReadableError" || name === "AbortError") return "Microphone unavailable: another app is using it.";
  if (name === "TypeError" && !(typeof navigator !== "undefined" && navigator.mediaDevices))
    return "Microphone unavailable in this browser.";
  return e instanceof Error && e.message ? e.message : "Voice mode could not start.";
}
