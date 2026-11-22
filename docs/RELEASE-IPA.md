> **LATEST：1.4.34 / build 58**
> 文件 `artifacts/ipa/JKMUSIC-1.4.34-unsigned-20261122.ipa`
> sha256 `29a83542c9d04c52fe5adbef662534ac7a9c33061e3bc32713630838033c8a7f`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.34（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.34-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `29a83542c9d04c52fe5adbef662534ac7a9c33061e3bc32713630838033c8a7f` |
| 版本 / build | 1.4.34 / 58 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.34` |

### 1.4.34 流式播放的两个运行时看护（批次 3）

改成流式后丢了「下载完再校验」这条防线，补两个运行时检查（每 5 秒采样一次进度）：

**a) 试听片段检测**

```
播放到 3 秒后，比较 RNTP 的 duration 与曲目元信息里的时长；
实际 < 应有 × 80%（且应有 >= 60s）→ 判定为试听片段 → 换源
```

本地文件（`file://`）不参与，避免误判。

**b) 中途停滞检测**

```
播放意图为 play 且位置 > 0.5s：
位置 15 秒没有前进（前后跳动 > 0.4s 视为前进，含拖动）
→ 与起播失败同样处理：换源
```

三道防误判：
- 播完（position ≥ duration-1.5）不判；
- 暂停/停止期间不计时；
- App 挂起恢复时（采样间隔 > 10s）重新计时。

**开发开关（仅调试用）**

- `jkmusic://settingSection/dev?action=clipsim&on=1` → 把应有时间放大到 600s，用来验证片段检测；
- `jkmusic://settingSection/dev?action=nativePause` → 只暂停原生播放器不改意图，用来验证停滞检测。

**实测**

```
片段：流式时长明显偏短 270s/600s → 换源 kw -> tx -> wy
停滞：position=6.3 冻结 → 15s 后「播放停滞 15s」→ 换源 kw -> wy
连续播放 70 秒：pos=69.15，停滞/片段误判 0 次，换源 0 次
连续切歌 10/10，连续拖动 10/10，误判 0 次
五平台：kw 7.36 / kg 4.09 / tx 15.06 / wy 8.12 / mg 6.19
```


