import { test } from "node:test";
import assert from "node:assert/strict";
import { walkCues, spokenWords, type Architecture } from "@explanimate/core";

const part = (id: string, keyword: string) => ({ id, keyword, name: keyword, kind: "service", what: "", evidence: ["a.ts"], icon: "box" });
const arch = {
  components: [part("cli", "command line tool"), part("drv", "browser driver"), part("tab", "browser tab")],
  connections: [],
  walkthrough: { name: "open a page", steps: [
    { from: "cli", to: "drv", label: "send cdp instruction", evidence: "a.ts" },
    { from: "drv", to: "tab", label: "drive page", evidence: "a.ts" },
    { from: "drv", to: "cli", label: "return result", evidence: "a.ts" },
  ] },
  scale: [],
} as unknown as Architecture;
const cues = (s: string) => walkCues(spokenWords(s), arch);

test("a walkthrough told in plain words syncs each step to the part it reaches", () => {
  const s = "You type a command into the command line tool, and it hands the order to the browser driver. The driver clicks through the page in the browser tab, then the browser driver sends what it saw back to the command line tool.";
  const k = cues(s), w = spokenWords(s);
  assert.ok(k.every((i) => i >= 0), `cues ${k}`);
  assert.deepEqual(k.map((i) => w[i]), ["browser", "browser", "command"]);
  assert.ok(k[0] < k[1] && k[1] < k[2], "in order");
});

test("a step's label wins when the narration says it", () => {
  const s = "The command line tool will send cdp instruction now. Later the browser driver shows up.";
  assert.equal(cues(s)[0], spokenWords(s).indexOf("send"));
});

test("a part named early on the way somewhere else does not fire a later step", () => {
  // "browser tab" is named in the first sentence; step 2 must wait until the driver hands off to it
  const s = "The command line tool, which controls a browser tab, talks to the browser driver. Then the browser driver works the browser tab.";
  const w = spokenWords(s), k = cues(s);
  assert.ok(k[1] > w.lastIndexOf("driver") - 1 && w[k[1]] === "browser" && w[k[1] + 1] === "tab.", `step 2 at word ${k[1]}`);
});

test("a step the narration never tells is -1", () => {
  assert.deepEqual(cues("Nothing about the parts here."), [-1, -1, -1]);
});
