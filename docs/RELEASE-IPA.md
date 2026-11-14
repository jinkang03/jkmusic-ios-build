# JKMUSIC iOS 未签名 IPA（交付说明）

## 1. 产物

| 项 | 值 |
|---|---|
| 路径 | `artifacts/ipa/JKMUSIC-ios27-unsigned.ipa` |
| 大小 | 17 MB（Payload 解包后二进制 36 MB / jsbundle 5.8 MB） |
| 构建日期 | 2026-11-14 |
| bundle id | com.jkmusic.ios |
| 版本 | CFBundleShortVersionString **1.2.0**（见「已知差异」）/ CFBundleVersion 1 |
| 架构 | arm64（`lipo -info` 确认） |
| 最低系统 | iOS 16.4（`MinimumOSVersion` / `LC_BUILD_VERSION minos 16.4`） |
| 签名 | 未签名（`codesign -dv` → `code object is not signed at all`） |

## 2. 构建命令（可复现）

```bash
xcodebuild -workspace ios/JKMUSIC.xcworkspace -scheme JKMUSIC \
  -configuration Release -sdk iphoneos -arch arm64 \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  -derivedDataPath .build/dd-device

rm -rf .build/ipa && mkdir -p .build/ipa/Payload
cp -R .build/dd-device/Build/Products/Release-iphoneos/JKMUSIC.app .build/ipa/Payload/
cd .build/ipa && zip -qry JKMUSIC-unsigned.ipa Payload
```

构建结果：`** BUILD SUCCEEDED **`，1690 个编译步骤，0 个 error。

## 3. 验证结果

```
CFBundleIdentifier      = com.jkmusic.ios
CFBundleShortVersionString = 1.2.0
CFBundleVersion         = 1
MinimumOSVersion        = 16.4
lipo -info              = architecture: arm64
LC_BUILD_VERSION        = platform 2 (iOS), minos 16.4, sdk 26.2
main.jsbundle           = 5.8M
user-api-preload.js     = 21K
codesign -dv            = code object is not signed at all
```

## 4. 安装方式

未签名 IPA **不能直接安装**，需要以下之一：

- **Sideloadly / AltStore / SideStore**：用 Apple ID 重签后安装（免费账号 7 天有效期）
- **TrollStore**：仅限特定 iOS 版本，可永久签名
- **Xcode**：`Devices and Simulators` 里直接拖入 .app（需开发者账号）

## 5. 已知限制

1. **目标 iOS 27 未在真机验证**：本机最高为 iOS 26.3 模拟器 + iOS 26.2 SDK
2. **首次播放有 2-4 秒延迟**：AVPlayer 在本环境无法加载网络流，已改为「先下载后播放」
3. **部分曲目受上游版权限制只能试听**：会自动切换到其他音源
4. **桌面专属设置项仅保存不生效**：桌面歌词、快捷键、托盘、窗口尺寸等
5. **dev 调试入口**：`EXPO_PUBLIC_JK_DEV_IMPORT` 未设置，相关分支不执行；
   但 `devStress` 模块的字符串常量仍会被打进 bundle（不影响行为）

## 6. 回滚方式

```bash
# 还原 Swift 补丁
npx patch-package --reverse
git checkout -- node_modules/@rntp/player

# 还原 Podfile 的 Swift 降级
git checkout -- ios/Podfile ios/Podfile.properties.json
cd ios && pod install
```

## 7. 已知差异（未按最终批要求完成的部分）

- 版本号：`app.json` 已改为 `1.0.0`，但本次 IPA 构建在改动**之前**启动，
  Info.plist 仍为 `1.2.0`；如需 1.0.0 需重新跑一次设备构建（约 40 分钟）
- 阶段 2（下载页列表）、阶段 3（设置分区补齐）未实现
- 阶段 1（收尾验收截图）、阶段 5（14 项全量回归）未执行
