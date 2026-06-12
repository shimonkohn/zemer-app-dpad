// Unit tests for the pure core of scan-live-players.mjs (no network).
//   node --test tests/scan-live-players.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, coveredKeys } from "./scan-live-players.mjs";

test("aggregate counts and sorts most-seen first, dropping nulls", () => {
  const out = aggregate(["aaaaaaaa", "bbbbbbbb", "aaaaaaaa", null, "aaaaaaaa", "bbbbbbbb"]);
  assert.deepEqual(out, [
    { hash: "aaaaaaaa", count: 3 },
    { hash: "bbbbbbbb", count: 2 },
  ]);
});

test("aggregate breaks count ties by hash for stable output", () => {
  const out = aggregate(["ffffffff", "11111111"]);
  assert.deepEqual(out, [
    { hash: "11111111", count: 1 },
    { hash: "ffffffff", count: 1 },
  ]);
});

test("aggregate of empty / all-null is empty", () => {
  assert.deepEqual(aggregate([]), []);
  assert.deepEqual(aggregate([null, null]), []);
});

test("coveredKeys includes both primaries and aliases", () => {
  const cfg = JSON.stringify({
    schemaVersion: 1,
    players: {
      "12345678": { sig: "Tl(48,5831,INPUT)", nClass: "W_", sts: 20602, aliases: ["abcdef01"] },
    },
  });
  const keys = coveredKeys(cfg, "test.json");
  assert.ok(keys.has("12345678"), "primary covered");
  assert.ok(keys.has("abcdef01"), "alias covered");
  assert.ok(!keys.has("deadbeef"), "unknown not covered");
});

test("coveredKeys throws on an invalid config (device would reject it wholesale)", () => {
  assert.throws(() => coveredKeys(JSON.stringify({ players: {} }), "bad.json"));
});
