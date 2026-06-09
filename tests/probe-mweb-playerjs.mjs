#!/usr/bin/env node
/**
 * Check if MWEB uses different player.js than desktop
 */

async function getPlayerJsUrl(domain) {
  console.log(`\nChecking ${domain}...`);
  const html = await fetch(`https://${domain}/`, {
    headers: {
      'User-Agent': domain.includes('m.')
        ? 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'
    },
  }).then(r => r.text());

  const match = html.match(/\/s\/player\/([a-f0-9]+)\/player_ias\.vflset/);
  if (match) {
    console.log(`  Player hash: ${match[1]}`);
    console.log(`  Full path: /s/player/${match[1]}/player_ias.vflset`);
    return match[1];
  } else {
    console.log(`  Could not find player.js reference`);
    return null;
  }
}

async function main() {
  console.log('=== Comparing player.js across domains ===');

  const www = await getPlayerJsUrl('www.youtube.com');
  const m = await getPlayerJsUrl('m.youtube.com');
  const music = await getPlayerJsUrl('music.youtube.com');

  console.log('\n=== Summary ===');
  console.log(`www.youtube.com:   ${www}`);
  console.log(`m.youtube.com:     ${m}`);
  console.log(`music.youtube.com: ${music}`);

  if (www === m && m === music) {
    console.log('\nAll domains use the SAME player.js');
  } else {
    console.log('\nDomains use DIFFERENT player.js versions!');
  }
}

main().catch(console.error);
