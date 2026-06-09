#!/usr/bin/env node
// Probe YouTube API for unknown client IDs

const KNOWN_IDS = new Set([1, 3, 5, 7, 14, 28, 62, 67, 85, 101]);

const TEST_VIDEO_ID = 'dQw4w9WgXcQ'; // Never Gonna Give You Up

async function probeClient(clientId, clientName = `CLIENT_${clientId}`) {
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

  try {
    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    const data = await res.json();

    // Check if we got a valid response
    if (data.streamingData || data.videoDetails) {
      return { clientId, status: 'WORKS', hasStreams: !!data.streamingData?.formats || !!data.streamingData?.adaptiveFormats };
    } else if (data.error) {
      return { clientId, status: 'ERROR', message: data.error.message?.substring(0, 50) };
    } else if (data.playabilityStatus?.status === 'UNPLAYABLE') {
      return { clientId, status: 'UNPLAYABLE', reason: data.playabilityStatus.reason?.substring(0, 50) };
    } else if (data.playabilityStatus?.status === 'LOGIN_REQUIRED') {
      return { clientId, status: 'LOGIN_REQUIRED' };
    } else if (data.playabilityStatus) {
      return { clientId, status: data.playabilityStatus.status };
    }
    return { clientId, status: 'UNKNOWN', keys: Object.keys(data) };
  } catch (e) {
    return { clientId, status: 'FETCH_ERROR', message: e.message };
  }
}

async function probeClientName(clientId) {
  // Try common client name patterns
  const patterns = [
    `ANDROID_${clientId}`,
    `IOS_${clientId}`,
    `WEB_${clientId}`,
    `TVHTML5_${clientId}`,
    `MWEB_${clientId}`,
  ];

  // Just use numeric for initial probe
  return probeClient(clientId, clientId.toString());
}

async function main() {
  console.log('Probing YouTube client IDs...\n');
  console.log('Known IDs:', [...KNOWN_IDS].sort((a,b) => a-b).join(', '));
  console.log('');

  const results = [];

  // Probe IDs 1-120 (VISIONOS is 101, so check beyond)
  for (let id = 1; id <= 120; id++) {
    const result = await probeClient(id, id.toString());

    const isKnown = KNOWN_IDS.has(id);
    const marker = isKnown ? '[KNOWN]' : '[NEW?]';

    if (result.status === 'WORKS' || result.status === 'LOGIN_REQUIRED' || result.status === 'OK') {
      console.log(`${marker} ID ${id}: ${result.status}${result.hasStreams ? ' (has streams)' : ''}`);
      if (!isKnown) results.push(result);
    } else if (!isKnown && result.status !== 'ERROR' && result.status !== 'FETCH_ERROR') {
      console.log(`${marker} ID ${id}: ${result.status} - ${result.reason || result.message || ''}`);
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n=== POTENTIALLY NEW CLIENTS ===');
  if (results.length === 0) {
    console.log('No new working clients found in range 1-120');
  } else {
    results.forEach(r => console.log(`ID ${r.clientId}: ${r.status}`));
  }
}

main().catch(console.error);
