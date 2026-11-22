> **LATEST：1.4.25 / build 49**
> 文件 `artifacts/ipa/JKMUSIC-1.4.25-unsigned-20261122.ipa`
> sha256 `ec2a344b4e0b3310af61b354f35f9760e89ca84442217e7bc088ed819da29e62`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.25（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.25-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `ec2a344b4e0b3310af61b354f35f9760e89ca84442217e7bc088ed819da29e62` |
| 版本 / build | 1.4.25 / 49 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.25` |

### 1.4.25 歌单内移除单曲 + 添加到歌单透明化

**a) 歌单内单独移除某首歌**

`TrackShortcutsMenu` 本来就有 `allowDelete` / `onDeleteTrack`，但 `SongListView` 没有传。
现在：
- `SongListView` 新增 `listId` prop；
- 传入后行右侧「⋯」菜单出现 **删除**（destructive），点击调用
  `libraryStore.removeFromList(listId, [track.id])` 并提示「已移除」；
- `favorites/[name].tsx` 已传 `listId`，搜索/排行榜等不传 → 不显示删除项。

**b) 添加到歌单弹窗透明化**

`addToPlaylist` 原来用 `c.bg`（不透明白底），现在：
- 背景改 `glass()` 填充 + 描边，外层加一层 `rgba(0,0,0,0.22)` 压暗背景；
- 顶部圆角 22，与整体玻璃风格一致；
- 标题/歌单名/箭头文字改用 `usePageTheme().colors`，**跟随「文字颜色」设置**。


