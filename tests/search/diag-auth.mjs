// Authenticated request helpers for DIAGNOSTIC probes (browse, auth experiments). Unlike lib.mjs —
// which is deliberately app-faithful (search runs unauthenticated, setLogin=false) — these helpers
// attach the logged-in cookie + SAPISIDHASH and can hit /browse. Use ONLY for investigation, never
// as a model of the app's real search path. Reads the gitignored innertube_cookie.txt via cred.mjs;
// no secret is stored in this file.
import crypto from "node:crypto";
import { getCred } from "../cred.mjs";
import { CLIENTS, ORIGIN } from "../clients.mjs";

const REMIX = CLIENTS.find((c) => c.key === "WEB_REMIX");
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let _cred = null;
export async function diagCred() {
  if (_cred) return _cred;
  const c = await getCred();
  _cred = { visitorData: dec(c.visitorData || ""), cookie: c.cookie || "", source: c.source };
  return _cred;
}

function sapisidhash(cookie) {
  const m = cookie.match(/(?:^|; )SAPISID=([^;]+)/) || cookie.match(/(?:^|; )__Secure-3PAPISID=([^;]+)/);
  if (!m) return null;
  const ts = Math.floor(Date.now() / 1000);
  return `SAPISIDHASH ${ts}_${crypto.createHash("sha1").update(`${ts} ${m[1]} ${ORIGIN}`).digest("hex")}`;
}

function headers({ visitorData, cookie, auth }) {
  const h = {
    "Content-Type": "application/json", "X-Goog-Api-Format-Version": "1",
    "X-YouTube-Client-Name": REMIX.clientId, "X-YouTube-Client-Version": REMIX.clientVersion,
    "X-Origin": ORIGIN, Referer: ORIGIN + "/", "User-Agent": REMIX.userAgent,
  };
  if (visitorData) h["X-Goog-Visitor-Id"] = visitorData;
  if (auth && cookie) { h.cookie = cookie; const a = sapisidhash(cookie); if (a) h.Authorization = a; }
  return h;
}

const context = (visitorData) => ({ client: { clientName: REMIX.clientName, clientVersion: REMIX.clientVersion, hl: "en", gl: "US", ...(visitorData ? { visitorData } : {}) } });

// Returns { blocked } when Google serves its anti-bot HTML (so callers can back off).
async function post(path, body, { auth = false } = {}) {
  const { visitorData, cookie } = await diagCred();
  const res = await fetch(`${ORIGIN}/youtubei/v1/${path}?prettyPrint=false`, {
    method: "POST", headers: headers({ visitorData, cookie, auth }), body: JSON.stringify({ context: context(visitorData), ...body }),
  });
  const txt = await res.text();
  if (txt.startsWith("<")) return { blocked: true, status: res.status };
  return { blocked: false, status: res.status, j: JSON.parse(txt) };
}

export const searchDiag = (query, { params = null, auth = false } = {}) =>
  post("search", params ? { query, params } : { query }, { auth });
export const browseDiag = (browseId, { params = null, auth = true } = {}) =>
  post("browse", params ? { browseId, params } : { browseId }, { auth });

// Shared extractors.
export const sectionList = (j) => j?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer;
export function chipParams(j) {
  const out = {};
  for (const c of (sectionList(j)?.header?.chipCloudRenderer?.chips || [])) {
    const r = c.chipCloudChipRenderer;
    const label = r?.text?.runs?.[0]?.text;
    if (label) out[label] = r?.navigationEndpoint?.searchEndpoint?.params ?? null;
  }
  return out;
}
export function albumCount(j) {
  let n = 0;
  for (const s of (sectionList(j)?.contents || []))
    for (const it of (s.musicShelfRenderer?.contents || s.itemSectionRenderer?.contents || [])) {
      const pt = it.musicResponsiveListItemRenderer?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
      if (pt === "MUSIC_PAGE_TYPE_ALBUM" || pt === "MUSIC_PAGE_TYPE_AUDIOBOOK") n++;
    }
  return n;
}
