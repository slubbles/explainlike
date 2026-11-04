/** @type {import('next').NextConfig} */
const IMMUTABLE = "public, max-age=31536000, immutable";

export default {
  // no x-powered-by header (the rest of the security headers come from middleware.ts)
  poweredByHeader: false,
  // production ships no source maps: neither browser chunks nor server output reference any
  productionBrowserSourceMaps: false,
  experimental: {
    serverSourceMaps: false,
  },
  serverExternalPackages: [],
  // shared input checks are TypeScript source in the workspace
  transpilePackages: ["@explanimate/core"],
  // job outputs (videos, boards, caches) are run-time data, never part of the server build
  outputFileTracingExcludes: {
    "/*": ["../../explanimate-out/**", "./explanimate-out/**", "../../explainlike-out/**", "./explainlike-out/**"],
  },
  // named static files cache for a year; middleware sets the same split (lib/cache.ts) for
  // everything else, including the gallery files under /api/gallery/*. The build output under
  // /_next/static/* keeps Next's own immutable header (setting it here warns and breaks dev).
  async headers() {
    const immutable = [{ key: "Cache-Control", value: IMMUTABLE }];
    return [
      { source: "/og.png", headers: immutable },
      { source: "/hero.jpg", headers: immutable },
      { source: "/icon.svg", headers: immutable },
      { source: "/favicon.ico", headers: immutable },
      { source: "/api/gallery/:path*", headers: immutable },
    ];
  },
};
