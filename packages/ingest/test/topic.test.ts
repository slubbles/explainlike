import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeTopic } from "@explanimate/core";
import { topicQuery, topicWords, reputable, relevance, topicText } from "../src/topic.ts";

test("a topic in words is told apart from links and folders", () => {
  for (const t of ["how DNS works", "why is the sky blue?", "inflation"]) assert.ok(looksLikeTopic(t), t);
  for (const l of [
    "https://example.com/a",
    "github.com/a/b",
    "blog.vllm.ai/2023/06/20/vllm.html",
    "./repo",
    "/home/me/repo",
    "~/code",
    "",
    "  ",
  ])
    assert.ok(!looksLikeTopic(l), l);
});

test("the search words drop the asking and keep the subject", () => {
  assert.equal(topicQuery("Explain how DNS works like I'm five"), "how DNS works");
  assert.equal(topicQuery("can you explain to me what inflation is?"), "what inflation is");
  assert.deepEqual(topicWords("how do vaccines work"), ["vaccine"]);
  assert.deepEqual(topicWords("how does a bloom filter work"), ["bloom", "filter"]);
});

test("only https pages on reputable sites count as sources", () => {
  assert.ok(reputable("https://www.rfc-editor.org/rfc/rfc1034"));
  assert.ok(reputable("https://www.cdc.gov/vaccines/"));
  assert.ok(reputable("https://web.mit.edu/x"));
  assert.ok(!reputable("http://www.cdc.gov/vaccines/"));
  assert.ok(!reputable("https://someblog.example.com/dns"));
  assert.ok(!reputable("https://www.nist.gov/report.pdf"));
  assert.ok(!reputable("https://cdc.gov.evil.example/x"));
});

test("a page about the subject outranks one that only mentions it", () => {
  const on = relevance("Vaccine Types", "There are several types of vaccines. Each vaccine teaches the immune system.", ["vaccine"]);
  const off = relevance("Volcano report", "The eruption displaced thousands. A vaccine drive followed.", ["vaccine"]);
  assert.ok(on >= 1.2 && off < 1.2, `${on} ${off}`);
});

test("each source is numbered and named in the planner's text", () => {
  const t = topicText([
    { title: "Domain Name System", url: "https://en.wikipedia.org/wiki/DNS", site: "en.wikipedia.org", text: "DNS maps names." },
    { title: "RFC 1034", url: "https://www.rfc-editor.org/rfc/rfc1034", site: "rfc-editor.org", text: "Domain concepts." },
  ]);
  assert.match(
    t,
    /^\[Source 1: Domain Name System \(en\.wikipedia\.org\)\]\nDNS maps names\.\n\n\[Source 2: RFC 1034 \(rfc-editor\.org\)\]/,
  );
});
