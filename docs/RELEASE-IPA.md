> **LATEST：1.4.20 / build 44**
> 文件 `artifacts/ipa/JKMUSIC-1.4.20-unsigned-20261122.ipa`
> sha256 `6a89fbaf4517e59b3f4fdb76518cf15c4c0c05ae36d4f144522cc68797e56238`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.20（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.20-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `6a89fbaf4517e59b3f4fdb76518cf15c4c0c05ae36d4f144522cc68797e56238` |
| 版本 / build | 1.4.20 / 44 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.20` |

### 1.4.20 功能条与播放条视觉对齐

1.4.19 把功能条缩到屏宽 ×0.155（≈62pt 边距），用户反馈「太短」。
改为与播放条同一比例：

| 项 | 1.4.19 | 1.4.20 |
|---|---|---|
| 功能条左右 | 屏宽 × 0.155（≈62） | **屏宽 × 0.027（≈10，与播放条相同）** |
| 功能条高度 | 53 | **64**（播放条约 68） |

两者左右边缘完全对齐，视觉上成为一组。


