/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: [],
  // job outputs (videos, boards, caches) are run-time data, never part of the server build
  outputFileTracingExcludes: { "/*": ["../../explainlike-out/**", "./explainlike-out/**"] },
};
