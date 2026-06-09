#!/usr/bin/env node
// Get detailed info about specific client IDs

const TEST_VIDEO_ID = 'dQw4w9WgXcQ';

// Known client name mappings (from various sources)
const KNOWN_NAMES = {
  1: 'WEB',
  2: 'MWEB',
  3: 'ANDROID',
  4: 'ANDROID_EMBEDDED_PLAYER',
  5: 'IOS',
  6: 'TVAPPLE',
  7: 'TVHTML5',
  10: 'TVHTML5_AUDIO',
  13: 'XBOX',
  14: 'ANDROID_CREATOR',
  15: 'IOS_CREATOR',
  16: 'TVHTML5_SIMPLY',
  18: 'ANDROID_KIDS',
  20: 'ANDROID_TESTSUITE',
  21: 'WEB_PRODUCER_EMBEDDED_PLAYER',
  23: 'TVHTML5_KIDS',
  26: 'ANDROID_MUSIC',
  27: 'IOS_MUSIC',
  28: 'ANDROID_VR',
  29: 'ANDROID_UNPLUGGED',
  30: 'ANDROID_LITE',
  31: 'IOS_UNPLUGGED',
  32: 'IOS_TESTSUITE',
  33: 'WEB_MUSIC_ANALYTICS',
  36: 'IOS_EMBEDDED_PLAYER',
  38: 'WEB_EMBEDDED_PLAYER',
  39: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER_OVERRIDE',
  40: 'MWEB_UNPLUGGED',
  56: 'WEB_UNPLUGGED',
  57: 'ANDROID_MUSIC_TESTSUITE',
  58: 'MWEB_EMBEDDED_PLAYER',
  59: 'MEDIA_CONNECT_FRONTEND',
  60: 'ANDROID_VR_CREATOR',
  61: 'IOS_LIVE_CREATION_EXTENSION',
  62: 'WEB_CREATOR',
  63: 'IOS_DIRECTOR',
  64: 'ANDROID_DIRECTOR',
  65: 'GOOGLE_ASSISTANT',
  66: 'IOS_KIDS',
  67: 'WEB_REMIX',
  68: 'IOS_UPTIME',
  69: 'WEB_UNPLUGGED_ONBOARDING',
  70: 'WEB_UNPLUGGED_OPS',
  71: 'WEB_UNPLUGGED_PUBLIC',
  72: 'TVHTML5_UNPLUGGED',
  74: 'MWEB_MUSIC',
  75: 'TVHTML5_AUDIO',  // Maybe?
  76: 'ANDROID_PRODUCER',
  77: 'MUSIC_INTEGRATIONS',
  78: 'GOOGLE_MEDIA_ACTIONS',
  80: 'TVHTML5_YONGLE',
  82: 'WEB_MUSIC_EMBEDDED_PLAYER',
  84: 'TVHTML5_CAST',
  85: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
  87: 'WEB_KIDS',
  88: 'WEB_HEROES',
  89: 'WEB_MUSIC',
  90: 'GOOGLE_ASSISTANT_CREATOR',
  91: 'CHROMECAST',
  92: 'ANDROID_SPORTS',
  93: 'IOS_SPORTS',
  94: 'ANDROID_LIVE_RING',
  95: 'WEB_SPORTS',
  96: 'GOOGLE_LENS',
  97: 'ANDROID_CREATOR_LIVE_RINGLESS',
  98: 'ANDROID_SHORTS',
  99: 'IOS_CREATOR_LIVE_RINGLESS',
  100: 'TVOS',
  101: 'VISIONOS',
  102: 'ANDROID_GO',
  103: 'ANDROID_GO_MEDIA_SERVICE',
};

async function getClientDetail(clientId) {
  const clientName = KNOWN_NAMES[clientId] || `UNKNOWN_${clientId}`;

  const body = {
    context: {
      client: {
        clientName: clientName,
        clientVersion: '1.0',
        hl: 'en',
        gl: 'US',
      }
    },
    videoId: TEST_VIDEO_ID,
  };

  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();

  console.log(`\n=== Client ID ${clientId}: ${clientName} ===`);
  console.log(`Status: ${data.playabilityStatus?.status || 'N/A'}`);
  console.log(`Reason: ${data.playabilityStatus?.reason || 'N/A'}`);

  if (data.streamingData) {
    const formats = data.streamingData.formats || [];
    const adaptive = data.streamingData.adaptiveFormats || [];
    console.log(`Formats: ${formats.length} progressive, ${adaptive.length} adaptive`);

    // Check audio formats
    const audioFormats = adaptive.filter(f => f.mimeType?.startsWith('audio/'));
    console.log(`Audio formats: ${audioFormats.length}`);
    audioFormats.slice(0, 3).forEach(f => {
      console.log(`  - ${f.mimeType} @ ${f.bitrate}bps (itag ${f.itag})`);
    });

    // Check if URLs need cipher
    const sampleUrl = adaptive[0]?.url || formats[0]?.url;
    const hasCipher = !sampleUrl && (adaptive[0]?.signatureCipher || formats[0]?.signatureCipher);
    console.log(`URLs: ${sampleUrl ? 'Direct' : hasCipher ? 'CIPHERED' : 'None'}`);
  }

  if (data.videoDetails) {
    console.log(`Video: ${data.videoDetails.title?.substring(0, 40)}...`);
  }

  return data;
}

async function main() {
  // Check the interesting ones
  const targets = [33, 70, 75];

  // Also check some other potentially interesting IDs
  const extras = [26, 27, 74, 89, 91, 100, 102, 103];

  console.log('=== NEWLY FOUND ===');
  for (const id of targets) {
    await getClientDetail(id);
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n\n=== OTHER POTENTIALLY USEFUL ===');
  for (const id of extras) {
    await getClientDetail(id);
    await new Promise(r => setTimeout(r, 200));
  }
}

main().catch(console.error);
