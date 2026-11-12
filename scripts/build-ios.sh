#!/usr/bin/env bash
# 构建 CyMusic（JKMUSIC 适配版）未签名 IPA。
# 前置：yarn install、pod install 已完成；Xcode 需安装 iOS 平台组件。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== 1/4 生成 iOS JS bundle =="
rm -rf /tmp/jk-export
npx expo export --platform ios --output-dir /tmp/jk-export >/dev/null

echo "== 2/4 xcodebuild（未签名）=="
mkdir -p ios/build
xcodebuild -workspace ios/CyMusic.xcworkspace \
  -scheme CyMusic \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath ios/build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  DEVELOPMENT_TEAM="" \
  build

echo "== 3/4 打包 ipa =="
APP="ios/build/Build/Products/Release-iphoneos/CyMusic.app"
test -d "$APP" || { echo "missing $APP" >&2; exit 1; }
rm -rf artifacts/ipa && mkdir -p artifacts/ipa/Payload
cp -R "$APP" artifacts/ipa/Payload/
cd artifacts/ipa && rm -f JKMUSIC-ios-unsigned.ipa && zip -qry JKMUSIC-ios-unsigned.ipa Payload

echo "== 4/4 完成 =="
ls -lh JKMUSIC-ios-unsigned.ipa
