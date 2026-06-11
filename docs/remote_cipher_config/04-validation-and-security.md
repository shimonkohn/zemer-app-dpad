# 04 — Validation and the security boundary: `PlayerConfigParser`

File: `cipher/library/src/main/kotlin/com/zemer/cipher/PlayerConfigParser.kt`. Pure JVM by
design — no Android or Timber imports — so the *entire* validation surface is covered by
plain unit tests (`PlayerConfigParserTest.kt`, `ConfigParityFixturesTest.kt`,
`NJsExpressionTemplateTest.kt`).

## The threat model

Every value in `player_configs.json` ultimately influences JavaScript **evaluated inside
the cipher WebView on the device** (`CipherWebView`, which loads the YouTube player JS and
the exported transform functions). The file is fetched over HTTPS from a GitHub repo — but
the design treats the remote file as untrusted anyway: a compromised repo, a poisoned
cache, or a tampered response must not be able to run arbitrary JS in the app.

The defense is **shape, not sanitization**: fields are regex-locked to grammars too small
to express code.

- `sig` must match `^[A-Za-z0-9$_]{1,8}\(\d+,\d+,INPUT\)$` — exactly one call of one short
  identifier with two integer literals and the `INPUT` token. No dots, quotes, operators,
  semicolons, parens beyond the one pair, no whitespace. The worst a malicious value can
  do is call the wrong player-internal function with wrong constants → deciphering fails →
  playback falls back; nothing escapes the expression.
- `nClass` must match `^[A-Za-z0-9$_]{1,8}$` — a bare identifier. It is interpolated into
  a **locally built template**, never used as code itself:

## The n-IIFE template — built device-side, pinned byte-for-byte

`PlayerConfigParser.buildNJsExpression(nClass)` produces (with `$nClass` interpolated):

```js
(function(n){try{var u=new g.$nClass('https://x.googlevideo.com/videoplayback?n='+n,true);var t=u.get('n');return(t&&t!==n)?t:n;}catch(e){return n;}})(INPUT)
```

What it does: constructs the player's URL-wrapper class `g.<nClass>` around a fake
googlevideo URL carrying the current `n`, reads `n` back via `.get('n')` — the class's
internal canonicalization applies the n-transform — and returns the transformed value
(falling back to the input if unchanged or on any exception, so a wrong class degrades to
"no transform" rather than an error).

The remote file **cannot supply this expression**; it only supplies the class name. The
template exists in exactly two implementations — Kotlin (`buildNJsExpression`) and JS
(`nTrick` in `tests/player-configs.mjs`) — and both are pinned **byte-for-byte** to the
same golden file, `config-parity/n-template-Yx.golden`
(`NJsExpressionTemplateTest.kt` in the cipher repo; the template test in
`tests/player-configs.test.mjs` in the app repo — cipher commit `d78a8b3`, app commit
`53d2aa0`). Consequence: what `validate-player-config.mjs` proves with an HTTP 206 is
byte-identical to what devices will evaluate. Change the template in one place and one of
the two test suites goes red.

## What a parsed entry becomes

`parseEntry()` maps a JSON entry onto the pre-existing `HardcodedPlayerConfig` shape
(`FunctionNameExtractor.kt`) in *expression form*:

```kotlin
HardcodedPlayerConfig(
    sigFuncName = "_expr_sig",          // marker names; the expressions carry the logic
    sigJsExpression = sig,               // e.g. "mP(4,155,INPUT)"
    nFuncName = "_expr_n",
    nJsExpression = buildNJsExpression(nClass),
    signatureTimestamp = sts,
    sigConstantArg/nArrayIndex/nConstantArgs = null,
)
```

The legacy named-function fields stay `null`; downstream (`CipherWebView`) branches on
`jsExpression != null` (doc 05).

## File-level vs entry-level, and the parity fixtures

The split (skip a bad entry / reject a bad file, including any duplicate hash-or-alias
key) is specified in doc 02. What keeps the two readers honest about it:

```
cipher/library/src/test/resources/config-parity/
  accept-empty-players.json          accept-entry-with-alias.json
  reject-malformed.json              reject-root-array.json
  reject-players-missing.json        reject-alias-collision.json
  reject-schema-version-missing.json reject-schema-version-string.json
  reject-schema-version-zero.json    reject-schema-version-future.json
  n-template-Yx.golden
```

Both test suites iterate this **same directory** (the app repo reaches it through the
submodule path): Kotlin's `ConfigParityFixturesTest` asserts every `accept-*` parses as
`Success` and every `reject-*` as `Failure`; the harness's `player-configs.test.mjs`
asserts `parsePlayerConfigs` returns / throws on the same files. Only *file-level*
verdicts are pinned — entry-level behavior intentionally differs (app skips, harness
throws). **Rule:** changing a validation rule requires updating both readers AND the
fixtures, or one suite goes red — that's the mechanism, not a convention.

The `reject-schema-version-string.json` fixture exists because the two readers initially
*disagreed* on `"schemaVersion": "1"` (Kotlin's `toIntOrNull` on a string primitive's
content would have accepted it; `Number.isInteger` would not) — cipher commit `ee29c60`
made the Kotlin parser require a non-string primitive (`takeIf { !it.isString }`, same
technique as the `sts` check) and pinned the case forever.

## Why rejection is always safe

Every consumer of `ParseResult.Failure` keeps its previous state: the store keeps the
previous in-memory map and the previous disk cache (doc 03), the monitor treats the hash
as unknown and alerts (doc 06), the harness aborts the test run loudly. There is no path
where an invalid file *degrades* a device below its last-good table — the worst-case
outcome of any push is "no change".
