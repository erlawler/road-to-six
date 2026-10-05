import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const vinextRequire = createRequire(import.meta.resolve("vinext"));
const commonjsPath = vinextRequire.resolve("vite-plugin-commonjs");
const commonjsRequire = createRequire(commonjsPath);
const dynamicImportPath = commonjsRequire.resolve("vite-plugin-dynamic-import");

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "road-to-six-glob-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const modules = {
    "alpha.mjs": "alpha",
    "beta.js": "beta",
    "nested/gamma.mjs": "gamma",
    "directory/index.js": "directory",
    ".hidden.mjs": "hidden",
    ".private/secret.mjs": "secret",
  };
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  for (const [file, value] of Object.entries(modules)) {
    const path = join(root, "modules", file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `export default ${JSON.stringify(value)};`);
  }
  // A directory ending in a module extension must not become an import target.
  await mkdir(join(root, "modules", "not-a-file.mjs"));
  return root;
}

function config(root) {
  return {
    root,
    resolve: { extensions: [".mjs", ".js"], alias: [] },
    optimizeDeps: {},
    createResolver: () => async () => undefined,
  };
}

async function transform(plugin, root, source) {
  plugin.configResolved(config(root));
  const path = join(root, "entry.mjs");
  const result = await plugin.transform(source, path);
  assert.ok(result?.code, "the installed plugin must transform variable imports");
  assert.doesNotMatch(result.code, /hidden|private|not-a-file/);
  await writeFile(path, result.code);
  return import(pathToFileURL(path).href);
}

for (const mode of ["CommonJS", "ESM"]) {
  test(`installed dynamic import plugin resolves extensionless and nested files via ${mode}`, async (t) => {
    const root = await fixture(t);
    const pluginModule = mode === "CommonJS"
      ? commonjsRequire("vite-plugin-dynamic-import")
      : await import(pathToFileURL(dynamicImportPath.replace(/index\.js$/, "index.mjs")).href);
    const { load } = await transform(pluginModule.default(), root,
      'export const load = (name) => import(`./modules/${name}`);');
    for (const [name, expected] of [["alpha", "alpha"], ["beta.js", "beta"],
      ["nested/gamma", "gamma"], ["directory", "directory"]]) {
      assert.equal((await load(name)).default, expected);
    }
    await assert.rejects(load("missing"), /Unknown variable dynamic import/);
    await assert.rejects(load(".hidden"), /Unknown variable dynamic import/);
  });
}

test("vinext CommonJS plugin preserves variable require resolution", async (t) => {
  const root = await fixture(t);
  const { default: commonjs } = await import(pathToFileURL(commonjsPath.replace(/index\.js$/, "index.mjs")).href);
  const { load } = await transform(commonjs(), root,
    'export const load = (name) => require(`./modules/${name}`);');
  for (const [name, expected] of [["alpha", "alpha"], ["beta", "beta"],
    ["nested/gamma.mjs", "gamma"], ["directory", "directory"]]) {
    assert.equal(load(name).default, expected);
  }
  assert.throws(() => load("missing"), /found module: \.\/modules\/missing/);
});
