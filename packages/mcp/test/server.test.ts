import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createExplanimateServer } from "../src/server.ts";
import type { Job, JobRequest, JobRunner } from "@explanimate/api";

test("explain accepts a name and a look and hands them to the job", async () => {
  let req: JobRequest | undefined;
  const job: Job = {
    id: "abc123",
    input: "how DNS works",
    out: "/tmp/x",
    state: "done",
    stage: "done",
    message: "done",
    pct: 100,
    started: 1,
    title: "dns",
    durationSec: 60,
  };
  const runner = {
    start: (r: JobRequest) => ((req = r), { ...job }),
    get: () => ({ ...job }),
    list: () => [{ ...job }],
    on: () => {},
    off: () => {},
    wait: async () => ({ ...job }),
  };
  const { server } = createExplanimateServer(runner as unknown as JobRunner);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    await client.callTool({
      name: "explain",
      arguments: { source: "how DNS works", name: "dns", look: "dark", waitSeconds: 0 },
    });
  } finally {
    await client.close();
    await server.close();
  }
  assert.equal(req?.name, "dns");
  assert.equal(req?.look, "dark");
});
