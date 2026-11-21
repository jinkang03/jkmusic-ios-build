> **LATEST：1.4.6 / build 30**
> 文件 `artifacts/ipa/JKMUSIC-1.4.6-unsigned-20261121.ipa`
> sha256 `c7f67f55948a2e4ca0aea35d4076f8ab5853e043267b3ffa57c4d26437c41016`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.6（2026-11-21）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.6-unsigned-20261121.ipa` |
| 大小 | 18 MB |
| sha256 | `c7f67f55948a2e4ca0aea35d4076f8ab5853e043267b3ffa57c4d26437c41016` |
| 版本 / build | 1.4.6 / 30 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.6` |

### 1.4.6 六项问题（下载/底栏/歌词/播放失败）

**a) 下载页筛选音质不生效**

`filtered = items` 完全没有参与过滤，选 128k 只是胶囊变色。现在按 `quality` 过滤；
同时修正 `normalizeQuality` 的判断顺序：**扩展名优先**（`.flac` 一定是 flac），
再按文件大小，最后才用 sidecar 的 quality（旧数据把它写错过，出现「4.1MB · 320k」）。

**b) 底部功能条偏大、文字压圆角**

54 高 = icon 34 + label 14 + padding 4×2，内容已溢出。改为：
高度 60、圆角 30、上下 padding 0、item 垂直居中、icon 容器 32。

**c) 下载音质与播放音质分离**

新增 `download.quality`（默认 128k）。`downloadTrack` 不再读 `music.quality`，
设置 → 下载设置新增「下载音质」三档。手动选择音质（播放页/长按菜单）仍然优先。

**d) 逐字歌词偏移 / 全屏无高亮 / 元信息行**

- 全屏歌词滚动定位失败的主因：`itemHeightsRef` 从不清空，切歌后 `getItemLayout`
  按上一首的行高算 offset → 整体偏移。现在按歌词身份清空缓存，并在行高测量完成后
  追加一次 420ms 校准。
- `parseKaraokeLine` 增加时间基准自适应：首段起点 ≥ 行时间 ×0.8 时视为绝对时间，
  不再重复叠加行时间（兼容原始 krc 与 kw 转换后的两种格式）。
- 元信息行过滤扩充：`Lyrics by` / `Composed by` / `Written by` / `以下歌词翻译由…提供` 等。
- **翻译行不再逐字**：主歌词的 seg 时间轴套不到译文上，改为整行高亮（紧凑与全屏同步）。

**e) 播放卡住无提示 / 取流成功但播放失败**

取流成功 ≠ 能播。原来 `failToPlay` 只 stop + 提示，不会换源。

- 新增 12 秒播放看门狗：进度未推进（`position <= 0.5`）即判定失败；
- `failToPlay` 先尝试跨平台换源（同一首只换一次），成功则继续播并提示「已用 XX 播放」；
- 跨源兜底只保留「有脚本支持」的平台（避免为 wy 这种无脚本平台白等超时）；
- 兜底 meta 不再把 `hash` 强制写成 id（kg/tx 会取错字段）。

**f) 回归清单**

新增 `docs/REGRESSION.md`：按版本记录已修问题与验证方式，每次构建前过一遍，
防止后续改动把已修问题带回来。


