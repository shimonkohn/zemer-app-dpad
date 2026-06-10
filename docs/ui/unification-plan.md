# UI unification plan (migration roadmap)

Working blueprint (NOT committed - the committed artifacts are `docs/ui/standards.md` and the token
foundation in `ui/theme/`). Standard Material 3 (Expressive dropped - gated `internal` in
material3 1.4.0, which is strict-pinned; not worth an alpha Compose cascade).

Goal: bring all UI onto the system in `docs/ui/standards.md` and drive `scripts/ui-audit.sh` to zero.
Build (`./gradlew assembleDebug`) after each phase; a phase is done when its audit category is at
zero (minus documented exemptions). Audit baseline: 347 (R0/M2 already 0).

## Phase 0 - foundation (DONE, committed)

- [x] `docs/ui/standards.md` - the strict standard (R0-R12 + checklists).
- [x] `ui/theme` tokens: `Dimens` (spacing/size), `AppColors` (media overlays), `Shape`
      (`AppShapes` scale + `PillShape`, wired into `ZemerTheme`), `Motion` (shared specs).
- [x] Components: `SelectPreference` (pick-one -> `ListDialog`), `InfoCard`/`StatusRow`.
- [x] `scripts/ui-audit.sh` enforcement.

## Phase 1 - structural unification (low risk) - DONE (commit 0d80a2c)

- [x] R2 scrollBehavior -> TopAppBar (settings screens) - audit R2 grep at 0
- [x] R3 back button: SettingsScreen, AndroidAutoSettings, ContributeScreen
- [x] R6 SettingsScreen -> `PreferenceGroupTitle`+`PreferenceEntry`; `Material3SettingsGroup.kt` deleted; `ToggleRow`/OnboardingScreen -> `SwitchPreference`
- [x] R4/R5 body+spacers: SettingsScreen, ContributeScreen, GeneralSettings, UpdaterSettings
- [x] R1 `UpdaterScreen` -> `UpdaterSettings` (+ NavigationBuilder route)

## Phase 2 - move app strings out of upstream `strings.xml` - DONE (commit 1f43027)

- [x] Relocated the app-feature strings to `metrolist_strings.xml`

## Phase 3 - extract hardcoded literals (R8) - DONE (commit cf7c9f3). Audit R8 clean.

## Phase 4 - typography to roles (R9) - DONE. No literal `fontSize` (audit clean).

## Phase 5 - shape + color to tokens (R9) - DONE (commit 362d29b). No magic `RoundedCornerShape`/hardcoded `Color` (audit clean).

## Phase 6 - dialogs + components - DONE (commit 362d29b). No raw `AlertDialog`/`BasicAlertDialog` (audit R7 clean); bespoke cards -> `InfoCard`/`StatusRow`; account dialog consolidated.

## Phase 7 - D-pad completeness + polish (R10-R12) - DONE (verified on-device)

- [x] R0-R9 `scripts/ui-audit.sh` clean (0 violations).
- [x] R12 `contentDescription` on the high-traffic interactive icon-only controls of the
      now-playing surface: `Player.kt` (share x2, favorite [state-aware], menu), `MiniPlayer.kt`
      (play/pause, skip-next, skip-previous), `Items.kt` (overlay edit button), `Queue.kt` (item menu,
      lock toggle [state-aware]), `VideoPlayerScreen.kt` (back, PIP, copy-link). New strings
      `picture_in_picture`, `move_up`, `move_down`, `lock_queue`, `unlock_queue`.
- [x] R11 gesture-parity verified for the flagged gesture files: title/artist tap+long-press have a
      D-pad path via `PlayerMenu` (view artist/album, copy link); thumbnail double-tap-seek and
      mini/video swipe-seek are covered by focusable seek/skip buttons; `BottomSheet`/`BottomSheetPage`
      drag-dismiss is covered by `BackHandler` (back dismisses); `DraggableScrollbar` is a touch
      convenience over normal D-pad focus traversal. `BigSeekBar` has explicit D-pad seek.
- [x] R11 Queue **drag-to-reorder** now has a D-pad move path: Move up / Move down rows in the queue
      item `PlayerMenu` (gated on `isQueueTrigger` + `!locked` + boundary). `Queue.kt` `moveQueueItem`
      mirrors the drag-end commit exactly (`mutableQueueWindows.move` + `moveMediaItem` / shuffle
      `setShuffleOrder`).
- [x] R11 MiniPlayer: added a focusable **skip-previous** button to the Legacy compact bar (parity
      with the existing skip-next). The New compact bar relies on swipe + tap-to-expand to the full
      player (full prev/next controls), which is its D-pad path.

On-device verification (emulator-5554, API 36, arm64), driven entirely via D-pad keyevents + the
accessibility tree:
- D-pad works across the whole onboarding flow: sensible initial focus, traversal of radio
  groups / toggles / buttons, no focus traps, center activates, `TextFieldDialog` opens with OK
  default-focused and Back dismisses.
- Reached the live Home screen via anonymous login; played a Mix (20-song queue).
- R12 labels confirmed present in the a11y tree: "Share", "Like" (player), "More options" (queue rows).
- Queue reorder confirmed: Move up/down appear only when the queue is unlocked (correctly hidden when
  locked, like the drag handle); **Move down** moved a row 3->4 and **Move up** moved it 4->3, with
  correct index math and a clean menu dismissal - no crash, no glitch.

## Phase 7b - exhaustive D-pad audit of the WHOLE codebase (DONE)

Goal: every action operable without a touchscreen. Verified by scripted detectors over all UI files.

- [x] R12 swept every `IconButton` in the codebase (not just the player). 148 interactive icon-only
      buttons were unlabeled; all now carry a localized `contentDescription` (more_vert->more_options,
      arrow_back->back_button_desc, close, search, favorite [state-aware], download, queue_music,
      view-toggle->change_view_type, stepper +/- ->increase/decrease, etc.). New strings:
      select_all, deselect_all, change_view_type, increase, decrease, use_suggestion, collapse, play_all.
- [x] Only 3 `contentDescription = null` remain inside IconButtons, all `drag_handle` with empty
      `onClick` (touch-only drag affordances) - intentionally null; reorder is reachable another way.
- [x] Detector for clickable `Box`/`Surface` wrapping an icon-only null-description icon: 0 remaining.
- [x] Every touch gesture surface (14 files) reviewed for a D-pad equivalent:
      - Drag-to-reorder had NO D-pad path on three screens - all fixed:
        * Queue -> Move up/down in the item `PlayerMenu`.
        * `LocalPlaylistScreen` -> Move up/down in `SongMenu` (`moveSong` mirrors the drag-end DB
          reindex + YouTube sync).
        * `AndroidAutoSettings` -> focusable up/down `IconButton`s next to the drag handle.
      - Swipe-to-remove all have a D-pad equivalent: Queue (selection -> Delete in
        `SelectionMediaMetadataMenu`), LocalPlaylist (`SongMenu` -> Remove from playlist), Items
        `SwipeToSongBox` (play-next / add-to-queue in the song menu).
      - `VideoPlayerScreen` controls auto-hid and were only revealed by tap: added `onPreviewKeyEvent`
        (any key reveals + resets the hide timer) + a focusable root that parks focus while hidden,
        so a D-pad key always summons the controls.
      - Drag-seek / swipe-skip / double-tap-seek / sheet-drag already had button/`BackHandler`/D-pad
        equivalents (seek buttons, skip buttons, `BigSeekBar`, back-to-dismiss).

## Phase 8 - finish reuse + D-pad seek + test harnesses (DONE)

- [x] Extracted the shared `AppBarSearchField` and replaced the 7x copy-pasted in-app-bar search
      `TextField` (history + six playlist screens); dropped the now-unused imports.
- [x] `SyncStatusCard` (ContentSettings) now uses the shared `InfoCard` - 0 bespoke status `Card`s
      left. (The DownloadedContent count-tiles stay bespoke: they are clickable nav tiles, not status
      blocks, so `InfoCard` is the wrong fit.) DropdownMenus already live inside `SortHeader`/`ChipsRow`.
- [x] Player D-pad seek: the Material `Slider` provably cannot hold D-pad focus in the player layout
      (forced-focus + preview-key probe never received a key). Solved at the surface level - an
      `onPreviewKeyEvent` on the controls column scrubs +-5s on Left/Right, gated off while the
      transport button row is focused. Verified on-device: position 18 -> 20018 (RIGHT x4) -> 10018
      (LEFT x2); button-row Left/Right still navigates.
- [x] Test harnesses: `tests/unification/check.mjs` (static reuse, 6/6) and `tests/dpad/` (adb oracles
      + focus sweep, onboarding through every screen).

## Verification

- After each phase: build green; `scripts/ui-audit.sh` shows the targeted rule at zero.
- Phases 1-8 landed; audit clean (0); build green; unification test 6/6.
- D-pad verified on-device (onboarding, home, drawer, settings, player scrub, queue reorder).
- Remaining intentional non-unification: the playlist-screen `isSearching`/app-bar scaffold is shared
  in spirit but not extracted into one composable (a large, risky refactor with no clear clarity win).
  Everything mechanically enforceable is at zero.
