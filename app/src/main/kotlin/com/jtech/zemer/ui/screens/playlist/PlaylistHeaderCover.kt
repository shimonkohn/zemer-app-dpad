package com.jtech.zemer.ui.screens.playlist

/**
 * Cover art for a community / online playlist.
 *
 * Picks the first **content-filtered** track's thumbnail ([thumbnailOf]) instead of the raw
 * curator/YouTube playlist image. That raw image bypasses the content filter, so an all/mostly-female
 * playlist would otherwise show a female cover even when female is blocked (and persist it into the
 * Library when the playlist is saved). The supplied track list has already passed `filterWhitelisted`,
 * so its first entry is guaranteed to be a surviving (whitelisted, non-female-when-blocked) track.
 *
 * Returns `null` when nothing survives (e.g. still loading, or a 100%-filtered playlist) so callers
 * render their neutral placeholder rather than falling back to the raw curator image.
 */
fun <T> filteredPlaylistCover(filteredSongs: List<T>, thumbnailOf: (T) -> String?): String? =
    filteredSongs.firstOrNull()?.let(thumbnailOf)
