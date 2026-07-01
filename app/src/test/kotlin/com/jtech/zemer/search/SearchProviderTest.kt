package com.jtech.zemer.search

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Locks the `online_playlist` route contract the ViewModel's `zemer` nav arg + NavigationBuilder depend
 * on: a Zemer-sourced playlist opens through the server `/playlist` path, a YouTube one keeps the plain
 * InnerTube path. Changing either string here without updating the route (or vice-versa) breaks opening.
 */
class SearchProviderTest {

    @Test
    fun `zemer playlists route through the server path`() {
        assertEquals("online_playlist/PL1?zemer=true", SearchProvider.ZEMER.onlinePlaylistRoute("PL1"))
    }

    @Test
    fun `youtube playlists keep the plain innertube path`() {
        assertEquals("online_playlist/PL1", SearchProvider.YOUTUBE.onlinePlaylistRoute("PL1"))
    }
}
