# JKMUSIC iOS（基于 CyMusic 架构重做）

本工程以 [CyMusic](https://github.com/gyc-12/Cymusic)（Expo 57 / React Native 0.86 / 新架构）为 iOS 宿主，
把 JKMUSIC 桌面版（Electron + Vue）的功能与数据模型移植过来。

## 为什么要换路线

之前的 Capacitor 方案把 Vue 页面塞进 WKWebView，遇到两个硬问题：

1. **自定义源跑不起来**：JKMUSIC 的音源脚本需要 Node 语义（Buffer / crypto / zlib / needle），WKWebView 里没有。
2. **真机白屏**：Capacitor 8 的 Scene 生命周期绕过了自定义 ViewController，插件未注册。

CyMusic 的路线是原生 JavaScriptCore 执行 lx-music 脚本 + RNTP v5 原生播放器 —— 这才是 LX 生态在 iOS 上的正确形态。

## 已移植的功能

| 模块 | 说明 |
|---|---|
| 多源 SDK | `kw / kg / tx / wy / mg` 全套（原 CyMusic 只有精简 tx） |
| 请求层 | needle → fetch，保留桌面版 `bHh` 签名头算法（base64 → deflateRaw → hex + 版本号） |
| Node 兼容层 | `crypto`（AES-ECB/CBC、MD5）、`zlib`（pako）用 crypto-js 实现 |
| 搜索 | 多源并行搜索，结果统一为 LX.Music 条目 |
| 歌单 | 标签 / 排序 / 分页列表 + 详情 |
| 榜单 | 源切换 + 榜单列表 + 详情 |
| 我的列表 | 试听列表 / 我的收藏 / 用户列表（MMKV 持久化，兼容桌面备份结构） |
| 不喜欢列表 | 规则字符串（`歌名@歌手`），可增删清空 |
| 播放地址 | 自定义源按平台注入 `global.lx.apis`，musicSdk 统一取流 |
| 歌词 | 优先多源 SDK，失败回退原实现 |
| 自定义源 | 复用 CyMusic 的 JavaScriptCore 运行时，已扩展为多平台（原来固定 tx） |

## 目录

```
src/jk/                JKMUSIC 业务层（SDK 封装、列表、歌词、播放桥）
src/shims/             crypto / zlib 的 RN 实现
src/components/utils/musicSdk/   移植过来的多源 SDK
src/app/(tabs)/       搜索 / 歌单 / 榜单 / 我的列表
modules/cymusic-native/          原生 JS 引擎（CyMusic 原有）
```

## 构建

### 本地（需要完整 Xcode，含 iOS 平台组件）

```bash
yarn install --frozen-lockfile
cd ios && pod install && cd ..
./scripts/build-ios.sh        # 产出 JKMUSIC-<版本>-unsigned-<日期>.ipa，并同步固定别名
```

Ruby 2.6 环境已通过 `ios/ruby_compat.rb` 兼容（补 `filter_map`）。

### GitHub Actions

推送到 GitHub 后运行 `Build JKMUSIC iOS IPA` 工作流，产物为 `JKMUSIC-ios-unsigned-ipa`。

## 首次使用

正式包里打开「设置 → 音源管理」，用 URL、文件或粘贴文本导入脚本并点「使用」。
没有选中音源时不能播放。入口不依赖 `EXPO_PUBLIC_JK_DEV_IMPORT`。

## 已知差异

- 桌面版的**主题编辑系统**、**桌面歌词悬浮窗**、**托盘/全局快捷键**在 iOS 无对应，沿用 CyMusic 的主题与播放页。
- **同步服务端 / 开放 API** 未移植（需要常驻监听端口，iOS 不可行；同步客户端可后续补）。
- 下载走 CyMusic 的缓存机制（`CacheManager`），没有桌面版的多任务下载队列 UI。

## 本机构建（唯一回路）

### 4 个 expo-modules-jsi 补丁

`patches/expo-modules-jsi+57.1.0.patch`（patch-package 固化）：

| 文件 | 改动 | 解决的问题 |
|---|---|---|
| `apple/Package.swift:153` | `swiftLanguageModes: [.v6]` → `[.v5]` | 包级 Swift 6 模式，导致 14 个并发隔离错误 |
| `apple/Sources/ExpoModulesJSI-Cxx/include/RuntimeScheduler.h:53,61` | 删 2 处 `SWIFT_RETURNS_RETAINED` | 构造器不是 `SWIFT_SHARED_REFERENCE` 类型，标注非法 |
| `apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntime.swift:314` | `/^[a-zA-Z_$][a-zA-Z0-9_$]*$/` → `#/.../#` | Swift 5 模式下裸正则会按除法解析，报 `'$' is not a valid digit` |
| `apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptPromise.swift:33` | 新增 `nonisolated init() {}` | `LongLivedState` 隐式 init 被 `@JavaScriptActor` 隔离，同步上下文调不到 |

### Podfile 的 Swift 降级

`ios/Podfile` 的 `post_install` 把 `SWIFT_VERSION = 5.0`、
`SWIFT_STRICT_CONCURRENCY = minimal` 应用到名称匹配
`ExpoModulesJSI` / `expo-modules-jsi` / `ExpoModules*` / `expo-modules-core`
的 target —— 实测覆盖 **8 个 build configuration**（`grep -c SWIFT_STRICT_CONCURRENCY = minimal`
在 Pods.xcodeproj 里从 2 变成 8）。

不扩到 `expo-modules-core` 时，会卡在：

```
expo-modules-core/ios/Core/Events/EventEmitter.swift:52: error: sending 'emitter' risks causing data races
expo-modules-core/ios/Core/Events/EventEmitter.swift:79: error: sending 'emitter' risks causing data races
```

### 为什么本机必须源码模式

`ios/Podfile.properties.json` 里设了：

```json
"ios.buildReactNativeFromSource": "true"
```

默认的 prebuilt 模式需要下载 94MB 的 `reactnative-core-*.tar.gz`，
本机网络反复中断（curl 18 / 传输 stalled），预编译包下不全，
导致 `React.framework` / `ReactNativeDependencies.framework` 没被嵌进 `Frameworks/`，
装上模拟器后启动即崩：

```
dyld: Library not loaded: @rpath/React.framework/React
```

源码模式把 RN 静态链进主二进制（Release 下 `JKMUSIC.debug.dylib` / 主二进制 100MB+），
不再依赖动态框架，dyld 错误归零。

### 为什么验收只能用 Release

工程内的 bundle 阶段是：

```bash
if [[ "$CONFIGURATION" = *Debug* ]]; then export SKIP_BUNDLING=1; fi
```

Debug 不内联 JS，只能走 Metro；而 expo-dev-client 的深链 `exp+jkmusic://...`
会在模拟器弹「在 JKMUSIC 中打开？」，`simctl` 无法点确认按钮，验收卡住。
Release 把 JS 打进 `main.jsbundle`，`simctl launch` 即可直接验收界面。

### 架构限制（Intel）

Release 配置没有 `ONLY_ACTIVE_ARCH`，模拟器会同时编 arm64 + x86_64，耗时翻倍。
全量重编时加：

```bash
./scripts/dev-sim.sh --clean --arch x86_64
```

### 增量成本表

| 改动范围 | 命令 | 耗时 |
|---|---|---|
| 只改 `src/` 下 TS/TSX/JS | `./scripts/dev-sim.sh` | 1-3 分钟（只重跑 bundle） |
| 只重装验证 | `./scripts/dev-sim.sh --verify` | 秒级 |
| 改 Podfile / 加 pod | `./scripts/dev-sim.sh --clean --arch x86_64` | 15-30 分钟 |
| 改 expo-modules-jsi 补丁 | 同上 + `npx patch-package expo-modules-jsi` | 15-30 分钟 |
| 出 IPA（P6） | `xcodebuild -configuration Release -sdk iphoneos CODE_SIGNING_ALLOWED=NO` | 20-40 分钟 |

### 回滚

```bash
rm -f patches/expo-modules-jsi+57.1.0.patch
# 恢复 ios/Podfile.properties.json（去掉 ios.buildReactNativeFromSource）
cd ios && pod install
```

回滚后回到 prebuilt 模式；若预编译包能完整下载，则不需要源码模式，但
Podfile 的 Swift 降级仍然必要（否则 Swift 6 并发错误会让编译失败）。

