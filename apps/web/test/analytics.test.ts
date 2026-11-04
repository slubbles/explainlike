import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pageViewOverride } from "../lib/analytics.ts";

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

test("the /copy page_view strips the login code from the URL before GA sees it", () => {
  assert.deepEqual(pageViewOverride("https://explanimate.co/copy?c=123456"), {
    page_location: "https://explanimate.co/copy",
    page_path: "/copy",
  });
  assert.deepEqual(pageViewOverride("https://explanimate.co/copy?c=123456#top"), {
    page_location: "https://explanimate.co/copy",
    page_path: "/copy",
  });
  for (const href of [
    "https://explanimate.co/",
    "https://explanimate.co/gallery",
    "https://explanimate.co/?job=abcdef123456",
    "not a url",
  ]) {
    assert.equal(pageViewOverride(href), null, href);
  }
  const loader = fs.readFileSync(path.join(import.meta.dirname, "../components/Analytics.tsx"), "utf8");
  assert.match(loader, /pageViewOverride\(window\.location\.href\)/);
  assert.match(loader, /anonymize_ip: true, \.\.\.override/);
});
