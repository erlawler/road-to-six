import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateFootballSnapshot } from "../lib/football-validation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.replace(/^--/, "").split("=");
  return [key, rest.join("=")];
}));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const snapshot = await readJson(resolve(root, args.snapshot ?? "app/data/nfl-snapshot.json"));
const sourceMetadata = await readJson(resolve(root, args["source-metadata"] ?? "app/data/source-manifest.json"));
const evaluationText = await readFile(resolve(root, args.evaluation ?? "app/data/model-evaluation.json"), "utf8");
const hash = (value) => createHash("sha256").update(value).digest("hex");
// The checked-in fallback is a dated artifact. Its validation reference must
// follow both the official review and the final raw-input retrieval.
const verificationTime = Math.max(Date.parse(snapshot.season.verifiedAt),
  ...["games", "roster", "stats"].map((key) => Date.parse(snapshot.manifest.inputs[key].retrievedBetween.end)),
  Date.parse(snapshot.manifest.reviewedAt ?? snapshot.season.verifiedAt));
assert.ok(Number.isFinite(verificationTime) && verificationTime <= Date.now(), "Snapshot verification cannot be in the future");
const validationTime = "at-verification" in args ? verificationTime : Date.now();
await validateFootballSnapshot(snapshot, sourceMetadata, evaluationText, validationTime);
for (const key of ["games", "roster", "stats"]) if (args[key]) assert.equal(hash(await readFile(args[key])), snapshot.manifest.inputs[key].sha256, `${key} raw input checksum mismatch`);
console.log(`Validated ${"at-verification" in args ? "dated fallback at its recorded verification time; live D1 freshness is checked by the updater" : "current snapshot"} ${snapshot.dataVersion}: ${snapshot.schedule.length} games, ${snapshot.players.length} featured players; model ${snapshot.ratingsMetadata.modelVersion}`);
