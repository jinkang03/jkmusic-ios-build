> **LATEST：1.4.23 / build 47**
> 文件 `artifacts/ipa/JKMUSIC-1.4.23-unsigned-20261122.ipa`
> sha256 `69ce419ec2a928594fc7462ac5dd9ce5d188dddabdaed4b2a84a57b51175472d`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.23（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.23-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `69ce419ec2a928594fc7462ac5dd9ce5d188dddabdaed4b2a84a57b51175472d` |
| 版本 / build | 1.4.23 / 47 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.23` |

### 1.4.23 文字颜色设置 + 功能页白字统一

**a) 新增「文字颜色」设置**

- `themeStore.textColorStore`（`app.textColor`），与强调色同源逻辑；
- 设置 → 基本设置 → **文字颜色** → 打开同一个 `ColorPickerModal`（色盘 + 跟随壁纸）；
- 生效范围：`macPalette`、`usePageTheme` 的 `colors`、原生 header（`getStackScreenWithSearchBar`）。

**b) 功能页默认白字**

之前「我的列表」标题/歌单名是黑的，原因是：

| 位置 | 原因 |
|---|---|
| 页面标题 | 原生 header 用 `colors.text`（Cymusic 浅色主题的深灰） |
| 歌单名 | `PlaylistListItem` 用 `defaultStyles.text`（同上） |
| 播放条歌名/歌手/进度 | `FloatingPlayer` 用 `useThemeColors()`（同上） |

修复：
- `macColors` 的 `text/textStrong/textMuted` 改为白系；
- `PlaylistListItem` 用 `mac.text` / `mac.textMuted`；
- `FloatingPlayer` 改用 `usePageTheme().colors`；
- header 默认白（用户设了文字颜色则优先）。

**c) 播放条按钮固定白色**

`PlayerButtonProps` 新增 `color`，播放条的上一曲 / 播放暂停 / 下一曲统一传 `#FFFFFF`，
不跟随文字颜色变化。


