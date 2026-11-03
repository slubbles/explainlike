import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

const unused = [
  "error",
  {
    argsIgnorePattern: "^_",
    varsIgnorePattern: "^_",
    caughtErrorsIgnorePattern: "^_",
    destructuredArrayIgnorePattern: "^_",
    ignoreRestSiblings: true,
  },
];

export default defineConfig([
  {
    ignores: [
      "**/node_modules/",
      "**/.next/",
      "**/dist/",
      "**/out/",
      "**/coverage/",
      "**/*.log",
      "**/.tmp/",
      "explainlike-out/",
      "explanimate-out/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // `any` is used deliberately in tests and untyped boundaries; tsc still checks the rest
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": unused,
      // an empty catch that keeps a fallback value is deliberate (a comment would add noise)
      "no-empty": ["error", { allowEmptyCatch: true }],
      // three render-math assignments the rule cannot follow; rewriting them is out of scope
      "no-useless-assignment": "off",
      // ingest deliberately translates technical failures into user-facing messages
      "preserve-caught-error": "off",
    },
  },
  {
    // plain browser scripts: cross-file globals by design, no modules, no tsc
    files: ["packages/render/src/stage/stage.js", "packages/render/src/skia/probe.js", "docs/design/landing-v2/sketch.js"],
    languageOptions: { globals: { ...globals.browser } },
    rules: { "no-undef": "off", "no-unused-vars": "off", "@typescript-eslint/no-unused-vars": "off" },
  },
]);
