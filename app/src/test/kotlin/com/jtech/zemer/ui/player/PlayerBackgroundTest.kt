package com.jtech.zemer.ui.player

import androidx.compose.ui.graphics.Color
import com.jtech.zemer.constants.PlayerBackgroundStyle
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins the pure player-background rules that guard a known illegibility regression: BLUR must
 * downgrade to DEFAULT where the RenderEffect blur is a no-op (pre-Android-12), and the gradient
 * stops both player surfaces paint must stay identical. No Android runtime needed — [effective]
 * takes the blur-support flag explicitly.
 */
class PlayerBackgroundTest {

    @Test
    fun `effective keeps every style when blur is supported`() {
        assertEquals(PlayerBackgroundStyle.BLUR, PlayerBackgroundStyle.BLUR.effective(blurSupported = true))
        assertEquals(PlayerBackgroundStyle.GRADIENT, PlayerBackgroundStyle.GRADIENT.effective(blurSupported = true))
        assertEquals(PlayerBackgroundStyle.DEFAULT, PlayerBackgroundStyle.DEFAULT.effective(blurSupported = true))
    }

    @Test
    fun `effective downgrades only BLUR to DEFAULT when blur is unsupported`() {
        assertEquals(PlayerBackgroundStyle.DEFAULT, PlayerBackgroundStyle.BLUR.effective(blurSupported = false))
        // GRADIENT and DEFAULT do not depend on blur support.
        assertEquals(PlayerBackgroundStyle.GRADIENT, PlayerBackgroundStyle.GRADIENT.effective(blurSupported = false))
        assertEquals(PlayerBackgroundStyle.DEFAULT, PlayerBackgroundStyle.DEFAULT.effective(blurSupported = false))
    }

    @Test
    fun `gradient stops use three swatches when at least three are present`() {
        val stops = playerGradientStops(listOf(Color.Red, Color.Green, Color.Blue, Color.White))
        assertEquals(3, stops.size)
        assertEquals(0.0f, stops[0].first, 0.0001f)
        assertEquals(0.5f, stops[1].first, 0.0001f)
        assertEquals(1.0f, stops[2].first, 0.0001f)
        assertEquals(Color.Red, stops[0].second)
        assertEquals(Color.Green, stops[1].second)
        assertEquals(Color.Blue, stops[2].second)
    }

    @Test
    fun `gradient stops fall back to a single-hue fade to black for fewer than three swatches`() {
        val stops = playerGradientStops(listOf(Color.Red))
        assertEquals(3, stops.size)
        assertEquals(0.0f, stops[0].first, 0.0001f)
        assertEquals(0.6f, stops[1].first, 0.0001f)
        assertEquals(1.0f, stops[2].first, 0.0001f)
        assertEquals(Color.Red, stops[0].second)
        assertEquals(Color.Black, stops[2].second)
    }
}
