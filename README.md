<p align="center">

<h1 align="center">JKMUSIC for iOS</h1>

<p align="center">
  JKMUSIC 桌面版（Vue3）的 iOS 移植：五平台音源聚合、流式播放、逐字歌词、歌单同步、手动下载。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.5.0%20(build%2088)-111111" alt="1.5.0 / 88" />
  <img src="https://img.shields.io/badge/iOS-16.4%2B-111111?logo=apple&logoColor=white" alt="iOS 16.4 及以上" />
  <img src="https://img.shields.io/badge/Expo-57-000020?logo=expo&logoColor=white" alt="Expo 57" />
  <img src="https://img.shields.io/badge/React_Native-0.86-61DAFB?logo=react&logoColor=111111" alt="React Native 0.86" />
  <img src="https://img.shields.io/badge/License-Apache_2.0-blue" alt="Apache 2.0" />
</p>

<p align="center">
  <a href="#最新构建">最新构建</a> ·
  <a href="#功能">功能</a> ·
  <a href="#安装">安装</a> ·
  <a href="#构建">构建</a> ·
  <a href="#文档">文档</a>
</p>

## 最新构建

| 项 | 值 |
|---|---|
| 版本 / build | **1.5.0 / 88** |
| IPA | [Releases · v1.5.0](../../releases/latest)（`JKMUSIC-1.5.0-unsigned-20261125.ipa`） |
| 源码 + IPA 压缩包 | 同上 Release 附件 |
| 大小 | 21 MB |
| sha256 | `9069f8d5a72e2fd2204f7eeafadfb40cec8eb33df7e0b1007e2b1aed35b0650d` |
| 架构 | arm64 + `JKMUSICWidget.appex` + `ShareExtension.appex` |
| 最低系统 | iOS 16.4 |
| 签名 | **未签名**，安装前需自签 |

安装后在 App 内确认版本号：**设置 → 其他 → App Version**。

> 仓库只放源码：IPA 等二进制产物放在 [Releases](../../releases)，
> 避免每个版本往 git 历史里塞 20 MB 的包。

## 功能

- **五平台音源**：酷我 / 酷狗 / QQ音乐 / 网易云 / 咪咕；脚本池并发取流，失败自动换源。
- **流式播放**：点歌直接起播（实测 0.9–2.4 秒），不预先下载整首。
- **无缝切歌**：剩余 20 秒解析下一首地址、剩余 3 秒预热连接，切歌间隙 0.25–1.05 秒。
- **逐字歌词**：整行内嵌分段 + 颜色插值，支持翻译/罗马音、全屏歌词。
- **歌单**：链接导入（五平台）、平台同步更新、单曲移除、lxmc 备份导入导出。
- **缓存**：起播后自动缓存当前曲并在歌名后打勾；超出上限按文件修改时间淘汰最老的（LRU 改进见 `docs/AUDIT.md`）。
- **手动下载**：128k / 320k / flac 可选，落盘 `Documents/downloads/<歌单名>/`，带 json/lrc/jpg sidecar。
- **外观**：自定义壁纸、磨砂、玻璃透明度、文字颜色；播放页固定封面背景。
- **系统集成**：锁屏/控制中心、灵动岛（Live Activity）、分享扩展、桌面小组件。

## 安装

1. 到 [Releases](../../releases) 下载最新的未签名 IPA；
2. 用 AltStore / Sideloadly / 企业证书自签后安装；
3. 首次启动在「设置 → 音源」导入自定义音源脚本（App 不内置音源）。

## 构建

```bash
# 依赖（首次）
npm ci
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
(cd ios && ~/.gem/ruby/2.6.0/bin/pod install)

# 模拟器验证
EXPO_PUBLIC_JK_DEV_IMPORT=1 ./scripts/dev-sim.sh

# 出未签名 IPA（自动同步版本号、别名、断言）
./scripts/build-ios.sh
```

版本号统一用 `./scripts/sync-version.sh <version> <build>` 修改，会同时更新
`app.json`、`project.pbxproj`、`src/constants/buildInfo.ts`。

## 目录结构

```
src/
  app/            expo-router 页面（tabs / modals / player / 设置）
  components/     播放条、歌曲行、歌词、mac 风格组件
  jk/             JKMUSIC 业务层：libraryStore、musicSdk、downloader、设置
  player/         取流解析、换源矩阵、缓存、预取
  helpers/        播放控制、歌词、音源适配
ios/              原生工程、Widget、ShareExtension
scripts/          构建、版本同步、模拟器脚本
docs/             版本记录、回归清单、移植说明
artifacts/ipa/    本地出包目录（IPA 不进仓库，发布走 Releases）
```

## 调试入口（仅开发构建）

```
jkmusic://settingSection/dev?action=probePlayback
jkmusic://settingSection/dev?action=importList&url=<歌单链接>
jkmusic://settingSection/dev?action=dumpList&name=<歌单名>
jkmusic://settingSection/dev?action=artistTest&name=<歌手>
```

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/RELEASE-IPA.md`](docs/RELEASE-IPA.md) | 每个版本的改动、sha256、实测结果 |
| [`docs/REGRESSION.md`](docs/REGRESSION.md) | 按版本记录的回归清单 |
| [`docs/JKMUSIC-PORT.md`](docs/JKMUSIC-PORT.md) | 桌面版 → iOS 的移植说明 |
| [`docs/development.md`](docs/development.md) | 开发环境与调试 |
| [`docs/mac-ui-spec.md`](docs/mac-ui-spec.md) | 桌面版 UI 规格对照 |

## 许可

本项目源码使用 Apache License 2.0，详见 [LICENSE](LICENSE)。
App 不内置任何音频源，在线播放需要自行导入音源；请遵守当地法律与各平台服务条款。
