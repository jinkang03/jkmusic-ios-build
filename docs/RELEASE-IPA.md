> **LATEST：1.5.0 / build 88**
> 文件 `artifacts/ipa/JKMUSIC-1.5.0-unsigned-20261125.ipa`
> sha256 `9069f8d5a72e2fd2204f7eeafadfb40cec8eb33df7e0b1007e2b1aed35b0650d`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.5.0（2026-11-25）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.5.0-unsigned-20261125.ipa` |
| 大小 | 21 MB |
| sha256 | `9069f8d5a72e2fd2204f7eeafadfb40cec8eb33df7e0b1007e2b1aed35b0650d` |
| 版本 / build | 1.5.0 / 88 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.5.0` |

### 1.5.0 下载删除修复 + 歌单排序/一键置顶

**修复：下载页「删除」无效**

`removeDownload` 先 `sidecarBase(uri)` 去掉扩展名，然后只删了
`${base}`、`.json`、`.lrc`、`.tlrc`、`.jpg` —— **音频本体（`.mp3`/`.flac`）从来没被删过**。
页面重新扫描目录，文件还在，看起来就是「点了没反应」。

现在按音频扩展名 + sidecar 一起删（flac/mp3/m4a/wav/aac/ogg/json/lrc/tlrc/jpg/png），
删完再扫一次复核，还在就弹「删除失败，文件仍占用」。同时把列表 `keyExtractor`
从「文件名」改成「完整路径」——不同歌单目录下同名文件之前会撞 key。

实测：`before=18 after=17 stillThere=false`，音频与 sidecar 同时消失。

**新增：歌单排序 / 一键置顶（含内置歌单）**

长按「我的列表」里任意歌单（包括试听列表、我的收藏）弹出菜单：

| 选项 | 行为 |
|---|---|
| 排序歌单 | 打开排序页，逐行 ↑/↓ 调整，立即生效 |
| 一键置顶 | 把该歌单移到最前 |

- 顺序存 `jk_library / listOrder`（MMKV），重启保留
- 删除歌单时自动从顺序表剔除，不会留下幽灵 id
- 没记录过顺序的歌单排在后面，保持原有相对顺序（向后兼容老数据）
- 内置歌单不再被「内置列表不能删除」整段拦掉，只是不给删除/改封面入口

**实测**

- 排序页 5 个歌单顺序正确，首行 ↑ / 末行 ↓ 置灰
- `pinTop` → `["user_b","love","default",...]`；`sortMove` 相邻交换正常；重启后顺序保留
- 用户歌单菜单：设置封面 / 排序歌单 / 一键置顶 / 删除歌单 / 取消
- 内置歌单菜单：排序歌单 / 一键置顶 / 取消
- 回归：播放 15.46s / 233.71s 正常，搜索、下载页、设置页无异常，`fatal=0`

## v1.4.63（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.63-unsigned-20261124.ipa` |
| 大小 | 21 MB |
| sha256 | `2dc83a93dd970bfbcf396fe9aaed1e1e0de089072cbd4f0bea1c12196975d2c8` |
| 版本 / build | 1.4.63 / 87 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.63` |

### 1.4.63 崩溃取证 + 后台停滞恢复 + 切歌重入保护

**1. 崩溃取证（App 直接消失时能查到原因）**

| 层 | 做了什么 |
|---|---|
| 原生 | `NSSetUncaughtExceptionHandler` + SIGABRT/SIGSEGV/SIGBUS/SIGILL/SIGFPE/SIGTRAP → `Documents/jk-last-crash.txt`（信号处理只用 `write`/`backtrace_symbols_fd`，不碰 Foundation） |
| 原生 | 启动写 `jk-run.marker`，正常退出才删；下次启动发现还在 → `jk-last-abnormal-exit.txt`（被系统杀掉） |
| JS | 启动读这两个文件 → 写「播放诊断」页（新增「崩溃」类型）+ 追加 `jk-crash-report.log` |
| JS | `ErrorUtils.setGlobalHandler` 接管未捕获 JS 错误，release 下也留痕 |

实测：`simctl terminate` 后重开 → 诊断页出现「崩溃 / 上次异常退出 / 版本 1.4.63 (87) 启动于 …」；
手动写入 SIGSEGV 栈后重开 → 「崩溃 / 上次崩溃 / 致命信号 + 栈首帧」。

**2. 后台停滞：原生上报，不再等 JS 定时器**

`AVPlayerItemPlaybackStalled` 之前没人监听。后台/熄屏时 App 一旦被挂起，JS 的
`setInterval` 看护不再执行，流卡住就只能静静停着，随后被系统回收。

现在 `AVPlayerEngine` 监听停滞：给 4 秒缓冲（多数卡顿会自愈），仍无进度就按失败上报，
JS 走「同源重取 → 跨源兜底」，在后台也能自恢复。

**3. 切歌重入保护（对应「点下一首闪退」）**

- `advanceAfterEnd` / `PlaybackError` 里的恢复动作改成 `setTimeout(0)` 跳出原生事件回调：
  `MediaItemTransition` 是在原生改队列过程中派发的，在回调里同步 `setMediaItems`
  等于同时改两次队列
- `tryAltSource` / `tryFreshResolve` 落地前校验 `controlRevision` + `isCurrentMusic`（1.4.62 已加）

**4. 内存：日志不再无限增长**

`logger` store 的数组无上限，下载进度每块写一条，长时间后台播放/缓存会持续复制数组。
现在只保留最近 300 条，下载进度每 10% 记一条。

**实测**

- 播放 `Shape of You` 14.47s / 233.71s，正常
- 诊断页「崩溃」条目正常显示，格式正确
- `fatal=0`

## v1.4.62（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.62-unsigned-20261124.ipa` |
| 大小 | 21 MB |
| sha256 | `b16c51b7556c840308229816be1d15dd6a4fb84d5719536063c1c76bc0d29d5a` |
| 版本 / build | 1.4.62 / 86 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.62` |

### 1.4.62 清理死代码 + 去掉假音频兜底 + 换源竞态守卫

**P1：删死代码（17 个文件，约 900 行）**

`SearchList` / `SearchListItem` / `ArtistTracksList` / `PlaylistsListModal` / `KaraokeFillText` /
`trackViewList` / `usePlayerStore` / `useTrackPlayerVolume` / `useTrackPlayerRepeatMode` /
`MusicError`（含 NetworkError/APIError）/ `userApiHelper` / `timeformat` / `trackUtils` /
`nativeModules/cache` / `nativeModules/crypto` / `lyricUtils/util` / `trackPlayerEventListener`（空文件）

`getMusicSource.ts` 同时删掉无调用方的 `myGetMusicUrl` / `handleBackupFetch` / `fetchWithTimeout`。

> `lyricUtils/util.ts` 第一次删掉导致打包失败：`.js` 文件里 `import "./util"`，静态扫描只看了
> `.ts/.tsx`，漏掉 `.js`。已恢复并保留该文件。

**P2：去掉假音频兜底**

`MusicSourceResolver` 原来 4 处失败返回 `fakeAudioMp3Uri`（一段静音占位），表现为
「能播、进度条在走、但没声音」，而且不会触发换源。现在改为抛错：

| 场景 | 错误 |
|---|---|
| 本地文件丢失 | `LOCAL_FILE_MISSING` |
| 没有导入音源 | `NO_MUSIC_API` |
| 所有音质都拿不到 | `SOURCE_UNAVAILABLE` |

抛错后走已有的 `failToPlay` → 同源重取 → 跨源兜底 → 停住提示，用户能看到真实原因。

**P2：`download.quality` / `odc.*` 收尾**

- `odc.*` 两个键在搜索页仍被读取，但已无 UI。保留默认 false，行为与之前一致（不自动清空）。
- `download.quality` 保留为「未指定音质时的兜底」，UI 已无入口。

**换源竞态守卫（对应「点下一首闪退」）**

`tryAltSource` / `tryFreshResolve` 是异步的，最坏要等十几秒（多脚本 + 多音质 + 超时）。
用户在这段时间点下一首，旧结果回来后会 `setMediaItems` 把新歌覆盖掉，等于在切歌中途再换一次源。
现在两个函数在落地前都校验 `controlRevision` 与 `isCurrentMusic`，过期结果直接丢弃。

**实测**

- 搜索页 / 播放 / 诊断页正常，无 ERROR
- 播放 `Shape of You` 13.98s / 233.71s（tx 源），切歌不中断
- 诊断页正常显示历史条目

## v1.4.61（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.61-unsigned-20261124.ipa` |
| 大小 | 21 MB |
| sha256 | `417d8aaf646539e3fa33dcb3792bb0f1e3ba2b3a9c279ce22d2c49c77fe1af9f` |
| 版本 / build | 1.4.61 / 85 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.61` |

### 1.4.61 删除强迫症设置 + 播放诊断补全

**删除「强迫症设置」分区**

- 设置首页不再显示该分区，`OdcSection` 组件与路由分支一并删除
- 搜索页仍按默认行为（离开不自动清空），旧设置键保留但不再有入口

**播放诊断补全**

之前只有两条路径会记录：`tryAltSource`（换源成功）和 `haltWithNotice`（停住）。
用户实际看到的「音源：企鹅 → 网易」大多来自 `resolveSource` 内部的**跨源兜底**，这条路没记录。

现在：

| 事件 | 记录 |
|---|---|
| 跨源兜底（resolveSource 内部换源） | `换源`：from → to + 「主源取流失败（跨源兜底）」 |
| tryAltSource 换源 | `换源`：from → to + 具体原因 |
| 任意一次播放失败 | `失败`：原因（起播超时 / 播放停滞 / 试听片段 / 播放出错 / 播放失败） |
| 所有平台都不可用后停住 | `停住`：原因 + 提示文案 |

**实测**

- 设置首页已无「强迫症设置」
- 诊断页能显示「停住 / Shape of You / tx · 所有平台均不可用」等历史条目

## v1.4.60（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.60-unsigned-20261124.ipa` |
| 大小 | 21 MB |
| sha256 | `252f3889d69407ef5c3331c4d81b9b01bca1bc6a94eb62af92f461ceba2ffdd8` |
| 版本 / build | 1.4.60 / 84 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.60` |

### 1.4.60 修复播放详情页下载不跟随音质

**根因**

播放详情页传给下载器的 track 带着**当前播放的流地址**（通常是 128k）。
`resolveSource()` 看到曲目已有 `http(s)` 地址就直接复用、不再请求音源，
所以选 flac/320k 也会下载到那条 128k 地址。
歌单行里的 track 没有 url，所以那边一直正常。

**修法**

- `downloadTrack`：解析前剥掉曲目自带的 http 地址
- `resolveSource`：`requestType === 'download'` 时**强制重新取流**（不再复用已有 url）
- 顺带修正 `[quality]` 日志：之前打印的是播放音质，不是本次请求的下载音质

**删除「下载音质」设置**

手动下载（详情页、歌单行）都会单独弹音质选择，这个设置没有实际入口可用，已从下载设置里移除。

**实测**

- 带 url 的 track + `quality=flac` 触发下载：日志出现 `[download] start ... q=flac` +
  `开始请求音源`（证明没有复用旧地址）
- 模拟器里新导入的「星海音乐源」后端 `zddyr.top` 当前不可达（取令牌超时），
  所以端到端的音质验证需要换一个可用音源

## v1.4.59（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.59-unsigned-20261124.ipa` |
| 大小 | 21 MB |
| sha256 | `7675d74ff0afd9b64120af39bb51dfafa4216224f29bdc554bc5eacac5e2faca` |
| 版本 / build | 1.4.59 / 83 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.59` |

### 1.4.59 实时活动去掉进度/倒计时 + 中断结束自动恢复播放

**实时活动精简**

- 去掉剩余时间倒计时（展开态右上、紧凑态、锁屏卡片）
- 去掉进度条（展开态边缘 trim 进度、百分比、锁屏细线）
- 保留：App 图标、歌名/歌手、播放/暂停状态图标、紫色描边

原因：iOS 对 App 主动 `update()` 的 Live Activity 有频率预算，App 在后台被限流后进度会停住；
之前紧凑态的倒计时用的是系统 `Text(timerInterval:)`，所以它一直在走，看起来「只有进度条不刷新」。

**中断结束自动恢复播放**

- `AVPlayerEngine` 中断结束时：只要中断前在播就恢复，不再依赖 `shouldResume`
  （抖音等短视频 App 经常不设置该标记）
- 恢复播放会重新激活音频会话，系统控制中心才会认我们是「正在播放」

## v1.4.58（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.58-unsigned-20261124.ipa` |
| 大小 | 21 MB |
| sha256 | `d315d5e785c8f97b604ce52cf6280db6ab19c13c2cfc835521a8d335e9e74229` |
| 版本 / build | 1.4.58 / 82 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.58` |

### 1.4.58 控制中心「未在播放」修复（停住时不再清空 Now Playing）

**根因**

1. 播放失败/停住时 `haltWithNotice()` 调用了 `ReactNativeTrackPlayer.clear()`：
   这会清空 `MPNowPlayingInfo` 并**关闭音频会话**，控制中心直接变成「未在播放」
   （QQ 音乐停住时仍然显示暂停卡片）
2. 音频中断结束（抖音让出音频）时只重新发布信息，没有重新 `setActive(true)`；
   系统已把我们的会话置为非激活，发布也不会被当成「正在播放」

**修法**

- 停住时不再 `clear()`：只把 JS 侧队列引用置空，原生 item 保留，系统仍能读到这首歌
- 中断结束时先 `activateAudioSession()` 再 `republish()`
- 配合 1.4.57 的 `refreshNowPlaying()`（回到前台/起播后 300ms）

**实测**

- 回到前台：`[nowPlaying] republish requested` → `NPIC: setNowPlayingInfo: sending to MediaRemote`
- 模拟器后台会被系统终止（音频暂停后进入挂起），所以后台场景需要真机验证

## v1.4.57（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.57-unsigned-20261124.ipa` |
| 大小 | 21 MB |
| sha256 | `50442134a41a26b019d5bc2f9979daf6815a40419f2655fff02e44da228f5e18` |
| 版本 / build | 1.4.57 / 81 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.57` |

### 1.4.57 实时活动封面换 App 图标 + 系统 Now Playing 修复

**实时活动（灵动岛 / 锁屏卡片）**

- 封面固定用 **App 图标**（`assets/jk-app-icon.png`，进程内编码一次并缓存），不再塞歌曲封面
- 保留原有进度条与倒计时（不用系统计时），保留紫色描边
- 启动时先 `await` 结束系统里残留的旧活动，再开新的（避免岛上继续显示旧封面）
- `update` 时如果进程重启导致引用丢失，会从 `Activity.activities` 认领回来
- `staleDate` 30 分钟兜底

**系统「正在播放」（控制中心 / 锁屏系统控件）**

- `publish()` 时同步 `MPNowPlayingInfoCenter.playbackState`（playing / paused）
- 新增 `refreshNowPlaying()`：重新写 nowPlayingInfo + playbackState
- 触发时机：回到前台、音频中断结束、起播后 300ms
- 目的：抖音等 App 抢走音频后，切回来控制中心仍然有我们的歌，可以暂停/切歌

**实测**

- `[live] start ... icon= yes`：图标已编码并传入 attributes
- 切到设置 App 再回到 JKMUSIC：`[nowPlaying] republish requested` → `NPIC: setNowPlayingInfo: sending to MediaRemote`
- 模拟器里 Live Activities 被系统禁用（`[LiveActivity] start enabled=false`），
  岛上看到的是系统自带的 now playing，需要真机验证图标效果

## v1.4.56（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.56-unsigned-20261124.ipa` |
| 大小 | 20 MB |
| sha256 | `b4c1e075d3c68e9017063064611c554a9ebd31a35ceed70cef4c3c0f654ff978` |
| 版本 / build | 1.4.56 / 80 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.56` |

### 1.4.56 音源测试改样本制 + 换源原因 + 播放诊断

**音源测试**

- 从 1 首固定曲目改成 **3 个不同年代的样本**（稻香 / 起风了 / Shape of You）
- 每个平台用**自己搜索到的第 1 条**去取流：搜得到说明有版权，取流失败才是真的不能播
- 结果按 `x/3` 显示，失败带原因：`kg 0/3 fail(稻香: Script returned error; 起风了: 获取音乐 URL 超时)`
- 两首连续超时提前结束，省掉第三首的等待
- 超时收紧：搜索 5s / 取流 10s / 拉流 6s
- 仍然不写缓存、不切当前音源、不占播放脚本池

**换源提示带原因**

- 之前：`该源无法播放，已用酷我播放`
- 现在：`tx 不可用（起播超时），已用酷我播放`
- 原因来自实际失败分支：播放出错 / 起播超时 / 播放停滞 / 试听片段 / 取流失败

**播放诊断页**

- 设置 → 其他 → 播放诊断
- 最近 50 条：换源（from → to + 原因）、停住（原因 + 详情）、时间
- 支持清空；数据持久化，重启仍在

**实测**

- 测试结果：`kw 3/3`、`wy 3/3`、`mg 3/3`、`kg 0/3`（稻香脚本报错、其余超时）、`tx 0/3`（全部超时）
- 诊断页渲染正常（换源/停住两种条目、时间、原因、详情）

## v1.4.55（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.55-unsigned-20261124.ipa` |
| 大小 | 20 MB |
| sha256 | `92efec41017f02591b2c47c9f5a5ba652b17209fe77e43cfb7cd6c48b47b7b46` |
| 版本 / build | 1.4.55 / 79 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.55` |

### 1.4.55 已下载的歌与「已缓存」共用同一个标记

**变化**

- 手动下载的歌在歌单里显示与「已缓存」相同的 ✓ 标记，不再区分缓存/下载
- 下载完成立即打勾；删除下载后标记同步消失
- 启动时后台校验下载索引（文件被外部删掉时，标记不会一直挂着）
- 播放路径不再等待索引构建：未就绪就当没有下载、直接走在线，保证点播零等待

**实现**

- `cachedKeysStore`（打勾用的集合）在 `refreshCachedKeys()` 时合并 `downloadIndex` 的 key
- 下载完成 `markCached`、删除下载后 `refreshCachedKeys` 重算
- `SongListView` 订阅 `cachedKeysStore`，列表即时刷新
- `getDownloadedUri` 只做内存查表，不再 `await` 建索引

**实测**

- 收藏列表第 6 行「晴天」（只有下载、没有缓存）显示 ✓
- 播放该曲：`[jk/play] 使用手动下载文件: file:///...`，时长 269s（用的是 flac 那份）
- 下载目录里同一首同时有 flac/320k 时，按音质取 flac

## v1.4.54（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.54-unsigned-20261124.ipa` |
| 大小 | 20 MB |
| sha256 | `33f771bda6e5e5b33b4f46b3a1a9ae59bdca59d6737d45656843d0051517553b` |
| 版本 / build | 1.4.54 / 78 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.54` |

### 1.4.54 手动下载优先本地 + 文字颜色即时生效

**手动下载优先本地**

取流顺序改为：

```
曲目自带 file:// → 手动下载 → 末段预取 → 播放缓存 → 网络
```

- 新增 `src/jk/downloadIndex.ts`：`<source>:<id>` → 本地文件
  - 索引持久化在 MMKV，启动直接读；首次无索引时后台扫 `downloads/` 的 sidecar
  - 下载完成 / 删除下载时增量更新
  - 命中后校验文件存在与大小，失效自动剔除并回退
  - 同一首歌多份时按 flac > 320k > 128k，同档取最新
  - 老下载没有 `source`/`sourceId` 的跳过（不按歌名猜）

**文字颜色即时生效**

- 根因：`macPalette()` 取色逻辑没问题，但 `AppThemeProvider` 没有订阅 `textColorStore`，
  改完颜色当前页不重渲染，必须退出再进
- 修法：provider 订阅 `textColorStore` 并放进 context 依赖，所有功能页改色后立即重渲染

**实测**

- 下载 `Blinding Lights`（tx）→ 再播放：`[jk/play] 使用手动下载文件: file:///...`
- 手动删掉下载文件 → 再播放：`[dlIndex] 文件已失效，剔除 tx:...` → 回退网络，正常播放（200s）
- 索引登记：`[dlIndex] 已登记 tx:000qLNqZ3SXnhg 128k`

**已知**

- 源只提供试听时，下载到的就是试听片段（实测该曲 tx 只给 60s），与本次改动无关

## v1.4.53（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.53-unsigned-20261124.ipa` |
| 大小 | 20 MB |
| sha256 | `88cee53328db0607210d4eeb92483989ec76912190dd8b3148200f7db0dd8ca2` |
| 版本 / build | 1.4.53 / 77 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.53` |

### 1.4.53 修复：播完不切歌 / 连续失败误判 / 音源测试不准

**现象**

1. 播完当前歌曲不切下一首，卡在当前画面
2. 提示「播放连续失败，已暂停」，点播放又能放
3. 音源测试显示可用，实际播放又换源

**根因**

1. `consecutiveFailures` 只在「手动点歌单里的歌」时清零，正常播完/成功播放从不清零。
   一次网络抖动累积 3 次失败后，`skipToNext` 的硬保护**永久生效** → 播完不切歌 + 弹「连续失败」。
2. 失败恢复直接走「换源」，没有先按当前平台重新取流。手动点播放会重新取流，所以「点一下又能放」。
3. 音源测试只判断 `getMusicUrl` 返回了非空字符串，不验证地址真的能拉流；而且固定用 128k 测。

**修法**

1. 连续失败计数：播到 10 秒以上即清零；失败记录超过 10 分钟自动作废
2. 失败恢复第一步：同源重新取流（跳过末段预取缓存，限时 8s），救回来就不计失败
3. 末段预热（T-3s）失败时丢弃预取地址，切歌时重新取流，避免复用死链
4. 硬保护触发时同步 JS 播放意图（否则 UI 仍显示在播，用户点一下变成「暂停」）
5. 音源测试改为真实拉流验证：Range 请求前 32KB，要求 200/206、非 HTML、有数据；
   用当前播放音质；带 AVPlayer 的 UA（避免 CDN 按 UA 拒绝导致误判）

**实测**

- 播完自动切歌：Go! (235s) → Something to Hope For (174s)，日志 `队列末尾，播放下一首 (transition)`
- 音源测试：kw / wy / mg / kg 通过，tx 明确报「获取音乐 URL 超时」（修复前会显示 ✓）

## v1.4.52（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.52-unsigned-20261124.ipa` |
| 大小 | 20 MB |
| sha256 | `6990b1a3f637167550ebf58c9cb4aca19611575ca9205e5abc17072e0915f161` |
| 版本 / build | 1.4.52 / 76 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.52` |

### 1.4.52 播放速度并入「变调和变速」+ 整链离线对拍

**界面**

- 音效页新增「变调和变速」区块（在环境混响之上）：
  - 播放速度 0.5x–2.0x（立即作用于当前播放，不受音效总开关影响）
  - 音调升降 0.50x–1.50x（需开启「启用音效」）
  - 「重置」一次把速度和音调都归位
- 「播放设置」里原来的「播放倍速」已移除（只保留这一处入口）

**离线对拍（iOS vs Mac 整链）**

详见 `docs/AUDIO-AB.md`。同一段 12s 素材、同一组参数（摇滚 EQ + bright-hall 4 声道 IR +
干 180% + 湿 240%），Chrome `OfflineAudioContext` 与 `SoundEffectProcessor.renderOffline` 各渲染一遍：

| 指标 | 结果 |
|---|---|
| 总电平 | -0.30 dB |
| 10 个频段（31Hz–16kHz） | -0.28 ~ -0.31 dB，形状完全一致 |
| 波形相关 | 0.9992 / 0.9991（lag = 0） |
| 湿声（干=0，湿=1） | **+0.02 / 0.00 dB** |
| 干声（干=1.8，湿=0） | -0.29 dB |
| 压缩器静态曲线（1kHz 稳态） | **0.01 dB** |

结论：卷积/IR 归一化/4 声道真立体声/EQ 全部一致；0.28 dB 的差来自压缩器在噪声+瞬态下的动态差异，
属于听不出来的量级。

## v1.4.51（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.51-unsigned-20261124.ipa` |
| 大小 | 20 MB |
| sha256 | `1f1370da1fcca7cc6fbf6415538fc18a32f4e73192edb036380bcf9607e09cd9` |
| 版本 / build | 1.4.51 / 75 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.51` |

### 1.4.51 变调（批次 3：相位声码器）

**功能**

- 音调升降调节：0.50x–1.50x 滑块 + 重置（只改音高，不改速度）
- 与混响/均衡器/环绕可叠加
- 1.00x 时完全绕过声码器（不引入额外延迟和 CPU）

**实现**

- 移植 Mac 端的 olvb/phaze 相位声码器：FFT 4096 / hop 128 / 32 重叠 /
  Hann 窗 `0.8*(1-cos)` / 峰值区域搬移 + 相位修正 / 强制共轭对称 / 重叠相加 ÷32
- vDSP 复数 FFT，全部缓冲预分配，音频线程不分配内存
- 变调启用时整条链走 1024 块管线（约 116ms 总延迟，与 Mac 的 93ms 同量级）

**实测**

- 离线单测（正弦 + Goertzel 找峰）：
  - 1.00x @440Hz → 440Hz
  - 1.50x @440Hz → 666Hz（期望 660，受 FFT bin 量化影响，与 Mac 同一算法同样量化）
  - 0.50x @440Hz → 225Hz（期望 220）
  - 1.20x @1kHz → 1205Hz，0.80x @1kHz → 795Hz
  - 各倍率 RMS 一致（0.339 / 输入 0.354），没有爆音或衰减
- 实机：`pitch:1.5` 下发后播放不中断（16.86s → 47.53s），切回 1.0 正常
- CPU（模拟器，含大厅混响）：变调开 19.9% / 关 10.4%

**已知**

- 变调基于 FFT bin 搬移，会有约 ±0.5% 的音高量化误差（Mac 端完全相同）
- 变调开启时总延迟约 116ms，歌词同步仍在可接受范围

## v1.4.50（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.50-unsigned-20261124.ipa` |
| 大小 | 20 MB（+6.6MB IR） |
| sha256 | `4fe5044237e5ac24bcd01709dd9c501c82a316e7d0b8f19b458faf771def64cf` |
| 版本 / build | 1.4.50 / 74 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.50` |

### 1.4.50 环境混响（批次 2：卷积混响）

**功能**

- 环境混响音效：13 个预设（电话 / 教堂 / 大厅 / 电影院 / 餐厅 / 卫生间 / 室内 /
  立体声 / 矩阵混响（1）/ 矩阵混响（2）/ 心形扩散 / 磁性立体声 / 反馈弹簧）
- 选中预设会自动写入该预设的原始音频增益与环境音效增益（与 Mac 一致）
- 环境音效增益 0–500%
- 再点一次已选中的预设 = 关闭混响

**实现**

- 分段 FFT 卷积（block 1024 / FFT 2048 / overlap-add），vDSP 实现
- IR 归一化完全复刻 WebKit `Reverb.cpp` 的 `calculateNormalizationScale`
  （power → 1/power × 10^-2.9 × 44100/sr，4 声道再 ×0.5）
- 4 声道 IR 走 true-stereo 矩阵（与 WebKit Case 6 一致）：
  `outL = conv(L,ir0) + conv(R,ir2)`，`outR = conv(L,ir1) + conv(R,ir3)`
- 48k IR 自动重采样到当前音源采样率
- IR 在后台线程加载/建核，切预设不卡 UI；准备好后原子替换
- 混响启用时引入约 23ms 处理延迟（与 Mac 的卷积块延迟同量级）

**实测**

- 卷积数值对拍：2 声道最大误差 0.0002%，4 声道 true-stereo 0.0001%（对比直接卷积）
- IR 加载：`bright-hall` 4ch/64 段、`matrix-reverb2` 2ch/122 段、`s2_r4_bd` 48k→44.1k
- 切 IR 播放不中断（5.68s → 14.57s）
- 开关、切歌、seek 正常
- CPU（模拟器）：混响开 11.3% / 关 4.9%（4 秒 IR）

**已知**

- AirPlay / 部分蓝牙输出可能不支持自定义 audioMix
- 变调（批次 3）尚未接入

## v1.4.49（2026-11-24）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.49-unsigned-20261124.ipa` |
| 大小 | 18 MB |
| sha256 | `951965b8482718d119076bf981a115984ab784aa24bc361a8f82ee8560b7bc24` |
| 版本 / build | 1.4.49 / 73 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.49` |

### 1.4.49 音效（批次 1：EQ / 增益 / 压缩器 / 3D 环绕）

**入口**

- 设置 → 新增「音效」分区
- 播放页底部工具行新增 tune 图标，直达音效页

**功能**

- 总开关「启用音效」（默认关；关闭时完全不挂 tap，播放路径与 1.4.48 一致）
- 10 段均衡器（31/62/125/250/500/1k/2k/4k/8k/16k），-15~+15dB，与 Mac 同一套 peaking 系数（Q=1.4）
- 9 个 EQ 预设（流行/舞曲/摇滚/古典/人声/慢歌/电子乐/重低音/柔和），数值与 Mac 完全一致
- 「重置」一键归零
- 原始音频增益 0–500%
- 3D 立体环绕（需使用耳机）：启用、环绕速度 1–50、声音距离 1–30
- 设置写入 `player.soundEffect.*`（与 Mac 同 key），随备份导出/导入

**实现**

- iOS 侧用 `AVPlayerItem.audioMix` + `MTAudioProcessingTap`（MediaToolbox），
  直接处理 AVPlayer 解码后的 PCM：流式/缓存代理/换源/后台/锁屏全部不动
- 链路：EQ×10 → 干声增益 → 压缩器（WebKit `DynamicsCompressorKernel` 移植，默认参数）→ equalpower 声像
- 参数通过 TurboModule `setSoundEffect` 下发，音频线程用 trylock 读快照，不阻塞、不分配内存
- 环境混响（13 个 IR）与变调留到后续批次

**实测**

- tap 与缓存代理（本地 HTTP 流）兼容：`audioMix attached` / `tap prepare sr=44100 ch=2 float=true`
- 切歌自动重挂（旧 tap finalize → 新 tap prepare），seek/后台播放正常
- 关→开、开→关：tap 干净挂载/卸载，播放不断
- EQ 离线单测：+6dB@1kHz → 6.00dB；+7dB@31Hz → 7.00dB；-8dB@16kHz → -8.00dB；平直 → 0.00dB
- 压缩器：无 NaN、输出正常；声像 θ=270° → L1.00/R0.00，θ=180° → L0.50/R0.50

**已知**

- 环境混响、变调尚未接入（UI 里暂不显示）
- AirPlay / 部分蓝牙输出可能不支持自定义 audioMix，会退回未处理音频
- 音色主观一致性还需要和 Mac 端 A/B 试听

## v1.4.48（2026-11-23）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.48-unsigned-20261123.ipa` |
| 大小 | 18 MB |
| sha256 | `ff247dbc0afefa3c617fa0db1a7fa83924670f3b54085c3b0921b67c40a613ba` |
| 版本 / build | 1.4.48 / 72 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.48` |

### 1.4.48 自定义歌单封面（批次 2）

**长按菜单**

| 歌单 | 菜单项 |
|---|---|
| 平台导入 | 设置封面 / 更新歌单 / 删除歌单 / 取消 |
| 手动创建 | 设置封面 / 删除歌单 / 取消（没有更新项） |
| 已设自定义封面 | 更换封面 / 恢复默认封面 / 更新歌单 / 删除歌单 / 取消 |

**设置封面**

- 系统相册，1:1 裁剪，选完立即生效（不需要重启或手动刷新）
- 图片复制进沙盒 `Documents/covers/list-<id>-<时间戳>.jpg`
- 用唯一文件名：固定名会被 expo-image 按 URI 缓存，出现「提示成功但还是旧图」
- 换图时删旧文件；恢复默认 / 删除歌单时一并清理
- 无相册权限 → 提示「需要相册权限才能设置封面」

**恢复默认封面**

删掉自定义封面 → 回到平台封面；没有平台封面则回到第一首歌封面；都没有回心形。

**手动创建**

「导入/创建歌单」里选的封面现在真的保存并显示（之前选了会被丢掉）。

**更新歌单**

不会覆盖自定义封面（有 `coverFile` 时跳过 `coverUrl` 更新）。

**实测**

- 有来源的歌单菜单：设置封面 / 更新歌单 / 删除 / 取消
- 手动创建（`nh`）：设置封面 / 删除 / 取消，无更新项
- 设自定义封面后菜单：更换封面 / 恢复默认 / 更新 / 删除 / 取消
- 设封面 → 列表立即换图，杀进程重启仍在
- 恢复默认 → 沙盒文件被删，封面回第一首歌
- 删除歌单 → 沙盒封面文件同步删除
- 内置列表菜单行为不变

**验收说明**

系统相册选图无法脚本化，需在模拟器/真机上手动点一次「设置封面」确认权限弹窗与选图；
选图之后的保存、显示、清理路径已用 dev 动作（`coverSet` / `coverReset` / `coverFiles`）完整验证。

## v1.4.47（2026-11-23）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.47-unsigned-20261123.ipa` |
| 大小 | 18 MB |
| sha256 | `ee79c08f639819e861f9d079c0f86b8dd4162b43f2cbf4f8cde1b7f5db5f7806` |
| 版本 / build | 1.4.47 / 71 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.47` |

### 1.4.47 歌单封面（批次 1）

**变化**

「我的列表」里用户歌单不再固定显示爱心，改为真实封面：

- 平台导入的歌单：显示平台歌单封面（QQ / 酷我 / 酷狗 / 网易云）
- 没有平台封面的歌单：用第一首歌的专辑封面
- 都拿不到：沿用原来的「粉底白心」占位
- 封面加载失败（地址失效/断网）：自动回退占位，不留白不裂图
- 内置列表（试听列表 / 我的收藏）：外观不变

**「更新歌单」同步封面**

更新时顺带读取平台返回的歌单信息，写入 `coverUrl`；
老歌单（没有封面字段）第一次更新后自动补上。
自定义封面字段已预留（`coverFile`），更新时不会被覆盖（批次 2 开放入口）。

**数据**

`JkUserList` 新增 `coverUrl` / `coverFile` / `coverUpdatedAt`，老数据无需迁移。

**踩到的坑**

- 不能把封面地址一律 http→https：`img1.kwcdn.kuwo.cn` 的证书和域名不匹配，
  强制 https 会直接 SSL 失败（实测 `no alternative certificate subject name`）。
  Info.plist 已开 `NSAllowsArbitraryLoads`，保持原协议即可。
- 内置列表原本用的是 QQ 的 `cover_like.png`（粉底白心），
  改成图标后观感变化明显，已改回原图，保证外观不变。

**实测**

- `youth`（tx 链接导入）→ 更新后 `coverUrl` = `https://y.gtimg.cn/...T002R300x300...`，列表显示平台封面
- 酷我 `playlist_detail/2858093057` 导入 → `coverUrl` = `http://img1.kwcdn.kuwo.cn/...`，列表正常显示
- 网易云 / 酷狗 歌单 → 首曲封面兜底正常
- 失效地址（`invalid.example.invalid`）→ 回退占位心形
- 内置列表外观与 1.4.46 一致

**已知限制**

lxmc 备份导入的老歌单里，部分歌曲 `meta` 为空（没有封面字段），
这类歌单在没有平台封面时只能显示占位；点一次「更新歌单」即可补上。

## v1.4.46（2026-11-23）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.46-unsigned-20261123.ipa` |
| 大小 | 18 MB |
| sha256 | `96c1cdd2bf4d6b53bf14cdeb630b7ca727af4b68b73c0d0346a7d60fc54db919` |
| 版本 / build | 1.4.46 / 70 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.46` |

### 1.4.46 全屏歌词当前行居中

**问题**

部分歌曲进全屏歌词后，正在唱的那行不居中、掉到屏幕下方看不见。

**根因（两层）**

1. 行高测量点错了：`onLayout` 挂在主歌词 `Text` 上，翻译行是它的兄弟节点，
   所以每行只量到「主歌词」的高度。开翻译时每行少算约 18px，
   几十行累计偏差 400–500px，当前行自然被推到屏幕外。
2. `scrollToLyricIndex` 定义在 `getItemLayout` 之前，闭包捕获的是首帧那一份
   （歌词和翻译都还没到），之后一直按固定 49px 估算滚动；
   同时「清空行高」的 effect 在首帧布局后执行，会把刚量到的整批行高擦掉。

**修法**

- 行高改量最外层容器（主歌词 + 翻译一起）
- `getItemLayoutRef` 始终指向最新的 `getItemLayout`，不再用首帧闭包
- 行高缓存按歌词身份在写入时失效（不再用 effect 清空），避免和 onLayout 抢时序
- 新增 `layoutTick`：行高变化稳定 90ms 后按真实布局校正一次，
  与上次滚动目标相差 > 12px 才滚，避免来回抖
- 兜底估算按字号、行数（中英文字宽）、翻译行计算，并用已测行做比例自校准
- 歌词行一次性渲染（`initialNumToRender` / `maxToRenderPerBatch` / `windowSize`，
  `removeClippedSubviews=false`），保证每行都能量到真实高度

**实测**

- 同一首（just do it #24）：暂停 120s / 60s、播放中 150s，当前行均居中
- 另一首（#30，英文 + 中文翻译）：首行与中间位置均正常
- 无翻译的歌：容器高度即主歌词高度，行为不变

## v1.4.45（2026-11-23）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.45-unsigned-20261123.ipa` |
| 大小 | 18 MB |
| sha256 | `9abf037588bf4f0fe7bf41a8da5bd18fb2e780461da6d5be6bb52e00870569ff` |
| 版本 / build | 1.4.45 / 69 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.45` |

### 1.4.45 播放条歌名跟随「文字颜色」

**问题**

播放条的 `trackTitle` 样式只 spread 了 `defaultStyles.text`（固定深色），
没有使用页面文字色，所以「文字颜色」滑块改了之后歌名始终是黑色；
歌手名和时间用的是 `colors.textMuted`，看起来就只差歌名一个。

**修法**

- `trackTitle` 显式加 `color: colors.text`
- `MovingText` 新增 `color` 参数，并在 `Animated.Text` 的 style 数组里单独应用
  （实测仅靠 StyleSheet 里的 color，Animated.Text 偶发不生效）
- 播放条歌名、歌手、时间现在统一跟随「文字颜色」

**实测**

- `settextcolor #FF3B30` → 页面与播放条歌名全部变红
- `settextcolor #FFFFFF` → 恢复白色


