> **LATEST：1.4.41 / build 65**
> 文件 `artifacts/ipa/JKMUSIC-1.4.41-unsigned-20261123.ipa`
> sha256 `4df59a9e19fc0f4b39c6066d0bab35eb7636343db8d3df9877214b857148b6a6`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.41（2026-11-23）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.41-unsigned-20261123.ipa` |
| 大小 | 18 MB |
| sha256 | `4df59a9e19fc0f4b39c6066d0bab35eb7636343db8d3df9877214b857148b6a6` |
| 版本 / build | 1.4.41 / 65 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.41` |

### 1.4.41 品牌与仓库整理

**a) 应用图标**

换成 JKMUSIC 自己的图标（取自桌面版 `icon.icns`）：
- iOS `AppIcon`（1024）
- `assets/icon.png`、`assets/1024.png`、`assets/adaptive-icon.png`、`assets/favicon.png`
- README 顶部图标

**b) 移除默认壁纸**

删除 `assets/default-wallpaper.jpg` 与首装写入逻辑（`ensureDefaultWallpaper`）。
新安装不再自带任何壁纸，避免图片版权问题；已有用户的壁纸设置不受影响。

**c) 仓库清理**

删除与软件无关的内容：
`docs/screenshots`、`docs/images`、`docs/audit`、`docs/maintenance`、
`docs/JKMUSIC-PORT.md`、`references/`、`.idea/`、`.vscode/`、`.trellis/`、
`.claude/skills/cymusic-plugin-dev/`，以及历史中全部旧 IPA（约 1GB）。

现在仓库只保留：`src/`、`ios/`、`modules/`、`scripts/`、`patches/`、`docs/`（5 个说明）、
`artifacts/ipa/`（仅最新版）。


