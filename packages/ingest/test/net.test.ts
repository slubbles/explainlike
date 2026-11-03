import { test } from "node:test";
import assert from "node:assert/strict";
import { privateAddress, publicFetch, PrivateAddressError } from "../src/net.ts";

test("private, loopback, link-local and metadata addresses are spotted, public ones pass", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
  ])
    assert.ok(privateAddress(ip), ip);
  for (const ip of ["8.8.8.8", "140.82.112.3", "172.32.0.1", "2606:4700::1111"]) assert.ok(!privateAddress(ip), ip);
});

test("a link to the server's own network is refused before any request", async () => {
  delete process.env.EXPLANIMATE_ALLOW_PRIVATE_URLS;
  for (const u of ["http://127.0.0.1:3000/", "http://localhost/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/"]) {
    await assert.rejects(publicFetch(u), PrivateAddressError, u);
  }
  await assert.rejects(publicFetch("file:///etc/passwd"), /Only http and https/);
});

test("a redirect into the private network is refused at the hop", async () => {
  const http = await import("node:http");
  const srv = http
    .createServer((_q, s) => {
      s.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      s.end();
    })
    .listen(0);
  const port = (srv.address() as { port: number }).port;
  // the test server is on loopback, so only 127.0.0.1 counts as public here
  const r = await publicFetch(`http://127.0.0.1:${port}/`, {}, 5, (ip) => ip !== "127.0.0.1" && privateAddress(ip)).catch((e) => e);
  srv.close();
  assert.ok(r instanceof PrivateAddressError, String(r));
});
