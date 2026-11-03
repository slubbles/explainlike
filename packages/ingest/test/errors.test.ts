import { test } from "node:test";
import assert from "node:assert/strict";
import { cloneError } from "../src/repo.js";
import { fetchError as pageError } from "../src/concept.js";

test("a failed clone says why in words a person can act on", () => {
  assert.match(
    cloneError({ stderr: "remote: Repository not found.\nfatal: repository 'x' not found" }, "a/b"),
    /was not found\. It may be private or misspelled/,
  );
  assert.match(
    cloneError({ stderr: "fatal: could not read Username for 'https://github.com': terminal prompts disabled" }, "a/b"),
    /private/,
  );
  assert.match(
    cloneError(
      { stderr: "warning: Could not find remote branch dev\nfatal: Remote branch dev not found in upstream origin" },
      "a/b",
      "dev",
    ),
    /no branch called "dev"/,
  );
  assert.match(cloneError({ signal: "SIGTERM" }, "torvalds/linux"), /too big/);
  assert.match(
    cloneError({ stderr: "fatal: unable to access 'https://github.com/a/b.git/': Could not resolve host: github.com" }, "a/b"),
    /Could not reach GitHub/,
  );
});

test("a page or post that will not load says what to try next", () => {
  assert.match(pageError("x-post", 404), /deleted, from a private account/);
  assert.match(pageError("article", 403), /paywall or a bot check/);
  assert.match(pageError("article", 404), /not found/);
  assert.match(pageError("article", 503), /HTTP 503/);
});
