> **LATEST：1.4.18 / build 42**
> 文件 `artifacts/ipa/JKMUSIC-1.4.18-unsigned-20261122.ipa`
> sha256 `SHA18`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.18（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.18-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `de8804f3758ddf9666c91e55252775e3333b2ad3af70ca70806543a53cfcb444` |
| 版本 / build | 1.4.18 / 42 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.18` |

### 1.4.18 批次 3：歌单从平台拉取更新

对应 mac 端 `ListUpdateModal.vue` + `store/list/syncSourceList.ts`：
按 `source` + `sourceListId` 重新拉取平台歌单，整体覆盖本地并记录更新时间。

**a) 新增能力**

- `musicSdk.searchSongLists(source, name)`：五个平台的 `songList.search` 统一封装；
- `libraryStore.updateUserListFromSource(listId, forcedSource?)`：
  - 有 `sourceListId` → 直接按 id 拉全部页（每页 100，最多 20 页）；
  - 没有 → 用歌单名搜索同名歌单，命中后补上 id；
  - 平台返回空时不动本地数据。

**b) 交互**

「我的列表」长按歌单 → 弹出「更新歌单 / 删除歌单」。
老歌单（备份导入，无来源信息）更新时弹「选择来源平台」，选完后按同名歌单反查并覆盖。

**c) 实测**

`试音个人精选` 分别指定平台：

```
kw -> ok count=95  sourceListId=3705864378
kg -> ok count=78  sourceListId=id_6825944
tx -> ok count=50  sourceListId=9644770211
```

列表页数量同步刷新。**注意**：同一名字在多个平台都存在时，选哪个平台就取哪个平台的歌单内容。


