// Unit tests for the harness config loader (run: node --test tests/player-configs.test.mjs).
// Mirrors the collision/validation rules of the app's PlayerConfigParser — an ambiguous
// table (duplicate hash/alias keys) must be rejected wholesale, never half-applied.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePlayerConfigs, loadRawPlayerConfigs, loadKnownPlayerConfigs, nTrick } from "./player-configs.mjs";

const COVERS_CLI = join(dirname(fileURLToPath(import.meta.url)), "config-covers.mjs");

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

test("config-covers CLI: covered / uncovered / invalid-file verdicts", () => {
  const dir = mkdtempSync(join(tmpdir(), "covers-"));
  const valid = join(dir, "valid.json");
  writeFileSync(valid, file({ abcd1234: entry({ aliases: ["ffff0000"] }) }));

  assert.equal(execFileSync("node", [COVERS_CLI, "abcd1234", valid], { encoding: "utf8" }).trim(), "covered");
  assert.equal(execFileSync("node", [COVERS_CLI, "ffff0000", valid], { encoding: "utf8" }).trim(), "covered", "aliases count as covered");
  assert.equal(execFileSync("node", [COVERS_CLI, "deadbeef", valid], { encoding: "utf8" }).trim(), "uncovered");

  // An invalid file must exit nonzero — a textually-present hash in a file devices
  // reject wholesale is NOT covered.
  const invalid = join(dir, "invalid.json");
  writeFileSync(invalid, JSON.stringify({ schemaVersion: 1, players: { abcd1234: { sig: "evil()", nClass: "Yx", sts: 1 } } }));
  assert.throws(() => execFileSync("node", [COVERS_CLI, "abcd1234", invalid], { encoding: "utf8", stdio: "pipe" }));
});

test("parity fixtures: file-level verdicts match the Kotlin parser's", () => {
  // Same golden files ConfigParityFixturesTest runs in the cipher repo — file-level
  // accept/reject must agree between the two readers. (Entry-level handling differs by
  // design: the app skips bad entries, the harness throws.)
  const fixtureDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..", "cipher", "library", "src", "test", "resources", "config-parity",
  );
  const names = readdirSync(fixtureDir);
  assert.ok(names.some((n) => n.startsWith("accept-")) && names.some((n) => n.startsWith("reject-")));
  for (const name of names) {
    const text = readFileSync(join(fixtureDir, name), "utf8");
    if (name.startsWith("accept-")) {
      assert.doesNotThrow(() => parsePlayerConfigs(text, name), `${name} must be accepted`);
    } else if (name.startsWith("reject-")) {
      assert.throws(() => parsePlayerConfigs(text, name), undefined, `${name} must be rejected`);
    }
  }
});

test("n-IIFE template is byte-equal to the Kotlin template's golden file", () => {
  // NJsExpressionTemplateTest (cipher repo) pins buildNJsExpression("Yx") to this same
  // file — the expression this harness 206-validates must be exactly what devices run.
  const goldenPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "..", "cipher", "library", "src", "test", "resources", "config-parity", "n-template-Yx.golden",
  );
  assert.equal(nTrick("Yx"), readFileSync(goldenPath, "utf8"));
});

test("missing config file names the submodule fix", () => {
  assert.throws(
    () => loadRawPlayerConfigs("/nonexistent/player_configs.json"),
    /git submodule update --init/,
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
