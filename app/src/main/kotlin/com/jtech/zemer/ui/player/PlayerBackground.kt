package com.jtech.zemer.ui.player

import android.os.Build
import android.util.LruCache
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.palette.graphics.Palette
import coil3.imageLoader
import coil3.request.ImageRequest
import coil3.request.allowHardware
import coil3.toBitmap
import com.jtech.zemer.constants.PlayerBackgroundStyle
import com.jtech.zemer.ui.theme.PlayerColorExtractor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Single source of truth for the player background system, shared by the full player
 * ([BottomSheetPlayer]) and the mini player ([MiniPlayer]) so the two surfaces never disagree.
 *
 * [PlayerBackgroundStyle.BLUR] is rendered with a `RenderEffect` blur, which only exists on
 * Android 12 (S) and above. Below that the blur is a no-op, so the un-blurred, bright artwork would
 * show behind the light-on-dark transport — illegible. [effective] downgrades BLUR to DEFAULT on
 * those devices; every render decision (background, text/icon colors, status bar, gradient
 * extraction) must read the *effective* style, and the settings list hides BLUR when
 * [isBlurSupported] is false.
 */
fun PlayerBackgroundStyle.effective(): PlayerBackgroundStyle =
    if (this == PlayerBackgroundStyle.BLUR && !isBlurSupported) PlayerBackgroundStyle.DEFAULT else this

/** Whether [PlayerBackgroundStyle.BLUR] can actually render on this device (Android 12+). */
val isBlurSupported: Boolean
    get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

/**
 * Bounded, process-wide cache of extracted gradient palettes keyed by media id. `android.util`'s
 * [LruCache] is internally synchronized, so it is safe to read on the main thread while the
 * extraction coroutine writes from a background dispatcher, and it cannot grow without bound over a
 * long listening session (the old per-composable `mutableMapOf` did both).
 */
private val gradientColorCache = LruCache<String, List<Color>>(48)

/**
 * Extracts the gradient palette for [mediaId]'s [thumbnailUrl], or an empty list when [enabled] is
 * false or there is no artwork. The bitmap decode + Palette pass runs at most once per track and is
 * memoised in [gradientColorCache], so the full player and the mini player share the result instead
 * of each decoding the same artwork. The previous palette is kept on screen while a new (uncached)
 * one is extracted, avoiding a flash to the default background on every track change.
 */
@Composable
fun rememberPlayerGradient(
    mediaId: String?,
    thumbnailUrl: String?,
    enabled: Boolean,
    fallbackColor: Int,
): List<Color> {
    val context = LocalContext.current
    var gradientColors by remember { mutableStateOf<List<Color>>(emptyList()) }
    LaunchedEffect(mediaId, enabled) {
        if (!enabled || mediaId == null || thumbnailUrl == null) {
            gradientColors = emptyList()
            return@LaunchedEffect
        }
        gradientColorCache.get(mediaId)?.let {
            gradientColors = it
            return@LaunchedEffect
        }
        val extracted = withContext(Dispatchers.IO) {
            val request = ImageRequest.Builder(context)
                .data(thumbnailUrl)
                .size(100, 100)
                .allowHardware(false)
                .memoryCacheKey("gradient_$mediaId")
                .build()
            val bitmap = runCatching { context.imageLoader.execute(request) }
                .getOrNull()?.image?.toBitmap() ?: return@withContext null
            val palette = withContext(Dispatchers.Default) {
                Palette.from(bitmap)
                    .maximumColorCount(8)
                    .resizeBitmapArea(100 * 100)
                    .generate()
            }
            PlayerColorExtractor.extractGradientColors(palette = palette, fallbackColor = fallbackColor)
        }
        if (extracted != null) {
            gradientColorCache.put(mediaId, extracted)
            gradientColors = extracted
        }
    }
    return gradientColors
}
