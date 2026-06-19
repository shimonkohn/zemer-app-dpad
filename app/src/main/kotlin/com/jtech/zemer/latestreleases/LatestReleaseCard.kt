package com.jtech.zemer.latestreleases

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.navigation.NavController
import com.jtech.zemer.db.MusicDatabase
import com.jtech.zemer.models.MediaMetadata
import com.jtech.zemer.playback.PlayerConnection
import com.jtech.zemer.ui.component.LocalMenuState
import com.jtech.zemer.ui.component.YouTubeGridItem
import com.jtech.zemer.ui.component.YouTubeListItem
import com.jtech.zemer.ui.menu.YouTubeAlbumMenu
import com.jtech.zemer.utils.joinByBullet
import kotlinx.coroutines.CoroutineScope

/**
 * One Latest Releases card, shared by the Home shelf ([asGrid] = true, a [YouTubeGridItem]) and the
 * "See all" list ([asGrid] = false, a [YouTubeListItem]). Keeping the binding here — album mapping,
 * the "Artist • <relative date>" subtitle, the single's centred play button, the now-playing state,
 * the tap ([openOrPlay]: play a single / open an album) and the long-press [YouTubeAlbumMenu] — means
 * it exists once and can't drift between the two surfaces.
 *
 * [coroutineScope] is only used by the grid variant (the album play button); the list variant ignores
 * it, so callers that render a list may pass null.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun LatestReleaseCard(
    release: LatestRelease,
    navController: NavController,
    playerConnection: PlayerConnection,
    database: MusicDatabase,
    mediaMetadata: MediaMetadata?,
    isPlaying: Boolean,
    asGrid: Boolean,
    coroutineScope: CoroutineScope? = null,
) {
    val menuState = LocalMenuState.current
    val haptic = LocalHapticFeedback.current
    val album = remember(release.browseId) { release.toAlbumItem() }
    val dateLabel = remember(release.browseId) { release.relativeDateLabel() }
    val subtitle = joinByBullet(release.artistName, dateLabel)
    val clickable = Modifier.combinedClickable(
        onClick = { release.openOrPlay(navController, playerConnection, database) },
        onLongClick = {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            menuState.show {
                YouTubeAlbumMenu(
                    albumItem = album,
                    navController = navController,
                    onDismiss = menuState::dismiss,
                )
            }
        },
    )

    if (asGrid) {
        YouTubeGridItem(
            item = album,
            subtitleOverride = subtitle,
            centeredPlayButton = release.isPlayableSingle(),
            isActive = release.isNowPlaying(mediaMetadata),
            isPlaying = isPlaying,
            coroutineScope = coroutineScope,
            thumbnailRatio = 1f,
            modifier = clickable,
        )
    } else {
        YouTubeListItem(
            item = album,
            subtitleOverride = subtitle,
            centeredPlayButton = release.isPlayableSingle(),
            isActive = release.isNowPlaying(mediaMetadata),
            isPlaying = isPlaying,
            modifier = clickable,
        )
    }
}
