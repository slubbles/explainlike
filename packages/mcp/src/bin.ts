import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createExplanimateServer } from "./server.js";

// stdout is the protocol: anything human-readable goes to stderr
const { server, runner } = createExplanimateServer();
const stop = () => {
  runner.close();
  process.exit(0);
};
process.stdin.on("close", stop);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, stop);
await server.connect(new StdioServerTransport());
if (!process.env.MODEL_API_KEY) process.stderr.write("explanimate-mcp: MODEL_API_KEY is not set, so explain will fail until it is\n");
