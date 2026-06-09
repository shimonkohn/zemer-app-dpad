#!/usr/bin/env node
// Probe with proper client configurations

const TEST_VIDEO_ID = 'dQw4w9WgXcQ';

const CLIENTS_TO_TEST = [
  // Client 75 - found working
  {
    id: 75,
    name: 'TVHTML5_AUDIO',
    config: {
      clientName: 'TVHTML5_AUDIO',
      clientVersion: '2.0',
      userAgent: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.1',
    }
  },
  // Apple TV
  {
    id: 100,
    name: 'TVOS',
    config: {
      clientName: 'TVOS',
      clientVersion: '21.03',
      userAgent: 'com.google.ios.youtube/21.03 (Apple TV; U; CPU AppleTVOS 17_1 like Mac OS X)',
      osName: 'tvOS',
      osVersion: '17.1',
      deviceMake: 'Apple',
      deviceModel: 'AppleTV11,1',
    }
  },
  // Chromecast
  {
    id: 91,
    name: 'CHROMECAST',
    config: {
      clientName: 'CHROMECAST',
      clientVersion: '0.1',
      userAgent: 'Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.225 Safari/537.36 CrKey/1.56.500000',
    }
  },
  // Android Music (dedicated YT Music app)
  {
    id: 26,
    name: 'ANDROID_MUSIC',
    config: {
      clientName: 'ANDROID_MUSIC',
      clientVersion: '7.27.52',
      userAgent: 'com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 14) gzip',
      osName: 'Android',
      osVersion: '14',
      androidSdkVersion: '34',
    }
  },
  // iOS Music
  {
    id: 27,
    name: 'IOS_MUSIC',
    config: {
      clientName: 'IOS_MUSIC',
      clientVersion: '7.27.0',
      userAgent: 'com.google.ios.youtubemusic/7.27.0 (iPhone14,3; U; CPU iOS 17_2 like Mac OS X)',
      osName: 'iOS',
      osVersion: '17.2',
      deviceMake: 'Apple',
      deviceModel: 'iPhone14,3',
    }
  },
  // Android Go (lite version for low-end devices)
  {
    id: 102,
    name: 'ANDROID_GO',
    config: {
      clientName: 'ANDROID_GO',
      clientVersion: '3.01',
      userAgent: 'com.google.android.apps.youtube.go/3.01 (Linux; U; Android 12) gzip',
      osName: 'Android',
      osVersion: '12',
    }
  },
  // MWEB Music (mobile web for YT Music)
  {
    id: 74,
    name: 'MWEB_MUSIC',
    config: {
      clientName: 'MWEB_MUSIC',
      clientVersion: '1.0',
      userAgent: 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    }
  },
];

async function testClient(client) {
  const body = {
    context: {
      client: {
        clientName: client.config.clientName,
        clientVersion: client.config.clientVersion,
        hl: 'en',
        gl: 'US',
        osName: client.config.osName,
        osVersion: client.config.osVersion,
        deviceMake: client.config.deviceMake,
        deviceModel: client.config.deviceModel,
        androidSdkVersion: client.config.androidSdkVersion,
      }
    },
    videoId: TEST_VIDEO_ID,
  };

  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': client.config.userAgent,
      },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();

  console.log(`\n=== ${client.name} (ID ${client.id}) ===`);
  console.log(`Status: ${data.playabilityStatus?.status || 'N/A'}`);

  if (data.playabilityStatus?.status === 'ERROR') {
    console.log(`Error: ${data.playabilityStatus?.reason || data.error?.message}`);
    return { works: false, streams: false };
  }

  if (data.playabilityStatus?.status === 'LOGIN_REQUIRED') {
    console.log('Requires login');
    return { works: 'login', streams: false };
  }

  if (data.streamingData) {
    const formats = data.streamingData.formats || [];
    const adaptive = data.streamingData.adaptiveFormats || [];
    console.log(`Streams: ${formats.length} progressive, ${adaptive.length} adaptive`);

    // Check audio
    const audioFormats = adaptive.filter(f => f.mimeType?.startsWith('audio/'));
    if (audioFormats.length > 0) {
      console.log(`Audio: ${audioFormats.length} formats`);
      const best = audioFormats.reduce((a, b) => (a.bitrate > b.bitrate ? a : b));
      console.log(`  Best: ${best.mimeType} @ ${Math.round(best.bitrate/1000)}kbps`);
    }

    // Check URL type
    const sample = adaptive[0] || formats[0];
    if (sample?.url) {
      // Check if URL has spc parameter (requires poToken)
      const hasSpc = sample.url.includes('spc=');
      console.log(`URLs: Direct${hasSpc ? ' (has spc - may need poToken)' : ' (no spc - likely works!)'}`);

      // Quick HEAD check
      try {
        const head = await fetch(sample.url, { method: 'HEAD' });
        console.log(`HEAD check: ${head.status}`);
      } catch (e) {
        console.log(`HEAD check: failed`);
      }
    } else if (sample?.signatureCipher) {
      console.log(`URLs: Ciphered (needs deobfuscation)`);
    }

    return { works: true, streams: true };
  }

  console.log('No streaming data');
  return { works: false, streams: false };
}

async function main() {
  console.log('Testing potential new YouTube clients...\n');

  const results = [];

  for (const client of CLIENTS_TO_TEST) {
    const result = await testClient(client);
    results.push({ ...client, ...result });
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n\n========== SUMMARY ==========');
  console.log('Clients that work without login:');
  results.filter(r => r.works === true).forEach(r => {
    console.log(`  ✓ ${r.name} (ID ${r.id})`);
  });

  console.log('\nClients requiring login:');
  results.filter(r => r.works === 'login').forEach(r => {
    console.log(`  ? ${r.name} (ID ${r.id})`);
  });

  console.log('\nClients that don\'t work:');
  results.filter(r => r.works === false).forEach(r => {
    console.log(`  ✗ ${r.name} (ID ${r.id})`);
  });
}

main().catch(console.error);
