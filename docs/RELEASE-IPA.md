> **LATEST：1.4.12 / build 36**
> 文件 `artifacts/ipa/JKMUSIC-1.4.12-unsigned-20261121.ipa`
> sha256 `9cd04208780b7dcdcc8adddf59814364266b09ac3d8cd46c1b3b4e27275bf5c1`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.12（2026-11-21）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.12-unsigned-20261121.ipa` |
| 大小 | 18 MB |
| sha256 | `9cd04208780b7dcdcc8adddf59814364266b09ac3d8cd46c1b3b4e27275bf5c1` |
| 版本 / build | 1.4.12 / 36 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.12` |

### 1.4.12 浅色透感 / 去分割线 / 底栏尺寸

**a) 功能页固定浅色透感，不再跟随深浅色**

新增 `usePageTheme()`：功能页（搜索/歌单/排行榜/我的列表/下载/设置/各类弹窗）
固定 `resolvedTheme = light`，即使系统或设置切成深色也保持浅色玻璃。

播放页原本就有 `<ThemeOverrideProvider resolvedTheme="dark">`，不受影响；
并在播放页补了 `<StatusBar style="light" />`，避免全局状态栏变深后不可读。

**b) 去掉歌曲行之间的分割线**

`SongRow` / `SongListCard` 的 `borderBottomWidth: 0.5` 改为 0。
表头下方的分隔线保留（区分表头与内容）。

**c) 底部功能条缩小并内收**

| 参数 | 1.4.11 | 1.4.12 |
|---|---|---|
| 高度 | 56 | **52** |
| 左右边距 | 12 | **18** |
| 距底 | 4 | **12** |
| 圆角 | 28 | **26** |
| icon 容器 | 32 | **30** |
| 播放条间距 | 14 | **12** |

胶囊外轮廓与屏幕圆角保持均匀间隙，播放条同步下移且完整显示。

**d) 排行榜播放：实测四个平台均可播**

用新增的 `playBoard` dev 动作逐个验证榜单首曲：

```
kw -> id=670443861   item0 ✅
tx -> id=001cabiZ2klAvy item0 ✅
wy -> id=3461983295  item0 ✅
mg -> id=1145708036  item0 ✅
```

榜单取流链路本身正常；此前「播不了」是 1.4.8 之前「加密 flac + 下载世代被预取作废」
导致的，那两项已在 1.4.8 修复。本次未改榜单代码。

