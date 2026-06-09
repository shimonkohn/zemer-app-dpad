// Is there ACTUALLY a new player_ias, or was 16ee6936 a transient A/B variant?
// Checks every source the app/monitor could use, several times, and reports the distribution.
//
//   node tests/check-live-player.mjs

import crypto from "node:crypto";

const UA_WEB = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";
const KNOWN = new Set(["9c249f6f", "a6fc27c5", "4f38b487", "1215646b", "5cabb421", "94f9ca52", "9d2ef9ef", "6fb43da5", "69e2a55d", "70d8066f", "74edf1a3"]);

async function text(url, ua = UA_WEB) {
  const r = await fetch(url, { headers: { "User-Agent": ua } });
  return { status: r.status, body: r.ok ? await r.text() : "" };
}
function hashFrom(body) {
  const m = body.match(/\\?\/s\\?\/player\\?\/([a-zA-Z0-9_-]{8})\\?\//);
  return m ? m[1] : null;
}

async function iframeApi() {
  const { body } = await text("https://www.youtube.com/iframe_api");
  return hashFrom(body);
}
async function watchPage(videoId) {
  const { body } = await text(`https://www.youtube.com/watch?v=${videoId}`);
  const m = body.match(/\/s\/player\/([a-z0-9]{8})\/player_ias/);
  return m ? m[1] : null;
}
async function musicPage() {
  const { body } = await text("https://music.youtube.com/");
  const m = body.match(/\/s\/player\/([a-z0-9]{8})\//);
  return m ? m[1] : null;
}
async function playerExists(hash) {
  for (const locale of ["en_GB", "en_US"]) {
    const r = await fetch(`https://www.youtube.com/s/player/${hash}/player_ias.vflset/${locale}/base.js`, { headers: { "User-Agent": UA_WEB } });
    if (r.ok) {
      const js = await r.text();
      const md5 = crypto.createHash("md5").update(Buffer.from(js.slice(0, 10000), "utf8")).digest("hex").slice(0, 8);
      const sts = (js.match(/signatureTimestamp[':\s"]+(\d{4,6})/) || [])[1];
      return { ok: true, locale, size: js.length, md5, sts };
    }
  }
  return { ok: false };
}

async function main() {
  console.log("=== iframe_api (what cipher.mjs/PlayerJsFetcher uses) x6 ===");
  const seen = {};
  for (let i = 0; i < 6; i++) {
    const h = await iframeApi();
    seen[h] = (seen[h] || 0) + 1;
    process.stdout.write(`${h}${KNOWN.has(h) ? "(known)" : "(NEW?)"} `);
  }
  console.log(`\n  distribution: ${Object.entries(seen).map(([k, v]) => `${k}=${v}`).join("  ")}`);

  console.log("\n=== watch page x3 (each a different video) ===");
  for (const v of ["dQw4w9WgXcQ", "JTF9fLJvniI", "kJQP7kiw5Fk"]) {
    const h = await watchPage(v);
    console.log(`  ${v}: ${h}${h && KNOWN.has(h) ? " (known)" : " (NEW?)"}`);
  }

  console.log("\n=== music.youtube.com homepage ===");
  const mh = await musicPage();
  console.log(`  ${mh || "no hash found"}${mh && KNOWN.has(mh) ? " (known)" : mh ? " (NEW?)" : ""}`);

  console.log("\n=== does 16ee6936 base.js actually exist? ===");
  const exists = await playerExists("16ee6936");
  console.log(`  16ee6936: ${exists.ok ? `EXISTS (${exists.locale}, ${exists.size}B, md5=${exists.md5}, sts=${exists.sts})` : "404 — not a real player"}`);

  const allHashes = new Set([...Object.keys(seen)]);
  const newOnes = [...allHashes].filter((h) => h && !KNOWN.has(h));
  console.log(`\n=== VERDICT ===`);
  if (newOnes.length === 0) {
    console.log(`iframe_api currently serves only KNOWN players. 16ee6936 was NOT seen this run — likely a transient A/B variant, not a rotation. Consistent with the monitor not emailing.`);
  } else {
    console.log(`iframe_api served NEW hash(es): ${newOnes.join(", ")} — a real rotation; cipher config needed.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
