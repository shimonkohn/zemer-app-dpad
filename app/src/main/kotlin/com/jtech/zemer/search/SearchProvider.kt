package com.jtech.zemer.search

/**
 * Which engine backs the online search screen.
 *
 * - [ZEMER] — the whitelist-scoped, Hebrew-aware engine at search.zemer.io (the default). Results are
 *   already content-filtered server-side, so the app does not re-run the local whitelist filter on them.
 * - [YOUTUBE] — the upstream YouTube Music search path, with the local whitelist filter applied on top.
 *
 * Persisted as its [name] under `searchProvider` (see `SearchProviderKey`).
 */
enum class SearchProvider {
    ZEMER,
    YOUTUBE,
}

/**
 * The `online_playlist` nav route for a playlist opened from a search result. Zemer-sourced playlists
 * carry `?zemer=true` so the screen opens them through the server's `/playlist` endpoint (tracks/count/
 * cover match the search card); YouTube-sourced playlists keep the plain InnerTube path.
 */
fun SearchProvider.onlinePlaylistRoute(playlistId: String): String =
    if (this == SearchProvider.ZEMER) "online_playlist/$playlistId?zemer=true" else "online_playlist/$playlistId"
