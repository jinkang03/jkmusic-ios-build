> **LATEST：1.4.13 / build 37**
> 文件 `artifacts/ipa/JKMUSIC-1.4.13-unsigned-20261121.ipa`
> sha256 `d50b9d2b38d398dda1a3077f7dc532924f2188b58671bab1ced932ab40f8ccfc`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.13（2026-11-21）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.13-unsigned-20261121.ipa` |
| 大小 | 18 MB |
| sha256 | `d50b9d2b38d398dda1a3077f7dc532924f2188b58671bab1ced932ab40f8ccfc` |
| 版本 / build | 1.4.13 / 37 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.13` |

### 1.4.13 四项视觉/播放问题（1.4.12 未真正生效的原因）

1.4.12 只改了颜色 token，但页面根容器本身是**透明**的，壁纸直接铺满。
深色模式下 `WallpaperBackground` 的底层是 `#0B0B0C`，半透明玻璃叠在黑色上 → 整页发暗。
所以「浅色主题」看起来没生效。

**修复**

| 项 | 做法 |
|---|---|
| 页面底色 | Stack `contentStyle` + Tabs `sceneStyle` 统一 `rgba(255,255,255,0.72)`，壁纸只轻微透出 |
| 壁纸底层 | `WallpaperBackground` 固定浅色（不再跟系统深色变黑） |
| ThemeOverride | `ThemeOverrideProvider` 补回 `wallpaper/accent/glassAlpha/macTheme`，否则 override 后子页面拿不到壁纸参数 |
| 分割线 | 全局去掉 `borderBottomWidth: 0.5`（SongRow / SongListCard / SettingRow / 设置页 / 下载页 / 两个弹窗） |
| 底栏 | 高 52→**48**、左右 18→**22**、距底 12→**14**、圆角 26→**24**、icon 30→**28** |

**排行榜播放**：用 `playBoard` 复测 kw/tx/wy/mg 四个平台首曲，
`item0` 均为 `file://`，播放条 0:20 / 3:14 正常推进。此前「播不了」是 1.4.8 已修的
加密 flac + 下载世代问题，本次未改榜单代码。

**验证截图要点**：设置页/排行榜在**深色模式**下仍是浅色玻璃、行间无横线、底栏明显变小且与屏幕圆角间隙均匀、播放条完整显示。


