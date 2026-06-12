// ROOT-CAUSE probe for "albums on the channel page but none in search".
//
// Finding: YouTube's search chip cloud no longer offers an "Albums" facet for these (independent)
// artists, so the album filter returns "No results" — while the artist's /browse page still lists
// every album. This probe documents that, and tests whether the app's STALE params (old trailing
// context segment) vs YouTube's CURRENT one makes any difference (it shouldn't, if the facet is gone).
//
//   node tests/search/album-facet-probe.mjs ["Artist Name"]
import { searchDiag, chipParams, albumCount, sectionList, sleep, diagCred } from "./diag-auth.mjs";

const HARDCODED = "EgWKAQIYAWoKEAkQChAFEAMQBA%3D%3D";     // app's FILTER_ALBUM (old context segment)
const NEWCTX = "EgWKAQIYAWoOEAUQAxAKEAQQEBAVEBE%3D";      // album type + the context segment live chips use now
const hasMsg = (j) => JSON.stringify(sectionList(j)?.contents || []).includes('"messageRenderer"');

async function chips(name) {
  const r = await searchDiag(name);
  if (r.blocked) { console.log(`  ${name}: RATE-LIMITED`); return null; }
  const cm = chipParams(r.j);
  console.log(`  ${name.padEnd(20)} chips: ${JSON.stringify(Object.keys(cm))}`);
  return cm;
}
async function albums(name, params, label) {
  const r = await searchDiag(name, { params, auth: true });
  if (r.blocked) { console.log(`  ${name} [${label}]: RATE-LIMITED`); return; }
  console.log(`  ${name.padEnd(20)} ALBUM [${label.padEnd(12)}] -> albums=${albumCount(r.j)}  noResults=${hasMsg(r.j)}`);
}

const target = process.argv[2] || "Mordechai Shapiro";
const { source } = await diagCred();
console.log(`cred=${source ? "yes" : "no"}\n--- which artists get an "Albums" chip? ---`);
const tsChips = await chips("Taylor Swift"); await sleep(8000);          // mainstream control
const targetChips = await chips(target); await sleep(8000);             // whitelisted artist
console.log(`\n  Taylor Swift offers Albums chip: ${tsChips ? "Albums" in tsChips : "?"}`);
console.log(`  ${target} offers Albums chip:   ${targetChips ? "Albums" in targetChips : "?"}`);

console.log(`\n--- does album search return anything? old params vs YouTube's current context ---`);
await albums(target, HARDCODED, "app/old"); await sleep(8000);
await albums(target, NEWCTX, "live-context"); await sleep(8000);
await albums("Taylor Swift", HARDCODED, "control");
console.log(`\nIf both ${target} variants are 0 while Taylor Swift works AND only Taylor Swift gets an`);
console.log(`Albums chip, the root cause is: YouTube dropped the album facet from SEARCH for these`);
console.log(`artists (params are irrelevant). Albums live only on the artist /browse page now.`);
