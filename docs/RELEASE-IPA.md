> **LATEST：1.4.40 / build 64**
> 文件 `artifacts/ipa/JKMUSIC-1.4.40-unsigned-20261122.ipa`
> sha256 `e04a6787eb6e6c41078dae8929b87322c01d7099807c691ae964ecdf4c782450`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.40（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.40-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `e04a6787eb6e6c41078dae8929b87322c01d7099807c691ae964ecdf4c782450` |
| 版本 / build | 1.4.40 / 64 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.40` |

### 1.4.40 歌手页 / 歌单导入 / 队列与缓存标记 / LRU

**a) 播放页点歌手没反应**

- 原因：QQ 歌手搜索接口返回的歌手名带括号（`松隆子 (松たか子)`），原来的严格相等匹配失败；
  接口偶发不响应时也没有兜底。
- 修法：去括号后再匹配 + 6 秒超时；查不到 mid 时退到搜索页，保证点歌手一定有反应。
- 实测：`松隆子 → 000hlGvC24a1ed`，歌手页正常显示歌曲。

**b) 歌单导入**

| 平台 | 问题 | 修法 | 实测 |
|---|---|---|---|
| kg | 新版分享链接用 `gcid_xxx`，没有数字 id，接口全部签名失败 | 解析分享页 SSR 的 `window.$output` | 10 首（分享页上限，共 146，会提示） |
| tx | `disstid` 接口对部分歌单稳定 `try max num` | 导入路径接入 `fcg_v8_playlist_cp` 兜底（一次返回整张，最多 1000） | 1000 首 |
| wy | 长链接被 URL 编码一次后 `id=` 解析不到 | `resolveSourceListId` 先 decodeURIComponent | 46 首 |

另外：所有导入路径加了去重（`source:id`），分页接口不认 page 时不会重复堆积。

**c) wy 歌单点歌不切换 + 全部显示已缓存**

- 根因：wy 歌单详情走 SDK 通道时返回的条目**只有 songmid、没有 id**，
  而 wy 分支没有过 `normalizeMusic` → 每首歌 id 都是 `undefined`：
  - 点任意一首都被判定为「当前曲」，所以不切换；
  - 缓存 key 全是 `wy:undefined`，播一首就整列打勾。
- 修法：wy 歌单详情也过 `normalizeMusic`。
- 实测：Maps → Good Time 正常切换；`dumpList` 46 首、unique 46。

**d) 缓存 LRU**

- 之前 `enforceCacheLimit` 从未被调用；现在每次缓存完成后按 `download.cacheLimitMb` 淘汰。
- 只删最老的直到低于上限，新缓存保留；删除文件的同时删索引、取消「已缓存」勾。
- 实测（上限 60MB）：新增 25MB 后 `LRU 淘汰 1 个文件，剩余 25.2MB`，旧文件、索引、勾一起消失。


