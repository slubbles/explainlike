/** @type {import('next').NextConfig} */
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
};
