// Unit tests import page components directly under tsx, which cannot parse
// stylesheets. This loader answers every .css import with the class names
// themselves, so `styles.page` reads as "page" in tests.
export async function resolve(specifier, context, next) {
  if (specifier.endsWith(".css")) {
    return { url: new URL(specifier, context.parentURL).href, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith(".css")) {
    return {
      format: "module",
      source: "export default new Proxy({}, { get: (_t, p) => String(p) });",
      shortCircuit: true,
    };
  }
  return next(url, context);
}
