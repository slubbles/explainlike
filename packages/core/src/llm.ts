/**
 * Which service answers the Muse Spark chat calls: planning in the CLI and the voice chat on the web.
 * Images, SAM and the voiceover transcript check stay on Meta's own API with MODEL_API_KEY.
 *
 * EXPLANIMATE_LLM_PROVIDER picks "openrouter" or "meta". Unset, it is OpenRouter when OPENROUTER_API_KEY
 * is set, else Meta. EXPLANIMATE_SPARK_MODEL overrides the model id, and META_API_BASE or
 * OPENROUTER_API_BASE the address.
 */
export type LlmProvider = {
  id: "openrouter" | "meta";
  /** the name a person sees in an error */
  service: string;
  base: string;
  keyVar: "OPENROUTER_API_KEY" | "MODEL_API_KEY";
  model: string;
};

type Env = Record<string, string | undefined>;

export function llmProvider(env: Env = process.env): LlmProvider {
  const pick = (env.EXPLANIMATE_LLM_PROVIDER ?? "").trim().toLowerCase() || (env.OPENROUTER_API_KEY ? "openrouter" : "meta");
  if (pick === "openrouter")
    return {
      id: "openrouter",
      service: "OpenRouter",
      base: env.OPENROUTER_API_BASE ?? "https://openrouter.ai/api/v1",
      keyVar: "OPENROUTER_API_KEY",
      model: env.EXPLANIMATE_SPARK_MODEL ?? "meta/muse-spark-1.3",
    };
  if (pick === "meta")
    return {
      id: "meta",
      service: "Meta Muse",
      base: env.META_API_BASE ?? "https://api.meta.ai/v1",
      keyVar: "MODEL_API_KEY",
      model: env.EXPLANIMATE_SPARK_MODEL ?? "muse-spark-1.3-contributor",
    };
  throw new Error(`EXPLANIMATE_LLM_PROVIDER must be "openrouter" or "meta", not "${env.EXPLANIMATE_LLM_PROVIDER}".`);
}

/** Muse Spark 1.3 list price per token, the same on Meta and on OpenRouter's meta/muse-spark-1.3 ($1.25 / 1M in, $4.25 / 1M out). */
export const SPARK_PRICE = { in: 1.25e-6, out: 4.25e-6 };

/**
 * What one chat call cost. OpenRouter reports the charged amount in usage.cost, which also covers
 * cached input and credits, so that is used when present; otherwise tokens times the list price.
 */
export function chatUsd(usage: { prompt_tokens?: number; completion_tokens?: number; cost?: unknown } | undefined): number {
  if (typeof usage?.cost === "number" && Number.isFinite(usage.cost)) return usage.cost;
  return (usage?.prompt_tokens ?? 0) * SPARK_PRICE.in + (usage?.completion_tokens ?? 0) * SPARK_PRICE.out;
}
