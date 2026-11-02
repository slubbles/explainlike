import { test } from "node:test";
import assert from "node:assert/strict";
import { isSecretPath, redact } from "@explanimate/ingest";

test("credential-looking files are never opened", () => {
  for (const p of [".env", "apps/web/.env.local", ".dev.vars", "certs/server.pem", "home/.ssh/id_ed25519", "config/service-account.json", ".npmrc", "old/backup/db.sql"]) assert.ok(isSecretPath(p), p);
  for (const p of [".env.example", "src/index.ts", "docs/auth.md", "package.json"]) assert.ok(!isSecretPath(p), p);
});

test("credentials in text that is read get redacted, env lookups stay", () => {
  const key = "sk-" + "a1B2c3D4e5F6g7H8i9J0".repeat(2);
  const out = redact(`const k = "${key}";\napi_key = "abcdef123456"\nconst t = process.env.MODEL_API_KEY;\nDATABASE_URL=postgres://u:p@host/db`);
  assert.ok(!out.includes(key));
  assert.ok(!out.includes("abcdef123456"));
  assert.ok(!out.includes("u:p@host"));
  assert.ok(out.includes("process.env.MODEL_API_KEY"));
});
