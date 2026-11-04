import { test } from "node:test";
import assert from "node:assert/strict";

const runtimeConfig = () => import("../app/api/runtime-config/route.ts");

test("the runtime config serves the GA id when set and null when unset", async () => {
  const saved = process.env.GA_MEASUREMENT_ID;
  try {
    const { GET } = await runtimeConfig();
    delete process.env.GA_MEASUREMENT_ID;
    assert.deepEqual(await (await GET(new Request("http://x/api/runtime-config"), undefined as never)).json(), {
      gaMeasurementId: null,
    });
    process.env.GA_MEASUREMENT_ID = "G-TEST123";
    assert.deepEqual(await (await GET(new Request("http://x/api/runtime-config"), undefined as never)).json(), {
      gaMeasurementId: "G-TEST123",
    });
  } finally {
    if (saved === undefined) delete process.env.GA_MEASUREMENT_ID;
    else process.env.GA_MEASUREMENT_ID = saved;
  }
});
