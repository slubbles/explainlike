import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pageViewOverride } from "../lib/analytics.ts";
import { gaMeasurementId } from "../lib/security.ts";

test("the GA id comes only from the GA_MEASUREMENT_ID server setting", () => {
  const saved = { next: process.env.NEXT_PUBLIC_GA_ID, legacy: process.env.GA_MEASUREMENT_ID };
  try {
    delete process.env.NEXT_PUBLIC_GA_ID;
    delete process.env.GA_MEASUREMENT_ID;
    assert.equal(gaMeasurementId(), undefined);
    process.env.NEXT_PUBLIC_GA_ID = "G-BUILDVAR";
    assert.equal(gaMeasurementId(), undefined, "a build-time NEXT_PUBLIC var is never read");
    process.env.GA_MEASUREMENT_ID = "G-TEST123";
    assert.equal(gaMeasurementId(), "G-TEST123");
  } finally {
    if (saved.next === undefined) delete process.env.NEXT_PUBLIC_GA_ID;
    else process.env.NEXT_PUBLIC_GA_ID = saved.next;
    if (saved.legacy === undefined) delete process.env.GA_MEASUREMENT_ID;
    else process.env.GA_MEASUREMENT_ID = saved.legacy;
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
  assert.deepEqual(pageViewOverride("https://x.example/copy/share?text=pasted"), {
    page_location: "https://x.example/copy/share",
    page_path: "/copy/share",
  });
  for (const href of [
    "https://explanimate.co/",
    "https://explanimate.co/gallery",
    "https://explanimate.co/?job=abcdef123456",
    "https://x.example/copyright?q=1",
    "not a url",
  ]) {
    assert.equal(pageViewOverride(href), null, href);
  }
  const loader = fs.readFileSync(path.join(import.meta.dirname, "../components/Analytics.tsx"), "utf8");
  assert.match(loader, /pageViewOverride\(location\.href\)/, "every page_view passes through the /copy guard");
  assert.match(loader, /override\?\.page_path/, "the guard's bare path wins when it fires");
});
