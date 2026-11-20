## v1.3.8（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.3.8-unsigned-20261120.ipa` |
| 大小 | 18.x MB |
| sha256 | `1b6e9ccef4f60231d9fdfa2120046bd310d41e9dc92992ce9e7edb962ff5a970` |
| 版本 / build | 1.3.8 / 22 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.3.8` |

### 1.3.8 保存播放进度

mac 行为（`usePlayProgress.ts` / `player/action.ts`）：保存「当前播放状态」
`{time, maxTime, listId, index}`，启动时恢复到该位置并暂停；开关关闭则从头开始。

实现：

1. `src/player/playProgress.ts`：读写 `music.progressInfo`（7 天过期、已播完不恢复）；
2. 播放中每 5 秒节流保存；暂停 / 切歌前立即保存；
3. 启动恢复：队列恢复后按 `id + platform` 定位曲目，设为当前（**不自动播放**），
   迷你条 / 播放页进度条显示上次位置；
4. 用户点播放：音源就绪后 `seekTo(保存位置)`，只应用一次；
5. 设置项去掉「暂不支持」，hint 改为「启动后恢复上次播放的曲目与位置」；
6. 新增 dev action `resume` 便于无点击验证。

### 实测（模拟器）

```
开启 player.isSavePlayTime → 播《晴天》→ seek 60s → 暂停 → 杀进程重启
[progress] restore 228908 pos= 60 dur= 270
迷你条：晴天 / 1:00 / 4:29（未自动播放）
点播放 → [progress] seek restored 60 → 播放页 01:51 继续
```

### 断言

```
bundle com.jkmusic.ios / version 1.3.8 / build 22 / minos 16.4 / arm64
jsbundle 6.4M / dev 残留 0 / size 18.x MB
sha256 1b6e9ccef4f60231d9fdfa2120046bd310d41e9dc92992ce9e7edb962ff5a970
```

## v1.3.7（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.3.7-unsigned-20261120.ipa` |
| 大小 | 18.x MB |
| sha256 | `bb4f80e229e6051171a3a3cd301df779573d8bc5cca7fa748914bf97981bda31` |
| 版本 / build | 1.3.7 / 21 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.3.7` |

### 1.3.7 恢复锁屏卡片

尝试把锁屏 content 改成透明空视图（想只保留灵动岛），实测会留下一个空白圆角块，
比原来的卡片更难看，已回滚。

**限制说明**：ActivityKit 的 `ActivityConfiguration` 必须提供锁屏 content，
系统无法只渲染灵动岛。可选只有：

1. 正常卡片（当前：封面 + 歌名 + 剩余时间 + 细进度线）—— 推荐；
2. 空白块（透明空视图）—— 难看，已放弃。

### 断言

```
bundle com.jkmusic.ios / version 1.3.7 / build 21 / minos 16.4 / arm64
jsbundle 6.4M / dev 残留 0 / size 18.x MB
sha256 bb4f80e229e6051171a3a3cd301df779573d8bc5cca7fa748914bf97981bda31
```

## v1.3.6（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.3.6-unsigned-20261120.ipa` |
| 大小 | 18.x MB（新增 expo-image-manipulator） |
| sha256 | `9ef020f7f980f411176c722f7aa883ecb2ee62c70efef6a2c31af92c7fb54c86` |
| 版本 / build | 1.3.6 / 20 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.3.6` |

### 1.3.6 灵动岛：封面 + 展开态边缘进度

**封面（解决「有时读不到」）**

根因：Live Activity 是独立进程，读不到主 App 沙盒；传远程 URL 又依赖网络。

做法：

1. 主 App 用 `expo-image-manipulator` 把封面压成 **64×64 JPEG**（base64 约 2KB）；
2. 放进 `ActivityAttributes`（切歌时重启 activity），widget 直接 `UIImage(data:)` 解码；
3. 封面来源优先 `currentArtworkStore`（本地缓存曲目的 `track.artwork` 常为空）；
4. **ActivityAttributes 有 4KB 上限**（实测超限报
   `Request includes ActivityAttributes that exceed the maximum permitted size`）：
   - base64 > 3000 字符时再压到 48×48；
   - Swift 侧 start 失败会自动去掉封面重试一次，保证灵动岛至少能显示；
5. 同一首歌封面后到时补一次 start，且只尝试一次（避免每 2 秒重建 activity）。

**进度**

- 删除紧凑态圆圈进度；
- 展开态（长按卡片）：`RoundedRectangle.trim(from:0,to:progress)` 沿边缘画进度线（强调色 2.5pt）；
- 紧凑态：左侧封面缩略图、右侧倒计时（`Text(timerInterval:)`，系统自动走，不耗 update）；
- 锁屏卡片：封面 + 歌名 + 剩余时间 + 线性进度条。

**实测（模拟器锁屏截图）**

```
[LiveActivity] Requesting an activity ... （无 start failed）
锁屏卡片：封面缩略图 + 晴天 / 周杰伦 + 波形图标 + 3:45 倒计时 + 紫色进度线
[INFO] [live] start 晴天 total= 269.8 art= yes
```

首次使用会弹「允许 JKMUSIC 的实时活动?」，点「允许」后生效。

### 断言

```
bundle com.jkmusic.ios / version 1.3.6 / build 20 / minos 16.4 / arm64
PlugIns: JKMUSICWidget.appex / ShareExtension.appex
jsbundle 6.4M / dev 残留 0 / size 18.x MB
sha256 9ef020f7f980f411176c722f7aa883ecb2ee62c70efef6a2c31af92c7fb54c86
```

## v1.3.5（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.3.5-unsigned-20261120.ipa` |
| 大小 | 17.x MB |
| sha256 | `f10f1be6eb89739a9822d22b553792a0c4a1afb59bd2e370343ff2e4d5b22f3f` |
| 版本 / build | 1.3.5 / 19 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.3.5` |

### 1.3.5 UI 色差 + 排行榜/歌单重复标题

**色差根因（用像素采样定位）**

同一壁纸下逐页截图取同一坐标：

```
我的列表 (246,246,224)   歌单 (234,234,180)
排行榜   (234,234,180)   下载 (234,234,180)   搜索 (246,246,246)
```

差异不是调色板（实测 `macPalette().bg` 与 `getThemeColors().background` 都是
`rgba(255,255,255,0.588)`），而是**叠加层数**：

- 我的列表/歌单/排行榜：子 `_layout` 容器 + 页面根容器各一层半透明底 → 壁纸透出更少、偏白；
- 搜索页：`SafeAreaView` + `contentContainer` 两层；
- 下载页：只有一层 → 最透。

**修复**

1. 各子 `_layout` 容器改为透明，页面只保留一层底色；
2. 搜索页去掉 `contentContainer` 的第二层背景；
3. 我的列表/歌单底色统一改用 `macPalette().bg`（与搜索/排行榜同一来源）；
4. 排行榜、歌单的 Stack header 隐藏 —— 去掉顶部重复的「榜单」，
   页面内大标题上移（同时完成「排行榜标题」那一项）。

**实测**

```
我的列表 / 歌单 / 排行榜 / 下载：同一坐标全部 (234,234,180)，底部全部 (220,238,175)
搜索页顶部差异来自内容卡片（fillSubtle 实色），页面底色与其它页一致
```

### 断言

```
bundle com.jkmusic.ios / version 1.3.5 / build 19 / minos 16.4 / arm64
jsbundle 6.3M / dev 残留 0 / size 17.x MB
sha256 f10f1be6eb89739a9822d22b553792a0c4a1afb59bd2e370343ff2e4d5b22f3f
```

## v1.3.4（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.3.4-unsigned-20261120.ipa` |
| 大小 | 17.x MB |
| sha256 | `22738e314ff116a529bb0874fcf48f9afa7060448f144267b61b9dea064ac997` |
| 版本 / build | 1.3.4 / 18 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.3.4` |

### 1.3.4 歌词三项

**a) 逐字不丝滑 → 平滑填充**

- 旧实现：每个字到点才变色（一格一格跳）；
- 新实现：`KaraokeFillText` 两层文字叠加（底层灰、上层强调色按进度裁剪宽度），
  `Animated` 120ms 线性补间，进度按「字内插值」计算（段内按 dur 推进）；
- 进度刷新从 100ms 提到 50ms；
- 播放页紧凑歌词与全屏歌词都换用该组件，全屏当前行字号放大 1.08 倍。

**b) 英文歌曲翻译不逐字 → 与原文同一时间轴**

- 翻译行改用同一个 `KaraokeFillText` 与同一 `progress`：
  原文唱到哪，翻译就填到哪（无逐字数据时按行时间线性推进）。

**c) 拖动进度后歌词对不上 → 拖动时歌词实时跟随**

- 新增 `seekPreview`：进度条拖动时把「预览位置」广播给歌词，
  松手后才真正 `seekTo`，seek 完成再清预览（避免闪回旧位置）；
- 播放页歌词、全屏歌词都优先使用预览位置；
- 全屏歌词的当前行/滚动位置同样按预览位置计算。

### 实测（模拟器）

- 紧凑歌词：`What you see in her` 已唱部分紫色、未唱灰色，中间连续过渡；
  翻译行同步推进；
- 全屏歌词：`So La Si Si Si La Si La So` 前半紫色后半灰色，上下渐隐正常；
- seek 到 48s/62s 后当前行与音频位置一致（日志 `active idx` 与行时间核对）。

### 断言

```
bundle com.jkmusic.ios / version 1.3.4 / build 18 / minos 16.4 / arm64
jsbundle 6.3M / dev 残留 0 / size 17.x MB
sha256 22738e314ff116a529bb0874fcf48f9afa7060448f144267b61b9dea064ac997
```

## v1.3.3（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.3.3-unsigned-20261120.ipa` |
| 大小 | 17.x MB |
| sha256 | `de5677709b8b79589a064627fda4729cbf4ad3871a0c1f87aa35e295c765813a` |
| 版本 / build | 1.3.3 / 17 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.3.3` |

### 1.3.3 底部导航 + 迷你播放条：悬浮玻璃胶囊

对齐 iOS 26/27 Apple Music：

- **TabBar**：左右 12pt 留边、离底悬浮、58pt 高、圆角 29；
  `BlurView` 95 + 细描边（浅色 8% 黑 / 深色 14% 白）+ 投影；
- **迷你播放条**：圆角 22 胶囊、玻璃 + 描边 + 投影，悬浮在导航胶囊上方 10pt；
- 进度条、时间、上一首/暂停/下一首、封面全部保留，只改样式；
- 列表底部留白统一提到 176（悬浮导航 + 播放条不再遮挡最后几行）。

### 实测（模拟器）

截图确认：底部导航为悬浮胶囊（左右留边、离底留白），迷你播放条为同宽胶囊悬浮其上，
内容从两者下方穿过；选中 tab 仍为强调色。

### 断言

```
bundle com.jkmusic.ios / version 1.3.3 / build 17 / minos 16.4 / arm64
jsbundle 6.3M / dev 残留 0 / size 17.x MB
sha256 de5677709b8b79589a064627fda4729cbf4ad3871a0c1f87aa35e295c765813a
```

## v1.3.2（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.3.2-unsigned-20261120.ipa` |
| 大小 | 17.x MB |
| sha256 | `5ff2e0d00fef8a886776b5ca379abee9852a669eb242a70bfc0794127dd98b1c` |
| 版本 / build | 1.3.2 / 16 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.3.2` |

### 1.3.2 主题简化：只保留强调色

按确认方案：

1. **删除「主题」行**（4 套预设不再驱动颜色）；外观（浅色/深色/跟随系统）保留；
2. **强调色自定义改为色盘**：新增 `ColorPickerModal`
   - 饱和度/亮度面板（两层 LinearGradient 叠加）+ 色相条 + hex 预览；
   - 纯 JS + `expo-linear-gradient`，没有新增依赖；
3. **默认强调色跟随壁纸主色**：
   - 保存壁纸时用 `react-native-image-colors` 提取主色，持久化到 `app.wallpaperAccent`；
   - 启动时若已有壁纸但没记录主色，`ensureWallpaperAccent()` 补提取一次；
   - `getAccentColor()` 优先级：自定义 → 壁纸主色 → 默认品牌色；
   - 清除壁纸同时清掉壁纸主色；
4. 色盘弹窗用实色背景（壁纸开启时页面底色是半透明，弹窗会透出下层）。

### 实测（模拟器）

```
壁纸主色提取 → #55369E
清空自定义强调色 → hint 变「跟随壁纸」，滑块/开关/按钮全部同步为该色
打开色盘 → 初始色即 #55369E，指示圈落在紫蓝区域
设置页不再有「主题」行
```

### 断言

```
bundle com.jkmusic.ios / version 1.3.2 / build 16 / minos 16.4 / arm64
jsbundle 6.3M / dev 残留 0 / size 17.x MB
sha256 5ff2e0d00fef8a886776b5ca379abee9852a669eb242a70bfc0794127dd98b1c
```

## v1.3.1（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.3.1-unsigned-20261120.ipa` |
| 大小 | 17.x MB |
| sha256 | `397c519f9cac32adb5ec01b1559c234a93c05a607e99ae10b208e69b1d6b448f` |
| 版本 / build | 1.3.1 / 15 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.3.1` |

### 1.3.1 音源管理：按平台逐个测试

**旧实现的问题**

- 只测 `supportedSources[0]`（通常就是 kg）；
- 且用酷我的曲目 id（228908）去问所有平台 —— 各平台 id 体系不同，必然失败。

结果：安妮音源明明 kw / wy 可用，测试却显示「失败」。

**新实现**（`src/jk/sourceTest.ts`）

1. 取脚本声明的平台列表（空则 kw/kg/tx/wy/mg 全测）；
2. 每个平台先在该平台真实搜索「稻香 周杰伦」，拿到该平台自己的 id/meta 再取流；
3. 搜索 6s / 取流 10s 超时；5 个平台并发（串行最坏 60s+）；
4. 卡片实时显示进度：`2/4  酷我✓ 酷狗✗ 企鹅✗ 网易✓`；
5. 结束 toast 三态：全部通过 / 部分平台可用（附失败原因）/ 全部失败；证据日志同步。

### 实测（安妮独家音源）

```
[sourceTest] 安妮独家音源 kw ok
[sourceTest] 安妮独家音源 wy ok
[sourceTest] 安妮独家音源 kg fail(当前版本已停止服务，请升级到最新版本后重试)
[sourceTest] 安妮独家音源 tx fail(当前版本已停止服务，请升级到最新版本后重试)
→ 部分平台可用（旧实现只会显示失败）
```

### 断言

```
bundle com.jkmusic.ios / version 1.3.1 / build 15 / minos 16.4 / arm64
jsbundle 6.3M / dev 残留 0 / size 17.x MB
sha256 397c519f9cac32adb5ec01b1559c234a93c05a607e99ae10b208e69b1d6b448f
```

## v1.3.0（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.3.0-unsigned-20261120.ipa` |
| 大小 | 17.x MB |
| sha256 | `60c44a5cba493833f8579bdca548df584767d94c558ad9e0d98b20b5e4fe5630` |
| 版本 / build | 1.3.0 / 14 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.3.0` |

### 1.3.0 歌曲换源（对齐 mac 弹窗）

mac 端交互（按截图复刻）：

- 二级菜单「歌曲换源」→ 弹窗；
- 顶部 5 个平台 tab（酷我/酷狗/企鹅/网易/咪咕），切 tab 用「歌名 歌手」搜索该平台；
- 列表：歌名 / 歌手·专辑 / 时长 + 试听 + 选择；
- 选中后底部显示 `原 歌名 tx 02:54 → 新 歌名 kw 02:54` + 确认；
- 确认后把这一首替换成新源的曲目。

iOS 实现：

1. `src/app/(modals)/changeSource.tsx`：弹窗页面（原曲目卡片 + 搜索框 + 平台 tab + 结果列表 + 底部对比/确认）；
2. `pendingChangeSource`：用模块级变量传完整对象（URL 参数会丢 meta.songmid，导致换源后取不到流）；
3. `libraryStore.replaceSong(old, new)`：在「试听列表 / 我的收藏 / 所有自建歌单」里按 `source+id` 匹配替换，
   位置不变；返回替换条数；
4. 若正在播放这首歌：确认后用新源重新播放；
5. 试听按钮：播放该结果（会切换当前播放，toast 提示）。

### 实测

```
[dev] applyChangeSource Something to Hope For tx -> kw count= 1   ← 数据层替换成功
弹窗截图：企鹅 tab、20 条结果、底部对比条与列表不再重叠
```

### 断言

```
bundle com.jkmusic.ios / version 1.3.0 / build 14 / minos 16.4 / arm64
jsbundle 6.3M / dev 残留 0 / size 17.x MB
sha256 60c44a5cba493833f8579bdca548df584767d94c558ad9e0d98b20b5e4fe5630
```

## v1.2.9（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.2.9-unsigned-20261120.ipa` |
| 大小 | 17.x MB |
| sha256 | `9e558125529a6c28158f877a97fc5c4dba67832b829c356cf160074d68bce8bb` |
| 版本 / build | 1.2.9 / 13 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.2.9` |

### 1.2.9 歌单二级菜单：复制歌曲名 / 搜索（先核对 mac 源码）

mac 端实现（`references/mac-ui/renderer/views/List/MusicList/useMusicActions.js`）：

- 搜索：`router.push({ path:'/search', query:{ text: `${info.name} ${info.singer}` } })`
- 复制歌曲名：`clipboardWriteText(formatMusicName(appSetting['download.fileName'], minfo.name, minfo.singer))`
  - `formatMusicName` = 把模板里的 `歌手` 换成 singer、`歌名` 换成 name
  - 默认模板 `download.fileName = "歌名 - 歌手"`

iOS 实现：

1. 「复制歌曲名」：读 `download.fileName` 模板格式化后写系统剪贴板，toast 显示复制内容；
2. 「搜索」：跳 `/(tabs)/search?q=歌名 歌手&source=曲目平台`，
   比 mac 多带 `source` —— 直接落在该曲目所属平台的搜索页；
3. 搜索页支持 `?source=`：选中对应源胶囊、按该源搜索、关键词回填搜索框（实测截图确认）。

### 实测

```
jkmusic://search?q=Something to Hope For Phoebe Ryan&source=tx
→ 搜索框回填关键词，源胶囊选中「企鹅」，结果为该源的 9 条命中
```

### 断言

```
bundle com.jkmusic.ios / version 1.2.9 / build 13 / minos 16.4 / arm64
jsbundle 6.0M / dev 残留 0 / size 17.x MB
sha256 9e558125529a6c28158f877a97fc5c4dba67832b829c356cf160074d68bce8bb
```

## v1.2.8（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.2.8-unsigned-20261120.ipa` |
| 大小 | 17.x MB |
| sha256 | `94ca62e5090111976bacf1e740ca164a4a0dfe67a598c22764e92b2f16a1f0c5` |
| 版本 / build | 1.2.8 / 12 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.2.8` |

### 1.2.8 修复：跨源兜底漏掉「能播的版本」

真机现象：第 16 / 18 / 25 首仍提示「所有平台均不可用」，但手动搜索酷我、网易都能播。

根因（匹配太严 + 搜索退化缺失）：

- 歌手是多值字段（`KAROL G、Bruno Mars`），旧逻辑用整串做包含判断，顿号直接导致不匹配；
- 标题带装饰（`Spring Day (made popular by BTS) (backing version) - Party Tyme`），
  kw 对超长 query 返回空 → 该平台没有候选；
- 偶发搜索/取流超时，第二次重试就通。

修复：

1. 标题先去装饰（圆括号/方括号/` - 后缀`），再用「主标题」匹配；
2. 歌手按 `, 、 & / ;` 拆分，任一歌手有交集即通过；
3. 候选打分：标题精确 3 分 + 歌手命中 5 分，取最高分；
4. 搜索词三级退化：`完整标题+歌手` → `主标题+首位歌手` → `仅主标题`；
5. 搜索超时 5s→6.5s、取流 6s→7s；无候选 / 全失败各再重试一次；
6. 片段判定改为「时长优先」：能解析时长就不看文件大小，
   避免 320k 文件（26MB）与 flac 标称（48MB）比对误判；
7. preload 只查同曲索引，不再每首歌都打 5 个平台搜索。

### 实测（模拟器，同一歌单）

```
第16首 Spring Day (made popular by BTS) (backing version)
  matrix search hit platform=kg score=35 / kw score=35 / mg score=30
  matrix ok platform=kw → live start total=274.83   ← 4:34 完整

第18首 Still - KAROL G, Bruno Mars
  matrix search hit platform=mg/kg/kw/wy score=35
  matrix ok platform=kw → live start total=220.68   ← 3:40 完整

第25首 Something to Hope For - Phoebe Ryan
  matrix ok platform=kw/wy/kg/mg → live start total=174.34   ← 2:54 完整
```

### 断言

```
bundle com.jkmusic.ios / version 1.2.8 / build 12 / minos 16.4 / arm64
jsbundle 6.0M / dev 残留 0 / size 17.x MB
sha256 94ca62e5090111976bacf1e740ca164a4a0dfe67a598c22764e92b2f16a1f0c5
widget PlugIns/JKMUSICWidget.appex present / NSSupportsLiveActivities true
PlugIns/ShareExtension.appex present
```

## v1.2.7（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.2.7-unsigned-20261120.ipa` |
| 大小 | 17.x MB |
| sha256 | `49661b17a3573c3a3a54c218d27ddf2026f11929261cbf06a24ba53f6a5334c7` |
| 版本 / build | 1.2.7 / 11 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.2.7` |

### 1.2.7 修复：歌单连跳（最高优先级）

**复现证据（模拟器）**

- `tx_000n75W32Y8syY.flac`（Fractals）只有 960KB / 60s，元数据写 270s；
- 旧逻辑把片段当完整曲目缓存并播放，`[live] start total=60.03`；
  片段播完 = 正常播放结束 → 自动下一首，**不计入失败保护**，所以能一路跳；
- 下载失败后回退远程 URL：本环境 AVPlayer 放不了网络流 → PlaybackError → `failToPlay`
  → `skipToNext`，一首接一首；
- 跨源兜底只用「当前选中的单个脚本」，单源场景几乎必失败。

**修复**

1. 新增 `src/player/audioDuration.ts`：解析 flac / mp3 / m4a 本地文件时长；
   并配合元数据 `qualitys` 的文件大小做双判据（时长 < 80% 或大小 < 60% → 片段）。
2. 下载完成即校验：片段删除、不写缓存索引；缓存命中前同样校验，坏缓存自动清除重取。
3. 删除「下载失败回退远程 URL」：改为 `SOURCE_UNAVAILABLE`。
4. 跨源兜底改为 **全平台（kw/kg/tx/wy/mg）× 脚本池**：
   同曲多源索引 + 各平台实时搜索，候选并发竞速，音质逐档降级（flac → 320k → 128k）。
5. 失败不再连跳：默认暂停并提示「所有平台均不可用，点击播放重试」，
   点播放重新走完整取流；`player.autoSkipOnError` 默认改为 false（含老用户一次性迁移）。
6. 预取地址只用于下载，不再直接交给播放器。

**实测（模拟器）**

```
[ERROR] [jk/play] 缓存为试听片段，删除重取 ... actual=60s/270s size=960887/30995906
[ERROR] [cache] 试听片段已丢弃: Fractals
[resolve] matrix 候选平台= kw(idx)/kg/wy
[resolve] matrix ok platform=kw quality=flac id=54270824 from=index
[resolve] switched tx -> kw
[live] start Fractals total= 270.46      ← 完整 4:30

[resolve] matrix 候选平台= mg(idx)/kg(idx)/kw(idx)/wy
[resolve] matrix ok platform=kg quality=flac
[jk/play] 缓冲完成，改播本地
[live] start bittersweet total= 202.85   ← 完整 3:22

（人为制造播放失败）
播放出错 → autoSkipOnError=false，停在当前曲目（可点播放重试）   ← 不再连跳
```

### 断言

```
bundle com.jkmusic.ios / version 1.2.7 / build 11 / minos 16.4 / arm64
jsbundle 6.0M / dev 残留 0 / size 17.x MB
sha256 49661b17a3573c3a3a54c218d27ddf2026f11929261cbf06a24ba53f6a5334c7
widget PlugIns/JKMUSICWidget.appex present / NSSupportsLiveActivities true
PlugIns/ShareExtension.appex present
```

## v1.2.6（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.2.6-unsigned-20261120.ipa` |
| 大小 | 17.x MB |
| sha256 | `b65e0b83907f6fb965c1c1f0776640dbadd4b7bae4fb5be4aa2996fbf94fbd9b` |
| 版本 / build | 1.2.6 / 10 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.2.6` |

### 1.2.6 修复：换壁纸提示成功但不生效

**原因**：壁纸文件固定写 `Documents/wallpaper.jpg`，URI 始终不变。
`expo-image` 以 URI 作为缓存键，文件内容换了但 URI 没变 → 直接用缓存里的旧图，
表现为「提示设置成功，界面没变化」。第二次以后换图尤其明显。

**修复**：

1. 壁纸文件改用唯一名 `wallpaper-<timestamp>.jpg`，URI 变化才会真正重新加载；
2. 保存后 `getInfoAsync` 校验文件存在且 `size > 0`，失败不再提示成功；
3. 保存成功后删除上一张，避免文件越积越多；
4. `WallpaperBackground` 的 `Image` 增加 `key={uri}` 与 `cachePolicy="none"` 双保险；
5. 新增 dev 动作 `?action=wallpaperFile&path=<绝对路径>`，便于无点击环境验证换图链路。

### 断言

```
bundle com.jkmusic.ios / version 1.2.6 / build 10 / minos 16.4 / arm64
jsbundle 6.0M / dev 残留 0 / size 17.x MB
sha256 b65e0b83907f6fb965c1c1f0776640dbadd4b7bae4fb5be4aa2996fbf94fbd9b
widget PlugIns/JKMUSICWidget.appex present / NSSupportsLiveActivities true
PlugIns/ShareExtension.appex present
```

### 验证方式

- 用两张差异明显的测试图（蓝紫渐变 / 橙绿渐变）依次经 `saveWallpaperFrom` 保存：
  界面立即切换（截图取样像素 `(182,166,224)` → 橙绿系 → 换回后仍为 `(182,166,224)`）；
- `Documents` 目录始终只保留最新一张 `wallpaper-*.jpg`（旧文件被清理）。

## v1.2.5（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.2.5-unsigned-20261120.ipa` |
| 大小 | 17.x MB |
| sha256 | `4eb0b9d578f4f5207dc858bb6d6ec153e77a889da7097e5ba9bc06dd811ae897` |
| 版本 / build | 1.2.5 / 9 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.2.5` |

### 功能页面壁纸（对齐 mac 端）

mac 端的做法（references/mac-ui）：

- `#root { background: var(--background-image) }` —— 整窗壁纸，内容区卡片叠在上面；
- 卡片底色 `--glass-tint`（浅色 0.08 白）/ `--glass-tint-dark`（深色 0.31 黑）；
- `common.glassBlur` 通过 IPC 设置窗口 vibrancy（整窗磨砂）；
- `playDetail.bgBlur/bgOpacity` 只作用于播放详情页。

iOS 端等价实现：

1. **壁纸层**：`src/components/WallpaperBackground.tsx`，挂在根布局最底层，
   `expo-image` 铺满 + `BlurView` 磨砂（强度 = 壁纸磨砂）。
2. **玻璃卡片**：壁纸开启时 `macPalette().bg` 与 `getThemeColors().background`
   返回 `rgba(255,255,255,α)` / `rgba(18,18,20,α)`，40 处页面根容器自动透出壁纸，
   不用逐页改背景。α 由「玻璃不透明度」映射：`0.12 + 0.78 × 百分比`。
3. **导航层**：只有壁纸开启时才把 Stack/Tabs 场景背景设为透明，未开启保持原实色，
   避免页面漏出底层黑底。
4. **设置项**（设置 → 基本设置）：
   - 主题壁纸：选择图片 / 清除 / 缩略图预览（只存文件名，重装后仍有效）；
   - 壁纸磨砂：0（清晰）– 40（最模糊）；
   - 玻璃不透明度：10%（壁纸最明显）– 100%（页面最实）。
5. **作用范围**：我的列表、歌单、排行榜、搜索、下载、设置等所有功能页面；
   **播放页仍用封面背景，不受壁纸影响**（无封面时用实色兜底）。

### 断言

```
bundle com.jkmusic.ios / version 1.2.5 / build 9 / minos 16.4 / arm64
jsbundle 6.0M / dev 残留 0 / size 17.x MB
sha256 4eb0b9d578f4f5207dc858bb6d6ec153e77a889da7097e5ba9bc06dd811ae897
widget PlugIns/JKMUSICWidget.appex present / NSSupportsLiveActivities true
PlugIns/ShareExtension.appex present
```

### 验证方式（模拟器 iPhone 17 Pro / iOS 26.3）

- 浅色 + 壁纸：我的列表 / 设置 / 搜索 / 下载 四页均透出壁纸，卡片为半透明玻璃；
- 深色 + 壁纸：整页偏暗，壁纸隐约可见（文字对比度正常）；
- 磨砂 0 + 不透明度 25%：壁纸清晰且明显；不透明度 70% 时壁纸明显变淡；
- 清除壁纸后立即恢复原实色（深色纯黑、浅色纯白），与 1.2.4 一致；
- 播放页在壁纸开启状态下仍显示封面模糊背景；
- 无壁纸时打开 modal（导入歌单 / 添加到歌单）背景正常，不漏黑底。

## v1.2.4（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.2.4-unsigned-20261120.ipa` |
| 大小 | 17.x MB |
| sha256 | `6d398d2fca853738baea9fda4de35f5dcc4bd7892dbae597a56c267157933bcd` |
| 版本 / build | 1.2.4 / 8 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.2.4` |

### 1.2.4 变更

1. **播放页取消自定义壁纸**：背景恢复为「封面铺满 + 模糊」，封面正常显示；
   播放页其它布局/交互未改动。
2. **设置 → 基本设置移除壁纸入口**（主题壁纸 / 壁纸磨砂 / 壁纸不透明度），
   避免留下不生效的设置项。强调色、主题、明暗仍保留。
3. **歌词制作信息过滤补全**：除「作词/作曲/编曲」外，新增「合声/和声/配唱/录音助理/
   录音工程/混音/母带/制作人/出品/监制/统筹/企划/发行」等写法（允许中间带 0–10 个字）。
4. **无效设置项统一标注「暂不支持（仅保存）」**：字号、玻璃模糊、显示源名、播放倍速、
   保存播放进度、显示歌词音译、列表设置 5 项、网络代理 3 项。

### 断言

```
bundle com.jkmusic.ios / version 1.2.4 / build 8 / minos 16.4 / arm64
jsbundle 6.0M / dev 残留 0 / size 17.x MB
sha256 6d398d2fca853738baea9fda4de35f5dcc4bd7892dbae597a56c267157933bcd
widget PlugIns/JKMUSICWidget.appex present / NSSupportsLiveActivities true
PlugIns/ShareExtension.appex present
```

### 验证方式

- 模拟器播放页截图：背景为封面模糊，无壁纸层；封面居中正常显示。
- 设置 → 基本设置：只剩 语言/外观/主题/强调色/字号/玻璃模糊/显示源名。
- 设置 → 列表设置：5 项均带「暂不支持（仅保存）」副标题。

## v1.2.3（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.2.3-unsigned-20261120.ipa` |
| 大小 | 17.x MB |
| sha256 | `f646c13590c19cc59b68c6de621590188df3140208abdc7ed3dcb817becd3918` |
| 版本 / build | 1.2.3 / 7 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.2.3` |

本版按真机反馈分四批（H1–H4）修复，只动有问题的部分。

### H1 功能 bug

1. **播放页下载没有音质选择、下载页看不到**：改为弹 128k/320k/flac 选择，走 `downloadTrack` 写入
   下载索引（`manual: true`）。旧实现 `cacheAndImportMusic` 只缓存 + 导入本地，下载页不显示。
2. **歌词翻译开关无效**：新增 `nowTlyricState`，`lyricManager` 的 source 带上 `translation`，
   `wy` 请求 `tv:-1`；全屏/紧凑翻译都按「时间就近匹配」（避免作词/作曲行导致整体错位）。

### H2 主题（强调色 / 明暗 / 壁纸）

1. **主题只改强调色**：主题预设只提供默认强调色；设置 → 基本设置新增「强调色」色板（8 色 + 跟随主题），
   独立控制字体强调、进度条、按钮颜色。
2. **整个窗口明暗**：新增「外观：跟随系统 / 浅色 / 深色」，与主题互不影响。
3. **主题壁纸 + 磨砂/透明度**：可选择图片、清除、缩略图预览，壁纸磨砂（0–40）与不透明度（10–100%）可调，
   播放页用壁纸 + 可调磨砂/压暗；没有壁纸时仍是封面模糊。
4. 壁纸只持久化文件名，修重装/换容器后绝对路径失效导致壁纸空白。
5. 设置项键值对齐桌面版：字号（px 14/16/18）、玻璃模糊（0..1）、显示源名（alias/real）。

### H3 英语界面补齐

1. 新增 `tr(zh, en)` 双语助手（渲染期翻译），tab 名、设置首页与 14 个分区页、搜索、下载、歌单、
   排行榜、我的列表、本地音乐、音源管理、播放页、公共组件全部双语。
2. 内置列表名英文显示 Listening / Favorites；音源名 Kuwo/Kugou/QQ Music/NetEase/Migu。
3. 设置页「桌面专属」分组移到主列表之后；tab 标签 10px，英文 Downloads 不再截断。

### H4 歌词滚动 / 逐字 / 渐隐

1. **全屏歌词不逐字、不跟手**：当前行改按播放位置二分计算（progress 事件滞后会导致不滚动/逐字不亮），
   去掉 900ms/2 行节流，逐行平滑滚到中间。
2. **上下渐隐**：按「与当前行距离」做透明度渐隐（纯透明度，不叠黑色遮罩），与 mac 端一致。
3. **播放页歌词顿挫**：紧凑歌词改为整行高度滑入动画；窗口行数按容器高度自适应，不再出现半截字；
   翻译行绝对定位固定行高。
4. 过滤「作词/作曲/编曲…」制作信息行；`wy` 歌词请求 `yv/ytv/lv/rv/kv` 传 -1 以拿回逐字 yrc。

### 断言

```
bundle com.jkmusic.ios / version 1.2.3 / build 7 / minos 16.4 / arm64
jsbundle 6.0M / dev 残留 0 / size 17.x MB
sha256 f646c13590c19cc59b68c6de621590188df3140208abdc7ed3dcb817becd3918
widget PlugIns/JKMUSICWidget.appex present / NSSupportsLiveActivities true
PlugIns/ShareExtension.appex present
```

### 验证方式

- 模拟器（iPhone 17 Pro / iOS 26.3）逐项截图：设置页（中文/英文/浅色）、强调色切换即时生效、
  壁纸 + 磨砂/不透明度、播放页歌词逐字与渐隐、全屏歌词逐字（「花落」着色）。
- 逐字数据核对日志：`[jk/lyric] got lyric=1466 lx=7118`、`[lyric] active idx=15 segs=6 lit=2`。

## v1.2.2（2026-11-20）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.2.2-unsigned-20261120.ipa` |
| 大小 | 17.x MB |
| sha256 | `b30298b6d8b5aba393851c0248ca0374e007c59de1c2c3320605d1554f5119c3` |
| 版本 / build | 1.2.2 / 6 |
| 架构 | arm64 + JKMUSICWidget.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.2.2` |

### 1.2.2 修复（真机反馈）

1. **腾讯源连续跳曲（1.2.x 回归）**：URL 校验把 403/416 误判为坏链，导致腾讯 CDN 被判死。
   现在只过滤 400/404/410，其余放行；并新增「下载失败 → 换源重下」。
2. **手动下载不显示**：下载页订阅任务表，完成即刷新；下载完成后兜底校正 `manual=true`。
3. **部分歌曲无歌词**：歌词兜底在索引未命中时增加实时搜索（kw/wy/tx）。
4. **设置里语言/主题不生效**：原来写的是 `common.langId` / `theme.id`（无人消费）。
   改为 `app.language`（i18n）与 `app.macTheme`（themeStore），选项改为四套主题。
5. **进度数字贴进度条**：迷你条时间移到进度条下方左右两端。
6. **灵动岛边缘进度**：紧凑态改为环形细进度（跨岛横线受 iOS 限制无法实现）。
7. **自动跳过错误曲目**：`player.autoSkipOnError` 已接线，关闭后播放失败不再连续跳。

### 断言

```
bundle com.jkmusic.ios / version 1.2.2 / build 6 / minos 16.4 / arm64
jsbundle 6.0M / preload 3 处 / dev 残留 0 / size 17.x MB
sha256 b30298b6d8b5aba393851c0248ca0374e007c59de1c2c3320605d1554f5119c3
widget PlugIns/JKMUSICWidget.appex present / NSSupportsLiveActivities true
```

### 设置项体检结果（33 项）

**已生效**：音质、音量、倍速、歌词翻译、字号（歌词）、缓存上限、并发下载数、清空搜索、搜索历史/热搜、详情页背景模糊/逐字/延迟滚动。

**仍无效（仅保存不生效）**：
- `common.fontSize` 全局字号、`common.glassBlur` 玻璃模糊、`common.sourceNameType` 显示源名
- `list.*`（操作按钮/点击整行/记住滚动/添加位置/显示来源）
- `player.isSavePlayTime`（保存播放进度）、`player.isShowLyricRoma`（音译）、`player.playbackRate`（设置里改倍速不生效，播放页可调）
- `network.proxy.*`（iOS 不走该代理）

这些会在后续版本逐步接线或在设置页标注「暂不支持」。

---

## v1.2.1（2026-11-19）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.2.1-unsigned-20261119.ipa` |
| 大小 | 17.x MB |
| sha256 | `761be2adca60d95a78bb4667ac64745c76ad823c23d2c80cc6ef06c76abff46d` |
| 版本 / build | 1.2.1 / 5 |
| 架构 | arm64 + JKMUSICWidget.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.2.1` |

### 1.2.1 变更

* **新增灵动岛 / 锁屏实时活动**（Widget Extension `JKMUSICWidget`）
  - 锁屏卡片：歌名 + 歌手 + 2px 细线进度
  - 灵动岛展开态：歌名 + 跨整岛细线进度
  - 紧凑态 / 最小态：音符图标 + 百分比
  - 颜色取当前主题色（`primaryHex` 由 JS 传入）
* 主 App 增加 `NSSupportsLiveActivities`
* 播放状态旁路同步：切歌 `start`、2 秒粒度 `update`、无曲目 `end`；时长未就绪不启动
* 不支持 Live Activity 的设备/系统上所有调用静默跳过，不影响播放

### 断言（本次构建实测）

```
1) bundle id   : com.jkmusic.ios
2) version     : 1.2.1
3) build       : 5
4) minos       : 16.4
5) arch        : arm64
6) jsbundle    : 6.0M
7) preload     : 3 处 globalThis.lxu，21K
8) dev 残留    : 0
9) size        : 17.x MB
10) sha256     : 761be2adca60d95a78bb4667ac64745c76ad823c23d2c80cc6ef06c76abff46d
11) widget     : PlugIns/JKMUSICWidget.appex 存在
12) LiveActivity: NSSupportsLiveActivities = true
13) extension  : com.apple.widgetkit-extension
```

### 验证状态

* 模拟器（iOS 26.3）：ActivityKit 成功创建 activity（`attributesType: JKMUSICLiveActivityAttributes`），
  每 2 秒 update，日志 `[live] start` + `Updating activity: … state: active`
* **灵动岛视觉需真机确认**：模拟器没有灵动岛硬件，锁屏卡片可用 Xcode Preview 预览
* 自签安装时需连同 `.appex` 一起签名（Sideloadly / AltStore 会自动处理）

### 已知限制

* 灵动岛紧凑态无法跨岛画线（iOS 限制），紧凑态显示百分比，展开态显示细线
* 其余限制同 1.2.0（酷狗直连、128k 文件扩展名、内置列表名 i18n）

---

## v1.2.0（2026-11-19）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.2.0-unsigned-20261119.ipa` |
| 大小 | 17.x MB |
| sha256 | `95b637b59f3045ebe84400ef2cada0bf787c9d725f99a13fc2c5305ea9f3d888` |
| 版本 / build | 1.2.0 / 4 |
| 架构 | arm64，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.2.0` |

### 1.2.0 变更

**歌单与导入**
- 兼容桌面版备份的 `list` 字段（此前只读 `songs` → 每单 0 首），实测 18 单 / 2080 首
- id 规范化：去源前缀、kg 复合 id 取 hash、mg 取 copyrightId；去重键改为 `source_id`
- 播放页「添加到歌单」改走 pending（此前走 URL 参数，弹「没有待添加歌曲」）
- 歌单长按删除改调 `libraryStore.removeUserList`（此前删的是旧 Cymusic store，删不掉）
- 内置列表（试听列表/我的收藏）禁止删除

**播放页与歌词**
- 去掉歌词区上下两条黑色遮罩（`rgba(0,0,0,0.55)`）
- 封面 0.62 → 0.52 屏宽并下移，四边完整不裁切
- 歌词区扩大到封面下方到进度条上方（同屏 5 行）
- 紧凑歌词固定 5 行窗口（消除首尾行整块跳动），滚动 420ms bezier，透明度 1/0.6/0.32
- 全屏歌词接入逐字渲染（此前整行变色）
- 歌词多源兜底：某源无词时按「歌名+歌手」查同曲索引换源取词
- 跨源播放的歌词按实际源请求（酷狗→酷我 也能显示词与逐字）

**下载**
- 手动下载可选音质（菜单二级：128k / 320k / flac）
- 取流后做 Range 校验，4xx 坏链换下一个脚本（回避聚合的 kw 128k 代理返回 400）
- 下载完成后兜底校正索引 `manual=true`
- 音质胶囊改为真正的筛选器（默认「全部」）

**设置与主题**
- 语言切换立即生效（根 Stack 以语言为 key 重建导航）
- 移除「深色/浅色」开关，改为四套 mac 主题：JK 终包 / 中国墨 / 落霞 / 青瓷
- 品牌色统一到 Cymusic token（40 处 `colors.primary` 全部跟随主题）

**外壳与首页**
- 原生启动屏去掉 Cymusic 品牌图（透明图），只剩黑底过渡
- 首页固定「我的列表」，不再落到搜索页/歌曲页

### 十一条断言

```
1) bundle id : com.jkmusic.ios
2) version   : 1.2.0
3) build     : 4
4) minos     : 16.4
5) arch      : arm64
6) jsbundle  : 6.0M
7) preload   : 3 处 globalThis.lxu，21K
8) dev 残留  : 0
9) size      : 17.x MB
10) sha256   : 95b637b59f3045ebe84400ef2cada0bf787c9d725f99a13fc2c5305ea9f3d888
11) 内容     : 二进制存在，无 .DS_Store，无 _CodeSignature
```

### 已知限制

- **灵动岛细线进度未实现**（需新增 Widget Extension target，留待 1.2.1）
- 酷狗直连仍不可用（长青接口停服 + 官方接口收费），靠跨源兜底
- 128k 下载的文件名沿用 `.flac` 扩展名（内容为 128k mp3，AVPlayer 按内容嗅探可播）
- 内置列表名（试听列表/我的收藏）与底部 tab 文案未接入 i18n，英文界面下仍显示中文
- 首次换源约 5 秒（索引命中）；索引未命中 10-15 秒

### 从 1.1.x 升级

覆盖安装即可，MMKV 数据（设置/歌单/下载索引/音源列表）保留。

---

## v1.1.1（2026-11-19）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.1.1-unsigned-20261119.ipa` |
| 大小 | 17.x MB |
| sha256 | `7f659b1dc8d6f6f7ecd1c184bb53ec8b949c6005662949e7336947bd75c40ea6` |
| 版本 / build | 1.1.1 / 3 |
| 架构 | arm64，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.1.1` |

### 1.1.1 修复

* **换源后歌词跟着换源**：酷狗曲目换到酷我播放时，歌词改按「实际源 + 实际曲目 id」请求，
  不再显示「暂无歌词」；实测《牡丹亭》(kg→kw) 能正常滚动并带逐字（`lxLen=4316`）
* `resolvedFromStore` 增加 `toId`，缓存索引增加 `actualId`，缓存命中时也能正确取词
* 原生曲目（未换源）保持原逻辑（日志 `swapped=false`），不误用换源

### 十一条断言（本次构建实测）

```
1) bundle id   : com.jkmusic.ios
2) version     : 1.1.1
3) build       : 3
4) minos       : 16.4
5) arch        : arm64
6) jsbundle    : 6.0M
7) preload     : 3 处 globalThis.lxu，21K
8) dev 残留    : 0
9) size        : 17.x MB
10) sha256     : 7f659b1dc8d6f6f7ecd1c184bb53ec8b949c6005662949e7336947bd75c40ea6
11) 内容       : 二进制存在，无 .DS_Store，无 _CodeSignature
```

### 已知限制

* **酷狗直连不可用**（长青接口停服 + 官方接口对第三方 IP 收费），靠跨源兜底
* 首次换源约 5 秒（同曲多源索引命中）；索引未命中时 10-15 秒（实时搜索）
* 换源后的歌词按实际源取，个别歌曲目标源也无词时仍显示「暂无歌词」

### 从 1.1.0 / 1.0.0 升级

覆盖安装即可，MMKV 数据（设置/歌单/下载索引/音源列表）保留。

---

## v1.1.0（2026-11-19）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.1.0-unsigned-20261119.ipa` |
| 大小 | 17.4 MB |
| sha256 | `71b9bce9967f2760cdbb31f1db9d5e1c5e06f5b6cefd6f236ca60ae7b9937992` |
| 版本 / build | 1.1.0 / 2 |
| 架构 | arm64，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.1.0` |

### 1.1.0 变更

* **多脚本池**：原生多 runtime，多个音源脚本并存（`pool=N`），主用脚本可切换
* **同平台多脚本并发竞速**：同一 platform 有多个脚本时并发取流，先到先用
* **跨源兜底**：酷狗不可直连时自动换 kw / wy / tx（`findPlayableAlt`）
* **同曲多源索引**：搜索/歌单结果按「歌名+歌手」建索引（最多 300 键），换源时先查索引，**首次换源 15s → 5s**
* **换源来源展示**：播放页显示「音源：酷狗 → 酷我」，首次换源与缓存命中都显示
* **迷你条封面按当前曲目同步**：修复「新歌名 + 旧封面」串台

### 十一条断言（本次构建实测）

```
1) bundle id   : com.jkmusic.ios
2) version     : 1.1.0
3) build       : 2
4) minos       : 16.4
5) arch        : arm64
6) jsbundle    : 6.0M
7) preload     : 3 处 globalThis.lxu，21K
8) dev 残留    : 0
9) size        : 17.4MB
10) sha256     : 71b9bce9967f2760cdbb31f1db9d5e1c5e06f5b6cefd6f236ca60ae7b9937992
11) 内容       : 二进制存在，无 .DS_Store，无 _CodeSignature
```

### 已知限制

* 跨源曲目（如酷狗→酷我）的歌词仍按**原源**请求，可能显示「暂无歌词」（1.1.1 已修复）
* **酷狗直连不可用**（长青接口停服 + 官方接口收费），只能靠跨源兜底
* 首次换源约 5 秒（索引命中）；索引未命中时 10-15 秒（实时搜索）

### 从 1.0.0 升级

覆盖安装即可，MMKV 数据（设置/歌单/下载索引/音源列表）保留。
1.0.0 包仍在 `artifacts/ipa/JKMUSIC-1.0.0-unsigned-20261116.ipa`。

---

## v1.0.0 基线（2026-11-16 封版）

- 产物：artifacts/ipa/JKMUSIC-1.0.0-unsigned-20261116.ipa
- 大小：17 MB ／ 架构：arm64 ／ 最低系统：16.4 ／ 未签名
- sha256：5a5eac900d067a5190b3d5e6c7b05b9dea5780c6d6336f18cc054edb55bddefe
- commit：**c4e67af**（含 sourceManage 路由注册，与 IPA 内容一致）
- tag：`v1.0.0` → c4e67af
- 说明：tag 已修正为包含 sourceManage 路由注册的 commit，与 IPA 内容一致
- 截图证据：见 `docs/screenshots/INDEX.md`（231 张图片不入库，本地保留；索引已入库）

已验（有截图或日志）：
导入音源（URL/文件/粘贴）、播放（先下载后播）、歌词高亮滚动、封面（含 kw 兜底）、
六页签导航、搜索切源（kw/kg/all）、热搜失败重试、历史记录去重、歌单/榜单/我的列表、
下载页（真实歌名/试听/删除/清空/音质）、备份导出导入（setting_v2/playList_v2/allData_v2，
重复导入幂等）、14 个设置分区、预取下载（缓存 0→2）、odc 开启与关闭分支。

未验（不影响使用，留待下一版）：
预取 latency 数值（未写打点）、cancelled 时序（太快跑不出窗口）、
历史缓存回填仅 1/5（kw songinfoandlrc 接口限制）、iOS 27 真机（需签名通道）。

已知外部限制：
- 音源脚本依赖的第三方接口随时失效：韩棠长青接口已停服（`APP_UPGRADE_REQUIRED`），
  酷狗官方接口对第三方 IP 返回「需要付费」；已用多脚本聚合 + 跨源兜底保证可用
- 随机点播首次需 3-10 秒（先跨源搜索、再下载；命中缓存后瞬时起播）
- 桌面专属项（托盘/全局快捷键/桌面歌词悬浮/开放 API 服务端）仅保存不生效

装机第一步：设置 → 音源管理 → 导入 2-3 个脚本（推荐 回避聚合 + HelloWorld + 安妮 v5）→ 选中其一 → 歌单点歌。

---

# JKMUSIC iOS 1.0.0 未签名 IPA

## 产物

| 项 | 值 |
|---|---|
| 路径 | `artifacts/ipa/JKMUSIC-1.0.0-unsigned.ipa` |
| 大小 | 17 MB |
| sha256 | `5a5eac900d067a5190b3d5e6c7b05b9dea5780c6d6336f18cc054edb55bddefe` |
| 版本 | 1.0.0 / build 1 |
| bundle id | com.jkmusic.ios |
| 架构 | arm64，最低 iOS 16.4 |
| 构建日期 | 2026-11-16 |

## 首次使用（三步）

1. **设置 → 音源管理 → 从 URL 导入**（或选 .js 文件 / 粘贴文本），**建议一次导入 2-3 个脚本**
2. 列表里点「使用」选中任意一个（它只决定优先顺序，不影响其它已导入脚本参与取流）
3. 回歌单点歌 → 首次缓冲 3-10 秒 → 起播（第二次命中缓存瞬时）

> 不导入音源则无法播放（应用内不带任何第三方音源）。
> 导入多个脚本时，同一首歌会由所有支持该平台的脚本并发取流，失败还会跨源找同曲。

## 音源能力矩阵（2026-11-19 实测）

离线 harness（模拟 lx 运行时，320k）+ 模拟器实测，结论一致：

| 脚本 | kw | kg | tx | wy | mg |
|---|---|---|---|---|---|
| 回避聚合 v0.0.1 | ✅ | ❌ | ✅ | ✅ | ❌ |
| HelloWorld | ✅ | ❌ | ✅ | ❌ | ✅ |
| 墨澜 v2.3.6 | ✅ | ❌ | ✅ | ❌ | ❌ |
| 安妮独家音源 v5 | ✅ | ❌ | ❌ | ✅ | ✗ 未实现 |
| 裤佬 SVIP v3 | ❌ | ❌ | ❌ | ❌ | ❌ |
| 星海 v2.3.18 | ❌ 需 token | — | — | — | — |

**kg（酷狗）全部脚本失败**，原因已用 curl 确认，不是代码问题：

- 官方 `m.kugou.com/app/i/getSongInfo.php` → `{"error":"需要付费"}`（第三方 IP 无播放权益）
- `wwwapi.kugou.com/yy/index.php?r=play/getdata` → `err_code 30020`（需要登录态签名）
- `trackercdn.kugou.com/i/v2/` → `status 2`（无地址）
- 韩棠长青 `musicserver.haitangw.cc` → `{"code":"APP_UPGRADE_REQUIRED"}`（停服）

### 应用层策略：多脚本聚合 + 跨源兜底

单个脚本总有失效的源，所以应用不绑定"一个万能脚本"：

1. **多脚本池**：已导入的所有 lx 脚本各自一个 JSC runtime 同时存活（原生侧已改为多实例）。
   每个平台按实测能力排序（主脚本优先），同一平台并发交给多个脚本竞速，先成功者胜。
   例：tx 在「回避聚合栈溢出」后 0.4 秒内由裤佬补上（日志 `取流兜底 tx: 回避 -> 裤佬`）。
2. **跨源兜底**：某个源整体失败时，用「歌名 + 歌手」并行到 kw / wy / tx 找同一首并取流，
   成功则 `showToast('该源暂不可用，已用酷我播放')`，结果缓存 5 分钟。
3. 因此 **kg 也能播**：脚本取不到酷狗流时自动换源播放同一首（实测：
   `[probe] kg pooled=fail(当前版本已停止服务…) final=ok`，
   `[resolve] cross-source kw 七里香 from kg`，随后下载完成并起播）。

> 建议至少导入 2-3 个脚本（例如 回避聚合 + HelloWorld + 安妮 v5），覆盖 kw/tx/wy/mg 四源。
> 只导入一个脚本时仍可用，但能直接取流的源会少一些，其余全部走跨源兜底。

音源失效的表现：**能导入、能搜索、但取播放地址为空** —— 此时会自动跨源，不再静默假播。

## 「播不了」三步定位

| 现象 | 含义 | 排查点 |
|---|---|---|
| ① `item0.url` 是 `fake-audio.mp3` | 音源取流失败 | 看 `[play] script returned … empty=true`，换脚本 |
| ② 有 url 但缓存不增 | 下载失败 | 看 `[jk/play] 缓冲下载失败` |
| ③ 有缓存但进度不动 | 播放器加载失败 | 看 `item0.url` 是否 `file://` |

## 十条断言（本次构建实测）

```
CFBundleShortVersionString = 1.0.0
CFBundleVersion            = 1
CFBundleIdentifier         = com.jkmusic.ios
lipo -info                 = arm64
LC_BUILD_VERSION           = platform 2 (iOS), minos 16.4
main.jsbundle              = 5.9M
user-api-preload.js        = 21K
AppIcon60x60@2x.png        = 存在
grep setdev|playnow        = 0
codesign -dv               = not signed at all
```

另：`sourceManage` 路由在包内（`strings main.jsbundle | grep -c sourceManage = 2`）。

## 功能清单

六页签 · 音源管理（URL/文件/文本三种导入 + 选中/测试/删除）· 搜索（真实热搜 + 历史 + 源切换）·
歌单单列卡片 · 排行榜五列 · 我的列表 · 播放（先下载后播放 + 预取）· 歌词（高亮/滚动）·
下载页（真实歌名/试听/删除/清空/音质）· 备份与恢复（setting_v2 / playList_v2 / allData_v2）·
设置 14 分区（桌面专属项只读）· 应用图标

## 补充验收（2026-11-16 实测）

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 预取下载（缓存 0→2） | ✅ | `[prefetch] resolve ok` / `limit start active=3` / `done path=118990` |
| 2 | 预取 latency 数值 | ❌ 无打点 | 代码里没有 `dev-latency.log` 写入，未实现 |
| 3 | 预取 cancelled | ❌ 未复现 | 切歌时预取已完成，世代未变化 |
| 4 | odc 关闭分支 | ✅ | `[search] blur autoclear input=false list=false` |
| 5 | 重复导入幂等 | ✅ | `[jk/backup] import ok lists=0 merged=2 songs=0` |

说明：#1/#4/#5 有日志证据；#2 是功能缺口（无 latency 打点代码）；#3 是时序问题（需要慢速解析才能触发）。

## 音质说明（2026-11-17 实测）

- **kw 的 flac 标识是 `bitrate$2000`**（不是 `bitrate$999`）
- 同一曲目不同次请求可能被**上游随机降级**：实测「发如雪」一次 `actual=2000k`、一次 `actual=128k`
- 判断实际音质以 URL 里的 `bitrate$NNNN` 为准，**不看文件大小**
- 日志位置：`[quality] requested= flac actual= 2000k`

## 逐字歌词（卡拉OK）✅ 已实现

数据链路：`kw.getLyric(music, true).lxlyric`（6937 字符）→ `nowLxLyricState` → `buildKaraokeMap`（行时间→逐字段）→ 二分定位当前行 → 嵌套 Text 逐字着色。

关键日志：
```
[lyric] render row 3 isCurrent= true segs= 6 lit= 2 color0= primary
[lyric] render row 3 isCurrent= true segs= 6 lit= 3 color0= primary
```
`lit` 随播放位置从 2 递增到 3，屏幕上「编曲」洋红、「：林迈可」灰。

踩过的两个坑：
1. **渲染必须用「单个 Text 嵌套多个 Text」**，不能用 `View flexDirection:row` 包多个 Text —— 后者颜色不生效
2. **当前行必须由 position 二分计算**，不能用 LyricManager 的 index（暂停/seek 后冻结）


## 已知问题

1. **随机点播需 2-4 秒**（本环境 AVPlayer 不加载网络流，改为先下载后播放）
2. **历史缓存文件回填受 kw 接口限制**，仅部分文件能解析出歌名（新下载不受影响）
3. **iOS 27 真机未验证**（本机最高 iOS 26.3 模拟器 / SDK 26.2）
4. **桌面专属设置项仅保存不生效**（桌面歌词 / 快捷键 / 托盘 / 窗口尺寸）
5. **音源依赖第三方代理**，域名下线即失效，见上方可用性表

## 安装

未签名 IPA 不能直装：Sideloadly / AltStore / SideStore（Apple ID 重签，免费账号 7 天）、
TrollStore（限特定系统版本）、或 Xcode → Devices and Simulators。

## 回滚

```bash
npx patch-package --reverse
git checkout -- node_modules/@rntp/player ios/Podfile ios/Podfile.properties.json
cd ios && pod install
```

