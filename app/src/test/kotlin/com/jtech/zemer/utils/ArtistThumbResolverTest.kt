package com.jtech.zemer.utils

import com.jtech.zemer.db.entities.ArtistWhitelistEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-JVM guards for the artist-thumbnail follow-ups:
 * - [ArtistThumbResolver.shouldAttempt] — the attempt policy that replaced both broken per-VM
 *   policies (remove-on-failure = retry storm on every recomposition; keep-on-failure = one transient
 *   failure blacklists the artist for the whole session).
 * - [artistThumbnailUpdates] — the sync-population rules (null/blank never written, only existing
 *   artist rows targeted), previously untested inline logic.
 */
class ArtistThumbResolverTest {

    private val cooldown = ArtistThumbResolver.FAILURE_RETRY_COOLDOWN_MS

    @Test
    fun `first request for an id is attempted`() {
        assertTrue(ArtistThumbResolver.shouldAttempt(emptySet(), emptyMap(), "UC1", nowMs = 1_000))
    }

    @Test
    fun `in-flight or definitively-resolved ids are never re-attempted`() {
        assertFalse(ArtistThumbResolver.shouldAttempt(setOf("UC1"), emptyMap(), "UC1", nowMs = 1_000))
    }

    @Test
    fun `a transient failure is held back only for the cooldown, then heals in place`() {
        val failedAt = mapOf("UC1" to 10_000L)
        // Within the cooldown: no re-attempt (this is what stops the every-recomposition retry storm).
        assertFalse(ArtistThumbResolver.shouldAttempt(emptySet(), failedAt, "UC1", nowMs = 10_000 + cooldown - 1))
        // After the cooldown: retried (this is what fixes the offline-at-open permanent blacklist).
        assertTrue(ArtistThumbResolver.shouldAttempt(emptySet(), failedAt, "UC1", nowMs = 10_000 + cooldown))
    }

    // --- artistThumbnailUpdates (sync population rules) ---

    private fun entry(id: String, thumb: String?) =
        ArtistWhitelistEntity(artistId = id, artistName = "A").also { it.thumbnailUrl = thumb }

    @Test
    fun `null or blank thumbnails are never written`() {
        val updates = artistThumbnailUpdates(
            listOf(entry("a", null), entry("b", ""), entry("c", "   ")),
            existingArtistIds = setOf("a", "b", "c"),
        )
        assertTrue(updates.isEmpty())
    }

    @Test
    fun `only rows already in the artist table are targeted`() {
        val updates = artistThumbnailUpdates(
            listOf(entry("existing", "https://yt3/x"), entry("new", "https://yt3/y")),
            existingArtistIds = setOf("existing"),
        )
        assertEquals(listOf("existing" to "https://yt3/x"), updates)
    }
}
