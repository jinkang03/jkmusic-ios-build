> **LATEST：1.4.29 / build 53**
> 文件 `artifacts/ipa/JKMUSIC-1.4.29-unsigned-20261122.ipa`
> sha256 `fe375b2241e5656bbc1ed983aca868de2a277acef10f3b54a76bc8286b21b4ab`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.29（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.29-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `fe375b2241e5656bbc1ed983aca868de2a277acef10f3b54a76bc8286b21b4ab` |
| 版本 / build | 1.4.29 / 53 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.29` |

### 1.4.29 歌单更新：短链解析 + tx 接口兜底

**a) QQ 短链能解析了**

之前 `resolveSourceListId` 对 `c6.y.qq.com/base/fcgi-bin/u?__=xxx` 返回空。
实际抓包发现：**GET 该短链返回 302**，`location` 是
`https://i.y.qq.com/n2/m/share/details/taoge.html?...&id=9644109902` —— id 就在里面。

（之前用 HEAD 请求看到的是 200，所以误判为「JS 落地页」）

修复：
- `fetch(url, { redirect: 'manual' })` 读 `location` 头；
- 兜底 `fetch(url)` 跟随后的 `res.url`；
- 再兜底原始链接里的 `id=`。

**b) tx 部分歌单稳定报 `try max num`**

`getSongListDetail`（`disstid` 接口）对部分歌单连续失败，重试 3 次仍 `try max num`；
但 `fcg_v8_playlist_cp.fcg` 对同一 id 正常返回。

修复：tx 平台在 `getSongListDetail` 全失败后，用
`getPlayListFromQ(sourceListId)`（另一套公开接口）兜底并转换字段。

**c) 实测（4 个歌单全部可更新）**

| 歌单 | sourceListId | 结果 |
|---|---|---|
| 试音个人精选 | 完整链接 → 9644770211 | ✅ 50 首 |
| 經典 | 短链 → 9644109902 | ✅ 43 首 |
| just do it | 短链 → 9644083255 | ✅ 176 首（走兜底接口） |
| DJ合集 | 短链 → 9644114020 | ✅ 247 首（走兜底接口） |


