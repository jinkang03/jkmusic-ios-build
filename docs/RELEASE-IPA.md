> **LATEST：1.4.16 / build 40**
> 文件 `artifacts/ipa/JKMUSIC-1.4.16-unsigned-20261122.ipa`
> sha256 `SHA16`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.16（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.16-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `00422ffe6f27500706c3051cfb536ea6d848123c325e2f9a27f20ed348c08961` |
| 版本 / build | 1.4.16 / 40 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.16` |

### 1.4.16 批次 1：添加到歌单 / 底栏尺寸 / 颜色盘

**a) 添加到歌单**

数据层验证：`dev addToUserList` → `测试歌单A len=8`，`我的列表`显示「共 8 首」。
同时补了两处：

- `addToPlaylist` 的插入位置改为跟随 `list.addMusicLocationType`（之前固定 bottom）；
- 新增 `addToUserList` dev 动作，便于排查 UI 链路。

**b) 底栏 / 播放条尺寸**

| 对象 | 上一版 | 1.4.16 |
|---|---|---|
| 功能条高度 | 44 | **53**（×1.2） |
| 功能条左右 | 26 | 按屏宽 15.5%（≈58，长度 ×0.8） |
| 播放条左右 | 26 | 按屏宽 2.7%（≈10，长度 ×1.1） |
| 功能条圆角 | 22 | 26 |

**c) 颜色盘滑不动**

根因：`PanResponder` 的 `onPanResponderMove` 读的是 `e.nativeEvent.locationX/Y`，
手指移动时该值会随视图重算，表现为「滑不动/跳变」；且面板尺寸读的是创建时的闭包 state（0）。

修复：按下时记录基准色值 + 用 ref 同步面板尺寸，移动时按 `gestureState.dx/dy` 累加。
色相条同样处理。


