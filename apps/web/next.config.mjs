/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: [],
  // shared input checks are TypeScript source in the workspace
  transpilePackages: ["@explanimate/core"],
  // job outputs (videos, boards, caches) are run-time data, never part of the server build
  outputFileTracingExcludes: {
    "/*": ["../../explanimate-out/**", "./explanimate-out/**", "../../explainlike-out/**", "./explainlike-out/**"],
  },
};
