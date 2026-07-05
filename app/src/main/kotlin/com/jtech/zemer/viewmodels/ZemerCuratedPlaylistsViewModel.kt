package com.jtech.zemer.viewmodels

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jtech.zemer.search.ZemerCuratedPlaylist
import com.jtech.zemer.search.ZemerSearchRepository
import com.jtech.zemer.search.zemerSearchOptions
import com.jtech.zemer.utils.ContentFilterState
import com.jtech.zemer.utils.reportException
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Backs the hand-curated "Zemer Playlists" Home section, deliberately separate from [HomeViewModel]
 * (like [LatestReleasesViewModel]) so a failed server fetch can never affect the rest of Home.
 *
 * The list is server-rendered for the user's content-filter flags and shown as received (editorial
 * order, no client re-filtering). Empty is a normal state — the section hides. A refresh runs on
 * creation and whenever the content-filter flags change (a list fetched under one flag set must never
 * be shown under another); the Home screen also calls [refresh] on each screen-open, matching the
 * endpoint's plain-refetch freshness contract. On failure the previous list is kept.
 */
@HiltViewModel
class ZemerCuratedPlaylistsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repository: ZemerSearchRepository,
) : ViewModel() {
    private val _playlists = MutableStateFlow<List<ZemerCuratedPlaylist>>(emptyList())
    val playlists: StateFlow<List<ZemerCuratedPlaylist>> = _playlists.asStateFlow()

    init {
        viewModelScope.launch(Dispatchers.IO) {
            ContentFilterState.state
                .map { it.allowFemaleSingers to it.blockVideos }
                .distinctUntilChanged()
                .collect { refreshNow() }
        }
    }

    fun refresh() {
        viewModelScope.launch(Dispatchers.IO) { refreshNow() }
    }

    private suspend fun refreshNow() {
        runCatching { repository.curatedPlaylists(zemerSearchOptions(context)) }
            .onSuccess { _playlists.value = it }
            .onFailure { reportException(it) }
    }
}
