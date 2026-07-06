package com.jtech.zemer.db.entities

import java.time.LocalDateTime

/**
 * Query projection (not a table) for the one-shot library-action telemetry backfill: one
 * currently-liked or currently-downloaded song id with its wall-clock action timestamp
 * (`likedDate` / `dateDownload`). See tracking/LibraryActionBackfill.kt.
 */
data class ActionSnapshotRow(
    val id: String,
    val timestamp: LocalDateTime,
)
