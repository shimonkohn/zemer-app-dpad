package com.jtech.zemer.utils

import com.jtech.zemer.db.MusicDatabase
import com.metrolist.innertube.YouTube
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The ONE on-device artist-thumbnail fallback resolver, shared by every surface (whitelisted-artists
 * tab, KidZone). Thumbnails normally arrive with the whitelist sync; this only runs when a synced URL
 * is missing (a handful of artists) or has rotted (AsyncImage onError), so it must stay rare and cheap:
 *
 * - **Bounded**: at most [MAX_CONCURRENT] InnerTube `YouTube.artist()` browses at once, app-wide — a
 *   batch of rotted URLs can never storm InnerTube (per-VM copies previously left KidZone unbounded).
 * - **Self-healing, not self-blacklisting**: a definitive answer (page fetched, with or without a
 *   thumbnail) is never retried; a transient failure (offline, API error) retries after
 *   [FAILURE_RETRY_COOLDOWN_MS] instead of either retrying on every recomposition (the old
 *   remove-on-failure storm) or never retrying again (the old keep-on-failure dead end).
 * - **Column-targeted write** ([MusicDatabase.replaceArtistThumbnailUrl]) so a concurrent change to
 *   another artist column (e.g. a subscribe setting bookmarkedAt) can never be clobbered by a stale
 *   full-row update. Replace (not fill-only): this path exists to swap out a dead URL.
 */
@Singleton
class ArtistThumbResolver @Inject constructor(
    private val database: MusicDatabase,
) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val semaphore = Semaphore(MAX_CONCURRENT)

    private val lock = Any()
    private val inFlightOrDone = mutableSetOf<String>()
    private val failedAtMs = mutableMapOf<String, Long>()

    fun requestThumb(artistId: String) {
        synchronized(lock) {
            if (!shouldAttempt(inFlightOrDone, failedAtMs, artistId, System.currentTimeMillis())) return
            inFlightOrDone.add(artistId)
            failedAtMs.remove(artistId)
        }
        scope.launch {
            semaphore.withPermit {
                YouTube.artist(artistId)
                    .onSuccess { artistPage ->
                        // Definitive answer — never retried, even when the artist has no thumbnail.
                        artistPage.artist.thumbnail?.takeIf { it.isNotBlank() }?.let { thumb ->
                            database.replaceArtistThumbnailUrl(artistId, thumb)
                            Timber.d("ArtistThumbResolver: resolved thumbnail for %s", artistId)
                        }
                    }
                    .onFailure { throwable ->
                        Timber.w(throwable, "ArtistThumbResolver: resolve failed for %s — retry after cooldown", artistId)
                        synchronized(lock) {
                            inFlightOrDone.remove(artistId)
                            failedAtMs[artistId] = System.currentTimeMillis()
                        }
                    }
            }
        }
    }

    companion object {
        const val MAX_CONCURRENT = 4
        const val FAILURE_RETRY_COOLDOWN_MS = 30_000L

        /**
         * Pure attempt policy: never re-request an id that is in flight or definitively resolved, and
         * hold a transiently-failed id back only for the cooldown — so offline-at-open heals in place
         * once connectivity returns instead of showing default avatars for the whole session.
         */
        fun shouldAttempt(
            inFlightOrDone: Set<String>,
            failedAtMs: Map<String, Long>,
            artistId: String,
            nowMs: Long,
        ): Boolean {
            if (artistId in inFlightOrDone) return false
            val failedAt = failedAtMs[artistId] ?: return true
            return nowMs - failedAt >= FAILURE_RETRY_COOLDOWN_MS
        }
    }
}
