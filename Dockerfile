# Explain Like web app: one container that takes a link or topic and renders the video itself.
# Needs a persistent volume at /data (jobs, spend ledger, caches). See docs/deploy.md.
FROM node:22-bookworm-slim

# Chromium draws the frames, ffmpeg encodes them, git clones repos. The fonts are bundled in the repo.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium ffmpeg git ca-certificates fonts-noto-color-emoji tini \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app
# dependencies first, so a code change does not reinstall them
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/api/package.json packages/api/
COPY packages/cli/package.json packages/cli/
COPY packages/core/package.json packages/core/
COPY packages/ingest/package.json packages/ingest/
COPY packages/mcp/package.json packages/mcp/
COPY packages/models/package.json packages/models/
COPY packages/planner/package.json packages/planner/
COPY packages/render/package.json packages/render/
COPY packages/voice/package.json packages/voice/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @explainlike/web build

# Everything the server writes goes under /data: jobs, the spend ledger and the repo, plan, voice and icon caches.
ENV NODE_ENV=production \
    HOME=/data \
    EXPLAINLIKE_ROOT=/app \
    EXPLAINLIKE_JOBS_DIR=/data/jobs \
    EXPLAINLIKE_CHROME=/usr/bin/chromium \
    PORT=3000
RUN mkdir -p /data/jobs && chown -R node:node /app
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

WORKDIR /app/apps/web
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "exec node_modules/.bin/next start -p \"$PORT\""]
