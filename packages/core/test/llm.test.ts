import { test } from "node:test";
import assert from "node:assert/strict";
import { llmProvider, chatUsd } from "@explanimate/core";

test("the chat provider is OpenRouter when its key is set, else Meta", () => {
  const or = llmProvider({ OPENROUTER_API_KEY: "k" });
  assert.deepEqual(
    [or.id, or.base, or.keyVar, or.model],
    ["openrouter", "https://openrouter.ai/api/v1", "OPENROUTER_API_KEY", "meta/muse-spark-1.3"],
  );
  const meta = llmProvider({ MODEL_API_KEY: "k" });
  assert.deepEqual(
    [meta.id, meta.base, meta.keyVar, meta.model],
    ["meta", "https://api.meta.ai/v1", "MODEL_API_KEY", "muse-spark-1.3-contributor"],
  );
});

test("EXPLANIMATE_LLM_PROVIDER wins over the key check, and the model and address can be overridden", () => {
  assert.equal(llmProvider({ OPENROUTER_API_KEY: "k", EXPLANIMATE_LLM_PROVIDER: "meta" }).id, "meta");
  assert.equal(llmProvider({ EXPLANIMATE_LLM_PROVIDER: " OpenRouter " }).id, "openrouter");
  assert.equal(llmProvider({ OPENROUTER_API_KEY: "k", EXPLANIMATE_SPARK_MODEL: "meta/muse-spark-1.2" }).model, "meta/muse-spark-1.2");
  assert.equal(llmProvider({ META_API_BASE: "http://localhost:9" }).base, "http://localhost:9");
  assert.throws(() => llmProvider({ EXPLANIMATE_LLM_PROVIDER: "acme" }), /must be "openrouter" or "meta"/);
});

test("a call costs what the provider charged when it says, else tokens at the list price", () => {
  assert.equal(chatUsd({ prompt_tokens: 1000, completion_tokens: 1000, cost: 0.0042 }), 0.0042);
  assert.equal(chatUsd({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }), 1.25 + 4.25);
  assert.equal(chatUsd(undefined), 0);
});
