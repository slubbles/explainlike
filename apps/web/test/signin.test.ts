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

test("signing in tells the nav, so it shows the account without a reload", () => {
  assert.match(src("components/Home.tsx"), /dispatchEvent\(new CustomEvent\("explanimate:auth-changed"\)\)/);
  assert.match(src("components/AuthNav.tsx"), /addEventListener\("explanimate:auth-changed"/);
});

test("signing out refreshes the nav and the page instead of reloading", () => {
  const nav = src("components/AuthNav.tsx");
  assert.match(nav, /if \(r\?\.ok\) dispatchEvent\(new CustomEvent\("explanimate:auth-changed"\)\)/);
  assert.doesNotMatch(nav, /location\.reload/);
  assert.match(src("components/Home.tsx"), /addEventListener\("explanimate:auth-changed"/);
});
