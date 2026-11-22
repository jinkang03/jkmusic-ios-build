> **LATEST：1.4.24 / build 48**
> 文件 `artifacts/ipa/JKMUSIC-1.4.24-unsigned-20261122.ipa`
> sha256 `6edb2011653278e4663ed2ebb6e8c7bef15795edcdce61dc7f0b87a6b0b27a17`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.24（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.24-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `6edb2011653278e4663ed2ebb6e8c7bef15795edcdce61dc7f0b87a6b0b27a17` |
| 版本 / build | 1.4.24 / 48 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.24` |

### 1.4.24 不透明度拉满 = 纯白；文字自动反转

1.4.23 为了白字可读，把 `glass()` 的填充改成了深色。用户要求**最大不透明度是白色**。

改法：
- `glass()` 填充恢复 `rgba(255,255,255,a)`：0% 全透明、100% 纯白；
- 文字自动反转：`glassAlpha > 0.65` 时 `macPalette` / `usePageTheme` 切回深色字
  （白底上白字看不见），否则用白字（透壁纸时可读）；
- `BlurView` 的 tint 跟随：`alpha > 0.5` 用 light，否则 dark；
- 用户自定义「文字颜色」始终优先。

实测：不透明度 100% → 播放条/功能条纯白 + 深色文字；0% → 完全透明 + 白字。


