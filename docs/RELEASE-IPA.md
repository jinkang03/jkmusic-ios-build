> **LATEST：1.4.30 / build 54**
> 文件 `artifacts/ipa/JKMUSIC-1.4.30-unsigned-20261122.ipa`
> sha256 `6cef28e28ede627ef9004e833f44feb5b850f4e7879e261caa8d51f9057f3ea6`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.30（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.30-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `6cef28e28ede627ef9004e833f44feb5b850f4e7879e261caa8d51f9057f3ea6` |
| 版本 / build | 1.4.30 / 54 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.30` |

### 1.4.30 全平台歌单更新 + 新安装默认外观

**a) 全平台歌单（原来只有 tx 能做）**

`resolveSourceListId` 扩展为通用解析：

| 平台 | 支持的形式 |
|---|---|
| kw | `playlist_detail/<id>`、`?pid=`、纯 id |
| kg | `special/single/<id>.html`、`?specialid=`、`collection_3_<id>`、`id_xxx` |
| wy | `playlist?id=`、`#/playlist?id=`、纯 id |
| mg | `/music/playlist/<id>`、纯 id |
| tx | `?id=`、`disstid=`、短链 302 |

通用兜底：先带 `redirect:'manual'` 读 302 的 `location`，再跟随取最终 URL，最后取原链接里的 id。

**b) 五平台实测（`probeList`，用各平台真实歌单）**

```
kg  id_9946011            813 首 ✅
mg  234332827              50 首 ✅
kw  digest-8__3678202180  101 首 ✅
wy  18428485896            68 首 ✅
tx  9644770211             50 首 ✅（完整链接）
```

**c) 新安装默认外观**

| 项 | 默认值 |
|---|---|
| 主题壁纸 | 内置 `assets/default-wallpaper.jpg`（1280×1600，**226KB**，<2MB） |
| 壁纸磨砂 | **10** |
| 玻璃不透明度 | **10%** |
| 玻璃透明度 | **10%** |
| 文字颜色 | **#FFFFFF** |

实现：`themeStore.ensureDefaultWallpaper()` 在启动时执行一次，
只在「用户从未设置过壁纸」时把内置图复制到 `Documents/wallpaper-default.jpg` 并写入设置；
之后一切以设置为准（不会再覆盖）。

实测：卸载重装后首屏即是该壁纸 + 磨砂 10 + 玻璃 10% + 白字。


