package com.jtech.zemer.tracking

import com.jtech.zemer.db.entities.Event
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * Guards the backfill conversion + batch policy (contract:
 * handoff-docs/zemer-tracking-history-backfill-request.md): wall-clock history timestamps convert
 * with the DEVICE ZONE (treating them as UTC dropped the freshest hours for east-of-UTC users —
 * the app's primary audience), rows outside the server window / zero-play / blank convert to
 * nothing, and the id cursor always advances past skipped rows so the drain is loss-free.
 */
class PlayHistoryBackfillTest {

    private val now = 1_800_000_000_000L
    private val utc: ZoneId = ZoneOffset.UTC

    @Test
    fun `history wall-clock timestamps convert with the device zone, not UTC`() {
        val wall = LocalDateTime.of(2026, 1, 1, 12, 0)
        // Wall time 12:00 in UTC+3 is 09:00Z — three hours EARLIER than the naive UTC reading.
        assertEquals(
            wall.toInstant(ZoneOffset.UTC).toEpochMilli() - 3 * 60 * 60 * 1000,
            historyEventEpochMillis(wall, ZoneOffset.ofHours(3)),
        )
        assertEquals(wall.toInstant(ZoneOffset.UTC).toEpochMilli(), historyEventEpochMillis(wall, utc))
    }

    @Test
    fun `the east-of-UTC freshest-history case survives conversion`() {
        val zone = ZoneOffset.ofHours(3) // e.g. Israel daylight time
        // A listen finished one minute ago by wall clock.
        val wall = LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(now - 60_000), zone)
        val t = historyEventEpochMillis(wall, zone)
        // Correct conversion lands ~1 min in the past — inside the window; the old UTC reading put
        // it ~3 h in the future and dropped it.
        assertEquals(now - 60_000, t)
        assertEquals(
            """{"type":"play_backfill","t":$t,"videoId":"v","secs":100}""",
            backfillLine("v", t, 100_000, now),
        )
    }

    @Test
    fun `a history row converts to the exact wire line with its original timestamp`() {
        assertEquals(
            """{"type":"play_backfill","t":1799000000000,"videoId":"zVRL5bTbDwk","secs":143}""",
            backfillLine("zVRL5bTbDwk", 1_799_000_000_000L, playTimeMs = 143_500, nowMillis = now),
        )
    }

    @Test
    fun `rows the server would reject convert to nothing`() {
        val threeYearsMs = 3L * 365 * 24 * 60 * 60 * 1000
        assertNull(backfillLine("v", now - threeYearsMs - 1, 10_000, now)) // too old
        assertNull(backfillLine("v", now + 6 * 60 * 1000, 10_000, now)) // future beyond tolerance
        assertNull(backfillLine("v", now - 1000, 999, now)) // zero seconds
        assertNull(backfillLine("", now - 1000, 10_000, now)) // blank id
    }

    // ---- the pure batch planner ----

    private fun event(id: Long, songId: String = "v$id", minusMinutes: Long = 60, playMs: Long = 30_000) =
        Event(
            id = id,
            songId = songId,
            timestamp = LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(now - minusMinutes * 60_000), utc),
            playTime = playMs,
        )

    @Test
    fun `empty page means the drain is done`() {
        assertNull(planBackfillBatch(emptyList(), now, utc))
    }

    @Test
    fun `a page converts its rows and cursors on the LAST row id`() {
        val batch = planBackfillBatch(listOf(event(10), event(11), event(12)), now, utc)!!
        assertEquals(3, batch.lines.size)
        assertEquals(12L, batch.nextCursorId)
    }

    @Test
    fun `unconvertible rows are skipped but the cursor still advances past them`() {
        val batch = planBackfillBatch(
            listOf(
                event(20),
                event(21, playMs = 0), // never played long enough — no line
                event(22, songId = ""), // sparse row — no line
            ),
            now,
            utc,
        )!!
        assertEquals(1, batch.lines.size)
        assertEquals(22L, batch.nextCursorId) // an all-skipped tail must not stall the drain
    }
}
