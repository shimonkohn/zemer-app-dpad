// MWEB verdict probe — the definitive characterisation, GET-based (HEAD is a false-negative trap).
//
// Establishes, across a realistic set of YouTube *Music* tracks (ATV art tracks, seeded from a
// real music search) plus a couple of OMV official videos:
//   1. How often MWEB returns a usable ciphered URL vs sabr-only (no signatureCipher) — the
//      art-track case the app actually plays.
//   2. For the ciphered ones: GET at byte 0 and GET past the 1-MiB wall, under each url-pot
//      binding (none / videoId / visitorData) — does ANY pot cross MWEB's wall?
//   3. WEB_REMIX head-to-head on the SAME videos with its known-good videoId-pot, to show
//      whether MWEB ever delivers a whole song that WEB_REMIX/the direct-url clients don't.
//   4. HEAD vs GET divergence — quantify the validateStatus false-negative.
//
//   node tests/probe-mweb-verdict.mjs [searchQuery]

import { getCred, describeCred } from "./cred.mjs";
import { createMinter } from "./potoken.mjs";
import { createCipher } from "./cipher.mjs";
import crypto from "node:crypto";

const ORIGIN = "https://music.youtube.com";
const MWEB_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";
const MWEB = { clientName: "MWEB", clientVersion: "2.20260213.00.00", clientId: "2", ua: MWEB_UA, login: true };
const WEB_REMIX = { clientName: "WEB_REMIX", clientVersion: "1.20260213.01.00", clientId: "67", ua: WEB_UA, login: true };
const WALL = 1048576;

const dec = (s) => { try { return s && /%[0-9A-Fa-f]{2}/.test(s) ? decodeURIComponent(s) : s; } catch { return s; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sapisidHash(cookie) {
  const m = cookie.match(/(?:^|; )SAPISID=([^;]+)/);
  if (!m) return null;
  const ts = Math.floor(Date.now() / 1000);
  return `SAPISIDHASH ${ts}_${crypto.createHash("sha1").update(`${ts} ${m[1]} ${ORIGIN}`).digest("hex")}`;
}

function headers(client, { visitorData, cookie } = {}) {
  const h = {
    "Content-Type": "application/json", "User-Agent": client.ua,
    "X-Goog-Api-Format-Version": "1", "X-YouTube-Client-Name": client.clientId,
    "X-YouTube-Client-Version": client.clientVersion, "X-Origin": ORIGIN, Referer: ORIGIN + "/",
  };
  if (visitorData) h["X-Goog-Visitor-Id"] = visitorData;
  if (cookie && client.login) { h.cookie = cookie; const a = sapisidHash(cookie); if (a) h.Authorization = a; }
  return h;
}

async function call(endpoint, client, body, cred) {
  const res = await fetch(`${ORIGIN}/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: "POST", headers: headers(client, cred),
    body: JSON.stringify({ context: { client: { clientName: client.clientName, clientVersion: client.clientVersion, gl: "US", hl: "en", visitorData: cred.visitorData } }, ...body }),
  });
  const text = await res.text();
  let j = {}; try { j = JSON.parse(text); } catch {}
  return { j, text, http: res.status };
}

async function searchSongs(query, cred, max = 8) {
  const { text } = await call("search", WEB_REMIX, { query, params: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D" }, cred); // songs filter
  const ids = [...text.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]);
  return [...new Set(ids)].slice(0, max);
}

async function playerFmt(client, videoId, sts, cred, reqPot) {
  const body = { videoId, playbackContext: { contentPlaybackContext: { signatureTimestamp: Number(sts) } } };
  if (reqPot) body.serviceIntegrityDimensions = { poToken: reqPot };
  const { j } = await call("player", client, body, cred);
  const status = j?.playabilityStatus?.status;
  const af = j?.streamingData?.adaptiveFormats || [];
  const audio = af.filter((f) => (f.mimeType || "").startsWith("audio/"));
  // app pick: max bitrate + webm bias
  const pick = audio.sort((a, b) => (b.bitrate + ((b.mimeType||"").startsWith("audio/webm")?10240:0)) - (a.bitrate + ((a.mimeType||"").startsWith("audio/webm")?10240:0)))[0];
  const mvType = (j?.videoDetails?.musicVideoType || "").replace("MUSIC_VIDEO_TYPE_", "") || "?";
  return { status, pick, audioCount: audio.length, mvType, sabrOnly: !!j?.streamingData?.serverAbrStreamingUrl && (!pick || (!pick.url && !pick.signatureCipher)) };
}

async function get(url, range, ua = MWEB_UA) {
  try { const r = await fetch(url, { headers: { "User-Agent": ua, Range: range } }); r.body?.cancel?.(); return r.status; }
  catch { return "ERR"; }
}
async function headReq(url, ua = WEB_UA, cookie = null) {
  const h = { "User-Agent": ua }; if (cookie) h.Cookie = cookie;
  try { const r = await fetch(url, { method: "HEAD", headers: h }); return r.status; } catch { return "ERR"; }
}

async function main() {
  const cred0 = await getCred();
  console.log(describeCred(cred0));
  const cred = { visitorData: dec(cred0.visitorData), cookie: cred0.cookie };
  const cipher = await createCipher({ verbose: false });
  console.log(`cipher: ${cipher.hash} sts=${cipher.sts}`);
  const minter = await createMinter(cred.visitorData);
  const sessionPot = await minter.mint(cred.visitorData);

  const query = process.argv[2] || "top hits 2024";
  const songIds = await searchSongs(query, cred, 8);
  const videos = [...new Set(["dQw4w9WgXcQ", ...songIds])];
  console.log(`videos (${videos.length}): ${videos.join(" ")}\n`);

  let mwebCipher = 0, mwebSabr = 0, mwebWholeSong = 0, headLies = 0, total = 0;

  for (const v of videos) {
    total++;
    const m = await playerFmt(MWEB, v, cipher.sts, cred, sessionPot);
    if (m.status !== "OK") { console.log(`${v}  MWEB playability=${m.status}`); continue; }
    if (!m.pick || (!m.pick.url && !m.pick.signatureCipher)) {
      mwebSabr++;
      console.log(`${v}  [${m.mvType}]  MWEB: SABR-ONLY (no signatureCipher) audio=${m.audioCount}`);
      continue;
    }
    mwebCipher++;
    let base;
    try { base = m.pick.url || cipher.deobfuscateStreamUrl(m.pick.signatureCipher); base = cipher.transformNParamInUrl(base); }
    catch (e) { console.log(`${v}  MWEB decipher-fail ${e.message}`); continue; }
    const videoPot = await minter.mint(v);
    const urls = {
      none: base,
      videoId: `${base}${base.includes("?") ? "&" : "?"}pot=${encodeURIComponent(videoPot)}`,
      visitor: `${base}${base.includes("?") ? "&" : "?"}pot=${encodeURIComponent(sessionPot)}`,
    };
    // HEAD (app validateStatus) vs GET byte0
    const headApp = await headReq(urls.none, WEB_UA, cred.cookie);
    const get0 = await get(urls.none, "bytes=0-1023");
    if (headApp === 403 && (get0 === 206 || get0 === 200)) headLies++;
    // past-wall GET under each pot
    const wallNone = await get(urls.none, `bytes=${WALL}-${WALL + 1023}`);
    const wallVid = await get(urls.videoId, `bytes=${WALL}-${WALL + 1023}`);
    const wallVis = await get(urls.visitor, `bytes=${WALL}-${WALL + 1023}`);
    const whole = wallVid === 206 || wallVid === 200 || wallNone === 206 || wallNone === 200;
    if (whole) mwebWholeSong++;
    console.log(`${v}  [${m.mvType}]  MWEB cipher  HEAD(app)=${headApp} GET0=${get0}  past-wall: none=${wallNone} vid=${wallVid} vis=${wallVis}  itag=${m.pick.itag}`);

    // WEB_REMIX head-to-head with its known-good videoId pot
    const wr = await playerFmt(WEB_REMIX, v, cipher.sts, cred, sessionPot);
    if (wr.status === "OK" && wr.pick && (wr.pick.url || wr.pick.signatureCipher)) {
      let wbase;
      try { wbase = wr.pick.url || cipher.deobfuscateStreamUrl(wr.pick.signatureCipher); wbase = cipher.transformNParamInUrl(wbase); }
      catch { wbase = null; }
      if (wbase) {
        const wrPot = `${wbase}${wbase.includes("?") ? "&" : "?"}pot=${encodeURIComponent(await minter.mint(v))}`;
        const wrWall = await get(wrPot, `bytes=${WALL}-${WALL + 1023}`);
        console.log(`              WEB_REMIX [${wr.mvType}] past-wall(vidPot)=${wrWall} itag=${wr.pick.itag}`);
      }
    } else {
      console.log(`              WEB_REMIX [${wr.mvType}] ${wr.sabrOnly ? "SABR-ONLY" : wr.status}`);
    }
    await sleep(400);
  }

  console.log(`\n=== SUMMARY (${total} videos) ===`);
  console.log(`MWEB returned cipher URL: ${mwebCipher}/${total}   sabr-only(no URL): ${mwebSabr}/${total}`);
  console.log(`MWEB delivered past 1-MiB wall: ${mwebWholeSong}/${mwebCipher} of ciphered`);
  console.log(`HEAD(app validateStatus)=403 while GET byte0 worked (false-negative): ${headLies} cases`);
}

main().catch((e) => { console.error(e); process.exit(1); });
