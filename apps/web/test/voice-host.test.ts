import { test } from "node:test";
import assert from "node:assert/strict";
import { micError, voiceHost } from "../lib/voiceHost.ts";

test("the mic shows only on the hosts the server lets voice mode run on", () => {
  for (const h of ["localhost", "127.0.0.1", "127.4.5.6", "::1", "[::1]", "LOCALHOST"]) assert.equal(voiceHost(h), true, h);
  for (const h of ["explanimate.co", "www.explanimate.co", "192.168.1.5", "localhost.evil.com", "127.0.0.1.nip.io", ""])
    assert.equal(voiceHost(h), false, h);
});

const dom = (name: string) => Object.assign(new Error(`raw ${name} text`), { name });

test("a missing or blocked microphone reads as a plain sentence, not a raw browser error", () => {
  assert.match(micError(dom("NotFoundError")), /^Microphone unavailable/);
  assert.match(micError(dom("OverconstrainedError")), /^Microphone unavailable/);
  assert.match(micError(dom("NotReadableError")), /^Microphone unavailable/);
  assert.match(micError(dom("NotAllowedError")), /^Microphone access was blocked/);
  assert.match(micError(dom("SecurityError")), /^Microphone access was blocked/);
  assert.doesNotMatch(micError(dom("NotFoundError")), /raw|Requested device not found/);
  assert.equal(micError(new Error("no voice token")), "no voice token");
  assert.equal(micError("weird"), "Voice mode could not start.");
});
