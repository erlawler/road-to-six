import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFootballSnapshot } from "../lib/football-builder.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  }),
);

const gamesPath = args.games ?? "/tmp/road-to-six-games.csv";
const rosterPath = args.roster ?? "/tmp/road-to-six-roster.csv";
const statsPath = args.stats ?? "/tmp/road-to-six-player-stats-2025.csv";
const outputPath = resolve(root, args.output ?? "app/data/nfl-snapshot.json");
const snapshotAsOf = args["as-of"];
const evaluationOutputPath = resolve(args["evaluation-output"] ?? resolve(dirname(outputPath), "model-evaluation.json"));

if (!snapshotAsOf) throw new Error("Provide the source validation date with --as-of=YYYY-MM-DD");
const metadata = args["source-metadata"] ? JSON.parse(await readFile(args["source-metadata"], "utf8")) : { inputs: {} };
const [gamesText, rosterText, statsText] = await Promise.all([readFile(gamesPath, "utf8"), readFile(rosterPath, "utf8"), readFile(statsPath, "utf8")]);
const { snapshot, evaluation, evaluationText } = await buildFootballSnapshot({ gamesText, rosterText, statsText, snapshotAsOf, forecastSeason: args.season ? Number(args.season) : undefined, metadata });
await mkdir(dirname(outputPath), { recursive: true });
await mkdir(dirname(evaluationOutputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
await writeFile(evaluationOutputPath, evaluationText, "utf8");
console.log(`Wrote ${outputPath}; validation ${snapshot.manifest.validationStatus}; ${evaluation.records.length} evaluated games`);
