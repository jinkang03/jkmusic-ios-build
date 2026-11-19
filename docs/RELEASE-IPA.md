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

