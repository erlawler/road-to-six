# Build plugin glob adapter

This private package replaces only the `fast-glob` dependency of
`vite-plugin-dynamic-import@1.6.0`, used by vinext's CommonJS transform.
That plugin calls only `sync(patterns, { cwd })`. Tinyglobby provides the
equivalent synchronous file matching API without the vulnerable
`fast-glob -> micromatch -> braces` chain.

As of October 5, 2026, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
affects every published Braces version and has no patched release.
The npm override is restricted to this exact plugin version. This is not a
general replacement for the full fast-glob API, and an upstream plugin update
must be reviewed before extending the override.

The adapter uses Tinyglobby 0.2.17, already present in the Vite dependency tree.
An explicit local dev dependency gives npm a root-relative link; the scoped
override references that dependency so `npm ci` installs the same adapter.
Integration tests exercise the actual installed dynamic import and CommonJS
plugins, including extension alternatives, directory index resolution, nested
paths, hidden-file exclusion, and missing modules. The full application build
and test suite also run through vinext. The normal npm audit gate remains active
for all dependencies.

Remove this adapter and its override when the upstream plugin removes the
vulnerable dependency or Braces publishes a compatible patched release. Then
regenerate the lockfile and rerun the integration tests and full CI checks.
