package com.jtech.zemer.tracking

import android.content.Context
import androidx.datastore.preferences.core.edit
import com.jtech.zemer.constants.TrackingBackfillBoundKey
import com.jtech.zemer.constants.TrackingBackfillCursorKey
import com.jtech.zemer.constants.TrackingBackfillDoneKey
import com.jtech.zemer.db.MusicDatabase
import com.jtech.zemer.db.entities.Event
import com.jtech.zemer.utils.dataStore
import com.jtech.zemer.utils.getSuspend
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import timber.log.Timber
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.concurrent.atomic.AtomicBoolean

/**
 * True epoch millis of a listen-history timestamp. The Room `event.timestamp` column stores the
 * device's LOCAL wall-clock time (`LocalDateTime.now()` at write), so the conversion must apply
 * the device [zone] — interpreting the wall time as UTC would shift every `t` by the zone offset,
 * pushing the freshest hours of an east-of-UTC user's history past the server's now+5min bound
 * (review-confirmed: that silently dropped the newest pre-upgrade listens for the app's primary
 * audience). Historical DST transitions can still skew individual rows by ≤1 h — immaterial for
 * taste modeling.
 */
internal fun historyEventEpochMillis(timestamp: LocalDateTime, zone: ZoneId): Long =
    timestamp.atZone(zone).toInstant().toEpochMilli()

/**
 * One backfill row as a wire line, or null when the server would reject/ignore it: zero play time,
 * a timestamp older than the server's 3-year acceptance window, or in the future.
 */
internal fun backfillLine(songId: String, timestampMillis: Long, playTimeMs: Long, nowMillis: Long): String? {
    if (songId.isEmpty()) return null
    val secs = (playTimeMs / 1000L).toInt()
    if (secs <= 0) return null
    if (timestampMillis > nowMillis + FUTURE_TOLERANCE_MS) return null
    if (timestampMillis < nowMillis - MAX_BACKFILL_AGE_MS) return null
    return TrackingEvents.playBackfill(timestampMillis, songId, secs).toString()
}

/** One drained batch: the uploadable wire lines and the id cursor to persist after the ack. */
internal data class BackfillBatch(val lines: List<String>, val nextCursorId: Long)

/**
 * Converts one page of history rows into an uploadable batch (pure — the whole per-batch policy is
 * unit-tested): rows convert via [backfillLine]; unconvertible rows are skipped but still covered
 * by the id cursor so the drain always advances. Null when [rows] is empty = the drain is done.
 */
internal fun planBackfillBatch(rows: List<Event>, nowMillis: Long, zone: ZoneId): BackfillBatch? {
    if (rows.isEmpty()) return null
    return BackfillBatch(
        lines = rows.mapNotNull {
            backfillLine(it.songId, historyEventEpochMillis(it.timestamp, zone), it.playTime, nowMillis)
        },
        nextCursorId = rows.last().id,
    )
}

private const val MAX_BACKFILL_AGE_MS = 3L * 365 * 24 * 60 * 60 * 1000 // server accepts now−3y
private const val FUTURE_TOLERANCE_MS = 5L * 60 * 1000 // …to now+5min

/**
 * One-time upload of the device's local listen history (the Room `event` table) as `play_backfill`
 * events — the recommender's warm start (contract:
 * handoff-docs/zemer-tracking-history-backfill-request.md, shipped server-side; stored unclamped,
 * segregated from live plays, deduped on (device, videoId, t)).
 *
 * Fire-and-forget like all telemetry, with these deliberate properties:
 * - **Bypasses the live queue** via [Tracker.uploadBackfill] — thousands of history rows must never
 *   flood the 500-cap live event queue — while SHARING the single-in-flight discipline and failure
 *   backoff with the live path.
 * - **Bounded**: the max event-row id is captured on the very first run (before the start delay)
 *   and persisted; rows above it were already reported live by the tracker and must not be
 *   double-counted as backfill. (Rows written by tracking-enabled builds BEFORE this feature
 *   shipped can still appear in both — a bounded, acknowledged skew.)
 * - **Resumable, loss-free**: the cursor is the last acked row's autoincrement id (a timestamp
 *   cursor skips equal-timestamp rows at batch boundaries), persisted after every acked batch; any
 *   failure aborts silently and a later launch resumes. Server dedup makes a replayed boundary
 *   batch harmless. The done-flag stops it permanently — checked BEFORE the database is ever
 *   opened, so completed installs never pay a Room open on this path.
 * - **Paced**: ≤100-row batches, one per [BATCH_PACE_MS] AFTER a real upload only (all-filtered
 *   pages advance without sleeping), started [START_DELAY_MS] after launch.
 */
object PlayHistoryBackfill {
    private val started = AtomicBoolean(false)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** [database] is a provider so the DB isn't opened unless the backfill actually has work. */
    fun maybeStart(context: Context, database: () -> MusicDatabase) {
        if (!started.compareAndSet(false, true)) return
        val appContext = context.applicationContext
        scope.launch {
            runCatching { run(appContext, database) }
                .onFailure { Timber.tag(TAG).d(it, "Backfill aborted; will resume next launch") }
        }
    }

    private suspend fun run(context: Context, databaseProvider: () -> MusicDatabase) {
        if (context.dataStore.getSuspend(TrackingBackfillDoneKey, false)) return
        // Capture the upper bound FIRST (persisted once): everything the player writes from now on
        // is live-tracked and must never also upload as backfill — even if this run keeps failing
        // and a much later launch finishes the drain.
        val database = databaseProvider()
        var bound = context.dataStore.getSuspend(TrackingBackfillBoundKey, 0L)
        if (bound == 0L) {
            bound = database.maxEventId()
            if (bound == 0L) {
                context.dataStore.edit { it[TrackingBackfillDoneKey] = true }
                return // no history at all
            }
            context.dataStore.edit { it[TrackingBackfillBoundKey] = bound }
        }

        delay(START_DELAY_MS)

        var cursorId = context.dataStore.getSuspend(TrackingBackfillCursorKey, 0L)
        var uploadedRows = 0
        var droppedRows = 0
        val zone = ZoneId.systemDefault()
        while (true) {
            val rows = database.eventsForBackfill(cursorId, bound, BATCH_ROWS)
            val batch = planBackfillBatch(rows, System.currentTimeMillis(), zone)
            if (batch == null) {
                context.dataStore.edit { it[TrackingBackfillDoneKey] = true }
                Timber.tag(TAG).d(
                    "Backfill complete: $uploadedRows rows uploaded" +
                        if (droppedRows > 0) ", $droppedRows rejected by the server" else ""
                )
                return
            }

            if (batch.lines.isNotEmpty()) {
                when (Tracker.uploadBackfill(batch.lines)) {
                    TrackingUploader.Result.Success -> uploadedRows += batch.lines.size
                    TrackingUploader.Result.DropBatch -> {
                        // Same policy as the live path — a malformed batch is never retried — but
                        // NEVER silent: this is real history being dropped.
                        droppedRows += batch.lines.size
                        Timber.tag(TAG).w("Server rejected a backfill batch; dropped ${batch.lines.size} rows")
                    }
                    // Network/server trouble: stop quietly; the cursor resumes a later launch.
                    else -> return
                }
            }
            cursorId = batch.nextCursorId
            context.dataStore.edit { it[TrackingBackfillCursorKey] = cursorId }
            // Pace only actual uploads; all-filtered pages advance without burning wall-clock.
            if (batch.lines.isNotEmpty()) delay(BATCH_PACE_MS)
        }
    }

    private const val TAG = "Zemer_Tracker"
    private const val BATCH_ROWS = 100
    private const val BATCH_PACE_MS = 3_000L
    private const val START_DELAY_MS = 45_000L
}
