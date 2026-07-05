package com.jtech.zemer.ui.screens.playlist

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.jtech.zemer.R
import com.jtech.zemer.constants.AlbumThumbnailSize
import com.jtech.zemer.constants.ThumbnailCornerRadius
import com.jtech.zemer.ui.component.shimmer.ButtonPlaceholder
import com.jtech.zemer.ui.component.shimmer.ListItemPlaceHolder
import com.jtech.zemer.ui.component.shimmer.ShimmerHost
import com.jtech.zemer.ui.component.shimmer.TextPlaceholder

/**
 * The loading skeleton every playlist-detail screen shows: header cover + text placeholders, the
 * Play/Shuffle button pair, then row placeholders. ONE copy so the online and curated screens can't
 * drift apart.
 */
@Composable
fun PlaylistHeaderShimmer(modifier: Modifier = Modifier) {
    ShimmerHost(modifier) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Spacer(
                    modifier = Modifier
                        .size(AlbumThumbnailSize)
                        .clip(RoundedCornerShape(ThumbnailCornerRadius))
                        .background(MaterialTheme.colorScheme.onSurface),
                )

                Spacer(Modifier.width(16.dp))

                Column(verticalArrangement = Arrangement.Center) {
                    TextPlaceholder()
                    TextPlaceholder()
                    TextPlaceholder()
                }
            }

            Spacer(Modifier.padding(8.dp))

            Row {
                ButtonPlaceholder(Modifier.weight(1f))

                Spacer(Modifier.width(12.dp))

                ButtonPlaceholder(Modifier.weight(1f))
            }
        }

        repeat(6) {
            ListItemPlaceHolder()
        }
    }
}

/**
 * The playlist-header transport pair — filled Play + outlined Shuffle, equal weights. ONE copy for
 * every playlist-detail screen; either action can be null to hide its button (the online screen
 * shows Shuffle only when the playlist has a shuffle endpoint).
 */
@Composable
fun PlaylistPlayShuffleButtons(
    onPlay: (() -> Unit)?,
    onShuffle: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = modifier) {
        if (onPlay != null) {
            Button(
                onClick = onPlay,
                contentPadding = ButtonDefaults.ButtonWithIconContentPadding,
                modifier = Modifier.weight(1f)
            ) {
                Icon(
                    painter = painterResource(R.drawable.play),
                    contentDescription = null,
                    modifier = Modifier.size(ButtonDefaults.IconSize)
                )
                Spacer(Modifier.size(ButtonDefaults.IconSpacing))
                Text(stringResource(R.string.play))
            }
        }

        if (onShuffle != null) {
            OutlinedButton(
                onClick = onShuffle,
                contentPadding = ButtonDefaults.ButtonWithIconContentPadding,
                modifier = Modifier.weight(1f)
            ) {
                Icon(
                    painter = painterResource(R.drawable.shuffle),
                    contentDescription = null,
                    modifier = Modifier.size(ButtonDefaults.IconSize)
                )
                Spacer(Modifier.size(ButtonDefaults.IconSpacing))
                Text(stringResource(R.string.shuffle))
            }
        }
    }
}
