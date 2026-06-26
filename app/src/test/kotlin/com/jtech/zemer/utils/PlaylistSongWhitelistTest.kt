package com.jtech.zemer.utils

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression tests for [shouldKeepPlaylistSong] — the pure decision behind the issue #130 fix
 * (songs the user added to a synced playlist vanished locally while staying in YouTube Music).
 *
 * The rule keeps the app 100% whitelisted: a song is kept ONLY when a whitelisted artist is
 * resolvable from the playlist renderer OR the local DB row. The local-DB fallback is what stops a
 * sparse/mismatched playlist renderer from dropping a song that is genuinely by a whitelisted artist.
 */
class PlaylistSongWhitelistTest {

    private val allowed = setOf("UC_white1", "UC_white2")

    @Test
    fun `kept when the playlist renderer already names a whitelisted artist`() {
        assertTrue(shouldKeepPlaylistSong(listOf("UC_white1"), emptyList(), allowed))
    }

    @Test
    fun `kept when the renderer is sparse but the local row resolves a whitelisted artist`() {
        // The #130 case: playlist renderer omitted the artist id; the song the user added was saved
        // locally with the correct (whitelisted) artist, so it must survive sync.
        assertTrue(shouldKeepPlaylistSong(emptyList(), listOf("UC_white2"), allowed))
    }

    @Test
    fun `kept when the renderer reports a wrong topic channel but the local row is whitelisted`() {
        // Renderer reports a "- Topic"/mismatched channel that is not whitelisted; the local row
        // carries the real whitelisted channel, which wins.
        assertTrue(shouldKeepPlaylistSong(listOf("UC_topic_mismatch"), listOf("UC_white1"), allowed))
    }

    @Test
    fun `dropped when no source resolves a whitelisted artist`() {
        assertFalse(shouldKeepPlaylistSong(listOf("UC_other"), listOf("UC_alsoOther"), allowed))
    }

    @Test
    fun `dropped when no artist is resolvable at all (100 percent whitelist, never keep the unverified)`() {
        assertFalse(shouldKeepPlaylistSong(emptyList(), emptyList(), allowed))
    }

    @Test
    fun `dropped when the allow-set is empty (whitelist not loaded keeps nothing)`() {
        assertFalse(shouldKeepPlaylistSong(listOf("UC_white1"), listOf("UC_white2"), emptySet()))
    }
}
