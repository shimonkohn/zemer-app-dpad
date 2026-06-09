// Confirm the MWEB fix: itag 140 (m4a) streams the WHOLE gated song where itag 251 (opus/webm)
// 403s past the 1-MiB wall. For a realistic set of gated ATV tracks, per itag:
//   HEAD(app validateStatus) | GET byte0 | GET past-wall | GET last-1KiB | full drain to clen
// "whole" = last-1KiB is 206/200 AND drain reaches clen. Also reports whether HEAD lies on 140
// (=> validateStatus would still wrongly reject the working m4a stream).
//
//   node tests/probe-mweb-itag140.mjs [searchQuery]

import { getCred, describeCred } from "./cred.mjs";
import { createMinter } from "./potoken.mjs";
import { createCipher } from "./cipher.mjs";
import crypto from "node:crypto";

const ORIGIN = "https://music.youtube.com";
const MWEB_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";
const MWEB = { clientName: "MWEB", clientVersion: "2.20260213.00.00", clientId: "2" };
const WEB_REMIX = { clientName: "WEB_REMIX", clientVersion: "1.20260213.01.00", clientId: "67" };
const WALL = 1048576;

const dec = (s) => { try { return s && /%[0-9A-Fa-f]{2}/.test(s) ? decodeURIComponent(s) : s; } catch { return s; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sapisidHash(cookie) {
  const m = cookie.match(/(?:^|; )SAPISID=([^;]+)/);
  if (!m) return null;
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
  const text = await res.text(); let j = {}; try { j = JSON.parse(text); } catch {}
  return { j, text };
}
async function searchSongs(query, cred, max = 10) {
  const { text } = await call("search", WEB_REMIX, { query, params: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D" }, cred);
  return [...new Set([...text.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]))].slice(0, max);
}
async function mwebPlayer(videoId, sts, cred, reqPot) {
  const { j } = await call("player", MWEB, { videoId, playbackContext: { contentPlaybackContext: { signatureTimestamp: Number(sts) } }, serviceIntegrityDimensions: { poToken: reqPot } }, cred);
  return j;
}
async function get(url, range, ua = MWEB_UA) {
  try { const r = await fetch(url, { headers: { "User-Agent": ua, Range: range } }); r.body?.cancel?.(); return r.status; } catch { return "ERR"; }
}
async function headReq(url) {
  try { const r = await fetch(url, { method: "HEAD", headers: { "User-Agent": WEB_UA } }); return r.status; } catch { return "ERR"; }
}
async function drainToEnd(url, capBytes = 3 * 1024 * 1024) {
  // Drain from byte 0; report bytes read and whether it reached cap (crossed wall cleanly).
  try {
    const r = await fetch(url, { headers: { "User-Agent": MWEB_UA, Range: "bytes=0-" } });
    if (r.status !== 200 && r.status !== 206) return { status: r.status, read: 0 };
    let read = 0; const reader = r.body.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; read += value.length; if (read >= capBytes) { await reader.cancel(); return { status: r.status, read, capped: true }; } }
    return { status: r.status, read, capped: false };
  } catch (e) { return { status: "ERR", read: 0 }; }
}

async function main() {
  const cred0 = await getCred();
  console.log(describeCred(cred0));
  const cred = { visitorData: dec(cred0.visitorData), cookie: cred0.cookie };
  const cipher = await createCipher({ verbose: false });
  console.log(`cipher: ${cipher.hash} sts=${cipher.sts}`);
  const minter = await createMinter(cred.visitorData);
  const sessionPot = await minter.mint(cred.visitorData);

  const query = process.argv[2] || "lofi hip hop";
  const videos = [...new Set([...await searchSongs(query, cred)])];
  console.log(`videos (${videos.length}): ${videos.join(" ")}\n`);

  let n140whole = 0, n251whole = 0, head140lies = 0, considered = 0;

  for (const v of videos) {
    const j = await mwebPlayer(v, cipher.sts, cred, sessionPot);
    if (j?.playabilityStatus?.status !== "OK") { console.log(`${v}  playability=${j?.playabilityStatus?.status}`); continue; }
    const audio = (j?.streamingData?.adaptiveFormats || []).filter((f) => (f.mimeType || "").startsWith("audio/"));
    const f140 = audio.find((f) => f.itag === 140);
    const f251 = audio.find((f) => f.itag === 251);
    if (!f140 && !f251) { console.log(`${v}  no 140/251 (sabr-only?) audio=${audio.length}`); continue; }
    considered++;

    for (const [name, f] of [["140(m4a)", f140], ["251(webm)", f251]]) {
      if (!f || (!f.url && !f.signatureCipher)) { console.log(`${v}  itag ${name}: missing`); continue; }
      let url;
      try { url = f.url || cipher.deobfuscateStreamUrl(f.signatureCipher); url = cipher.transformNParamInUrl(url); }
      catch (e) { console.log(`${v}  itag ${name}: decipher-fail`); continue; }
      const clen = Number(new URL(url).searchParams.get("clen")) || 0;
      const head = await headReq(url);
      const g0 = await get(url, "bytes=0-1023");
      const gWall = await get(url, `bytes=${WALL}-${WALL + 1023}`);
      const gEnd = clen ? await get(url, `bytes=${Math.max(0, clen - 1024)}-${clen - 1}`) : "?";
      const drain = await drainToEnd(url, Math.min(clen || 3e6, 3 * 1024 * 1024));
      const whole = (gEnd === 206 || gEnd === 200) && (drain.status === 206 || drain.status === 200) && drain.read > WALL;
      if (whole && name.startsWith("140")) n140whole++;
      if (whole && name.startsWith("251")) n251whole++;
      if (name.startsWith("140") && head === 403 && (g0 === 206 || g0 === 200)) head140lies++;
      console.log(`${v}  itag ${name.padEnd(10)} HEAD=${String(head).padEnd(4)} GET0=${String(g0).padEnd(4)} wall=${String(gWall).padEnd(4)} end=${String(gEnd).padEnd(4)} drain=${drain.status}/${(drain.read/1024/1024).toFixed(1)}MiB${drain.capped?"(cap)":""} clen=${(clen/1024/1024).toFixed(1)}MiB  whole=${whole ? "YES" : "no"}`);
    }
    await sleep(400);
    console.log();
  }

  console.log(`=== SUMMARY (${considered} gated tracks) ===`);
  console.log(`itag 140 (m4a) delivered WHOLE song: ${n140whole}/${considered}`);
  console.log(`itag 251 (webm) delivered WHOLE song: ${n251whole}/${considered}`);
  console.log(`itag 140 HEAD=403 while GET worked (validateStatus false-negative): ${head140lies}/${considered}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
