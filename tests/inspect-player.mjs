// Print the real cipher landmarks in a base.js so we can see how sig/n are dispatched,
// then write a correct extractor. Compares a known player to the new one.
//
//   node tests/inspect-player.mjs <hash> [knownSigFunc] [knownNClass]
//   node tests/inspect-player.mjs 69e2a55d Jf iE

const hash = process.argv[2];
const knownSig = process.argv[3]; // e.g. Jf
const knownN = process.argv[4];   // e.g. iE

const r = await fetch(`https://www.youtube.com/s/player/${hash}/player_ias.vflset/en_GB/base.js`, { headers: { "User-Agent": "Mozilla/5.0" } });
const js = await r.text();
console.log(`# ${hash}  size=${js.length}`);

function show(label, idx, before = 60, after = 120) {
  if (idx < 0) { console.log(`\n## ${label}: NOT FOUND`); return; }
  console.log(`\n## ${label} @${idx}:\n…${js.slice(Math.max(0, idx - before), idx + after).replace(/\n/g, "⏎")}…`);
}

// 1) The URL-assembler: function(url, sp, s) that builds the final media URL. Landmark: it
//    sets the signature param. yt-dlp finds it via the ("alr","yes") or the .set(sp, enc(...)).
show(`signatureTimestamp`, js.search(/signatureTimestamp/));
show(`("alr","yes") assembler`, js.search(/"alr"/));

// 2) The .get("n") site — n-transform application.
const getN = js.search(/\.get\("n"\)/);
show(`.get("n") site`, getN, 220, 60);

// 3) If we know the sig func name, show where it's defined and called.
if (knownSig) {
  // definition: knownSig=function( ... ){ ... }
  const def = js.search(new RegExp(`${knownSig}\\s*=\\s*function`));
  show(`${knownSig} definition`, def, 10, 160);
  // a call site with two int args
  const call = js.search(new RegExp(`${knownSig}\\(\\d+,\\d+,`));
  show(`${knownSig}(int,int,...) call`, call, 80, 60);
}

// 4) If we know the n class, show how it's used with get("n").
if (knownN) {
  const nuse = js.search(new RegExp(`new ${knownN}\\(`));
  show(`new ${knownN}( use`, nuse, 40, 100);
  const nuse2 = js.search(new RegExp(`g\\.${knownN}`));
  show(`g.${knownN} ref`, nuse2, 60, 80);
  // how many times the class name appears
  const cnt = (js.match(new RegExp(`\\b${knownN}\\b`, "g")) || []).length;
  console.log(`\n## ${knownN} appears ${cnt}x`);
}
