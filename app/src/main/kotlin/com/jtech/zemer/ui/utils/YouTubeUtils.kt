@file:Suppress("LocalVariableName")

package com.jtech.zemer.ui.utils

/**
 * Pixel size requested for whitelisted-artist avatars — the list and grid items share it (one cache
 * entry per artist whichever view is open). The source yt3 URLs are ~2880px / ~290 KB; 384px keeps the
 * download ~10x smaller while still covering a 128dp grid cell on 3x-density screens without upscaling.
 */
const val ARTIST_AVATAR_PX = 384

fun String.resize(
    width: Int? = null,
    height: Int? = null,
): String {
    if (width == null && height == null) return this
    // Match lh3/yt3 googleusercontent AND yt3.ggpht — all three serve the same FIFE =wW-hH resize
    // params (YouTube migrated music art from lh3 to yt3.googleusercontent; channel banners come from
    // yt3.ggpht). A missed host silently no-ops, so the UI downloads the full ~2880px source or
    // upscales a tiny one (blurry). Also tolerate a crop marker between w and h (e.g. =w544-c-h544).
    // Verified live: a yt3 URL + =w544-h544 returns a sharp full-size image.
    "https://(?:(?:lh3|yt3)\\.googleusercontent|yt3\\.ggpht)\\.com/.*=w(\\d+)(?:-c)?-h(\\d+).*".toRegex()
        .matchEntire(this)?.groupValues?.let { group ->
        val (W, H) = group.drop(1).map { it.toInt() }
        var w = width
        var h = height
        if (w != null && h == null) h = (w / W) * H
        if (w == null && h != null) w = (h / H) * W
        return "${split("=w")[0]}=w$w-h$h-p-l90-rj"
    }
    // Square =sN form (avatar URLs like ...=s160-c-k-c0x00ffffff-no-rj on either host family):
    // replace the size in place, preserving the remaining params.
    if (contains(".googleusercontent.com/") || contains(".ggpht.com/")) {
        val sParam = "=s(\\d+)".toRegex()
        if (sParam.containsMatchIn(this)) {
            return replace(sParam, "=s${width ?: height}")
        }
    }
    return this
}
