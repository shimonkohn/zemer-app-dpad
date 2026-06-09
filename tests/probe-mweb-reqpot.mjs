// Last lever for "can MWEB be fixed?": does the MWEB /player REQUEST poToken binding change
// whether the returned stream URL crosses the 1-MiB wall? Tries every request-pot x url-pot
// combination and drains past the wall (ExoPlayer-faithful bounded chunks on fresh connections).
// If EVERY combination 403s past 1 MiB while WEB_REMIX (control) streams whole, MWEB is truly dead.
//
//   PLAYER_HASH=69e2a55d node tests/probe-mweb-reqpot.mjs [searchQuery]

import { getCred, describeCred } from "./cred.mjs";
import { createMinter } from "./potoken.mjs";
import { createCipher } from "./cipher.mjs";
import crypto from "node:crypto";

const ORIGIN = "https://music.youtube.com";
const MWEB_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";
const MWEB = { clientName: "MWEB", clientVersion: "2.20260213.00.00", clientId: "2" };
const WEB_REMIX = { clientName: "WEB_REMIX", clientVersion: "1.20260213.01.00", clientId: "67" };
const WALL = 1048576, CHUNK = 262144;

const dec = (s) => { try { return s && /%[0-9A-Fa-f]{2}/.test(s) ? decodeURIComponent(s) : s; } catch { return s; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function sapisidHash(cookie) {
  const m = cookie.match(/(?:^|; )SAPISID=([^;]+)/); if (!m) return null;
  const ts = Math.floor(Date.now() / 1000);
  return `SAPISIDHASH ${ts}_${crypto.createHash("sha1").update(`${ts} ${m[1]} ${ORIGIN}`).digest("hex")}`;
}
async function call(endpoint, client, body, cred) {
  const h = { "Content-Type": "application/json", "User-Agent": MWEB_UA, "X-Goog-Api-Format-Version": "1",
    "X-YouTube-Client-Name": client.clientId, "X-YouTube-Client-Version": client.clientVersion, "X-Origin": ORIGIN,
    Referer: ORIGIN + "/", "X-Goog-Visitor-Id": cred.visitorData, cookie: cred.cookie };
  const a = sapisidHash(cred.cookie); if (a) h.Authorization = a;
  const res = await fetch(`${ORIGIN}/youtubei/v1/${endpoint}?prettyPrint=false`, { method: "POST", headers: h,
    body: JSON.stringify({ context: { client: { clientName: client.clientName, clientVersion: client.clientVersion, gl: "US", hl: "en", visitorData: cred.visitorData } }, ...body }) });
  let j = {}; try { j = JSON.parse(await res.text()); } catch {}
  return j;
}
async function searchSongs(query, cred, max = 10) {
  const j = await call("search", WEB_REMIX, { query, params: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D" }, cred);
  return [...new Set([...JSON.stringify(j).matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]))].slice(0, max);
}
async function playerAudio(client, videoId, sts, cred, reqPot) {
  const body = { videoId, playbackContext: { contentPlaybackContext: { signatureTimestamp: Number(sts) } } };
  if (reqPot) body.serviceIntegrityDimensions = { poToken: reqPot };
  const j = await call("player", client, body, cred);
  if (j?.playabilityStatus?.status !== "OK") return { err: j?.playabilityStatus?.status };
  const audio = (j?.streamingData?.adaptiveFormats || []).filter((f) => (f.mimeType || "").startsWith("audio/"));
  return { audio };
}
function deobf(cipher, f) { let u = f.url || cipher.deobfuscateStreamUrl(f.signatureCipher); return cipher.transformNParamInUrl(u); }
async function chunk(url, s, e, ua) { try { const r = await fetch(url, { headers: { "User-Agent": ua, Range: `bytes=${s}-${e}`, Connection: "close" } }); r.body?.cancel?.(); return r.status; } catch { return "ERR"; } }
async function drain(url, clen, ua) {
  let off = 0, last = -1, n = 0;
  while (off < clen) { const end = Math.min(off + CHUNK - 1, clen - 1); const st = await chunk(url, off, end, ua); n++;
    if (st !== 206 && st !== 200) return { ok: false, failAt: off, last, st }; last = end; off = end + 1; await sleep(120); }
  return { ok: true, n };
}

async function main() {
  const cred0 = await getCred(); console.log(describeCred(cred0));
  const cred = { visitorData: dec(cred0.visitorData), cookie: cred0.cookie };
  const cipher = await createCipher({ verbose: false });
  console.log(`cipher: ${cipher.hash} sts=${cipher.sts} (pinned=${process.env.PLAYER_HASH || "live"})`);
  const minter = await createMinter(cred.visitorData);
  const sessionPot = await minter.mint(cred.visitorData);

  // pick 2 short gated tracks
  const cands = await searchSongs(process.argv[2] || "billboard hot 100", cred);
  const chosen = [];
  for (const v of cands) { if (chosen.length >= 2) break;
    const r = await playerAudio(MWEB, v, cipher.sts, cred, sessionPot);
    const f251 = r.audio?.find((f) => f.itag === 251); const f140 = r.audio?.find((f) => f.itag === 140);
    if (!f251 && !f140) continue;
    let u; try { u = deobf(cipher, f251 || f140); } catch { continue; }
    const clen = Number(new URL(u).searchParams.get("clen")) || 0;
    if (clen > 0 && clen < 6 * 1024 * 1024) chosen.push(v);
  }
  console.log(`tracks: ${chosen.join(" ")}\n`);

  for (const v of chosen) {
    console.log(`=== ${v} ===`);
    const videoPot = await minter.mint(v);
    const reqPots = [["reqPot=none", null], ["reqPot=visitorData", sessionPot], ["reqPot=videoId", videoPot]];
    for (const [rpName, rp] of reqPots) {
      const r = await playerAudio(MWEB, v, cipher.sts, cred, rp);
      if (r.err) { console.log(`  MWEB ${rpName}: playability=${r.err}`); continue; }
      const f = r.audio.find((x) => x.itag === 251) || r.audio.find((x) => x.itag === 140);
      if (!f || (!f.url && !f.signatureCipher)) { console.log(`  MWEB ${rpName}: sabr-only/no-cipher`); continue; }
      let base; try { base = deobf(cipher, f); } catch { console.log(`  MWEB ${rpName}: decipher-fail`); continue; }
      const clen = Number(new URL(base).searchParams.get("clen")) || 0;
      for (const [upName, up] of [["urlPot=none", null], ["urlPot=videoId", videoPot]]) {
        const url = up ? `${base}${base.includes("?") ? "&" : "?"}pot=${encodeURIComponent(up)}` : base;
        const d = await drain(url, clen, MWEB_UA);
        console.log(`  MWEB itag=${f.itag} ${rpName.padEnd(20)} ${upName.padEnd(15)} ${d.ok ? `WHOLE SONG ✓ (${d.n})` : `403 at ${(d.failAt/1024/1024).toFixed(2)}MiB`}`);
        await sleep(300);
      }
    }
    // control
    const wr = await playerAudio(WEB_REMIX, v, cipher.sts, cred, sessionPot);
    const w = wr.audio?.find((x) => x.itag === 251);
    if (w && (w.url || w.signatureCipher)) {
      let b; try { b = deobf(cipher, w); b = `${b}${b.includes("?") ? "&" : "?"}pot=${encodeURIComponent(await minter.mint(v))}`; } catch { b = null; }
      if (b) { const clen = Number(new URL(b).searchParams.get("clen")) || 0; const d = await drain(b, clen, WEB_UA);
        console.log(`  WEB_REMIX-251 reqPot=visitorData urlPot=videoId  ${d.ok ? `WHOLE SONG ✓ (${d.n})` : `403 at ${(d.failAt/1024/1024).toFixed(2)}MiB`}  [CONTROL]`); }
    }
    console.log();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
