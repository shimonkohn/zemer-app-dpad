// Is MWEB's 1-MiB wall absolute? Confirm it's invariant to UA, itag, and pot binding,
// and re-confirm WEB_REMIX crosses it on the same gated tracks. If every MWEB past-wall
// GET 403s while WEB_REMIX 206s, MWEB is a dead fallback for gated tracks (same class as IOS).
//
//   node tests/probe-mweb-wall-absolute.mjs

import { getCred, describeCred } from "./cred.mjs";
import { createMinter } from "./potoken.mjs";
import { createCipher } from "./cipher.mjs";
import crypto from "node:crypto";

const ORIGIN = "https://music.youtube.com";
const UAS = {
  mweb: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  web: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
  android: "com.google.android.youtube/21.03.38 (Linux; U; Android 14) gzip",
};
const MWEB = { clientName: "MWEB", clientVersion: "2.20260213.00.00", clientId: "2" };
const WEB_REMIX = { clientName: "WEB_REMIX", clientVersion: "1.20260213.01.00", clientId: "67" };
const WALL = 1048576;

const dec = (s) => { try { return s && /%[0-9A-Fa-f]{2}/.test(s) ? decodeURIComponent(s) : s; } catch { return s; } };

function sapisidHash(cookie) {
  const m = cookie.match(/(?:^|; )SAPISID=([^;]+)/);
  if (!m) return null;
  const ts = Math.floor(Date.now() / 1000);
  return `SAPISIDHASH ${ts}_${crypto.createHash("sha1").update(`${ts} ${m[1]} ${ORIGIN}`).digest("hex")}`;
}
async function player(client, videoId, sts, cred, reqPot) {
  const h = { "Content-Type": "application/json", "User-Agent": UAS.mweb, "X-Goog-Api-Format-Version": "1",
    "X-YouTube-Client-Name": client.clientId, "X-YouTube-Client-Version": client.clientVersion, "X-Origin": ORIGIN,
    Referer: ORIGIN + "/", "X-Goog-Visitor-Id": cred.visitorData, cookie: cred.cookie };
  const a = sapisidHash(cred.cookie); if (a) h.Authorization = a;
  const body = { context: { client: { clientName: client.clientName, clientVersion: client.clientVersion, gl: "US", hl: "en", visitorData: cred.visitorData } },
    videoId, playbackContext: { contentPlaybackContext: { signatureTimestamp: Number(sts) } } };
  if (reqPot) body.serviceIntegrityDimensions = { poToken: reqPot };
  const res = await fetch(`${ORIGIN}/youtubei/v1/player?prettyPrint=false`, { method: "POST", headers: h, body: JSON.stringify(body) });
  let j = {}; try { j = JSON.parse(await res.text()); } catch {}
  return j;
}
function audioFormats(j) {
  return (j?.streamingData?.adaptiveFormats || []).filter((f) => (f.mimeType || "").startsWith("audio/"));
}
async function get(url, range, ua) {
  try { const r = await fetch(url, { headers: { "User-Agent": ua, Range: range } }); r.body?.cancel?.(); return r.status; }
  catch { return "ERR"; }
}

async function main() {
  const cred0 = await getCred();
  console.log(describeCred(cred0));
  const cred = { visitorData: dec(cred0.visitorData), cookie: cred0.cookie };
  const cipher = await createCipher({ verbose: false });
  const minter = await createMinter(cred.visitorData);
  const sessionPot = await minter.mint(cred.visitorData);

  // Two gated ATV tracks that 403'd past the wall in probe-mweb-verdict.mjs.
  const videos = ["kIft-LUHHVA", "0hg3Y0YOaa8"];

  for (const v of videos) {
    console.log(`\n=== ${v} ===`);
    const videoPot = await minter.mint(v);
    const mj = await player(MWEB, v, cipher.sts, cred, sessionPot);
    for (const f of audioFormats(mj)) {
      if (!f.url && !f.signatureCipher) continue;
      if (![140, 251].includes(f.itag)) continue;
      let base;
      try { base = f.url || cipher.deobfuscateStreamUrl(f.signatureCipher); base = cipher.transformNParamInUrl(base); }
      catch (e) { console.log(`  itag=${f.itag} decipher-fail`); continue; }
      const variants = {
        none: base,
        vidPot: `${base}${base.includes("?") ? "&" : "?"}pot=${encodeURIComponent(videoPot)}`,
      };
      for (const [potName, url] of Object.entries(variants)) {
        const cells = [];
        for (const uaName of Object.keys(UAS)) cells.push(`${uaName}=${await get(url, `bytes=${WALL}-${WALL + 1023}`, UAS[uaName])}`);
        console.log(`  MWEB itag=${f.itag} pot=${potName}  past-wall: ${cells.join(" ")}`);
      }
    }
    // WEB_REMIX comparison on the same video with videoId pot.
    const wj = await player(WEB_REMIX, v, cipher.sts, cred, sessionPot);
    const wf = audioFormats(wj).find((f) => f.itag === 251) || audioFormats(wj)[0];
    if (wf && (wf.url || wf.signatureCipher)) {
      let wbase;
      try { wbase = wf.url || cipher.deobfuscateStreamUrl(wf.signatureCipher); wbase = cipher.transformNParamInUrl(wbase); } catch { wbase = null; }
      if (wbase) {
        const wurl = `${wbase}${wbase.includes("?") ? "&" : "?"}pot=${encodeURIComponent(await minter.mint(v))}`;
        console.log(`  WEB_REMIX itag=${wf.itag} vidPot  past-wall(webUA)=${await get(wurl, `bytes=${WALL}-${WALL + 1023}`, UAS.web)}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
