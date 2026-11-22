> **LATEST：1.4.39 / build 63**
> 文件 `artifacts/ipa/JKMUSIC-1.4.39-unsigned-20261122.ipa`
> sha256 `2f892c175b01a7f44fb4f71fcf33f45082bc579df98f1b514cc6f8274ce9cd3e`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.39（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.39-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `2f892c175b01a7f44fb4f71fcf33f45082bc579df98f1b514cc6f8274ce9cd3e` |
| 版本 / build | 1.4.39 / 63 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.39` |

### 1.4.39 下载音质 + 播放缓存与「已缓存」标记

**a) 手动下载音质**

| 问题 | 修法 |
|---|---|
| sidecar 记录成 `quality: unknown`（脚本上报 unknown 时被直接采用） | 下载完按**真实文件**（扩展名 + 大小）校正，脚本 unknown 时回退到请求值 |
| 下载音质筛选不生效 | sidecar 现在一定有真实音质，下载页直接按它分类 |
| 下载没显式指定音质时可能落到播放音质 | `resolveSource` 对 download 请求强制读 `download.quality`，绝不用 `music.quality` |
| 脚本给了 50KB 的片段也照存 | 下载后 < 500KB 直接判失败 |

**实测**

```
quality=128k → 4.1MB  mp3  sidecar quality=128k
quality=320k → 10.3MB mp3  sidecar quality=320k
quality=flac → 52.8MB flac sidecar quality=flac
download.quality=128k + music.quality=flac → 4.1MB（未跟随播放音质）
dlprobe 计数 {128k:1, 320k:1, flac:1, unknown:0}
下载页选 320k → 只显示 320k 那一条
```

**b) 播放过的歌自动缓存 + 已缓存标记**

- 起播 8 秒后（不阻塞播放）后台把当前曲写入 `musicCache`；
- 写入完成立即在歌曲名后打 ✓（`circle-check`）；
- 启动时从 `musicCache/index.json` 重建标记；
- 清缓存 / 删除单个下载时同步取消标记；
- 再次播放同一首走 `file://`，不再取流。

**实测**

```
[cache] 起播后缓存当前曲: 春泥
[cache] 标记已缓存 kw:213955314
二次播放：使用缓存的音频路径播放: file://...
重启后：[cache] 已缓存索引 3 首
```


