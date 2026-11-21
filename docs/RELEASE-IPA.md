> **LATEST：1.4.8 / build 32**
> 文件 `artifacts/ipa/JKMUSIC-1.4.8-unsigned-20261121.ipa`
> sha256 `60a02b24c2dfa1f5a92bad504df16c250cb2e2d668ccb6dac30c7d8a75701fd6`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.8（2026-11-21）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.8-unsigned-20261121.ipa` |
| 大小 | 18 MB |
| sha256 | `60a02b24c2dfa1f5a92bad504df16c250cb2e2d668ccb6dac30c7d8a75701fd6` |
| 版本 / build | 1.4.8 / 32 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.8` |

### 1.4.8 播放卡住：三个叠加的根因

**现象**：点歌后一直 `00:00 / 00:00`，按钮在「暂停」状态但没有任何声音，也不报错。

**根因 1：tx 的部分 flac 链接返回加密数据**

实测下载完整（33MB、进度 100%），但文件头是随机字节而不是 `fLaC`：

```
00000000: 3235 a1c5 cc86 417b cd3c d0ae ddc2 0b08  25....A{.<......
```

`afinfo` 直接报 `AudioFileOpenURL failed`，AVPlayer 同样打不开 → duration 0 → 卡住。
之前只校验「时长/大小是否被截断」，读不出时长时会用大小兜底，33MB 反而被判为「完整」。

修复：`downloadToCache` 落地后校验文件魔数（`fLaC` / `OggS` / `RIFF` / `ID3` /
MPEG 帧同步 / `ftyp`），不合法立即删除并抛 `UNDECODABLE_AUDIO`，走换源重下。

**根因 2：下载世代号是全局计数，被预取作废**

`downloadGeneration` 是全局变量，而预取会同时发起多个下载，每个都把世代 +1。
当前曲下载到 100% 后判断 `myGeneration !== downloadGeneration` → **丢弃结果** → 判定不可播：

```
下载进度: 100.00%
[jk/play] 下载世代已过期，丢弃结果
[ERROR] [jk/play] 下载与换源重下均失败，判定本曲不可播
```

修复：世代号改为**按曲目 key 隔离**（`platform:id`），只有同一首歌的新请求才会作废旧请求。

**根因 3：预取重复下载**

`prefetch` 先 `resolveSource()`（内部已下载一次），再 `downloadToCache()` 下载第二次。
修复：预取加 `skipDownload: true`，只取流地址，真正下载交给限流器。

**附带修复：换源后必须先落地再播**

`tryAltSource` 之前把换源拿到的 http 地址直接交给播放器，本环境 AVPlayer 放不了网络流，
会立刻再失败一次（表现为无限换源）。现在换源后先 `downloadToCache`，再交本地路径。

**验证**：清缓存后播放 tx 的 `Won't Look Back`：

```
缓冲下载失败，尝试换源重下 UNDECODABLE_AUDIO
下载失败换源重试: kw Won't Look Back
换源重下成功: file:///.../tx_000Crbrt2b9xwk.flac
```

文件头变为 `fLaC`、`afinfo` 识别为 flac 44.1kHz/16-bit，播放页进度 00:53 / 剩余 03:45 正常推进，
逐字歌词 `Captive like a teenage` 亮、` secret crush` 灰。


