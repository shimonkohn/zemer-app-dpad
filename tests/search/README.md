# tests/search — search-path harness

Exercises **every** YouTube Music search function the app calls, **exactly as the app does**, against
the live API, and reports any error: a strict-deserialization break, a parser drop, the
`searchContinuation` `!!` NPE, or an unexpectedly empty result. Built to answer "why is search not
working?" with measured data instead of guesses (same philosophy as the parent `tests/` harness).

## What it reproduces

The app's search entry points, all on the `WEB_REMIX` client:

| App function (`YouTube.kt`) | Request | Parser |
| --- | --- | --- |
| `searchSuggestions(query)` | POST `music/get_search_suggestions` | `SearchSuggestionPage` |
| `searchSummary(query)` | POST `search` (no params) | `SearchSummaryPage` (card + sections) |
| `search(query, filter)` x6 filters | POST `search` (params) | `SearchPage.toYTItem` |
| `searchContinuation(token)` | POST `search?continuation=&ctoken=` | `SearchPage.toYTItem` |

**Faithfulness facts** (verified against `InnerTube.kt`):
- Search runs with `setLogin = false` — the app sends **visitorData only, no cookie/Authorization**.
  The harness matches this (it does read `innertube_cookie.txt` only to reuse its `visitorData`).
- The 6 `SearchFilter` param strings, the request body shape, and the section-walking logic
  (`musicShelfRenderer` + `itemSectionRenderer`, `distinctBy id`) are copied verbatim.
- `lib.mjs` / `parsers.mjs` are line-for-line ports of the InnerTube helpers, the
  `MusicResponsiveListItemRenderer` accessors, and the four parsers. A drop here = a drop in the app.

## The strict-deserialization check (the big one)

The app decodes with kotlinx `ignoreUnknownKeys=true`, `explicitNulls=false`, **no
`coerceInputValues`**. So a Kotlin property that is **non-null and has no default** is REQUIRED: if
YouTube stops sending it, `body<SearchResponse>()` throws `MissingFieldException` and the **entire**
response fails — `YouTube.search*().getOrNull()` swallows it to `null` and the UI shows "No results".
One missing field kills every result.

`schema.mjs` encodes, per renderer reachable from a search response, which fields are required vs
optional (transcribed from the Kotlin models) and `validate()` walks the live JSON the same way
kotlinx would, flagging every non-null field the server omitted. **When a model's nullability
changes, update the matching entry here.** Subtrees that never appear in a search response
(`gridRenderer`, `musicQueueRenderer`, …) are intentionally unencoded and reported in `unencoded` if
ever met, so the sweep never silently skips something.

## Run

```bash
node tests/search/run.mjs                       # default query set, every function
node tests/search/run.mjs "mordechai shapiro"   # one query
node tests/search/run.mjs q1 q2 ...             # several queries
SAVE=1 node tests/search/run.mjs                # also dump raw JSON to tests/search/out/
node --test tests/search/self-test.mjs          # prove the checker catches breaks (no network)
```

Exit code: `0` = no whole-response killers; `1` = a strict break or continuation NPE was found.

### Whitelist-driven probes (need a names file at `tests/search/.cache/whitelist.json`, gitignored)

```bash
node tests/search/fetch-whitelist.mjs           # pull the whitelist (reads gitignored google-services.json)
N=300 node tests/search/coverage.mjs            # every function over N real whitelisted artists; aggregates errors
node tests/search/whitelist-findable.mjs        # are whitelisted artists findable in artist search? (drop reasons)
node tests/search/album-facet-probe.mjs         # ROOT CAUSE: which artists get an "Albums" search chip
node tests/search/verify-album-fix.mjs          # proves the artist-page album grid (the fix's data source)
```

`diag-auth.mjs` holds authenticated `search`/`browse` helpers for these probes — **diagnostic only**,
not a model of the app's real (unauthenticated) search path.

## Out of scope (by design)

Zemer's **artist-whitelist filter** (`app/.../utils/WhitelistFilter.kt`) runs *after* these functions
in `OnlineSearchViewModel` and drops every item whose artist isn't whitelisted. It needs the app's
Room DB, so it can't run here — but it is the **next** suspect when these functions are healthy and
search still looks empty (an empty/un-synced whitelist drops everything).

## Findings (2026-06-12, current `main`)

Across `searchSuggestions`, `searchSummary`, all 6 filters, and `searchContinuation` over 300 real
whitelisted-artist queries: **no strict breaks, no continuation NPE, parsers extract 100% of music
items.** The InnerTube search layer is structurally healthy. Other observations:
- `searchSummary` drops a few items per query — all `MUSIC_PAGE_TYPE_USER_CHANNEL` profiles and
  podcasts, which the app doesn't classify as music (and the whitelist would drop anyway).
- `searchContinuation` has a `!!` that NPE'd for ~4/300 artists when the continuation came back in a
  non-`musicShelfContinuation` shape; ~48/300 artist searches drop the artist for a missing
  shuffle/radio endpoint. Both are latent robustness issues (separate fixes), not the album problem.

## Why album search is empty for whitelisted artists (root cause)

Symptom: the "Albums" search tab / an artist's "Albums" come back empty for whitelisted (independent,
mostly Jewish) artists — **even though their channel page lists every album**. This used to work.

It is **not** the app's params, auth, or code, and **not** fixable in the search request:

| | "Albums" chip offered in search? | album search result | albums on `/browse` page |
| --- | --- | --- | --- |
| Taylor Swift (Official Artist Channel) | yes | 20 | yes |
| Mordechai Shapiro (independent) | **no** | **0** | **22** |
| Yaakov Shwekey / Baruch Levine / Avraham Fried | no | 0 | 24 / 23 / 24 |

The chip cloud is YouTube telling you which result categories exist for a query. **YouTube stopped
exposing an album facet in search for non-Official-Artist-Channel artists** — no "Albums" chip, and
`search?filter=albums` returns a "No results" `messageRenderer` regardless of the params (app's hard-
coded vs YouTube's current context segment) or authentication. Mainstream/OAC artists still get the
facet. The albums still exist as real `MPREb_…` entities — **only on the artist's `/browse` page now.**
(Reproduce: `album-facet-probe.mjs`, `verify-album-fix.mjs`.)

### The app-side bug + fix

`ArtistScreen` special-cased the "Albums" section's "see all" to navigate to `search?filter=albums`
(the now-dead facet), while **every other section** navigates via its own `section.moreEndpoint` — the
artist's item grid loaded by `YouTube.artistItems()`, which sources straight from the `/browse` page
where the albums still live. The fix removes that special-case so "Albums" uses `moreEndpoint` like the
rest. Verified: the album grid returns 34 / 19 albums for Shwekey / Levine; artists with no overflow
(Shapiro) show all albums inline in the carousel. The search `FILTER_ALBUM` chip for free-text queries
is a separate, optional follow-up (resolve the query to a whitelisted artist, then pull their page
albums) — not done here.
