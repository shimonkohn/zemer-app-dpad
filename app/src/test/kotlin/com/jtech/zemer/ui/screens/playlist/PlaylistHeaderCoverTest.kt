package com.jtech.zemer.ui.screens.playlist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlaylistHeaderCoverTest {

    @Test
    fun `empty filtered list yields null so the raw curator cover is never used`() {
        assertNull(filteredPlaylistCover(emptyList<String>()) { it })
    }

    @Test
    fun `uses the first surviving track's cover, not the raw playlist image`() {
        assertEquals("coverA", filteredPlaylistCover(listOf("coverA", "coverB")) { it })
    }

    @Test
    fun `a null cover on the surviving track yields null, not the raw image`() {
        assertNull(filteredPlaylistCover(listOf<String?>(null, "coverB")) { it })
    }
}
