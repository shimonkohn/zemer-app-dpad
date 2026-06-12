// Generate player_dates.json from the git history of player_configs.json: the "added" date of
// each player hash is the commit date its entry first landed in the cipher repo. This keeps the
// (cosmetic) dates file from ever drifting — re-run it whenever a player is onboarded.
//
//   node tests/gen-player-dates.mjs
//
// player_dates.json is a SEPARATE file from player_configs.json on purpose: older app versions
// never fetch it, so it cannot affect them; and a mistake here only changes a UI label, never
// deciphering.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const CIPHER = "cipher";
const CONFIG = "library/src/main/assets/player_configs.json";
// Repo root (NOT under src/main/assets) on purpose: this file is fetched by URL, never bundled
// into the APK. Raw URL: https://raw.githubusercontent.com/ZemerTeam/zemer-cipher/master/player_dates.json
const DATES = "player_dates.json";

const cfg = JSON.parse(readFileSync(`${CIPHER}/${CONFIG}`, "utf8"));
const hashes = Object.keys(cfg.players || {});

const dates = {};
for (const hash of hashes) {
  // -S<hash> --reverse: the first commit that changed the count of `hash` is the one that added it.
  const out = execFileSync(
    "git",
    ["-C", CIPHER, "log", "--reverse", "-S", hash, "--date=short", "--format=%ad", "--", CONFIG],
    { encoding: "utf8" },
  );
  const date = out.split("\n").find(Boolean);
  if (date) dates[hash] = date;
  else console.error(`WARN: no commit found that adds ${hash}`);
}

writeFileSync(`${CIPHER}/${DATES}`, JSON.stringify(dates, null, 2) + "\n");
console.log(`wrote ${Object.keys(dates).length} dates -> ${CIPHER}/${DATES}`);
