#!/usr/bin/env bash
# 把当前最新版 IPA 同步为固定别名 artifacts/ipa/JKMUSIC-ios-unsigned.ipa
#
# 背景：1.2.0 之后别名长期停在旧包，装别名的人看不到后续所有改动。
# 出包后必须跑一次，保证「别名 == 最新版」。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/artifacts/ipa"
ALIAS="$DIR/JKMUSIC-ios-unsigned.ipa"

latest=$(ls -t "$DIR"/JKMUSIC-[0-9]*-unsigned-*.ipa 2>/dev/null | head -1 || true)
if [ -z "$latest" ]; then
  echo "没有找到版本化 IPA（JKMUSIC-<版本>-unsigned-<日期>.ipa）" >&2
  exit 1
fi

cp "$latest" "$ALIAS"

a=$(shasum -a 256 "$latest" | cut -d' ' -f1)
b=$(shasum -a 256 "$ALIAS" | cut -d' ' -f1)
if [ "$a" != "$b" ]; then
  echo "sha256 不一致：$a != $b" >&2
  exit 1
fi

TMP=$(mktemp -d)
unzip -qo "$latest" Payload/JKMUSIC.app/Info.plist -d "$TMP"
ver=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" \
  "$TMP/Payload/JKMUSIC.app/Info.plist" 2>/dev/null || echo "?")
build=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" \
  "$TMP/Payload/JKMUSIC.app/Info.plist" 2>/dev/null || echo "?")
rm -rf "$TMP"

echo "别名已同步：$(basename "$latest")"
echo "  版本 $ver / build $build"
echo "  sha256 $a"
