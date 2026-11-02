import { createApiServer } from "./http.js";

const i = process.argv.indexOf("--port");
const port = Number(i >= 0 ? process.argv[i + 1] : process.env.EXPLANIMATE_API_PORT ?? 7311);
const api = createApiServer();
const bound = await api.listen(port);
process.stderr.write(`Explanimate API on http://127.0.0.1:${bound} (videos go to ${api.runner.outRoot})\n`);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { void api.close().then(() => process.exit(0)); });
