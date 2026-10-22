import { register } from "node:module";

// Vinext imports optional Worker tracing when a built bundle is loaded.
// Node regression tests use explicit request/env fixtures, not Worker bindings.
// Expose only tracing; unexpected binding imports must still fail closed.
const tracingModule = `data:text/javascript,${encodeURIComponent("export const tracing = undefined;")}`;
const workerRoot = new URL("../dist/server/", import.meta.url).href;

register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return { shortCircuit: true, url: ${JSON.stringify(tracingModule)} };
    }
    const resolved = await nextResolve(specifier, context);
    // Carry each existing fixture's isolation query into split Worker chunks.
    // Otherwise separate imports of index.js share cache and throttle state.
    if (context.parentURL?.startsWith(${JSON.stringify(workerRoot)}) &&
        resolved.url.startsWith(${JSON.stringify(workerRoot)})) {
      const parent = new URL(context.parentURL);
      const child = new URL(resolved.url);
      if (parent.search && !child.search) {
        child.search = parent.search;
        return { ...resolved, url: child.href };
      }
    }
    return resolved;
  }
`)}`);
