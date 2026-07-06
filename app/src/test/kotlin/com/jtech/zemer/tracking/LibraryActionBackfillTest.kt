package com.jtech.zemer.tracking

import com.jtech.zemer.db.entities.ActionSnapshotRow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * Guards the action-backfill conversion policy (contract:
 * handoff-docs/zemer-tracking-action-backfill-request.md, SETTLED): wall-clock snapshot
 * timestamps convert with the DEVICE ZONE (the play-backfill bug class), the window is the
 * server's now−10y..now+5min — NOT plays' 3-year floor, since an old likedDate on a still-liked
 * song is a long-standing favorite — and favorites always precede downloads so an interrupted
 * drain lands the primary signal first.
 */
class LibraryActionBackfillTest {

    private val now = 1_800_000_000_000L
    private val utc: ZoneId = ZoneOffset.UTC

    private fun row(id: String, millis: Long, zone: ZoneId = utc) =
        ActionSnapshotRow(id, LocalDateTime.ofInstant(Instant.ofEpochMilli(millis), zone))

    @Test
    fun `a snapshot row converts to the exact wire line with its original timestamp`() {
        assertEquals(
            """{"type":"action_backfill","t":1799000000000,"kind":"favorite","id":"zVRL5bTbDwk"}""",
            actionBackfillLine("favorite", "zVRL5bTbDwk", 1_799_000_000_000L, now),
        )
    }

    @Test
    fun `rows the server would discard convert to nothing`() {
        val tenYearsMs = 10L * 365 * 24 * 60 * 60 * 1000
        assertNull(actionBackfillLine("favorite", "v", now - tenYearsMs - 1, now)) // too old
        assertNull(actionBackfillLine("favorite", "v", now + 6 * 60 * 1000, now)) // future beyond tolerance
        assertNull(actionBackfillLine("favorite", "", now - 1000, now)) // blank id
    }

    @Test
    fun `the window floor is 10 years, not plays' 3 — long-standing favorites survive`() {
        val fourYearsAgo = now - 4L * 365 * 24 * 60 * 60 * 1000
        assertEquals(
            """{"type":"action_backfill","t":$fourYearsAgo,"kind":"favorite","id":"v"}""",
            actionBackfillLine("favorite", "v", fourYearsAgo, now),
        )
    }

    @Test
    fun `wall-clock timestamps convert with the device zone, not UTC`() {
        val zone = ZoneOffset.ofHours(3) // e.g. Israel daylight time
        // Liked one minute ago by wall clock: the naive UTC reading puts t ~3 h in the future
        // (past now+5min → silently dropped); zone-correct conversion lands it 1 min in the past.
        val lines = actionBackfillLines(
            favorites = listOf(row("fresh", now - 60_000, zone)),
            downloads = emptyList(),
            nowMillis = now,
            zone = zone,
        )
        assertEquals(
            listOf("""{"type":"action_backfill","t":${now - 60_000},"kind":"favorite","id":"fresh"}"""),
            lines,
        )
    }

    @Test
    fun `favorites precede downloads and each carries its own kind`() {
        val lines = actionBackfillLines(
            favorites = listOf(row("f1", now - 2000), row("f2", now - 1000)),
            downloads = listOf(row("d1", now - 3000)),
            nowMillis = now,
            zone = utc,
        )
        assertEquals(3, lines.size)
        assertTrue(lines[0].contains("\"kind\":\"favorite\"") && lines[0].contains("\"id\":\"f1\""))
        assertTrue(lines[1].contains("\"kind\":\"favorite\"") && lines[1].contains("\"id\":\"f2\""))
        assertTrue(lines[2].contains("\"kind\":\"download\"") && lines[2].contains("\"id\":\"d1\""))
    }

    @Test
    fun `unconvertible rows are skipped without affecting the rest`() {
        val lines = actionBackfillLines(
            favorites = listOf(row("good", now - 1000), row("", now - 1000)),
            downloads = listOf(row("ancient", now - 11L * 365 * 24 * 60 * 60 * 1000)),
            nowMillis = now,
            zone = utc,
        )
        assertEquals(1, lines.size)
        assertTrue(lines[0].contains("\"id\":\"good\""))
    }

    @Test
    fun `an empty library converts to an empty upload`() {
        assertTrue(actionBackfillLines(emptyList(), emptyList(), now, utc).isEmpty())
    }
}
