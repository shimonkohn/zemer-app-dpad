// Are whitelisted artists actually FINDABLE in the app's artist search? For each whitelisted
// {id, name}, run the app's FILTER_ARTIST search for the name and locate the entry whose browseId
// equals the whitelisted id (the artist themselves). Classify:
//   PARSED            - app surfaces them (toYTItem keeps the entry)            -> good
//   DROPPED:<reason>  - YouTube returned them but the app's parser drops them   -> BUG surface
//                       (notably pageType MUSIC_PAGE_TYPE_USER_CHANNEL, which zemer's is* ignores)
//   NOT_RETURNED      - YouTube didn't return the whitelisted id for this name  -> ranking/YouTube
//
// The whitelist filter keys on the artist id, so a DROPPED/NOT_RETURNED whitelisted artist is simply
// missing from search for the user. Names+ids come from a JSON file (array of {id,name}); no secrets.
//
//   node tests/search/whitelist-findable.mjs [whitelist.json]   # default tests/search/.cache/whitelist.json, N=150
//   N=ALL CONC=6 node tests/search/whitelist-findable.mjs
import fs from "node:fs";
import { postSearch, cred, FILTERS } from "./lib.mjs";
import { toYTItem } from "./parsers.mjs";

const FILE = process.argv[2] || new URL("./.cache/whitelist.json", import.meta.url);
const N = process.env.N || "150";
const CONC = Number(process.env.CONC || 6);

function load() {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8")).filter((x) => x && x.id && x.name);
  if (N === "ALL") return raw;
  const want = Math.min(Number(N), raw.length);
  const stride = Math.max(1, Math.floor(raw.length / want));
  const out = [];
  for (let i = 0; i < raw.length && out.length < want; i += stride) out.push(raw[i]);
  return out;
}

const sectionContents = (j) =>
  j?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? null;
const mrlirsOf = (contents) => {
  const out = [];
  for (const s of contents || []) {
    if (s.musicShelfRenderer) out.push(...(s.musicShelfRenderer.contents || []).map((c) => c.musicResponsiveListItemRenderer).filter(Boolean));
    if (s.itemSectionRenderer) out.push(...(s.itemSectionRenderer.contents || []).map((c) => c.musicResponsiveListItemRenderer).filter(Boolean));
    if (s.musicCardShelfRenderer) { /* card handled separately below */ }
  }
  return out;
};
const browseIdOf = (r) => r?.navigationEndpoint?.browseEndpoint?.browseId ?? null;
const pageTypeOf = (r) =>
  r?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType ?? "(none)";

const tally = { PARSED: 0, NOT_RETURNED: 0 };
const dropped = new Map();      // reason/pageType -> count
const droppedExamples = new Map();
const pageTypes = new Map();     // pageType of the whitelisted entry when returned -> count
const errors = [];

async function probe(a) {
  try {
    const { status, json } = await postSearch({ query: a.name, params: FILTERS.FILTER_ARTIST, visitorData: probe.vd });
    if (status !== 200) { errors.push(`${a.name}: HTTP ${status}`); tally.NOT_RETURNED++; return; }
    const contents = sectionContents(json);
    const cards = (contents || []).filter((c) => c.musicCardShelfRenderer).map((c) => c.musicCardShelfRenderer);
    // the whitelisted entry, found by exact id, among list items...
    let entry = mrlirsOf(contents).find((r) => browseIdOf(r) === a.id);
    // ...or as the top-result card (card.onTap.browseEndpoint.browseId)
    const card = cards.find((cs) => cs.onTap?.browseEndpoint?.browseId === a.id);

    if (!entry && !card) { tally.NOT_RETURNED++; return; }
    if (entry) {
      const pt = pageTypeOf(entry);
      pageTypes.set(pt, (pageTypes.get(pt) || 0) + 1);
      const res = toYTItem(entry);
      if (res.ok && res.kind === "artist") tally.PARSED++;
      else {
        const reason = res.ok ? `parsed as ${res.kind}` : `${res.kind}: ${res.reason}`;
        const key = pt === "MUSIC_PAGE_TYPE_ARTIST" ? reason : `${reason} [pageType=${pt}]`;
        dropped.set(key, (dropped.get(key) || 0) + 1);
        if (!droppedExamples.has(key)) droppedExamples.set(key, `${a.name} (${a.id})`);
      }
    } else {
      // present only as the top-result card; app shows the card, count as parsed-equivalent
      tally.PARSED++;
    }
  } catch (e) { errors.push(`${a.name}: ${e.message}`); }
}

async function pool(items, conc, fn) {
  let i = 0, done = 0;
  const tick = () => { done++; if (done % 10 === 0 || done === items.length) process.stderr.write(`\r  probed ${done}/${items.length}`); };
  await Promise.all(Array.from({ length: conc }, async () => { while (i < items.length) { const idx = i++; await fn(items[idx]); tick(); } }));
  process.stderr.write("\n");
}

async function main() {
  const { visitorData } = await cred();
  probe.vd = visitorData;
  const list = load();
  console.log(`whitelist findability via FILTER_ARTIST — sample ${list.length} of file ${FILE}\n`);
  await pool(list, CONC, probe);

  const totalDropped = [...dropped.values()].reduce((a, b) => a + b, 0);
  const n = list.length;
  const pc = (x) => `${x} (${Math.round((100 * x) / n)}%)`;
  console.log(`\n${"=".repeat(78)}\nWHITELISTED-ARTIST FINDABILITY (artist search)\n${"=".repeat(78)}`);
  console.log(`  PARSED (shown):        ${pc(tally.PARSED)}`);
  console.log(`  DROPPED by parser:     ${pc(totalDropped)}`);
  console.log(`  NOT_RETURNED by YT:    ${pc(tally.NOT_RETURNED)}`);
  console.log(`\n  pageType of the whitelisted entry when YouTube DID return it:`);
  for (const [pt, c] of [...pageTypes.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${pt.padEnd(34)} ${c}`);
  if (dropped.size) {
    console.log(`\n  DROPPED breakdown (these whitelisted artists are returned by YouTube but hidden by the app):`);
    for (const [k, c] of [...dropped.entries()].sort((a, b) => b[1] - a[1]))
      console.log(`    x${String(c).padStart(3)}  ${k}   e.g. ${droppedExamples.get(k)}`);
  }
  if (errors.length) console.log(`\n  errors: ${errors.length}  e.g. ${errors.slice(0, 3).join("; ")}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
