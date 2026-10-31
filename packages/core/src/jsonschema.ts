import { z } from "zod";

/**
 * Convert a zod schema to the strict JSON Schema dialect Meta's structured
 * outputs accept: every property required, no additional properties.
 */
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete raw.$schema;
  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(walk);
    if (!n || typeof n !== "object") return n;
    const o = { ...(n as Record<string, unknown>) };
    if (o.type === "object" && o.properties) {
      o.additionalProperties = false;
      o.required = Object.keys(o.properties as object);
    }
    for (const k of Object.keys(o)) o[k] = walk(o[k]);
    return o;
  };
  return walk(raw) as Record<string, unknown>;
}
