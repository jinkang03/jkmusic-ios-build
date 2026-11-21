#!/usr/bin/env bash
# 构建 JKMUSIC 未签名 IPA（设备版，arm64）
#
# 产物：
#   artifacts/ipa/JKMUSIC-<版本>-unsigned-<日期>.ipa   版本化，保留历史
#   artifacts/ipa/JKMUSIC-ios-unsigned.ipa             固定别名 = 最新版（自动同步）
#
# 前置：node_modules 与 Pods 已就绪（pod install 已完成）。
# 版本号请在构建前用 ./scripts/sync-version.sh <ver> <build> 设置。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VER=$(python3 -c "import json;print(json.load(open('app.json',encoding='utf-8'))['expo']['version'])")
DATE=$(date +%Y%m%d)
OUT="artifacts/ipa/JKMUSIC-${VER}-unsigned-${DATE}.ipa"

echo "== 1/4 同步版本号（app.json / pbxproj / buildInfo.ts）=="
./scripts/sync-version.sh

echo "== 2/4 xcodebuild（未签名，arm64）=="
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
xcodebuild -workspace ios/JKMUSIC.xcworkspace \
  -scheme JKMUSIC \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath .build/dd-device \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  ARCHS=arm64 \
  build

APP=".build/dd-device/Build/Products/Release-iphoneos/JKMUSIC.app"
test -d "$APP" || { echo "missing $APP" >&2; exit 1; }

echo "== 3/4 打包 IPA =="
mkdir -p artifacts/ipa
TMP=$(mktemp -d)
mkdir -p "$TMP/Payload"
cp -R "$APP" "$TMP/Payload/"
(cd "$TMP" && zip -qry "$ROOT/$OUT" Payload)
rm -rf "$TMP"

# 断言：扩展与灵动岛必须存在
test -d "$APP/PlugIns/JKMUSICWidget.appex" || { echo "缺少 JKMUSICWidget.appex" >&2; exit 1; }
/usr/libexec/PlistBuddy -c "Print :NSSupportsLiveActivities" "$APP/Info.plist" >/dev/null \
  || { echo "缺少 NSSupportsLiveActivities" >&2; exit 1; }

echo "== 4/4 同步固定别名 =="
./scripts/sync-latest-ipa.sh

echo
ls -lh "$OUT"
shasum -a 256 "$OUT"
