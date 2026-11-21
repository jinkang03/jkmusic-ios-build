> **LATEST：1.4.7 / build 31**
> 文件 `artifacts/ipa/JKMUSIC-1.4.7-unsigned-20261121.ipa`
> sha256 `5e490666d1695d7f9e3687c2c885ff1127099877a4956c7d3d7f1dfc71c074b9`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.7（2026-11-21）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.7-unsigned-20261121.ipa` |
| 大小 | 18 MB |
| sha256 | `5e490666d1695d7f9e3687c2c885ff1127099877a4956c7d3d7f1dfc71c074b9` |
| 版本 / build | 1.4.7 / 31 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.7` |

### 1.4.7 逐字歌词重做 + 已下载播放修复 + 视觉

**a) 逐字歌词按 mac 的 `lyric-font-player` 重做**

先读 mac 的实现：
- `common/utils/lyric-font-player/font-player.js` 把每个 `<start,dur>` 段生成一个 `<span>`，
  段内用 Web Animation 做 `background-size` 0→100%；
- 所有 span 在**同一个行内容器**里自然排版，空格/换行由浏览器负责；
- `index.js` 调用 `font.play(curTime - lines[num].time)`，传的是**行内相对时间**。

我们旧实现用「每段一个独立 Text + 宽度裁剪」，英文/含空格的行会因为宽度测量和空格 trim
整体错位 —— 这就是「歌词快了两个词」的来源。

新实现 `KaraokeSegLine`：
1. 整行是**一个 Text**，内部嵌套每个 seg 的 Text → 排版与普通文本完全一致；
2. 已唱=主色、未唱=灰、正在唱的那段做颜色插值（80ms 量化，不依赖宽度测量）；
3. 段区间 `[start, min(nextStart, start+dur))`，与 mac 的调度口径一致。

`findKaraokeSegs` 的匹配容差 30ms → 120ms（普通 lrc 与 lxlyric 行时间常有舍入差异，
匹配失败会回退成「整行扫过」，看起来也像提前）。

**b) 已下载歌曲卡顿/播不了（三个叠加的 bug）**

1. `file://` 未编码：文件名是「歌名 - 歌手」，含中文/空格/括号，
   AVPlayer 解析失败 → duration 0。改为统一走 `fileUriFromPath`；
2. `fileUriFromPath` 对已带 `file://` 的入参又编码了一次，生成
   `file://file%3A///...` → `INVALID_SOURCE`。改为先剥前缀；
3. `play()` 判定「已经在播这首」时复用 `nativeQueue.track`（没有 url）→ fake-audio。
   本地试听的 id 加 `local:` 前缀，并在复用分支里优先使用传入的 `file://` url。

实测：下载页试听晴天，进度 03:47 / 剩余 00:42 正常推进，封面与歌词来自 sidecar。

**c) 底栏与播放条**

高度 60→56、圆角 30→28、底部间距 8→4、播放条与胶囊间距 10→14，
保证播放条完整显示且不被底栏圆角压住。

**d) 液态玻璃（播放条 + 底栏）**

- BlurView 80/92 → 95/100；
- 描边 hairline → 1px；
- 新增顶部白色渐隐高光层（`LinearGradient` 0.30 → 0.06 → 透明），形成玻璃厚度；
- 播放条圆角 22 → 24。

**e) 源名显示分区**

- 排行榜、搜索、歌单列表的**平台胶囊固定中文**（酷我音乐/酷狗音乐…）；
- 只有歌单内的**歌曲行角标**跟随「显示源名」设置（中文名 / kw）。

**f) 换源规则：同名同歌手即成功**

去掉括号/后缀后标题一致 + 任一歌手有交集 → 直接判定同一首（score 100），
不再要求其它字段吻合。`collectCandidates` 的提前结束阈值同步改为 100。

**g) 翻译行元信息过滤**

`translationLyrics` 之前没走 `stripMetaLines`，tx 返回的
「以下歌词翻译由文曲大模型提供」会当成翻译行显示。现已过滤。


