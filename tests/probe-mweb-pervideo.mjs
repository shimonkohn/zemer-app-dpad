// MWEB per-video gate probe.
//
// probe-mweb-app-exact.mjs proved the MWEB 403 is NOT caused by any request/format/pot/
// validation difference between the app and the old probes: every combination 403s for the
// music track JTF9fLJvniI while dQw4w9WgXcQ gets 200 with the identical pipeline. So the gate
// is per-video. This probe characterises it:
//   - what KIND of video 403s (musicVideoType: official MV vs auto-generated art track)?
//   - does HEAD disagree with GET (the WEB_REMIX "HEAD is a false-negative trap")?
//   - does a videoId-bound pot unlock the first byte and/or past the 1-MiB wall?
//
// Seeds extra music-track ids from the anonymous WEB_REMIX watch-next queue of JTF9fLJvniI.
//
//   node tests/probe-mweb-pervideo.mjs

import { getCred, describeCred } from "./cred.mjs";
import { createMinter } from "./potoken.mjs";
import { createCipher } from "./cipher.mjs";

const ORIGIN = "https://music.youtube.com";
const MWEB_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const WEB_REMIX = { clientName: "WEB_REMIX", clientVersion: "1.20260213.01.00" };
const MWEB = { clientName: "MWEB", clientVersion: "2.20260213.00.00" };
const WALL = 1048576;

const dec = (s) => { try { return s && /%[0-9A-Fa-f]{2}/.test(s) ? decodeURIComponent(s) : s; } catch { return s; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function innertube(endpoint, client, body) {
  const res = await fetch(`${ORIGIN}/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": MWEB_UA, Origin: ORIGIN },
    body: JSON.stringify({ context: { client: { ...client, hl: "en", gl: "US" } }, ...body }),
  });
  return { text: await res.text(), http: res.status };
}

async function nextRelated(videoId, max = 6) {
  const { text } = await innertube("next", WEB_REMIX, { videoId });
  const ids = [...text.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]);
  return [...new Set(ids)].filter((id) => id !== videoId).slice(0, max);
}

async function playerMweb(videoId, sts) {
  const { text } = await innertube("player", MWEB, {
    videoId,
    playbackContext: { contentPlaybackContext: { signatureTimestamp: Number(sts) } },
  });
  let j = {}; try { j = JSON.parse(text); } catch {}
  return j;
}

async function videoType(videoId) {
  // MWEB videoDetails may lack musicVideoType; WEB_REMIX reliably has it.
  const { text } = await innertube("player", WEB_REMIX, { videoId });
  const m = text.match(/"musicVideoType":"([A-Z_]+)"/);
  const t = m ? m[1].replace("MUSIC_VIDEO_TYPE_", "") : "?";
  const title = (text.match(/"videoDetails":\{[^}]*?"title":"((?:[^"\\]|\\.)*)"/) || [])[1] || "?";
  return { type: t, title: title.slice(0, 28) };
}

async function req(url, { method = "GET", range } = {}) {
  const headers = { "User-Agent": MWEB_UA };
  if (range) headers.Range = range;
  try {
    const r = await fetch(url, { method, headers });
    r.body?.cancel?.();
    return r.status;
  } catch (e) { return "ERR"; }
}

async function main() {
  const cred = await getCred();
  console.log(describeCred(cred));
  const visitorData = dec(cred.visitorData);

  const cipher = await createCipher({ verbose: false });
  console.log(`cipher: ${cipher.hash} sts=${cipher.sts}`);
  const minter = await createMinter(visitorData);

  const related = await nextRelated("JTF9fLJvniI");
  const videos = ["dQw4w9WgXcQ", "kJQP7kiw5Fk", "JTF9fLJvniI", ...related];
  console.log(`videos: ${videos.join(" ")}\n`);

  const head = "video".padEnd(13) + "type".padEnd(8) + "title".padEnd(30) +
    "HEAD".padEnd(6) + "GET0".padEnd(6) + "GET1M".padEnd(7) + "HEAD+p".padEnd(8) + "GET0+p".padEnd(8) + "GET1M+p";
  console.log(head);

  for (const v of videos) {
    const { type, title } = await videoType(v);
    const j = await playerMweb(v, cipher.sts);
    const status = j?.playabilityStatus?.status;
    if (status !== "OK") {
      console.log(v.padEnd(13) + type.padEnd(8) + title.padEnd(30) + `playability=${status}`);
      continue;
    }
    const fmt = (j?.streamingData?.adaptiveFormats || []).find((f) => (f.mimeType || "").startsWith("audio/"));
    if (!fmt || (!fmt.url && !fmt.signatureCipher)) {
      console.log(v.padEnd(13) + type.padEnd(8) + title.padEnd(30) + "no-cipher(sabr-only)");
      continue;
    }
    let url;
    try {
      url = fmt.url || cipher.deobfuscateStreamUrl(fmt.signatureCipher);
      url = cipher.transformNParamInUrl(url);
    } catch (e) {
      console.log(v.padEnd(13) + type.padEnd(8) + title.padEnd(30) + `decipher-fail ${e.message}`);
      continue;
    }
    const pot = await minter.mint(v);
    const urlPot = `${url}${url.includes("?") ? "&" : "?"}pot=${encodeURIComponent(pot)}`;

    const cells = [
      await req(url, { method: "HEAD" }),
      await req(url, { range: "bytes=0-1023" }),
      await req(url, { range: `bytes=${WALL}-${WALL + 262143}` }),
      await req(urlPot, { method: "HEAD" }),
      await req(urlPot, { range: "bytes=0-1023" }),
      await req(urlPot, { range: `bytes=${WALL}-${WALL + 262143}` }),
    ];
    console.log(
      v.padEnd(13) + type.padEnd(8) + title.padEnd(30) +
      String(cells[0]).padEnd(6) + String(cells[1]).padEnd(6) + String(cells[2]).padEnd(7) +
      String(cells[3]).padEnd(8) + String(cells[4]).padEnd(8) + String(cells[5]),
    );
    await sleep(400);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
