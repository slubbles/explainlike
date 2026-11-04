// Loaded with --import before the test runner: stylesheets resolve to class-name
// stubs, so unit tests can import page components directly under tsx. Covers
// both module systems: tsx compiles test imports to require(), while plain
// ESM imports go through the registered loader hooks.
import { createRequire, register } from "node:module";

const proxy = new Proxy(
  {},
  {
    get: (_t, p) => {
      if (typeof p === "symbol" || p === "__esModule" || p === "then") return undefined;
      if (p === "default") return proxy;
      return String(p);
    },
  },
);

createRequire(import.meta.url).extensions[".css"] = (m) => {
  m.exports = proxy;
};

register("./css-stub-loader.mjs", import.meta.url);
