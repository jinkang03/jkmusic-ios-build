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
./scripts/build-ios.sh        # 产出 artifacts/ipa/JKMUSIC-ios-unsigned.ipa
```

Ruby 2.6 环境已通过 `ios/ruby_compat.rb` 兼容（补 `filter_map`）。

### GitHub Actions

推送到 GitHub 后运行 `Build JKMUSIC iOS IPA` 工作流，产物为 `JKMUSIC-ios-unsigned-ipa`。

## 已知差异

- 桌面版的**主题编辑系统**、**桌面歌词悬浮窗**、**托盘/全局快捷键**在 iOS 无对应，沿用 CyMusic 的主题与播放页。
- **同步服务端 / 开放 API** 未移植（需要常驻监听端口，iOS 不可行；同步客户端可后续补）。
- 下载走 CyMusic 的缓存机制（`CacheManager`），没有桌面版的多任务下载队列 UI。
