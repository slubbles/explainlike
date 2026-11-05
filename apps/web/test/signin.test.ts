import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(import.meta.dirname, "..");
const src = (p: string) => fs.readFileSync(path.join(WEB, p), "utf8");

test("sending the code needs the CAPTCHA token when one is set, whether by button or Enter", () => {
  const s = src("components/SignIn.tsx");
  assert.match(s, /const needCaptcha = Boolean\(siteKey\);/);
  assert.match(s, /disabled=\{busy \|\| !email\.trim\(\) \|\| \(needCaptcha && !token\)\}/);
  assert.match(s, /if \(needCaptcha && !token\) return setErr\("Finish the CAPTCHA check first/);
  assert.match(s, /if \(e\.key === "Enter"\) send\(\)/);
});

test("without a site key the email flow stays and says the code is logged locally", () => {
  const s = src("components/SignIn.tsx");
  assert.match(s, /Local dev: the code is logged to the server console\./);
  assert.match(s, /\{needCaptcha && <div ref=\{box\} className="scap" \/>\}/);
});

test("signing in tells the nav, so it shows the account without a reload", () => {
  assert.match(src("components/Home.tsx"), /dispatchEvent\(new CustomEvent\("explanimate:auth-changed"\)\)/);
  assert.match(src("components/AuthNav.tsx"), /addEventListener\("explanimate:auth-changed"/);
});

test("public nav sends signed-in people to the dashboard instead of showing their email", () => {
  const nav = src("components/AuthNav.tsx");
  assert.match(nav, /href="\/app"/);
  assert.match(nav, /Dashboard/);
  assert.doesNotMatch(nav, /Signed in as/);
  assert.match(src("components/Home.tsx"), /addEventListener\("explanimate:auth-changed"/);
});

test("a long signed-in address truncates without clipping the Sign out button", () => {
  const css = src("app/signin.css");
  // the ellipsis lives on the address span only; the account bit holding the button never hides overflow
  assert.match(css, /\.navuser \.who\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /\.navuser \.who\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.match(css, /\.navout\s*\{[^}]*flex:\s*none/);
  const account = css.match(/\.navuser\s*\{[^}]*\}/)?.[0] ?? "";
  assert.doesNotMatch(account, /overflow:/);
  assert.doesNotMatch(account, /text-overflow:/);
});

test("the panel fits the 300px CAPTCHA widget on narrow phones", () => {
  const css = src("app/signin.css");
  assert.match(css, /\.scap\s*\{[^}]*justify-content:\s*center/);
  const narrow = css.slice(css.indexOf("@media (max-width: 420px)"));
  assert.match(narrow, /\.signin-back\s*\{[^}]*padding:\s*16px/);
  assert.match(narrow, /\.signin\s*\{[^}]*padding:\s*22px 20px/);
});
