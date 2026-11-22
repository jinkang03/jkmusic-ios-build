> **LATEST：1.4.36 / build 60**
> 文件 `artifacts/ipa/JKMUSIC-1.4.36-unsigned-20261122.ipa`
> sha256 `6bcfbe2ee6f494c13072b637317f26af70bce20dfd8c5c0d0c0a9c74bb0831e7`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.36（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.36-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `6bcfbe2ee6f494c13072b637317f26af70bce20dfd8c5c0d0c0a9c74bb0831e7` |
| 版本 / build | 1.4.36 / 60 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.36` |

### 1.4.36 清掉残留下载路径 + 修「换源后停住」

**a) 播放路径彻底不再下载**

| 位置 | 之前的行为 | 现在 |
|---|---|---|
| `player/prefetch.ts` | 起播后把**下一首**整首下载进 musicCache | 空实现（不再预取下载） |
| `trackPlayerIndex` auto-cache | 起播 5 秒后把**当前曲**整首下载（几十 MB） | 删除 |
| `trackPlayerIndex` preload | 后台预加载下一首地址（多个脚本并发，抢带宽） | 删除 |

实测：播放 3 首不同歌曲 + 拖进度后，`Documents/musicCache` 仍为空；
`item0` 全部是 `http://`。

**b) 「已换 xx 播放」后暂停不动 —— 三个原因**

1. `haltWithNotice` 只调了原生 `pause()`，**没有同步播放意图**：
   UI 仍认为在播放，按钮显示「暂停」，用户点一下反而是暂停 → 感觉没反应。
   → 现在同步 `setPlaybackIntent('pause')`，按钮回到「播放」，点一下就是重新播放。
2. 停住时没有丢弃坏地址：换源后的地址被写进 `musicItem.url`，
   下次 play() 会原样重播这条死链。→ 现在 `play()` 会剥掉 http(s) 的 url，重新取流。
3. 上一条换源链路（最长 12s）返回失败时，会把**用户刚刚重新点起的播放**再次停住。
   → 现在 `tryAltSource` 返回后重新校验世代，过期结果直接丢弃。

**c) 占位地址检测**

实测部分脚本对不同歌曲返回**同一条**地址（如 `106.0.55.102/2026-11-22-150024_110711.mp3`），
连得上但永不响应。现在同一 URL 被不同歌曲取到即判为占位，
在音质循环里直接换下一档（不再等 8 秒看门狗）。

**d) 起播看门狗 8s → 6s**

实测正常起播 0.3–2.4s，6 秒足够；坏地址的等待从 8s 降到 6s。

**e) 试听片段判定收紧**

只认 30/60 秒试听，或比标称少 40% 且至少少 1 分钟；
避免把「现场版/短版本」误判成片段导致连续换源后停住。

**实测（just do it 歌单，随机 8 首，冷缓存）**

```
到出声：1.3s / 5.5s / 7.6s / 2.4s / 0.9s / 1.5s / 1.9s / 2.4s
停住 0 次   缓存文件 0 个
```

**流式证据（flac）**

```
item0 url = http://aqqmusic.tc.qq.com/...mp3
musicCache = 空
seek 107s（60%）→ pos 107.36，3 秒后 110.25，仍在播放
```


