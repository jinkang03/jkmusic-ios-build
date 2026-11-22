> **LATEST：1.4.26 / build 50**
> 文件 `artifacts/ipa/JKMUSIC-1.4.26-unsigned-20261122.ipa`
> sha256 `2f48e8ed26ebd3d711be9fef107f941a025a10a6a61fbe31cbd5062886bcc210`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.26（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.26-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `2f48e8ed26ebd3d711be9fef107f941a025a10a6a61fbe31cbd5062886bcc210` |
| 版本 / build | 1.4.26 / 50 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.26` |

### 1.4.26 歌单导入/更新按「可追溯的歌单 id」重做

**a) 隐藏「外观」设置**

设置 → 基本设置 → 外观（浅色/深色/跟随系统）整行移除；`app.themeMode` 键保留。

**b) lxmc 导入丢失来源（根因）**

`backup.ts` 的 `importPlayList` 创建歌单时只写了 `{ id, name, list }`，
把 `.lxmc` 里的 `source` / `sourceListId` 丢掉了 —— 所以导入的歌单永远无法更新。

修复：
- 新歌单保留 `source` / `sourceListId` / `locationUpdateTime`；
- 已存在的歌单（旧版导入丢字段）**补写**来源信息。

实测导入 `lx_list.lxmc`：16 个自建歌单，其中 **15 个带 sourceListId**（1 个手动创建的无来源）。

**c) 更新歌单：只认可追溯 id，删掉名字搜索**

- 新增 `libraryStore.resolveSourceListId(raw)`：纯 id 直接用；
  完整链接取 `id=(\d+)`；短链（`c6.y.qq.com/base/fcgi-bin/u?__=xxx`）**返回空**；
- `updateUserListFromSource` 只用这个 id 调 `getSongListDetail`，不再按歌单名搜索；
- 解析不到 id 时明确提示：「该歌单的来源是短链接，无法自动更新；请用含「id=」的完整歌单链接重新导入」。

**d) 导入/创建歌单弹窗修复**

原来两个动作都写旧 Cymusic store（`addPlayLists`），「我的列表」读的是 `libraryStore`，所以看不到。

- 创建：`libraryStore.createUserList(name)`；
- 链接导入：识别平台（tx/kw/kg/wy/mg）→ 解析 id → `getSongListDetail` 循环拉全部页 →
  写入 `libraryStore`（带 `source` / `sourceListId`）。

**e) 更新实测**

| 歌单 | sourceListId | 结果 |
|---|---|---|
| 试音个人精选 | 完整链接（含 id=9644770211） | ✅ 更新 50 首 |
| just do it | QQ 短链 | ❌ 明确提示改用完整链接 |


