> **LATEST：1.4.10 / build 34**
> 文件 `artifacts/ipa/JKMUSIC-1.4.10-unsigned-20261121.ipa`
> sha256 `55a69e509a5cedb98a84fc0e155cbc992401a541dde16bb629091bdfe222a38c`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.10（2026-11-21）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.10-unsigned-20261121.ipa` |
| 大小 | 18 MB |
| sha256 | `55a69e509a5cedb98a84fc0e155cbc992401a541dde16bb629091bdfe222a38c` |
| 版本 / build | 1.4.10 / 34 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.10` |

### 1.4.10 拖动进度后歌词卡几秒并偏移

**现象**（用户描述）：手动拉进度后，歌词先卡几秒，跟上来之后就和音频错位，偏移量每次不同；不拉进度就不偏移。

**根因：`seekPreview` 清得太早**

进度条松手时旧代码是：

```ts
myTrackPlayer.seekTo(newPosition)
  .then(() => setSeekPreview(null))   // ← 这里
```

`seekTo()` 返回只代表「原生层接受了 seek 请求」，`useProgress` 的 `position`
还要几百毫秒才追上。preview 一清空，`karaokeMs` 立刻回退到**旧的 position**，
歌词先跳回旧行；等 position 追上再跳一次。两次跳变的间隔取决于原生上报延迟，
所以「偏移多少不一定」。

**修复：`seekWithPreview`**

- seek 期间持续保持 `preview = 目标秒数`；
- 每 100ms 轮询 `getProgress().position`，追上目标（±0.6s）再清空，最多等 4 秒；
- 进度条拖动、点击歌词行跳转、紧凑歌词点击、dev seek 全部走同一条路径。

**验证**：播放晴天 25 秒后 seek 到 120s（暂停）

```
基线        active idx=0  pos=397
seek 之后   active idx=23 pos=120291 first=118543 last=124555
```

行时间 118.54s、位置 120.29s，立即落在正确行且 `lit=3`（逐字同步），
不再出现「先跳回旧行、几秒后又追上来」。


