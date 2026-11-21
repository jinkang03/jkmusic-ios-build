> **LATEST：1.4.9 / build 33**
> 文件 `artifacts/ipa/JKMUSIC-1.4.9-unsigned-20261121.ipa`
> sha256 `b7bf8b21739f41f9a781d49b980628b497ce4b64f27c9784f59048a4404e9f69`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.9（2026-11-21）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.9-unsigned-20261121.ipa` |
| 大小 | 18 MB |
| sha256 | `b7bf8b21739f41f9a781d49b980628b497ce4b64f27c9784f59048a4404e9f69` |
| 版本 / build | 1.4.9 / 33 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.9` |

### 1.4.9 歌词偏移：两个真实根因

**根因 1：`parseKaraokeLine` 的「绝对/相对时间」自适应会误判**

1.4.6 加过一条规则：若首个 seg 起点 ≥ 行时间 × 0.8，就认为数据是绝对时间、不再叠加行时间。
问题是 lxlyric 行首常有空白段（`<0,0>` 被跳过），第一个**有效**段的 start 可能已经比较大，
这条规则就会误判成绝对时间 → 少加一次行时间 → 整行提前（最多能提前一整行）。

把三个源的实现都核对了一遍，段内时间**全部是相对行开始**：
- kw：`lrcTools.getWordInfo` 输出 `<start,dur>`，start 从 0 起；
- mg：`parseLyric` 显式做了 `wordStart - lineStart`；
- mac 的 `FontPlayer` 同样把 seg.start 当相对值，播放时传 `curTime - lineTime`。

已去掉自适应，统一 `start + lineTimeMs`。

**根因 2：换源后歌词可能来自另一个平台**

`buildSwappedMusic` 之前只看 `resolvedFromStore`，不看**音频实际来源**。
`resolvedFromStore` 可能是上一次换源尝试的残留，于是出现「音频是 tx、歌词却是 kw」——
两个平台的同曲版本前奏长度不同，整行会差 1–5 秒（用户感知就是「快了两个词」）。

修复：
- `fetchLyric` 先读缓存 index 的 `actualSource`（音频真实来源）；
- 只有 `swapped.to === audioSource` 时才使用换源歌词；
- 日志增加 `audioSource=` 字段，便于核对（`source= kw audioSource= kw swapped= false`）。

**验证**：播放晴天 → seek 00:59（暂停）

```
[lyric] active idx=10 pos=59170 segs=6 lit=2 first=58838 last=60102
```

行时间 58.84s、位置 59.17s、行内 0.33s → 「花落的那一天」前 2 字已唱，
截图确认「花落」金色、「的那一天」灰色，时间轴与字序完全对齐。


