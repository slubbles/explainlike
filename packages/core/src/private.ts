/**
 * Hostnames that always point at this machine or a private network: localhost, loopback,
 * private-range and link-local IPs (in any URL spelling, since URL() normalises 2130706433
 * and 0x7f.1 to 127.0.0.1), IPv6 literals (a public site has a name), and .localhost, .local
 * and .internal names. Anything without a dot is internal too. The web app, the local API
 * and the MCP connector refuse these by default; EXPLANIMATE_ALLOW_PRIVATE_URLS=1 (or the
 * CLI's --allow-private) opts a local run back out. The fetch itself checks every redirect
 * hop again (see @explanimate/ingest), so this is the early, DNS-free half of the guard.
 */
export function privateHostname(host: string): boolean {
  const h = host.toLowerCase();
  return !h.includes(".") || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.|\[|.*\.localhost$|.*\.local$|.*\.internal$)/.test(h);
}

/** Explicit local-dev opt-out for the private-link guard (unset or anything else blocks). */
export function allowPrivateUrls(env: Record<string, string | undefined> = process.env): boolean {
  return env.EXPLANIMATE_ALLOW_PRIVATE_URLS === "1";
}
