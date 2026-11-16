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

1. **设置 → 音源管理 → 从 URL 导入**（或选 .js 文件 / 粘贴文本）
2. 列表里点「使用」选中该音源
3. 回歌单点歌 → 缓冲 2-4 秒 → 起播

> 不导入音源则无法播放（应用内不带任何第三方音源）。

## 音源可用性（2026-11-16 实测）

| 脚本 | 状态 |
|---|---|
| **安妮独家音源 v5** | ✅ 可用（依赖 c.wwwweb.top / musicserver.haitangw.cc） |
| 裤佬 SVIP v3.0.0 | ❌ 播放地址代理已下线（yy.zddyr.top / api.chksz.com / api.qs.la 均 000） |
| 星海 / 回避聚合 | ❌ 代理域名不可达 |

音源失效的表现：**能导入、能取歌词与封面，但取播放地址为空 → 播放无声**。

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

