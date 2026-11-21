> **LATEST：1.4.15 / build 39**
> 文件 `artifacts/ipa/JKMUSIC-1.4.15-unsigned-20261121.ipa`
> sha256 `a25cae96fe6e760ac6e60a1c2f3192ac9ad61669b614087387485ab9af258677`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.15（2026-11-21）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.15-unsigned-20261121.ipa` |
| 大小 | 18 MB |
| sha256 | `a25cae96fe6e760ac6e60a1c2f3192ac9ad61669b614087387485ab9af258677` |
| 版本 / build | 1.4.15 / 39 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.15` |

### 1.4.15 玻璃滑块失效 / 白遮罩 / 榜单点击播不了

**a) 玻璃透明度滑块「不生效」**

1.4.13 为了修「深色下发暗」，给 Stack/Tabs 加了 `rgba(255,255,255,0.72)` 的整页白底。
这层白底**不跟随玻璃滑块**，于是：

- 滑块调到 0，卡片透明了，但整页仍有一层白；
- 壁纸被永久压暗 28%。

修复：页面 `contentStyle`/`sceneStyle` 改回 `transparent`，只在
`GestureHandlerRootView` 留一个 `#F7F7F9` 作为「无壁纸时」的保底。
玻璃质感完全由 `glass()` 提供，跟随滑块。

实测 `glassAlpha=0.05` → 壁纸完全清晰、卡片几乎全透；`0.55` → 卡片恢复玻璃白。

**b) 切换浅色/深色看起来一样**

这是 1.4.12 按需求做的「功能页固定浅色」。深色现在只影响播放页
（播放页本来就有 dark override）。如果需要深浅有差异，需要另外定义深色玻璃色板，
本轮未做。

**c) 排行榜手动点击播不了（根因）**

`leaderboard/index.tsx` 的 `loadDetail` 直接 `setTracks(res.list)`，
**没有 `jkToTrack` 转换**。原始 JKMusic 是 `name/singer/source`，
而 `SongListView` / `playWithReplacePlayList` 读 `title/artist/platform`：

- `platform` 为 undefined → 角标不显示（用户截图里榜单行确实没有角标）
- 取流时 `readFromSource` 拿不到平台 → 直接失败 → 播放条 0:00

`leaderboard/[id].tsx`（榜单详情页）有转换，所以 dev 的 `playBoard` 测不出问题。

修复：`setTracks((res?.list ?? []).map(jkToTrack))`。
实测榜单行出现 `kw` 角标、播放条 1:51 / 5:02 正常推进。

**d) 底栏再缩 0.9 倍**

高度 48→**44**、左右 22→**26**、圆角 24→**22**、icon 28→**25**。


