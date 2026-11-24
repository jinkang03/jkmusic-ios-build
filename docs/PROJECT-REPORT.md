# JKMUSIC for iOS — 工程报告

> 版本：1.5.0（build 88）· 日期：2026-11-25
> 工程目录：`/Users/jinkang/Documents/deepseek-harness/jkmusic-rn`
> 分支：`mainline` · tag：`v1.5.0`

---

## 一、项目概述

### 1.1 目标

把桌面版 **JKMUSIC**（Electron + Vue3）的事件驱动架构与 UI 移植到 iOS，得到一个外观、交互、功能都与桌面版一致的手机客户端。底座使用 CyMusic（Expo/React Native）——只借它的工程骨架与原生能力，界面与行为以 `/Applications/JKMUSIC.app` 为准。

### 1.2 约束

| 项 | 约定 |
|---|---|
| 外观基线 | 桌面版 JKMUSIC，不按 CyMusic 的原设计走 |
| 构建方式 | 全部本机构建（`xcodebuild`），不依赖 CI |
| 交付物 | 未签名 IPA，可 AltStore / Sideloadly / 企业证书自签 |
| 数据兼容 | 设置键名、备份文件与桌面版双向兼容 |
| 歌单模型 | 统一走 `libraryStore`；收藏统一走 `libraryStore.loveList` |
| 播放失败 | 默认不自动跳歌（`player.autoSkipOnError = false`） |

### 1.3 规模

| 指标 | 数值 |
|---|---|
| 提交数 | 212 |
| TS/TSX 源文件 | 209 |
| TS/TSX 代码行 | 31,032 |
| 原生 Swift（App + Widget） | 3 个文件 + RNTP 补丁 |
| 第三方依赖 | 50 |
| 版本跨度 | 1.4.41 → 1.5.0（本工程内 1.4.42 → 1.5.0） |

---

## 二、技术栈与架构

### 2.1 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Expo 57.0.21 / React Native 0.86.3 |
| 路由 | expo-router 57（文件路由 + 模态） |
| 播放内核 | `@rntp/player` 5.9.2（AVPlayer），带本地补丁 |
| 状态 | zustand + 自研 `GlobalState` |
| 持久化 | react-native-mmkv 4.3.2 |
| 文件 | expo-file-system 57 |
| 动效 | react-native-reanimated 4.5.1 |
| 玻璃效果 | expo-blur |
| 原生扩展 | Widget Extension（实时活动）、Share Extension |

### 2.2 目录结构

```
src/
  app/            页面（expo-router）：tabs / 播放页 / 模态 / 设置分区
  components/     UI 组件（mac 风格、玻璃、列表、播放条）
  helpers/        播放主流程、歌词、Now Playing、日志
  player/         取流、缓存、进度、播放器状态
  jk/             桌面版模型移植：libraryStore / settingsStore / 下载 / 诊断 / 音源
  hooks/          主题、实时活动、播放器初始化
  constants/      设计 token、默认设置（138 键）、glass()
  utils/          状态容器、i18n、工具
ios/
  JKMUSIC/        AppDelegate（含崩溃取证）、Info.plist
  JKMUSICWidget/  实时活动 UI
patches/          7 个 patch-package 补丁（RNTP 占最大头）
scripts/          构建、版本同步、模拟器验收、30+ 静态检查脚本
docs/             方案、版本记录、审计、本报告
```

### 2.3 关键设计

**播放链路**：流式播放（AVPlayer），不预先下载。取流顺序为「本地下载 → 播放缓存 → 音源脚本池（多脚本并发 + 超时）→ 跨源兜底」。音质按 `music.quality` 逐级降级重试；整源级失败时跳过降级直接跨源，避免 3 音质 × N 脚本空转。

**换源语义**：`resolveSource` 内部跨源兜底 + `tryAltSource` 二次换源，两者都写「播放诊断」，并在落地前校验 `controlRevision` 与 `isCurrentMusic`，用户切歌后旧结果直接丢弃。

**歌词**：多源兜底（tx / wy / kg / kw / mg），tx 的 songId 必须是数字，否则用 mid 查 `get_music_info`；结果内存缓存 + 落盘 sidecar。

**音效**：`AVPlayerItem.audioMix` + `MTAudioProcessingTap`，链路为 EQ×10（Q=1.4）→ 干声增益 → WebKit 压缩器移植 → equalpower 声像 → 卷积混响（4ch true-stereo、Web Audio 归一化）→ 变调（FFT 4096 / hop 128 / Hann 0.8 相位声码器）。总开关默认关闭，关闭时不挂 tap（零开销）。

**下载与缓存**：手动下载在 `Documents/downloads/<歌单名>/`，播放缓存在 `Documents/musicCache/`，两者完全分离。下载索引 `<source>:<id>` 存 MMKV；播放路径只做内存查表。已下载与已缓存共用同一个 ✓ 标记。

**实时活动**：只保留 App 图标 + 歌名 + 播放状态 + 紫色描边。iOS 对 App 主动 `update()` 有频率预算，后台会被限流，所以去掉了进度条与倒计时。

---

## 三、版本演进（本工程）

| 版本 | 内容 |
|---|---|
| 1.4.42–1.4.45 | 播完自动切歌、歌词偶发失败、玻璃透明度、播放条歌名跟随文字颜色 |
| 1.4.46 | 全屏歌词当前行居中 |
| 1.4.47 | 我的列表显示歌单封面（平台/首曲兜底） |
| 1.4.48 | 自定义歌单封面（长按设置/更换/恢复） |
| 1.4.49 | 音效批次 1：EQ / 增益 / 压缩器 / 3D 环绕 |
| 1.4.50 | 音效批次 2：环境混响（13 个 IR、4ch true-stereo） |
| 1.4.51 | 音效批次 3：变调（相位声码器） |
| 1.4.52 | 播放速度并入「变调和变速」+ 整链离线对拍 |
| 1.4.53 | 修播完不切歌 / 连续失败误判 / 音源测试不准 |
| 1.4.54 | 手动下载优先本地播放；文字颜色即时生效 |
| 1.4.55 | 已下载与已缓存共用 ✓ 标记 |
| 1.4.56 | 音源测试 3 样本制 + 换源原因 + 播放诊断页 |
| 1.4.57 | 实时活动封面换 App 图标 + 系统 Now Playing 修复 |
| 1.4.58 | 停住时不再清空 Now Playing |
| 1.4.59 | 实时活动去进度/倒计时；中断结束自动续播 |
| 1.4.60 | 详情页下载跟随选择音质；删除「下载音质」设置 |
| 1.4.61 | 删除「强迫症设置」；诊断补全跨源兜底与失败原因 |
| 1.4.62 | 删死代码 900 行；去掉假音频兜底；换源竞态守卫 |
| 1.4.63 | 崩溃取证；后台停滞原生上报；切歌重入保护；日志上限 |
| **1.5.0** | **修复下载页删除；歌单排序 + 一键置顶** |

每个版本的完整记录（产物、sha256、实测数据）见 `docs/RELEASE-IPA.md`。

---

## 四、1.5.0 本版改动

### 4.1 修复：下载页「删除」无效

**根因**：`removeDownload` 先用 `sidecarBase(uri)` 去掉扩展名得到 `base`，随后只删 `base`、`base.json`、`base.lrc`、`base.tlrc`、`base.jpg`。`base` 是不带扩展名的路径，磁盘上不存在——**音频本体（`.mp3` / `.flac`）从未被删除**。删除后页面重新扫描目录，文件还在，表现为「点了没反应」。

**修复**：

1. 按音频扩展名 + sidecar 一起删：`flac/mp3/m4a/wav/aac/ogg` + `json/lrc/tlrc/jpg/png`
2. 删除后重新扫描复核，文件仍在则提示「删除失败，文件仍占用」
3. `keyExtractor` 由「文件名」改为「完整路径」——不同歌单目录下的同名文件会撞 key，导致列表行复用错乱
4. 删除失败不再静默吞掉，写日志 + toast

**验证**：造 3 个含中文/空格/括号的测试下载 → `delDownload index=0` → `before=18 after=17 stillThere=false`，音频与 sidecar 同时消失。

### 4.2 新增：歌单排序 / 一键置顶

**入口**：长按「我的列表」任意歌单（含内置的试听列表、我的收藏）→ 二级菜单。

| 选项 | 行为 |
|---|---|
| 排序歌单 | 打开排序页，逐行 ↑ / ↓ 调整，立即生效 |
| 一键置顶 | 该歌单移到最前 |

**实现**：

- `libraryStore` 新增 `listOrder`（MMKV `jk_library / listOrder`）与四个 API：
  `getListOrder` / `setListOrder` / `applyListOrder` / `moveListToTop` / `moveListBy`
- `applyListOrder` 对「顺序表里没有的 id」补在后面并保持原有相对顺序，兼容老数据
- `removeUserList` 时同步从顺序表剔除，不留幽灵 id
- 排序页 `src/app/(modals)/sortPlaylists.tsx`，首行 ↑ / 末行 ↓ 自动置灰
- 「我的列表」页订阅 `libraryVersionStore`，排序或置顶后立即重排
- 内置歌单不再被「内置列表不能删除」整段拦截，只是不提供删除/改封面入口

**验证**：

| 用例 | 结果 |
|---|---|
| `pinTop user_b` | `["user_b","love","default","user_a","user_c"]` |
| `sortMove user_c -1` | 与上一行交换，符合预期 |
| 重启后顺序 | 保留 |
| 删除歌单后顺序表 | 自动剔除该 id |
| 用户歌单菜单 | 设置封面 / 排序歌单 / 一键置顶 / 删除歌单 / 取消 |
| 内置歌单菜单 | 排序歌单 / 一键置顶 / 取消 |
| 排序页 5 行渲染 | 序号、内置标记、箭头置灰均正确 |

---

## 五、质量保障

### 5.1 构建与验收流程

每次改动固定跑一遍：

1. `./node_modules/.bin/tsc --noEmit` — 类型检查
2. `./node_modules/.bin/eslint <改动文件> --quiet`
3. `./scripts/dev-sim.sh` — 构建 + 安装到模拟器 + 启动 + 截图 + 检查 `fatal`
4. 深链驱动验收（`jkmusic://settingSection/dev?action=...`），读 `Documents/dev.log` 断言
5. `./scripts/build-ios.sh` — 出未签名 IPA + sha256

### 5.2 内置检查脚本

`scripts/` 下有 30+ 个专项检查（播放器原生补丁、音量、后台播放、定时器泄漏、音源运行时、菜单图标、本地文件、休眠定时器等），用于防止回归。

### 5.3 本版回归结果

| 项 | 结果 |
|---|---|
| 类型检查 / ESLint | 通过 |
| 构建 | `fatal=0`，无警告级错误 |
| 播放 | `Shape of You` 15.46s / 233.71s（tx 源），跨源兜底链路正常 |
| 搜索页 | 正常 |
| 下载页 | 15 项正常渲染，删除链路验证通过 |
| 设置页 | 分区完整（音源/基本/播放/音效/详情页/搜索/列表/下载/备份/其他） |
| 诊断页 | 崩溃/停住/换源条目正常 |
| 歌单菜单 | 内置 + 用户歌单两种形态均正确 |

---

## 六、已知限制

| 项 | 说明 |
|---|---|
| 实时活动 | 模拟器被系统禁用，图标/描边需真机验证 |
| 后台行为 | 模拟器后台会被系统终止，中断/熄屏场景只能真机验证 |
| 音源可用性 | 脚本池依赖第三方接口，单个源经常超时；靠多源兜底保证能播 |
| 音频线程崩溃 | 已加崩溃取证（信号 + 栈写入沙盒 + 诊断页展示），但需要复现样本才能定位 |
| 签名 | 产物未签名，需自签后安装 |

---

## 七、产物

| 项 | 值 |
|---|---|
| IPA | `artifacts/ipa/JKMUSIC-1.5.0-unsigned-20261125.ipa` |
| 固定别名 | `artifacts/ipa/JKMUSIC-ios-unsigned.ipa`（字节相同） |
| 大小 | 21 MB |
| sha256 | `9069f8d5a72e2fd2204f7eeafadfb40cec8eb33df7e0b1007e2b1aed35b0650d` |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex |
| 最低系统 | iOS 16.4 |
| 安装校验 | App 内 设置 → 其他 → App Version 应显示 `1.5.0（build 88）` |

---

## 八、后续建议

1. **真机验证**：实时活动、熄屏后台、中断续播三项只能在真机确认。
2. **崩溃样本**：若再次出现后台退出，先看「播放诊断」的「崩溃」条目；有栈看 `Documents/jk-crash-report.log`，无栈取 iOS 分析数据里的 `JKMUSIC-*.ips`。
3. **缓存 LRU**：`docs/AUDIT.md` 里记录的三处缓存规则偏差（按 mtime 淘汰、播放中文件保护失效、改上限不立即生效）尚未处理，属于体验优化项。
