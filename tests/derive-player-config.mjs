// Derive the cipher config (sigExpr, nClass, sts) for a rotated player_ias.
//
// Reliable landmark (verified against 4 known players): the media-URL assembler
//     ...=new g.<NCLASS>(P,!0); P.set("alr","yes");
//        K&&(K=<SIGFUNC>(a,b,<DECODE>(c,d,K)), P[..](L,<other>(..,K))); return P
// gives BOTH unknowns:
//   nClass  = the g.<NCLASS> used here (same class CVy uses for .get("n"))
//   sigExpr = <SIGFUNC>(a,b,INPUT)  — INPUT replaces <DECODE>(...) because CipherDeobfuscator
//             already URI-decodes the signature before the WebView runs the expression.
//   sts     = signatureTimestamp:NNNNN
//
//   node tests/derive-player-config.mjs <hash> [<hash> ...]
//   node tests/derive-player-config.mjs --selfcheck            # validate on known players
//   node tests/derive-player-config.mjs 16ee6936               # derive the new one

import crypto from "node:crypto";

const PLAYER_JS_URL = (h) => `https://www.youtube.com/s/player/${h}/player_ias.vflset/en_GB/base.js`;
const md5hash4 = (s) => crypto.createHash("md5").update(Buffer.from(s.slice(0, 10000), "utf8")).digest("hex").slice(0, 8);

const KNOWN = {
  "4f38b487": { sig: "Tl(48,5831,INPUT)", n: "W_", sts: 20602 },
  "5cabb421": { sig: "Qp(25,37,INPUT)", n: "W1", sts: 20606 },
  "9d2ef9ef": { sig: "v0(35,4499,INPUT)", n: "uY", sts: 20607 },
  "69e2a55d": { sig: "Jf(20,3699,INPUT)", n: "iE", sts: 20611 },
};

async function fetchJs(hash) {
  const r = await fetch(PLAYER_JS_URL(hash), { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`fetch ${hash}: HTTP ${r.status}`);
  return r.text();
}

function deriveFromJs(js) {
  const sts = Number((js.match(/signatureTimestamp[':\s"]+(\d{4,6})/) || [])[1]) || null;

  // Locate the assembler window around the ("alr","yes") landmark.
  const alr = js.indexOf('.set("alr","yes")');
  let nClass = null, sigExpr = null, decodeWrap = null;
  if (alr >= 0) {
    const win = js.slice(Math.max(0, alr - 80), alr + 160);
    // n-class: `new g.<NCLASS>(<var>,!0)` immediately before the alr set
    const nm = win.match(/new\s+g\.([A-Za-z0-9$_]{2,5})\s*\([^,()]+,\s*!0\s*\)\s*;\s*[A-Za-z0-9$_]+\.set\("alr","yes"\)/);
    if (nm) nClass = nm[1];
    // sig: `<SIGFUNC>(a,b,<DECODE>(c,d, <var>))` just after the alr set
    const sm = win.slice(win.indexOf('"alr"')).match(/([A-Za-z0-9$_]{2,5})\((\d+),(\d+),\s*([A-Za-z0-9$_]{2,5})\((\d+),(\d+),/);
    if (sm) { sigExpr = `${sm[1]}(${sm[2]},${sm[3]},INPUT)`; decodeWrap = `${sm[4]}(${sm[5]},${sm[6]},…)`; }
  }

  // Confirm nClass is the n-transform class: it must also appear as `new g.<NCLASS>(...).get("n")`.
  let nClassConfirmed = false;
  if (nClass) {
    nClassConfirmed = new RegExp(`new\\s+g\\.${nClass}\\([^)]*\\)\\)?\\s*\\.\\s*get\\("n"\\)`).test(js) ||
      new RegExp(`g\\.${nClass}\\b`).test(js) && new RegExp(`\\.get\\("n"\\)`).test(js);
  }

  return { sts, nClass, nClassConfirmed, sigExpr, decodeWrap };
}

async function analyze(hash) {
  const js = await fetchJs(hash);
  const urlHash = (js.match(/\/s\/player\/([a-f0-9]{8})\//) || [])[1] || hash;
  const md5 = md5hash4(js);
  const d = deriveFromJs(js);
  const k = KNOWN[hash];
  console.log(`\n===== ${hash}  size=${js.length}  md5Alias=${md5}  sts=${d.sts} =====`);
  console.log(`  sigExpr = ${d.sigExpr}   (decode wrapper stripped: ${d.decodeWrap})`);
  console.log(`  nClass  = ${d.nClass}   (confirmed via .get("n"): ${d.nClassConfirmed})`);
  if (k) {
    const ok = d.sigExpr === k.sig && d.nClass === k.n && d.sts === k.sts;
    console.log(`  SELF-CHECK: ${ok ? "✓ ALL MATCH" : "✗ MISMATCH"}` +
      (ok ? "" : `  want sig=${k.sig} n=${k.n} sts=${k.sts}`));
    return { ok };
  }
  console.log(`  >>> NEW CONFIG: urlHash=${urlHash}  md5Alias=${md5}`);
  console.log(`      sigJsExpression = "${d.sigExpr}"`);
  console.log(`      nClass          = "${d.nClass}"  sts = ${d.sts}`);
  return { hash, urlHash, md5, ...d };
}

const args = process.argv.slice(2);
const hashes = args.includes("--selfcheck") ? Object.keys(KNOWN) : args;
if (!hashes.length) { console.error("usage: node tests/derive-player-config.mjs <hash>... | --selfcheck"); process.exit(1); }
let allOk = true;
for (const h of hashes) {
  try { const r = await analyze(h); if (KNOWN[h] && !r.ok) allOk = false; }
  catch (e) { console.error(`${h}: ${e.message}`); allOk = false; }
}
if (hashes.every((h) => KNOWN[h])) console.log(`\n${allOk ? "✓ extractor validated on all known players" : "✗ extractor FAILED self-check — do not trust derived configs"}`);
