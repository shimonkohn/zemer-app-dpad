// Hard-data check: run zemer-cipher's FunctionNameExtractor regexes (ported verbatim
// from FunctionNameExtractor.kt) against the live player JS to see whether the cipher
// can actually extract the signature + n-transform functions for the CURRENT player.
//
//   node tests/cipher-check.mjs            (expects /tmp/player_base.js)
import fs from "node:fs";

const PATH = process.env.PLAYER_JS || "/tmp/player_base.js";
const js = fs.readFileSync(PATH, "utf8");
console.log(`player.js: ${js.length} bytes (${PATH})\n`);

// --- Q-array obfuscation (the thing the cipher was updated for, on player 74edf1a3) ---
const Q_ARRAY = /var\s+Q\s*=\s*"[^"]+"\s*\.\s*split\s*\(\s*"\}"\s*\)/;
const qMatch = js.match(Q_ARRAY);
console.log(`Q-array obfuscation: ${qMatch ? "YES" : "no"}`);
console.log(`"enhanced_except_" present: ${/enhanced_except_/.test(js)}`);
console.log(`'.get("n")' present: ${/\.get\("n"\)/.test(js)}\n`);

// --- SIG function patterns (verbatim from FunctionNameExtractor.SIG_FUNCTION_PATTERNS) ---
const SIG = [
  /&&\s*\(\s*[a-zA-Z0-9$]+\s*=\s*([a-zA-Z0-9$]+)\s*\(\s*(\d+)\s*,\s*decodeURIComponent\s*\(\s*[a-zA-Z0-9$]+\s*\)/,
  /\b[cs]\s*&&\s*[adf]\.set\([^,]+\s*,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(/,
  /\b[a-zA-Z0-9]+\s*&&\s*[a-zA-Z0-9]+\.set\([^,]+\s*,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(/,
  /\bm=([a-zA-Z0-9$]{2,})\(decodeURIComponent\(h\.s\)\)/,
  /\bc\s*&&\s*d\.set\([^,]+\s*,\s*(?:encodeURIComponent\s*\()([a-zA-Z0-9$]+)\(/,
  /\bc\s*&&\s*[a-z]\.set\([^,]+\s*,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(/,
];
console.log("--- SIG function patterns ---");
let sigName = null;
SIG.forEach((re, i) => {
  const m = js.match(re);
  if (m && !sigName) sigName = m[1];
  console.log(`  [${i}] ${m ? `MATCH name=${m[1]} arg=${m[2] ?? "-"}` : "no match"}`);
});
console.log(`SIG extracted: ${sigName ? `YES (${sigName})` : "NO"}\n`);

// --- N function patterns (verbatim from N_FUNCTION_PATTERNS) ---
const N = [
  /\.get\("n"\)\)&&\(b=([a-zA-Z0-9$]+)(?:\[(\d+)\])?\(([a-zA-Z0-9])\)/,
  /\.get\("n"\)\)\s*&&\s*\(([a-zA-Z0-9$]+)\s*=\s*([a-zA-Z0-9$]+)(?:\[(\d+)\])?\(\1\)/,
  /\(\s*([a-zA-Z0-9$]+)\s*=\s*String\.fromCharCode\(110\)/,
  /([a-zA-Z0-9$]+)\s*=\s*function\([a-zA-Z0-9]\)\s*\{[^}]*?enhanced_except_/,
];
console.log("--- N function patterns ---");
let nName = null;
N.forEach((re, i) => {
  const m = js.match(re);
  if (m && !nName) nName = m[1];
  console.log(`  [${i}] ${m ? `MATCH groups=${JSON.stringify(m.slice(1))}` : "no match"}`);
});
console.log(`N extracted: ${nName ? `YES (${nName})` : "NO"}\n`);

// --- signatureTimestamp ---
const STS = [/signatureTimestamp['":\s]+(\d+)/, /sts['":\s]+(\d+)/, /"signatureTimestamp"\s*:\s*(\d+)/];
let sts = null;
for (const re of STS) { const m = js.match(re); if (m) { sts = m[1]; break; } }
console.log(`signatureTimestamp: ${sts ?? "NOT FOUND"}`);

// --- player hash extraction (mirrors FunctionNameExtractor.extractPlayerHash) ---
const HASH_PATS = [
  /jsUrl['":\s]+[^"']*?\/player\/([a-f0-9]{8})\//,
  /player_ias\.vflset\/[^/]+\/([a-f0-9]{8})\//,
  /\/s\/player\/([a-f0-9]{8})\//,
];
let playerVer = null;
for (const re of HASH_PATS) { const m = js.match(re); if (m) { playerVer = m[1]; break; } }
if (!playerVer) {
  // MD5 fallback (first 10000 bytes)
  const { createHash } = await import("node:crypto");
  const buf = Buffer.from(js.slice(0, 10000));
  playerVer = createHash("md5").update(buf).digest("hex").slice(0, 8);
}
console.log(`\ndetected player hash: ${playerVer}`);

// --- hardcoded fallback availability ---
// Loaded from cipher/library/src/main/assets/player_configs.json — the single source of truth
// the app bundles, devices fetch remotely, and the rest of the harness reads.
const { loadKnownPlayerConfigs } = await import("./player-configs.mjs");
const KNOWN = Object.keys(loadKnownPlayerConfigs());
console.log(`hardcoded config for ${playerVer}: ${KNOWN.includes(playerVer) ? "YES" : "NO (only " + KNOWN.join(", ") + ")"}`);

console.log("\n=== VERDICT ===");
const ok = sigName || KNOWN.includes(playerVer);
const nOk = nName || KNOWN.includes(playerVer);
if (ok && nOk) console.log(`Cipher OK for ${playerVer}: sig=${sigName ?? "hardcoded"}, n=${nName ?? "hardcoded"}, sts=${sts}`);
else console.log(`Cipher FAIL for ${playerVer}: sig=${ok ? "ok" : "FAIL"}, n=${nOk ? "ok" : "FAIL"} — add to cipher/library/src/main/assets/player_configs.json`);
