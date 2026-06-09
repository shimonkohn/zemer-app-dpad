#!/usr/bin/env node
/**
 * Probe using www.youtube.com endpoint (not music.youtube.com)
 * Some clients only work on the main YouTube API
 */

import { createHash } from 'crypto';

const TEST_VIDEO_ID = 'dQw4w9WgXcQ';
const COOKIE = 'HSID=AGohAxISFIyXLqm7v; SSID=AAozZv1auInAw5clE; APISID=xpa2Z4eli5XIVPaw/ANAXCictCR85fx-p6; SAPISID=-cfPwuryMXooHWV1/AnDAwhQoOTd-ViLzM; SID=g.a0009ghS6p3oUS4C2Eki08QHHaOmrp5xmpcIyKijWploXYRDfcSv96zdFIJGfiZHY0O5iEBPogACgYKAdESARASFQHGX2Mia26Yo3Tnz8PTG_cE0Lgj2BoVAUF8yKorVf-A4rhnpftYlHtY1TWN0076';
const VISITOR_DATA = 'Cgs1RnUxMWVROTNLSSiZwOnPBjIKCgJVUxIEGgAgTQ==';

// Use www.youtube.com instead of music.youtube.com
const ORIGIN = 'https://www.youtube.com';
const API_URL = 'https://www.youtube.com/youtubei/v1/player';

const KNOWN_IDS = new Set([1, 3, 5, 7, 14, 28, 62, 67, 85, 101]);

function generateSapiSidHash(origin) {
  const sapisid = COOKIE.match(/SAPISID=([^;]+)/)?.[1];
  if (!sapisid) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  const hash = createHash('sha1').update(`${timestamp} ${sapisid} ${origin}`).digest('hex');
  return `SAPISIDHASH ${timestamp}_${hash}`;
}

// Clients to test on youtube.com endpoint
const CLIENTS = [
  // Already known (verify they work)
  { id: '101', name: 'VISIONOS', version: '0.1' },
  { id: '28', name: 'ANDROID_VR', version: '1.61.48', osName: 'Android', osVersion: '12' },
  { id: '5', name: 'IOS', version: '21.03.1' },

  // Embedded players (try on youtube.com)
  { id: '85', name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', version: '2.0', embedded: true },
  { id: '38', name: 'WEB_EMBEDDED_PLAYER', version: '1.0', embedded: true },
  { id: '4', name: 'ANDROID_EMBEDDED_PLAYER', version: '21.03.38', embedded: true },
  { id: '36', name: 'IOS_EMBEDDED_PLAYER', version: '21.03.1', embedded: true },
  { id: '58', name: 'MWEB_EMBEDDED_PLAYER', version: '2.20250101', embedded: true },

  // Mobile web
  { id: '2', name: 'MWEB', version: '2.20260213.00.00' },

  // TV clients
  { id: '7', name: 'TVHTML5', version: '7.20260213.00.00' },
  { id: '16', name: 'TVHTML5_SIMPLY', version: '2.0' },
  { id: '84', name: 'TVHTML5_CAST', version: '1.0' },
  { id: '91', name: 'CHROMECAST', version: '0.1' },
  { id: '100', name: 'TVOS', version: '1.0' },
  { id: '6', name: 'TVAPPLE', version: '1.0' },

  // Kids (sometimes less restricted)
  { id: '18', name: 'ANDROID_KIDS', version: '9.10.0', osName: 'Android', osVersion: '14' },
  { id: '66', name: 'IOS_KIDS', version: '9.10.0' },
  { id: '87', name: 'WEB_KIDS', version: '2.1' },

  // Music clients
  { id: '26', name: 'ANDROID_MUSIC', version: '7.27.52', osName: 'Android', osVersion: '14' },
  { id: '27', name: 'IOS_MUSIC', version: '7.27.0' },
  { id: '74', name: 'MWEB_MUSIC', version: '1.0' },

  // Test clients (can bypass restrictions)
  { id: '20', name: 'ANDROID_TESTSUITE', version: '1.9', osName: 'Android', osVersion: '14' },
  { id: '32', name: 'IOS_TESTSUITE', version: '1.9' },

  // Lite/Go (low-spec devices, less restricted)
  { id: '30', name: 'ANDROID_LITE', version: '3.26.1', osName: 'Android', osVersion: '12' },
  { id: '102', name: 'ANDROID_GO', version: '3.01', osName: 'Android', osVersion: '12' },

  // Gaming
  { id: '13', name: 'XBOX', version: '1.0' },

  // Unplugged (YouTube TV)
  { id: '29', name: 'ANDROID_UNPLUGGED', version: '8.26', osName: 'Android', osVersion: '14' },
  { id: '56', name: 'WEB_UNPLUGGED', version: '1.0' },
];

async function testClient(client) {
  const body = {
    context: {
      client: {
        clientName: client.name,
        clientVersion: client.version,
        hl: 'en',
        gl: 'US',
        visitorData: VISITOR_DATA,
        ...(client.osName && { osName: client.osName }),
        ...(client.osVersion && { osVersion: client.osVersion }),
      },
      ...(client.embedded && {
        thirdParty: { embedUrl: `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}` }
      }),
    },
    videoId: TEST_VIDEO_ID,
  };

  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Format-Version': '1',
    'X-YouTube-Client-Name': client.id,
    'X-YouTube-Client-Version': client.version,
    'X-Origin': ORIGIN,
    'Referer': `${ORIGIN}/`,
    'X-Goog-Visitor-Id': VISITOR_DATA,
    'Cookie': COOKIE,
    'Authorization': generateSapiSidHash(ORIGIN),
  };

  try {
    const res = await fetch(`${API_URL}?prettyPrint=false`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    const status = data.playabilityStatus?.status;
    const adaptive = data.streamingData?.adaptiveFormats || [];
    const formats = data.streamingData?.formats || [];

    if (adaptive.length === 0 && formats.length === 0) {
      return { ...client, status, hasStreams: false, reason: data.playabilityStatus?.reason?.substring(0, 50) };
    }

    const sample = adaptive[0] || formats[0];
    const urlType = sample?.url ? 'direct' : 'cipher';
    const hasSpc = sample?.url?.includes('spc=');

    let headStatus = null;
    if (sample?.url) {
      try {
        const head = await fetch(sample.url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        headStatus = head.status;
      } catch { headStatus = 'err'; }
    }

    const audioFormats = adaptive.filter(f => f.mimeType?.startsWith('audio/'));
    const bestAudio = audioFormats.length > 0
      ? audioFormats.reduce((a, b) => (a.bitrate > b.bitrate ? a : b))
      : null;

    return {
      ...client,
      status,
      hasStreams: true,
      adaptiveCount: adaptive.length,
      progressiveCount: formats.length,
      audioCount: audioFormats.length,
      urlType,
      hasSpc,
      headStatus,
      bestBitrate: bestAudio ? Math.round(bestAudio.bitrate / 1000) : null,
    };
  } catch (e) {
    return { ...client, status: 'ERROR', hasStreams: false, error: e.message?.substring(0, 40) };
  }
}

async function main() {
  console.log('=== YouTube Client Probe (www.youtube.com endpoint) ===\n');

  const results = [];

  for (const client of CLIENTS) {
    const result = await testClient(client);
    results.push(result);

    const marker = KNOWN_IDS.has(parseInt(client.id)) ? '[KNOWN]' : '[NEW?]';
    const star = result.urlType === 'direct' && !result.hasSpc && result.headStatus === 200 ? '★' :
                 result.urlType === 'direct' && result.headStatus === 200 ? '◆' : ' ';

    if (result.hasStreams) {
      console.log(`${star}✓ ${marker} ${result.name} (${result.id}): ${result.urlType}${result.hasSpc ? '+spc' : ''} HEAD:${result.headStatus} [${result.audioCount} audio${result.progressiveCount ? ', ' + result.progressiveCount + ' prog' : ''}]`);
    } else if (result.status === 'LOGIN_REQUIRED') {
      console.log(`? ${marker} ${result.name} (${result.id}): LOGIN_REQUIRED`);
    } else if (result.reason) {
      console.log(`✗ ${marker} ${result.name} (${result.id}): ${result.reason}`);
    }

    await new Promise(r => setTimeout(r, 150));
  }

  console.log('\n========== ANALYSIS ==========\n');

  const newClients = results.filter(r => !KNOWN_IDS.has(parseInt(r.id)) && r.hasStreams);

  // Best: direct, no spc, HEAD 200
  const best = newClients.filter(r => r.urlType === 'direct' && !r.hasSpc && r.headStatus === 200);
  console.log('★ BEST (direct, no spc, works):');
  best.length ? best.forEach(r => console.log(`   ${r.name} (${r.id})`)) : console.log('   None');

  // Good: direct + spc, HEAD 200
  const good = newClients.filter(r => r.urlType === 'direct' && r.hasSpc && r.headStatus === 200);
  console.log('\n◆ GOOD (direct + spc, works):');
  good.length ? good.forEach(r => console.log(`   ${r.name} (${r.id})`)) : console.log('   None');

  // OK: cipher
  const ok = newClients.filter(r => r.urlType === 'cipher');
  console.log('\n○ OK (cipher needed):');
  ok.length ? ok.forEach(r => console.log(`   ${r.name} (${r.id})`)) : console.log('   None');
}

main().catch(console.error);
