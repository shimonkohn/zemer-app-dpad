package com.jtech.zemer.ui.utils

import org.junit.Assert.assertEquals
import org.junit.Test

class YouTubeUtilsTest {

    @Test
    fun `lh3 googleusercontent is rewritten to the requested size`() {
        val url = "https://lh3.googleusercontent.com/abc=w120-h120-l90-rj"
        assertEquals(
            "https://lh3.googleusercontent.com/abc=w544-h544-p-l90-rj",
            url.resize(544, 544),
        )
    }

    @Test
    fun `yt3 googleusercontent is rewritten too (YouTube migrated host - fixes the blurry player)`() {
        // YT moved album art to yt3.googleusercontent and serves a ~60px thumbnail; without matching
        // this host resize() no-ops and the player upscales the 60px image into a blur.
        val url = "https://yt3.googleusercontent.com/_zDuDZFnSKmuQwDX=w60-h60-l90-rj"
        assertEquals(
            "https://yt3.googleusercontent.com/_zDuDZFnSKmuQwDX=w544-h544-p-l90-rj",
            url.resize(544, 544),
        )
    }

    @Test
    fun `i_ytimg urls are left unchanged (no resize param to rewrite)`() {
        val url = "https://i.ytimg.com/vi/abc/hqdefault.jpg?sqp=-oaymwE"
        assertEquals(url, url.resize(544, 544))
    }

    @Test
    fun `null dimensions return the url unchanged`() {
        val url = "https://yt3.googleusercontent.com/abc=w60-h60-l90-rj"
        assertEquals(url, url.resize())
    }

    @Test
    fun `ggpht avatar s-form is resized in place`() {
        val url = "https://yt3.ggpht.com/abc=s88"
        assertEquals("https://yt3.ggpht.com/abc=s544", url.resize(544, 544))
    }

    // The three shapes below were sampled live from the content mirror's whitelist thumbnails; they
    // previously matched neither branch and passed through unresized (full ~2880px downloads / blurry
    // 160px upscales). Every rewritten form was verified live against the CDN (HTTP 200, smaller file).

    @Test
    fun `ggpht banner with w-h params is rewritten, not passed through`() {
        val url = "https://yt3.ggpht.com/ytc/AIdro_x=w1214-h505-l90-rj-dcqRSgjpEK"
        assertEquals("https://yt3.ggpht.com/ytc/AIdro_x=w384-h384-p-l90-rj", url.resize(384, 384))
    }

    @Test
    fun `crop marker between w and h is tolerated`() {
        val url = "https://yt3.googleusercontent.com/abc=w544-c-h544-k-c0x00ffffff-no-l90-rj"
        assertEquals("https://yt3.googleusercontent.com/abc=w384-h384-p-l90-rj", url.resize(384, 384))
    }

    @Test
    fun `googleusercontent square s-form is resized in place preserving the remaining params`() {
        val url = "https://yt3.googleusercontent.com/ytc/AIdro_y=s160-c-k-c0x00ffffff-no-rj"
        assertEquals(
            "https://yt3.googleusercontent.com/ytc/AIdro_y=s384-c-k-c0x00ffffff-no-rj",
            url.resize(384, 384),
        )
    }

    @Test
    fun `bare google-host url with no size params passes through unchanged`() {
        val bare = "https://yt3.googleusercontent.com/abc"
        assertEquals(bare, bare.resize(384, 384))
    }
}
