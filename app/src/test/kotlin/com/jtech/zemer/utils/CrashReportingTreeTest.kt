package com.jtech.zemer.utils

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import timber.log.Timber

class CrashReportingTreeTest {

    private val breadcrumbs = mutableListOf<String>()
    private val nonFatals = mutableListOf<Throwable>()
    private val tree = CrashReportingTree(
        logBreadcrumb = breadcrumbs::add,
        recordNonFatal = nonFatals::add,
    )

    @After
    fun uprootAll() {
        Timber.uprootAll()
    }

    @Test
    fun `debug log becomes breadcrumb with tag and level`() {
        Timber.plant(tree)

        Timber.tag("YTPlayerUtils").d("Stream resolution START")

        assertEquals(listOf("D/YTPlayerUtils: Stream resolution START"), breadcrumbs)
        assertTrue(nonFatals.isEmpty())
    }

    @Test
    fun `verbose logs are dropped`() {
        Timber.plant(tree)

        Timber.v("noise")

        assertTrue(breadcrumbs.isEmpty())
    }

    @Test
    fun `error with throwable is recorded as non-fatal`() {
        val boom = RuntimeException("boom")
        Timber.plant(tree)

        Timber.e(boom, "[Exception] context")

        assertEquals(1, nonFatals.size)
        assertSame(boom, nonFatals[0])
        assertTrue(breadcrumbs.single().startsWith("E: [Exception] context"))
    }

    @Test
    fun `throwable below error level is breadcrumb only`() {
        Timber.plant(tree)

        Timber.w(RuntimeException("ignored"), "recoverable")

        assertTrue(nonFatals.isEmpty())
        assertEquals(1, breadcrumbs.size)
    }
}
