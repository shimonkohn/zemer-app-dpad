#!/usr/bin/env bash
# Android 15+ 16 KB page-size compatibility check.
#
# Every 64-bit native library in the APK must have its ELF LOAD segments aligned
# to 16384 bytes (0x4000), or devices booted with 16 KB pages refuse to load it
# (https://developer.android.com/16kb-page-size). 32-bit ABIs are exempt — 16 KB
# pages exist only on 64-bit devices.
#
#   bash scripts/check-16kb-alignment.sh [apk ...]
#
# With no arguments, checks the standard debug and release APK outputs (skipping
# ones that don't exist). Exits 1 if any 64-bit .so has alignment below 0x4000.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

APKS=("$@")
if [ ${#APKS[@]} -eq 0 ]; then
    for candidate in \
        "$ROOT/app/build/outputs/apk/debug/app-debug.apk" \
        "$ROOT/app/build/outputs/apk/release/app-release.apk"; do
        [ -f "$candidate" ] && APKS+=("$candidate")
    done
    if [ ${#APKS[@]} -eq 0 ]; then
        echo "No APKs found under app/build/outputs/apk — build first or pass paths." >&2
        exit 2
    fi
fi

fail=0
for apk in "${APKS[@]}"; do
    if [ ! -f "$apk" ]; then
        echo "FAIL  $apk: no such file" >&2
        fail=1
        continue
    fi
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    # 64-bit ABIs only (arm64-v8a, x86_64); 32-bit is exempt from the 16 KB rule.
    unzip -o -q "$apk" 'lib/arm64-v8a/*.so' 'lib/x86_64/*.so' -d "$tmp" 2>/dev/null
    found=0
    while IFS= read -r so; do
        found=1
        aligns="$(readelf -lW "$so" | awk '/LOAD/{print strtonum($NF)}')"
        bad="$(echo "$aligns" | awk '$1 < 16384')"
        rel="${so#"$tmp"/}"
        if [ -n "$bad" ]; then
            echo "FAIL  $(basename "$apk") $rel: LOAD alignment $(readelf -lW "$so" | awk '/LOAD/{print $NF}' | sort -u | tr '\n' ' ')(need >= 0x4000)"
            fail=1
        else
            echo "ok    $(basename "$apk") $rel"
        fi
    done < <(find "$tmp" -name '*.so' | sort)
    rm -rf "$tmp"
    if [ "$found" -eq 0 ]; then
        echo "note  $(basename "$apk"): no 64-bit native libs found"
    fi
done

if [ "$fail" -ne 0 ]; then
    echo ""
    echo "16 KB page-size check FAILED — see https://developer.android.com/16kb-page-size" >&2
    echo "(local builds: -DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON + the max-page-size link" >&2
    echo "flag in app/src/main/cpp/bento4/CMakeLists.txt; CI: the zemer-bento4 prebuilt must" >&2
    echo "be rebuilt with those flags)" >&2
fi
exit "$fail"
