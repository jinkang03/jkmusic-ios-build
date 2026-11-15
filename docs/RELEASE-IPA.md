# JKMUSIC iOS 1.0.0 未签名 IPA（交付定稿）

## 产物

| 项 | 值 |
|---|---|
| 路径 | `artifacts/ipa/JKMUSIC-1.0.0-unsigned.ipa` |
| 大小 | 17 MB |
| sha256 | `30fff6d748ab3ac2372bbc00782f3440e3228c34eb9c538d138bd3b0bd7b4866` |
| 版本 | CFBundleShortVersionString **1.0.0** / CFBundleVersion 1 |
| bundle id | com.jkmusic.ios |
| 架构 | arm64 |
| 最低系统 | iOS 16.4 |
| 构建日期 | 2026-11-14 |

**重要说明**：本 IPA 由提交 `e131e30`（下载页修复完成时）构建。
其后仓库里又有预取/network/odc 等改动，**这些改动未包含在本 IPA 中，且验证未全部通过**。

## 十条断言（该版本构建时实测）

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

## 功能清单（本 IPA 内可用）

六页签 · 搜索（真实热搜 12 词条 + 历史）· 歌单单列卡片 · 排行榜五列 · 我的列表 ·
播放（先下载后播放）· 歌词（高亮/滚动）· 下载页（真实歌名/试听/删除/清空/音质）·
备份与恢复（setting_v2 / playList_v2 / allData_v2，与桌面版格式一致）·
设置 14 个分区（桌面专属项只读）· 应用图标

## 首次使用（三步）

正式包不带开发开关。第一次打开还没有音源，点歌会失败，按这三步做完即可播放：

1. 打开底部「设置」，进入第一行「音源管理」（深链 `jkmusic://sourceManage`）。
2. 用「从 URL 导入」「选择 .js 文件」或「粘贴文本导入」装入 lx 音源脚本。脚本需自行准备，应用不内置播放地址。
3. 列表里确认名称、版本和支持平台（kw/kg/tx/wy/mg），单选「使用」。之后歌单、排行榜点播会先下载再播放。重启后仍保持选中。

## 已知问题

1. **随机点播需 2-4 秒**：本模拟器 AVPlayer 无法加载网络流，已改为「先下载后播放」
2. **预取未生效**：代码已写（`src/player/prefetch.ts`），触发点修到「起播后 2 秒」但验证未通过
3. **odc（自动清空搜索）关闭分支未验证**：开启分支有日志证据，关闭分支没有
4. **第三方音源不稳定**：音源代理有时效性，过期后需在「音源管理」重新导入脚本
5. **iOS 27 真机未验证**：本机最高 iOS 26.3 模拟器 / SDK 26.2
6. **历史缓存回填受 kw 接口限制**：仅部分文件能解析出歌名/歌手，新下载不受影响
7. **版权限制**：部分曲目只能试听，会自动换源
7. **搜索切源未接到请求**：源胶囊只改选中态，搜索请求仍走默认源
8. **酷我封面常为占位**：kw 的 `img` 恒为 null，播放页会显示音符占位
9. **「导入全部数据」只写设置**：歌单字段不会写入，界面显示「未写入」
10. **设置里仍有占位**：部分分区文案为「后续版本提供」；桌面专属项仍占一整行
11. **热搜与历史不完整**：热搜接口失败时整块消失；历史只在提交搜索时记录，点词、点行不记

## 安装

未签名 IPA 不能直装：
- Sideloadly / AltStore / SideStore（Apple ID 重签，免费账号 7 天）
- TrollStore（限特定系统版本）
- Xcode → Devices and Simulators 拖入 .app

## 回滚

```bash
npx patch-package --reverse
git checkout -- node_modules/@rntp/player ios/Podfile ios/Podfile.properties.json
cd ios && pod install
```

## 工程约定

- git 索引锁：`rm -f .git/index.lock`；禁用 `git add -A`（会卡死并写坏索引），用路径逐个 add
- 验证持久化/缓存前先看构建输出的 `cache files=N`，需要干净态用 `--fresh`
- hooks 必须全部在 early return 之前（eslint 门禁会拦）
- 播放策略：先下载后播放；点播不注入 ICY 头
- 歌词取参要把 meta 摊平到顶层
- 批量验证用 stress 场景写 `Documents/dev-stress.log`，宿主机 cat

