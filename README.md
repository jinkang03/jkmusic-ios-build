<p align="center">
  <img src="1024.png" width="112" alt="JKMUSIC" />
</p>

<h1 align="center">JKMUSIC for iOS</h1>

<p align="center">
  把 JKMUSIC 桌面版（Vue3）的事件驱动架构与 UI 移植到 iOS：五平台音源聚合、流式播放、逐字歌词、歌单同步、手动下载。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.4.40%20(build%2064)-111111" alt="1.4.40 / 64" />
  <img src="https://img.shields.io/badge/iOS-16.4%2B-111111?logo=apple&logoColor=white" alt="iOS 16.4 及以上" />
  <img src="https://img.shields.io/badge/Expo-57-000020?logo=expo&logoColor=white" alt="Expo 57" />
  <img src="https://img.shields.io/badge/React_Native-0.86-61DAFB?logo=react&logoColor=111111" alt="React Native 0.86" />
</p>

<p align="center">
  <a href="#最新构建">最新构建</a> ·
  <a href="#功能">功能</a> ·
  <a href="#构建">构建</a> ·
  <a href="#文档">文档</a> ·
  <a href="#底座cymusic">底座</a>
</p>

## 最新构建

| 项 | 值 |
|---|---|
| 版本 / build | **1.4.40 / 64** |
| IPA | [`artifacts/ipa/JKMUSIC-1.4.40-unsigned-20261122.ipa`](artifacts/ipa/JKMUSIC-1.4.40-unsigned-20261122.ipa) |
| 固定别名 | [`artifacts/ipa/JKMUSIC-ios-unsigned.ipa`](artifacts/ipa/JKMUSIC-ios-unsigned.ipa)（与最新版字节相同） |
| sha256 | `e04a6787eb6e6c41078dae8929b87322c01d7099807c691ae964ecdf4c782450` |
| 架构 | arm64 + `JKMUSICWidget.appex` + `ShareExtension.appex`，最低 iOS 16.4 |
| 签名 | **未签名**，安装前需自签（AltStore / Sideloadly / 企业证书） |

安装后在 App 内确认版本号：**设置 → 其他 → App Version**。

## 功能

- **五平台音源聚合**：酷我 / 酷狗 / QQ音乐 / 网易云 / 咪咕，脚本池并发取流、自动换源。
- **流式播放**：点歌直接起播（实测 0.9–2.4s），不预先下载整首。
- **末段预取**：剩余 20 秒解析下一首地址、剩余 3 秒预热连接，切歌间隙 0.25–1.05s。
- **逐字歌词**：按桌面版 `font-player` 模型实现，整行内嵌分段 + 颜色插值。
- **歌单**：链接导入（kw/kg/tx/wy/mg）、平台同步更新、单曲移除、lxmc 备份导入。
- **缓存**：起播后自动缓存当前曲，歌曲名后打勾；超出上限按 LRU 只淘汰最老的。
- **手动下载**：可选 128k / 320k / flac，落盘 `Documents/downloads/<歌单名>/`，带 json/lrc/jpg sidecar。
- **外观**：自定义壁纸、磨砂、玻璃透明度、文字颜色；播放页固定封面背景。
- **系统集成**：锁屏/控制中心、灵动岛（Live Activity）、分享扩展、桌面小组件。

## 构建

```bash
# 依赖（首次）
npm ci
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
(cd ios && ~/.gem/ruby/2.6.0/bin/pod install)

# 模拟器验证
EXPO_PUBLIC_JK_DEV_IMPORT=1 ./scripts/dev-sim.sh

# 出未签名 IPA（自动同步版本号/别名/断言）
./scripts/build-ios.sh
```

版本号统一用 `./scripts/sync-version.sh <version> <build>` 修改（同时更新 `app.json`、`project.pbxproj`、`src/constants/buildInfo.ts`）。

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/RELEASE-IPA.md`](docs/RELEASE-IPA.md) | 每个版本的改动、sha256、回归结果 |
| [`docs/REGRESSION.md`](docs/REGRESSION.md) | 按版本记录的回归清单（构建前过一遍） |
| [`docs/JKMUSIC-PORT.md`](docs/JKMUSIC-PORT.md) | 桌面版 → iOS 的移植说明 |
| [`docs/development.md`](docs/development.md) | 开发环境与调试入口 |
| [`docs/mac-ui-spec.md`](docs/mac-ui-spec.md) | 桌面版 UI 规格对照 |

---

## 底座：CyMusic

以下为底座项目 CyMusic 的原始说明。本项目在其上完成了 JKMUSIC 的架构与 UI 移植。

## 应用预览

<table>
  <tr>
    <td align="center" width="33%"><img src="docs/images/screenshots/library-dark.webp" width="240" alt="深色主题下的音乐列表" /><br /><sub>音乐列表</sub></td>
    <td align="center" width="33%"><img src="docs/images/screenshots/player.webp" width="240" alt="展示封面、播放进度和控制按钮的播放器" /><br /><sub>正在播放</sub></td>
    <td align="center" width="33%"><img src="docs/images/screenshots/lyrics.webp" width="240" alt="播放器中的逐行滚动歌词" /><br /><sub>滚动歌词</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/screenshots/favorites-light.webp" width="240" alt="浅色主题下的收藏与自定义歌单" /><br /><sub>个人收藏</sub></td>
    <td align="center"><img src="docs/images/screenshots/playlist-light.webp" width="240" alt="自定义歌单中的歌曲列表" /><br /><sub>歌单管理</sub></td>
    <td align="center"><img src="docs/images/screenshots/settings-light.webp" width="240" alt="App 外观、语言与音频设置" /><br /><sub>按喜好设置</sub></td>
  </tr>
</table>

截图采自当前 iOS 构建（iPhone 17 Pro · iOS 26.5），使用演示歌单、封面与歌词。演示内容不随 App 分发，也不代表 App 内置音源。

## 功能

| | 你可以做什么 |
| --- | --- |
| **浏览与搜索** | 浏览歌曲和榜单，搜索歌曲、歌手，查看专辑与歌手页面。 |
| **播放与队列** | 管理待播清单，切换播放模式，调节播放进度和系统音量，设置定时关闭。 |
| **歌词** | 查看滚动歌词、调整字号与时间偏移，在歌词页面保持屏幕常亮。 |
| **收藏与歌单** | 收藏歌曲，创建自定义歌单，导入 QQ 音乐歌单，添加或移除歌单内歌曲。 |
| **本地与缓存** | 播放本地音乐，下载或自动缓存歌曲，查看缓存标记并管理本地歌曲。 |
| **自定义音源** | 从文件或 URL 导入脚本，切换、更新和测试音源；通过系统分享接收脚本文件、链接或文本。 |
| **外观与语言** | 深色、浅色、跟随系统；中文与英文界面。 |

在线内容、可用音质与播放结果取决于第三方平台和所配置的音源。

部分 FLAC 在快进后可能出现音频与歌词不同步，可在 **设置 → 音频设置 → 精确跳转**
中开启改善。该开关默认关闭，记住选择并在切换歌曲后生效；开启后部分音频可能需要
完整加载，播放前等待更久。

## 下载

支持 **iOS 16.4 及以上**。

| 渠道 | 用途 |
| --- | --- |
| [`artifacts/ipa/`](artifacts/ipa/) | 本仓库直接提供每个版本的未签名 IPA，文件名带版本与日期。 |
| [`JKMUSIC-ios-unsigned.ipa`](artifacts/ipa/JKMUSIC-ios-unsigned.ipa) | 固定别名，始终指向最新版。 |
| [`docs/RELEASE-IPA.md`](docs/RELEASE-IPA.md) | 每个版本的改动与 sha256。 |

本 README 介绍 `main` 分支。Releases 与 `main` 可能处于不同版本；如需 Expo 57 / RNTP v5 版本，请选择对应的 `main` 构建。
Actions 产物是**未签名 IPA**，安装到真机前需要自己的有效签名和 App Group 配置。

## 开始使用

1. **安装 App**：从上方渠道获取对应版本，完成签名后安装。
2. **配置音源**：进入设置 → 自定义音源 → 导入音源，选择本地脚本或输入脚本 URL。可参考 [CyMusic 音源示例](https://github.com/gyc-12/CyMusic-ImportMusicApi-Example)。
3. **整理音乐**：在“收藏”中管理喜欢的歌曲、自定义歌单及本地/缓存歌曲；创建歌单或导入 QQ 音乐歌单。
4. **开始播放**：选择歌曲，点击底部迷你播放器展开播放页；在歌曲菜单中打开歌词、收藏、添加到歌单或设置定时关闭。

首次导入的音源会自动选中。请使用可信且有权访问的音源，并尊重音乐作品的版权。

## 开发指南

当前使用的工具链：**Node 24.19.0 · Yarn 1.22.22 · CocoaPods 1.16.2 · Xcode 26.6**。

```bash
git clone https://github.com/gyc-12/Cymusic.git
cd Cymusic

yarn install --frozen-lockfile --non-interactive
cd ios
pod _1.16.2_ install --deployment
cd ..

npx expo run:ios --no-install
```

自定义原生模块需要开发构建，不能在 Expo Go 中运行。仓库维护原有 `ios/` 工程与分享扩展，**不要运行 `expo prebuild` 覆盖原生工程**。
请保留锁文件和安装时应用的补丁；原生依赖或补丁变更后需要重新构建 App。

| 核心组件 | 当前版本 / 方案 |
| --- | --- |
| 框架 | Expo **57.0.21** · React Native **0.86.3** · React **19.2.3** |
| 原生架构 | New Architecture · Fabric · Hermes |
| 播放器 | `@rntp/player` **5.9.2**，适用独立许可 |
| 路由与状态 | Expo Router · Zustand |
| 存储 | MMKV 4 / Nitro · AsyncStorage |
| 本地能力 | Expo FileSystem 与自有 Expo Modules：音源运行时、系统音量、定时服务等 |

- [完整开发指南](docs/development.md)：环境准备、原生补丁、Pods 配置恢复、Release 构建与专项检查。
- [RNTP v5 集成记录](docs/maintenance/2026-09-10-rntp-v5.md)：实现边界、验证结果与回退说明。
- [精确跳转验证](docs/maintenance/2026-09-10-precise-seeking.md)：FLAC 跳转修复、加载取舍和复现方法。
- [第三方许可说明](third-party-licenses/README.md)：播放器许可的版本、来源与适用范围。

## 参与贡献

欢迎通过 [Issues](https://github.com/gyc-12/Cymusic/issues) 报告问题或提出建议，反馈时请附 App 版本、设备系统和复现步骤。
提交 PR 时请说明改动目的、影响范围与验证结果；涉及原生依赖时同步检查锁文件、补丁和 iOS 构建。
当前构建方式、专项检查和已知验证边界见[开发指南](docs/development.md)。

项目动态：[Telegram 频道](https://t.me/gyc_123)。

## 许可与使用范围

- **自有源码**：按 [Apache License 2.0](LICENSE) 授权。官方 App 的使用说明不修改 Apache-2.0 条款，也不撤销已有的源码授权。
- **RNTP v5**：`@rntp/player@5.9.2` 的版权属于 Double Symmetry GmbH，适用随该版本发布的[独立许可证](third-party-licenses/rntp-player-5.9.2.txt)。**RNTP v5 不属于 CyMusic 的 Apache-2.0 授权范围**，不能因本项目开源而视其为 Apache-2.0 或 MIT 软件；CyMusic 不另行授予其商业使用或再许可权利。
- **官方 App**：永久免费，仅限个人、非职业、非商业使用，禁止商业用途。免费不等于可以用于公司、组织或商业产品，RNTP 的具体授权条件以其原文为准。
- **其他依赖**：保留各自的版权与许可证。

完整说明见 [CyMusic 官方 App 使用说明](docs/app-usage.md)。请尊重版权，支持正版音乐。

## 致谢

感谢这些项目提供的参考与启发：

- [CodeWithGionatha-Labs/music-player](https://github.com/CodeWithGionatha-Labs/music-player)
- [lyswhut/lx-music-mobile](https://github.com/lyswhut/lx-music-mobile)
- [maotoumao/MusicFree](https://github.com/maotoumao/MusicFree)

<details>
  <summary>Star History</summary>

[![Star History](https://api.star-history.com/svg?repos=gyc-12/Cymusic&type=Date)](https://www.star-history.com/#gyc-12/Cymusic&Date)

</details>
