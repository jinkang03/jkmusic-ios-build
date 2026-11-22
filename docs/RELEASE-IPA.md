> **LATEST：1.4.35 / build 59**
> 文件 `artifacts/ipa/JKMUSIC-1.4.35-unsigned-20261122.ipa`
> sha256 `df44e8c3da85973527d5b098bfe18640b00dfe28fecc8c5dac81de34283cae3b`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.35（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.35-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `df44e8c3da85973527d5b098bfe18640b00dfe28fecc8c5dac81de34283cae3b` |
| 版本 / build | 1.4.35 / 59 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.35` |

### 1.4.35 修「点歌后 0:00 卡死不恢复」

**现象**：排行榜点任意歌，进度条停在 0:00 / 0:00，不报错、不换源、没有任何提示。

**根因（三处叠加）**

1. **源返回了「连得上但永不响应」的地址**。实测
   `curl http://106.0.55.102/2026-11-22-150024_110711.mp3` → 12 秒无任何响应（code=000）。
   AVPlayer 对这种地址既不报错也不推进，永远停在 0:00。
2. **`verifyMediaUrl` 把超时当成可用**（`catch → return true`），所以这条死地址通过了选源。
3. **8 秒起播看门狗的守卫写错，从未生效过**：

```js
// 旧代码
if (trackSourceLoadingStore.getValue() !== token) return
```

`token` 是 `setTrackSource` 新生成的，而 `trackSourceLoadingStore` 在 `play()` 的 `finally`
里已被清成 `null` —— 两者永远不相等，看门狗每次都在第一行返回。

**修复**

| # | 改动 |
|---|---|
| 1 | 看门狗守卫改为 `nativeQueue?.token !== token`（换曲/换源后 token 会被替换） |
| 2 | `verifyMediaUrl`：3 秒内连响应头都没有（AbortError）→ 判死，脚本池换下一个 |
| 3 | 停滞看护新增「从未起播」分支：position 和 duration 都是 0 超过 12s → 换源 |
| 4 | `haltWithNotice` 置 `streamGuardHalted`：停住后不再每 12s 自动重试、重复弹提示；点播放即重新武装 |
| 5 | 开发开关 `action=badurl&url=...` 可指定任意坏地址，用来复现挂死场景 |

**实测**

```
挂死地址复现：
看门狗超时：8s 未就绪 position= 0 duration= 0 state= buffering
换源成功 kw -> wy
看门狗超时：8s 未就绪 ...
换源成功 kw -> tx
...
停住后再等 25s：换源/看门狗计数不再增加（不会无限重试）

正常播放：连播 6 首，pos 8.5-10.4（12s 窗口），看门狗误报 0
```


