// Loader for the SINGLE source of truth for player cipher configs:
//   cipher/library/src/main/assets/player_configs.json   (zemer-cipher submodule)
//
// That one file is (1) bundled in the APK as the offline default, (2) fetched raw from
// GitHub by running apps (PlayerConfigStore) so rotation fixes need no APK update, and
// (3) read here by the harness — so app, devices, and tests can never drift apart.
//
// Validation mirrors PlayerConfigParser.kt. Unlike the app (which skips bad entries and
// keeps playing), the harness THROWS on any violation — in tests, loud is right.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CONFIG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "cipher", "library", "src", "main", "assets", "player_configs.json",
);

const SUPPORTED_SCHEMA_VERSION = 1;
const SIG_RE = /^[A-Za-z0-9$_]{1,8}\(\d+,\d+,INPUT\)$/;
const NCLASS_RE = /^[A-Za-z0-9$_]{1,8}$/;
const HASH_RE = /^[a-f0-9]{8}$/;

export function nTrick(urlClass) {
  // The app's nJsExpression (PlayerConfigParser.buildNJsExpression): parse a fake
  // googlevideo URL with the player's own URL class and read back the transformed "n".
  return `(function(n){try{var u=new g.${urlClass}('https://x.googlevideo.com/videoplayback?n='+n,true);var t=u.get('n');return(t&&t!==n)?t:n;}catch(e){return n;}})(INPUT)`;
}

/** Raw, validated file content: { hash: { sig, nClass, sts, aliases } } keyed by primary hash. */
export function loadRawPlayerConfigs() {
  const root = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    throw new Error("player_configs.json: root is not an object");
  }
  if (!Number.isInteger(root.schemaVersion) || root.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`player_configs.json: unsupported schemaVersion ${root.schemaVersion}`);
  }
  if (root.players === null || typeof root.players !== "object" || Array.isArray(root.players)) {
    throw new Error("player_configs.json: players missing or not an object");
  }
  for (const [hash, entry] of Object.entries(root.players)) {
    if (!HASH_RE.test(hash)) throw new Error(`player_configs.json: bad hash key "${hash}"`);
    if (!SIG_RE.test(entry.sig)) throw new Error(`player_configs.json: ${hash}: bad sig "${entry.sig}"`);
    if (!NCLASS_RE.test(entry.nClass)) throw new Error(`player_configs.json: ${hash}: bad nClass "${entry.nClass}"`);
    if (!Number.isInteger(entry.sts) || entry.sts <= 0) throw new Error(`player_configs.json: ${hash}: bad sts ${entry.sts}`);
    for (const alias of entry.aliases ?? []) {
      if (!HASH_RE.test(alias)) throw new Error(`player_configs.json: ${hash}: bad alias "${alias}"`);
    }
  }
  return root.players;
}

/**
 * Alias-expanded map in the shape the harness ciphers consume:
 *   { <hash-or-alias>: { sigExpr, nExpr, sts } }
 */
export function loadKnownPlayerConfigs() {
  const out = {};
  for (const [hash, entry] of Object.entries(loadRawPlayerConfigs())) {
    const cfg = { sigExpr: entry.sig, nExpr: nTrick(entry.nClass), sts: entry.sts };
    out[hash] = cfg;
    for (const alias of entry.aliases ?? []) out[alias] = cfg;
  }
  return out;
}
