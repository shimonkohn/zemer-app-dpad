#!/usr/bin/env node
/**
 * Test MWEB stream URL validation with different User-Agents
 */

const VIDEO_ID = process.argv[2] || 'dQw4w9WgXcQ';
const STS = 20611;

const MWEB = {
  clientName: 'MWEB',
  clientVersion: '2.20260213.00.00',
  userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
};

const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';

async function getPlayerResponse(videoId) {
  const body = {
    context: {
      client: {
        clientName: MWEB.clientName,
        clientVersion: MWEB.clientVersion,
        hl: 'en',
        gl: 'US',
      },
    },
    videoId: videoId,
    playbackContext: {
      contentPlaybackContext: {
        signatureTimestamp: STS,
      },
    },
  };

  const res = await fetch('https://music.youtube.com/youtubei/v1/player?key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': MWEB.userAgent,
      'Origin': 'https://music.youtube.com',
      'Referer': 'https://music.youtube.com/',
    },
    body: JSON.stringify(body),
  });

  return res.json();
}

function parseSignatureCipher(cipher) {
  const params = new URLSearchParams(cipher);
  return {
    url: params.get('url'),
    s: params.get('s'),
    sp: params.get('sp') || 'signature',
  };
}

async function testStreamUrl(url, userAgent, label) {
  console.log(`\nTesting with ${label}:`);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': userAgent },
    });
    console.log(`  Status: ${res.status}`);
    return res.status;
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    return 0;
  }
}

async function main() {
  console.log(`Video: ${VIDEO_ID}`);

  const resp = await getPlayerResponse(VIDEO_ID);
  console.log(`Player status: ${resp.playabilityStatus?.status}`);

  const formats = resp.streamingData?.adaptiveFormats || [];
  const audioFormat = formats.find(f => f.mimeType?.startsWith('audio/'));

  if (!audioFormat) {
    console.log('No audio format found');
    return;
  }

  console.log(`Format: itag=${audioFormat.itag}, mime=${audioFormat.mimeType}`);

  if (audioFormat.url) {
    console.log('\nFormat has direct URL');
    await testStreamUrl(audioFormat.url, MWEB.userAgent, 'MWEB User-Agent');
    await testStreamUrl(audioFormat.url, WEB_UA, 'WEB User-Agent');
  } else if (audioFormat.signatureCipher) {
    console.log('\nFormat has signatureCipher (needs deobfuscation)');
    const { url, s, sp } = parseSignatureCipher(audioFormat.signatureCipher);
    console.log(`  Base URL: ${url?.substring(0, 80)}...`);
    console.log(`  Signature param: ${sp}`);
    console.log(`  Signature length: ${s?.length}`);

    // Test base URL without signature (should fail)
    console.log('\nTesting base URL WITHOUT signature:');
    await testStreamUrl(url, MWEB.userAgent, 'MWEB UA (no sig)');

    // Note: To properly test, we'd need to deobfuscate the signature
    console.log('\n[To complete validation, signature deobfuscation is needed]');
  } else {
    console.log('No URL or signatureCipher in format');
  }
}

main().catch(console.error);
