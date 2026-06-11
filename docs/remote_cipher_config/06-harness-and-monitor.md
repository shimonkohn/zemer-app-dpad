# 06 — The harness and the hourly monitor

## `tests/player-configs.mjs` — the loader (app repo)

The harness's only source of player configs. Before app commit `1b05655`, `tests/cipher.mjs`
carried a hand-mirrored copy of the Kotlin table — the classic drift bug waiting to happen.
Now the harness reads **the same file the APK bundles and devices fetch**, through the
submodule path:

```
tests/player-configs.mjs → ../cipher/library/src/main/assets/player_configs.json
```

Exports:

- `parsePlayerConfigs(jsonText, label)` — validation mirroring `PlayerConfigParser`
  (same regexes, same integer-only `schemaVersion` gate — app commit `8c18396` — same
  whole-file rejection on duplicate hash/alias — app commit `09a1913`). Difference by
  design: it **throws** on a bad entry instead of skipping ("in tests, loud is right").
  Exported precisely so callers can validate *any* copy of the file — e.g. the live remote
  one — with the exact rules applied to the bundled copy.
- `loadRawPlayerConfigs(path?)` — reads + validates the submodule copy; a missing file
  produces the actionable error "the cipher submodule is not checked out. Run:
  `git submodule update --init`" (app commit `ac1965a`, which also made the load lazy so
  unrelated scripts don't die on a missing submodule).
- `loadKnownPlayerConfigs()` — alias-expanded map in the shape the harness ciphers consume:
  `{ <hash-or-alias>: { sigExpr, nExpr, sts } }`.
- `nTrick(urlClass)` — the JS copy of the n-IIFE template, golden-pinned to the Kotlin one
  (doc 04).

Unit tests: `node --test tests/player-configs.test.mjs` — 10 tests, no cookie or network
needed. They cover the validation rules, collision rejection, the `config-covers.mjs` CLI,
the schemaVersion gate, the template golden, and the cross-language parity fixtures.

## `tests/validate-player-config.mjs` — ground truth for new entries

`node tests/validate-player-config.mjs <hash>` (optionally
`<hash> "<sigExpr>" <nClass>` to test a specific pair):

1. Downloads `https://www.youtube.com/s/player/<hash>/player_ias.vflset/en_GB/base.js`.
2. Auto-enumerates candidate `(sig call, nClass)` pairs from the player's assembler, or
   uses the pair you pass.
3. Rebuilds the cipher exactly like the device: jsdom, the same export shims, the sig
   expression verbatim, the n expression via the shared `nTrick` template (app commit
   `53d2aa0` — before that it had its own template copy, i.e. it could validate bytes
   devices don't run).
4. Requests a real `/player` response (WEB_REMIX, logged-in cookie from
   `innertube_cookie.txt`, STS pinned to the candidate player), deciphers a real
   `signatureCipher`, and **GETs the CDN**. `HTTP 206` = the pair is correct; `403` =
   wrong. This is the only acceptable proof — multiple constant pairs "decipher"
   plausibly, only one is accepted by the server (doc 01).
5. Prints a paste-ready JSON entry including the MD5 alias. If the committed file already
   has an entry for the hash, it re-validates that entry first.

## `.github/workflows/player-monitor.yml` — the hourly watchdog

Runs hourly (`cron: '0 * * * *'`) + manual dispatch. Step by step, with the reasoning the
file itself documents:

1. **Get the live player hash**: scrape the 8-hex player hash from
   `https://www.youtube.com/iframe_api`.
2. **Fetch the config file ONCE, from the live URL** (app commit `8bdb956`):
   `curl -fsS --retry 3` against the same raw zemer-cipher `master` URL devices fetch — so
   the verdict is about *what deployed apps actually self-heal from*, and never
   false-alarms when cipher `master` is ahead of the app's submodule pointer. Fallback to
   the submodule copy only with an explicit `::warning::` (it can lag `master`); if both
   fail, the step fails — a broken monitor is a red run, not silence.
3. **Decide "known" like a device would** (app commit `4b47b6f`):
   `node tests/config-covers.mjs <hash> /tmp/player_configs.json` runs the file through
   the harness loader (= the app's validation rules) and matches against real keys +
   aliases, printing `covered`/`uncovered`. A textual grep would stay green when a pushed
   entry exists but fails validation — i.e. **exactly during a fleet outage**, since
   devices reject an invalid file wholesale. `config-covers.mjs` therefore exits 1 on an
   invalid file and the workflow treats the hash as unknown.
4. **MD5 fallback**: if the primary hash is uncovered, compute the md5-of-first-10000-bytes
   alias (`curl … | head -c 10000 | md5sum | cut -c1-8`) and check coverage again — the
   device would find the entry through the alias too.
5. **Alert** (only if both are uncovered): open a GitHub issue (labels `player-update`,
   `cipher`; deduped by title against open issues) and send an email to
   `dietdroidwp@gmail.com` via Gmail SMTP secrets. Both contain the exact runbook commands
   (doc 07).

The monitor **never auto-commits** — entries are derived, 206-validated, and pushed by a
human. By design: the validation needs a logged-in cookie and live-CDN judgment that CI
shouldn't hold.

## Drift containment, summarized

| Drift risk | Mechanism that kills it |
|---|---|
| Harness table ≠ app table | both read the one JSON file; mirrors deleted (`1b05655`) |
| Kotlin parser ≠ JS loader (file-level) | shared `config-parity/` fixtures run by both suites |
| n-template Kotlin ≠ JS ≠ validator | byte-pinned to `n-template-Yx.golden`; validator imports `nTrick` |
| Monitor verdict ≠ device behavior | monitor runs the harness loader on the live file |
| Bundled asset invalid | `BundledAssetTest` parses the real asset every build |

Still mirrored on purpose (NOT configs): client definitions and poToken constants —
`tests/clients.mjs` / `tests/potoken.mjs` must be updated by hand when `YouTubeClient.kt` /
`PoTokenGenerator.kt` change.
