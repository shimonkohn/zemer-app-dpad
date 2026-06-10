// Unit tests for the harness config loader (run: node --test tests/player-configs.test.mjs).
// Mirrors the collision/validation rules of the app's PlayerConfigParser — an ambiguous
// table (duplicate hash/alias keys) must be rejected wholesale, never half-applied.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlayerConfigs, loadRawPlayerConfigs, loadKnownPlayerConfigs } from "./player-configs.mjs";

const entry = (over = {}) => ({ sig: "mP(4,155,INPUT)", nClass: "Yx", sts: 20613, ...over });
const file = (players) => JSON.stringify({ schemaVersion: 1, players });

test("valid table parses", () => {
  const players = parsePlayerConfigs(file({ abcd1234: entry({ aliases: ["ffff0000"] }) }));
  assert.ok(players.abcd1234);
});

test("alias colliding with another entry's primary hash throws", () => {
  assert.throws(
    () => parsePlayerConfigs(file({
      abcd1234: entry(),
      deadbeef: entry({ aliases: ["abcd1234"] }),
    })),
    /duplicate hash\/alias "abcd1234"/,
  );
});

test("alias colliding with another entry's alias throws", () => {
  assert.throws(
    () => parsePlayerConfigs(file({
      abcd1234: entry({ aliases: ["ffff0000"] }),
      deadbeef: entry({ aliases: ["ffff0000"] }),
    })),
    /duplicate hash\/alias "ffff0000"/,
  );
});

test("alias equal to its own primary hash throws", () => {
  assert.throws(
    () => parsePlayerConfigs(file({ deadbeef: entry({ aliases: ["deadbeef"] }) })),
    /duplicate hash\/alias "deadbeef"/,
  );
});

test("unsupported schemaVersion throws", () => {
  assert.throws(
    () => parsePlayerConfigs(JSON.stringify({ schemaVersion: 2, players: {} })),
    /unsupported schemaVersion/,
  );
});

test("committed bundled file passes validation and alias expansion", () => {
  const raw = loadRawPlayerConfigs();
  const known = loadKnownPlayerConfigs();
  for (const [hash, e] of Object.entries(raw)) {
    assert.ok(known[hash], `primary ${hash} missing from expanded map`);
    for (const alias of e.aliases ?? []) {
      assert.equal(known[alias], known[hash], `alias ${alias} must resolve to ${hash}'s config`);
    }
  }
});
