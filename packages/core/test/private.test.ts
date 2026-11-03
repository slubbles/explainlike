import { test } from "node:test";
import assert from "node:assert/strict";
import { privateHostname, allowPrivateUrls } from "../src/private.ts";

test("localhost, private ranges, link-local and local names count as private", () => {
  for (const h of [
    "localhost",
    "127.0.0.1",
    "10.0.0.5",
    "10.255.1.2",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.255",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.9.9",
    "0.0.0.0",
    "[::1]",
    "[::ffff:127.0.0.1]",
    "app.localhost",
    "printer.local",
    "x.internal",
    "metadata.google.internal",
    "intranet",
    "noproxy",
  ])
    assert.ok(privateHostname(h), h);
});

test("public sites, including public IP literals, are not private", () => {
  for (const h of ["github.com", "x.com", "blog.vllm.ai", "example.com", "8.8.8.8", "140.82.112.3", "172.32.0.1", "100.128.0.1"])
    assert.ok(!privateHostname(h), h);
});

test("only EXPLANIMATE_ALLOW_PRIVATE_URLS=1 opts out", () => {
  assert.equal(allowPrivateUrls({}), false);
  assert.equal(allowPrivateUrls({ EXPLANIMATE_ALLOW_PRIVATE_URLS: "0" }), false);
  assert.equal(allowPrivateUrls({ EXPLANIMATE_ALLOW_PRIVATE_URLS: "1" }), true);
});
