> **LATEST：1.4.17 / build 41**
> 文件 `artifacts/ipa/JKMUSIC-1.4.17-unsigned-20261122.ipa`
> sha256 `b310a60261a021566b043a1164e990c74b5f69d354d9a1bfbe28511832ed20ba`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.17（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.17-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `b310a60261a021566b043a1164e990c74b5f69d354d9a1bfbe28511832ed20ba` |
| 版本 / build | 1.4.17 / 41 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.17` |

### 1.4.17 批次 2：系统媒体封面 + 全屏歌词居中

**a) 锁屏/灵动岛封面有时是黑色**

`mediaItem` 初始化只传 `track.artwork`，本地下载/缓存曲目该字段为空；
`artworkSync` 异步解析出封面后只写进了 `currentArtworkStore`（页面用），
没有回写系统媒体信息，所以锁屏一直是黑图。

修复：`syncCurrentArtwork` 拿到地址后调用 RNTP `updateMetadata(0, { artworkUrl })`，
不打断播放。日志确认 `[artwork] 已回写系统媒体封面 kw_228908`。

**b) 全屏歌词当前行不居中**

根因：
- `scrollToIndex({ viewPosition: 0.5 })` 依赖 `getItemLayout` 的 offset 精确，
  而 header（占位）在首帧未测量时按 0 计算，整体偏上；
- 行高不一致（翻译行更高）时误差累积。

修复：
- `getItemLayout` 的 header 兜底改为 `屏宽 × 0.7`（与 `paddingTop: '70%'` 一致）；
- 滚动改为手算 `scrollToOffset`：`offset = 行顶部 + 行高/2 - 视口高/2`，
  视口高由 FlatList 的 `onLayout` 记录。

实测 seek 到 120s：当前行「但偏偏风渐渐把距离吹得好远」位于屏幕垂直中心，逐字填充同步。


