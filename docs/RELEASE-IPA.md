> **LATEST：1.4.32 / build 56**
> 文件 `artifacts/ipa/JKMUSIC-1.4.32-unsigned-20261122.ipa`
> sha256 `2df53b1358b52013d9362a88f006b29c63453b93151f2a934a90b61ccec0f0ae`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.32（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.32-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `2df53b1358b52013d9362a88f006b29c63453b93151f2a934a90b61ccec0f0ae` |
| 版本 / build | 1.4.32 / 56 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.32` |

### 1.4.32 流式播放（点击即播，播放路径不再下载）

**背景**：之前「先下载后播放」是基于「AVPlayer 放不了网络流」的判断，实测该判断是错的。
严格测试数据：

| 测试 | 结果 |
|---|---|
| kw 3 首 / wy 2 首 / kg 2 首 / mg 1 首 | 8/8 流式成功 |
| tx 6 首 | 5/6 成功，1 首 `.mgg` 加密 |
| 连续切歌 10 次 | 10/10 成功，起播 0.3–0.8 秒 |
| 连续拖进度 10 次 | 10/10 成功，偏差 0.28–0.37 秒 |

**改动**

1. `MusicSourceResolver`：取流后**直接返回远程 URL**，删除整段「下载到缓存再播」逻辑；
2. **加密容器识别**：URL 后缀 `.mgg/.mflac/.qmc*/.tm*` 直接判失败 → 走换源；
3. `tryAltSource`：换源后**直接流式播放**（不再下载落地）；
4. 起播看门狗 12s → **8s**：8 秒内 position 未推进即判失败并换源；
5. 手动下载路径完全不变：`skipDownload` 分支保留，`downloadTrack` 仍走下载（实测 4.1MB mp3 + sidecar）。

**保留的后台缓存**：起播后仍会静默缓存（`trackPlayerIndex` 的 auto-cache 与 prefetch），
用于二次播放秒开，但不阻塞首播。

**回归验证**

```
连续切歌 10/10，日志中「开始缓冲下载/缓冲完成」= 0 次
连续拖动 10/10
手动下载：skipDownload → 4.1MB mp3 + .json/.lrc/.jpg
```


