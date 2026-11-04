import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(import.meta.dirname, "..");
const src = (p: string) => fs.readFileSync(path.join(WEB, p), "utf8");

test("sending the code needs the CAPTCHA token, whether by button or Enter", () => {
  const s = src("components/SignIn.tsx");
  assert.match(s, /disabled=\{busy \|\| !email\.trim\(\) \|\| !token\}/);
  assert.match(s, /if \(!token\) return setErr\("Finish the CAPTCHA check first/);
  assert.match(s, /if \(e\.key === "Enter"\) send\(\)/);
});
