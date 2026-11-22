> **LATEST：1.4.33 / build 57**
> 文件 `artifacts/ipa/JKMUSIC-1.4.33-unsigned-20261122.ipa`
> sha256 `ddc9d738925b93ce10fad10340abbd86df4e1fbc05eabdc7998c3715b601bd6c`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.33（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.33-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `ddc9d738925b93ce10fad10340abbd86df4e1fbc05eabdc7998c3715b601bd6c` |
| 版本 / build | 1.4.33 / 57 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.33` |

### 1.4.33 换源：从「一次性」改成「备用队列 + 逐级换源」

**修复的四个逻辑缺口**

| # | 问题 | 修法 |
|---|---|---|
| A1 | `altCache` 存的是 URL，第二次换源原样返回同一个已失效地址 | 缓存改存 `{source,id}` 身份，地址每次重新取 |
| A2 | `Promise.any` 把其余成功候选直接丢弃 | 成功结果留在 `altBackups`，失败时直接 pop（0 延迟） |
| A3 | 换源路径不拦加密后缀 | `isEncryptedAudioUrl` 两边共用，`.mgg` 候选直接跳过 |
| A4 | 一首歌只允许换一次源，点播放重试也不重置 | 改成「每曲最多 5 次」，`play()` 时重置该曲记录 |

**延迟优化**

| # | 问题 | 修法 |
|---|---|---|
| B1 | `Promise.allSettled` 等最慢平台（每平台最多 3×6.5s） | 索引候选立刻开跑，搜索结果随到随取 |
| B2 | 无总预算，最坏可拖到 60-80s | 换源总预算 **12s**（预取 6s），到点用已有结果 |
| B3 | 设 128k 换源时反而去试 320k | 音质阶梯只降不升 |

**实测（`_dev.forceBadUrl=true` 强制所有候选失败）**

```
matrix ok kw / tx / mg / wy（4 个候选全部拿到地址）
换源成功 kg -> tx
换源成功 kg -> mg
换源成功 kg -> wy
换源无可用结果
```

第二次播放同一首 → `tried= 1` 重新计数（证明重试会重置）。

**常规回归**

```
连续切歌 10/10（0 次换源，全部原平台直连）
连续拖动 10/10（偏差 0.34-0.37s）
五平台各 1 首：kw 8.04 / kg 4.87 / tx 15.77 / wy 8.46 / mg 8.71
```


