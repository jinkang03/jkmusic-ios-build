> **LATEST：1.4.5 / build 29**
> 文件 `artifacts/ipa/JKMUSIC-1.4.5-unsigned-20261121.ipa`
> sha256 `f886609aa23b080ae301932e9569e86f82ccabc886b31ea4c8f2d21b71e94bc0`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（每次出包后跑 `./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version），避免装到历史包。

## v1.4.5（2026-11-21）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.5-unsigned-20261121.ipa` |
| 大小 | 18 MB |
| sha256 | `f886609aa23b080ae301932e9569e86f82ccabc886b31ea4c8f2d21b71e94bc0` |
| 版本 / build | 1.4.5 / 29 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.5` |

### 1.4.5 全量核对：装错包 + 三处双存储

**a) 根因：固定别名包停在 1.2.0**

`artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 一直是 11-13 生成的 1.2.0 / build 1。
比对内容：`玻璃透明度`、`已下载占用`、`KaraokeSegLine`、`平台代号（kw）` 在该包里 0 命中，
即 1.2.1 → 1.4.4 的所有改动都不在其中。装这个文件就会「所有改动都没生效」。

- 别名已更新为最新版，字节与版本化产物完全一致；
- 新增 `scripts/sync-latest-ipa.sh`：出包后自动同步别名并校验 sha256；
- `scripts/build-ios.sh` 重写：原来指向不存在的 `CyMusic.xcworkspace`，还会 `rm -rf artifacts/ipa`
  删掉全部历史包；现在走正确工程、版本化命名、自动同步别名、扩展断言。

**b) App Version 硬编码 1.0.0**

设置 → 其他 的版本号是写死的 `'1.0.0' / '1'`，无法自检装了哪个版本。

- 新增 `src/constants/buildInfo.ts`，由 `scripts/sync-version.sh` 从 app.json + pbxproj 生成；
- 实测显示 `1.4.5 (29)`，与 Info.plist 一致。

**c) 歌词延迟读错存储通道（1.4.3 回归）**

`lyrics[].time` 存的是**未含 offset 的原始时间**；`LyricParser.getPosition()` 内部才减 offset。
但紧凑歌词和全屏歌词都是自己用二分查 `lyrics[].time`，**完全绕过 `getPosition`**。

1.4.3 的减法本身是对的，错在读 `settingsStore` —— 播放页 +/- 写的是 `PersistStatus`，
两边永远对不上，表现为「延迟调了没反应」（实测 delay=6 与 delay=0 画面完全相同）。

- 组件保留减法，改读 `PersistStatus`，与播放页 +/- 同源；
- 实测：同一位置 01:00，delay=0 高亮「花落的那一天」，delay=8 回退到「吹着前奏望着天空」。

**d) 两个设置项双存储分叉**

| 键 | 现象 | 修法 |
|---|---|---|
| `lyric.detailFontSize` | 播放页 +/- 写 PersistStatus，紧凑歌词读 settingsStore → 只有一边变 | 统一到 PersistStatus |
| `music.quality` | 自动降级写 PersistStatus，下载读 settingsStore → 重启后音质回退 | 统一到 settingsStore |

**e) dev 深链补同步**

`setdev` 对 `lyric.detailFontSize` / `lyric.delaySeconds` 同步写 PersistStatus 并刷新歌词，
保证脚本验证与 UI 操作走同一条路径。

