# 全软件体检：缓存清理规则 / 死代码 / 逻辑对不上

日期：2026-11-24 · 基于 1.4.61

---

## 一、缓存达到上限时的清理规则（现状）

### 参数

| 项 | 值 |
|---|---|
| 上限设置 | 设置 → 下载设置 → 缓存上限，默认 500 MB（`download.cacheLimitMb`） |
| 缓存目录 | `Documents/musicCache/`（自动缓存，`index.json` 记元数据） |
| 下载目录 | `Documents/downloads/`（手动下载，与缓存完全分离） |

### 触发时机

**只有一处**：自动缓存完一首新歌之后（`trackPlayerIndex` → `maybeCacheCurrent` → `enforceCacheLimit`）。

所以：

- 启动 App **不会**检查
- 把上限从 500MB 改成 100MB **不会**立即清理，要等下一次自动缓存
- 手动下载**永远不参与**这个上限

### 清理过程

1. 扫描 `musicCache/` 下所有文件，累加大小
2. 没超上限 → 什么都不做
3. 超了 → 按文件 **修改时间（mtime）从旧到新** 排序
4. 依次删除，直到总大小 ≤ 上限
5. 每删一个文件：同步删除 `index.json` 里的条目 + 去掉列表里的「已缓存/已下载」勾

### 保护规则

| 对象 | 是否受保护 |
|---|---|
| 手动下载（`downloads/`） | ✅ 完全不碰 |
| 当前正在播放的文件 | ⚠️ 代码里有保护，但**实际失效**（见下） |
| 歌词 / 封面 sidecar | ✅ 不单独清理（跟随音频一起被删的是缓存目录里的） |
| 播放进度、歌单、设置 | ✅ 不受影响 |

**为什么「正在播放」的保护失效**：

```ts
if (activePath && entry.uri.endsWith(activePath.replace(/^.*\//, ''))) continue
```

`activePath` 传进来的是**远程流地址**（`http://.../abc.mp3`），取最后一段是 `abc.mp3`；
而缓存文件名是 `tx_003aAYrm3GE0Ac.mp3`（按 平台_id 命名）。两者永远对不上，保护条件等于恒 false。

实际能躲过删除，是因为当前曲刚缓存完、mtime 最新，排在最后 —— 属于巧合，不是保护。

### 和设置描述对不上的地方

| 设置里写的 | 实际行为 |
|---|---|
| 「超出后按最久未使用淘汰」（LRU） | 按**文件修改时间**淘汰。缓存很久但天天在听的歌，会先于缓存后从没听过的歌被删 |
| 调小上限立刻生效（隐含） | 要等下一次自动缓存才清理 |

### 建议的修法（如果要改）

1. 播放命中缓存时 `touch` 一下文件 mtime（或索引里记 `lastUsedAt`），实现真正的 LRU
2. 修改缓存上限时立刻跑一次 `enforceCacheLimit`
3. 「正在播放」保护改为按**缓存文件名**判断（用 `getLocalFilePath(currentMusic)`）
4. 启动时做一次轻量校验（只统计大小，不删），超限再清理

---

## 二、死代码

### 2.1 完全没有被引用的文件（17 个，约 900 行）

| 文件 | 行数 | 说明 |
|---|---|---|
| `src/components/SearchList.tsx` | 192 | 搜索页已改用 `mac/SongListView`，旧列表组件 |
| `src/components/SearchListItem.tsx` | 150 | 同上 |
| `src/store/trackViewList.ts` | 93 | 旧版「正在播放列表」store，只有自引用 |
| `src/components/utils/nativeModules/crypto.ts` | 87 | 旧加密模块，SDK 已不走它 |
| `src/components/ArtistTracksList.tsx` | 86 | 歌手页已用别的实现 |
| `src/components/PlaylistsListModal.tsx` | 83 | 旧歌单弹窗 |
| `src/components/mac/KaraokeFillText.tsx` | 72 | 被 `KaraokeSegLine` 取代 |
| `src/helpers/userApiHelper.ts` | 59 | 旧 API 帮助函数 |
| `src/store/usePlayerStore.ts` | 27 | 旧 zustand store |
| `src/hooks/useTrackPlayerVolume.tsx` | 26 | 未使用 |
| `src/helpers/errors/MusicError.ts` | 24 | 未使用（含 NetworkError/APIError） |
| `src/utils/timeformat.ts` | 18 | 未使用 |
| `src/components/utils/lyricUtils/util.ts` | 13 | 未使用 |
| `src/hooks/useTrackPlayerRepeatMode.tsx` | 6 | 未使用 |
| `src/components/utils/nativeModules/cache.ts` | 6 | 未使用 |
| `src/utils/trackUtils.ts` | 6 | 未使用 |
| `src/constants/trackPlayerEventListener.tsx` | 0 | 空文件 |

另外 `src/helpers/userApi/getMusicSource.ts` 里的 `myGetMusicUrl` / `handleBackupFetch`
也没有调用方（连同注释掉的老逻辑），可以一起删。

### 2.2 从未被读取的设置键

**桌面专属（保留兼容，不算 bug）**：
`desktopLyric.*`、`tray.*`、`sync.*`、`openAPI.*`、`network.proxy.*`、
`player.mediaDeviceId`、`player.isMaxOutputChannelCount`、`player.isMute`、
`player.preservesPitch`、`player.audioVisualization`、`player.waitPlayEndStop*` 等。

**真正没人读的（iOS 上属于死键）**：

| 键 | 说明 |
|---|---|
| `player.playQuality` | 真源是 `music.quality`，代码注释里也写了「不再写这个镜像」 |
| `playDetail.bgOpacity` | 真源是 `playDetail.bgBlur` |
| `playDetail.style.fontSize` | 真源是 `lyric.detailFontSize`（PersistStatus） |
| `common.fontSize` / `common.font` / `common.isShowAnimation` / `common.randomAnimate` | 桌面 UI 遗留 |
| `common.controlBtnPosition` / `common.playBarProgressStyle` / `common.glassBlur` / `common.showChangeLog` | 同上 |
| `list.actionButtonsVisible` | 未使用 |
| `download.enable` | 未使用 |
| `download.skipExistFile` / `download.isDownloadLrc` / `download.isEmbed*` 等 | 桌面下载项，iOS 走自己的下载器 |

**最近两批改动留下的**：

| 键 | 状态 |
|---|---|
| `odc.isAutoClearSearchInput` / `odc.isAutoClearSearchList` | UI 已删，搜索页仍按默认 false 读取 |
| `download.quality` | UI 已删，`downloader.ts` 仍作为「没传 quality 时」的兜底 |

---

## 三、逻辑对不上

| # | 位置 | 问题 | 影响 |
|---|---|---|---|
| 1 | `CacheManager.enforceCacheLimit` | 「LRU」实际按文件 mtime 淘汰 | 常听的歌可能先被删 |
| 2 | 同上 | 当前播放文件保护条件用的是远程 URL 文件名 | 保护失效（靠 mtime 巧合躲过） |
| 3 | 同上 | 只在自动缓存后触发 | 改小上限不立即生效 |
| 4 | 设置 | `player.playQuality` / `playDetail.bgOpacity` / `playDetail.style.fontSize` 是旧键，页面写的是另外三个 | 备份导入后看着有值，实际不生效 |
| 5 | 下载 | `download.quality` 已无 UI，仍被 `downloader` 当兜底 | 行为不透明（用户以为没有这个设置了） |
| 6 | 搜索 | `odc.*` 已无 UI，搜索页仍读 | 同上（默认 false，暂时无感） |
| 7 | `getMusicSource.myGetMusicUrl` | 失败时返回 `fakeAudioMp3Uri`（假音频） | 该函数已无调用方；但 `resolveSource` 也有几处返回假音频，会「能播但没声」 |
| 8 | `player.autoSkipOnError` | iOS 默认 false，Mac 默认 true | 有意为之，但设置项说明需要写清「默认不自动跳歌」 |
| 9 | `MusicError` 体系 | 定义了 NetworkError/APIError，但没人用 | 错误处理实际都是字符串 |

---

## 四、建议的处理顺序

| 优先级 | 内容 | 风险 |
|---|---|---|
| P0 | 缓存 LRU 修正（touch mtime / lastUsedAt）+ 上限变更立即清理 + 播放文件保护修正 | 低，只动缓存 |
| P1 | 删死文件（17 个）+ `myGetMusicUrl` 死函数 | 低，删前 grep 确认 |
| P1 | 清理死设置键（`player.playQuality` / `playDetail.bgOpacity` / `playDetail.style.fontSize` / `common.*` 等） | 低，删默认值即可 |
| P2 | `download.quality` / `odc.*` 收尾（要么恢复 UI，要么删键） | 低 |
| P2 | `fakeAudioMp3Uri` 兜底改成「抛错走换源」 | 中，涉及播放失败路径 |

---

## 五、两个实测问题（1.4.62 之后）

### 问题 A：点「下一首」切换过程中闪退

**已定位的确定路径（1.4.62 / 1.4.63 已修）**

1. `tryAltSource` / `tryFreshResolve` 是长异步（多脚本 × 多音质 × 超时，最坏十几秒）。
   用户在这期间点下一首，旧结果回来后在**新歌**上再 `setMediaItems` 一次。
   现在落地前校验 `controlRevision` + `isCurrentMusic`，过期结果丢弃。
2. `advanceAfterEnd` 与 `PlaybackError` 的恢复动作原先直接在原生事件回调里执行。
   `MediaItemTransition` 是原生队列变更过程中派发的，回调里同步调 `setMediaItems`
   等于同时改两次队列。现在统一 `setTimeout(0)` 跳出回调。

**还没排除的**

- 音效开启时，`SoundEffectTap` 给新 item 挂 `audioMix` + `MTAudioProcessingTap`；
  快速切歌会让上一首的 tap 在音频线程上被释放。若崩溃栈落在
  `tapProcess` / `MTAudioProcessingTapFinalize`，就是这个原因。
- 1.4.63 起崩溃会写 `Documents/jk-last-crash.txt` 并显示在「播放诊断」，
  下次复现直接看栈首帧即可判定。

### 问题 B：熄屏播放 10–20 分钟后 App 退出

**三种可能，1.4.63 已覆盖前两种的取证**

| 可能 | 依据 | 处理 |
|---|---|---|
| 流停滞 → AVPlayer 暂停 → App 被挂起 → 系统回收 | 之前没有监听 `AVPlayerItemPlaybackStalled`，后台 JS 定时器不跑 | 原生停滞监听，4s 无进度就上报失败并换源 |
| 内存增长被杀（jetsam） | `logger` store 数组无上限，下载进度每块写一条 | 只留 300 条；下载进度每 10% 记一条 |
| 音频线程崩溃（音效 DSP） | 音效链路有 FFT / 卷积 / tap，崩溃无 JS 痕迹 | 崩溃取证会写信号 + 栈 |

**为什么重开后「进度在、但没在播」**

这是设计如此：`player.startupAutoPlay` 默认 false，恢复只把当前曲目和位置放回去（迷你条可见），
不自动起播。现在诊断页会多一条「上次异常退出」，能区分「被系统杀」和「自己崩」。

**下一步（如果还复现）**

1. 看「播放诊断」最上面的「崩溃」条目：`上次崩溃` = 有栈，`上次异常退出` = 被系统杀（无栈）
2. 有栈：`Documents/jk-crash-report.log` 里有完整符号，直接定位
3. 无栈：到 iOS「设置 → 隐私与安全性 → 分析与改进 → 分析数据」找 `JKMUSIC-*.ips`，
   看 `reason` 字段（`per-process-limit` = jetsam 内存，`Namespace SIGNAL` = 崩溃）
