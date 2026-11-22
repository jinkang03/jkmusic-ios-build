> **LATEST：1.4.38 / build 62**
> 文件 `artifacts/ipa/JKMUSIC-1.4.38-unsigned-20261122.ipa`
> sha256 `87827d12d0f731ffdc67b0fe4ae27a6a318358656b18aae6ecf998307c468028`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.38（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.38-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `87827d12d0f731ffdc67b0fe4ae27a6a318358656b18aae6ecf998307c468028` |
| 版本 / build | 1.4.38 / 62 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.38` |

### 1.4.38 末段预取：切歌几乎无缝

**做法（不下载，只提前拿地址）**

| 时机 | 动作 |
|---|---|
| 剩余 **20 秒** | 解析下一首的播放地址（`preloadSource`），存 120 秒 TTL |
| 剩余 **3 秒** | 对预取地址发一次 `Range: bytes=0-1`，提前完成 DNS/TLS/首字节（**不下载音频**） |
| 切歌瞬间 | `resolveSource` 直接返回预取地址（跳过取流 + 磁盘缓存检查） |

**关键实现**

- `preloadCache` 改为 `{url, at}` + 120s TTL（脚本地址带 vkey，不能永久复用）；
- `awaitPreloadedUrl()`：如果切歌时预取刚好还没完成，最多等 1.2 秒拿结果，而不是重新取流；
- 预取命中判断挪到 `isCached` 之前，省掉一次磁盘 stat；
- 预取只在「播放中」触发，每首一次；暂停时不触发。

**实测切歌间隙（transition → 真正出声）**

| 场景 | 之前 | 现在 |
|---|---|---|
| 预取命中 + 连接预热 | 4–5s | **0.25s** |
| 预取命中，未预热 | 4–5s | **0.61s** |
| 预取命中，首字节慢 | 4–5s | **1.05s** |
| 预取未完成（只剩几秒） | 4–5s | 0.7–2.3s（最多等 1.2s 后回退正常取流） |

`[lat] resolve` 从平均 2945ms 降到 **2–18ms**。

**验证**

```
[preload] 末段预取下一首: Less than a Lover remain= 19.6s
[preload] ready Less than a Lover http://ws.stream.qqmusic.qq.com/...
[preload] 预热下一首连接: Less than a Lover remain= 2.6s
队列末尾，播放下一首
使用末段预取地址起播: http://ws.stream.qqmusic.qq.com/...
[lat] resolve +2ms
[lat] audible +1146ms media→audible=1142ms pos=0.9   → 真实起播 246ms
```

`Documents/musicCache` 全程为空 —— 预取只拿地址，不下载。


