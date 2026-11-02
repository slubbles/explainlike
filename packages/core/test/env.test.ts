import { test } from "node:test";
import assert from "node:assert/strict";
import { adoptLegacyEnv } from "@explanimate/core";

test("old EXPLAINLIKE_* settings are copied to EXPLANIMATE_*, and a new name set as well wins", () => {
  const env: Record<string, string | undefined> = { EXPLAINLIKE_VOICE_CAP_USD: "5", EXPLAINLIKE_TRUST_PROXY: "1", EXPLANIMATE_TRUST_PROXY: "0", OTHER: "x" };
  adoptLegacyEnv(env);
  assert.equal(env.EXPLANIMATE_VOICE_CAP_USD, "5");
  assert.equal(env.EXPLANIMATE_TRUST_PROXY, "0");
  assert.equal(env.OTHER, "x");
});
