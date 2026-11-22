> **LATEST：1.4.27 / build 51**
> 文件 `artifacts/ipa/JKMUSIC-1.4.27-unsigned-20261122.ipa`
> sha256 `546776052f463534c3cee98f33ee6a1f282493f1d936abc774905460fed4ec42`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.27（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.27-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `546776052f463534c3cee98f33ee6a1f282493f1d936abc774905460fed4ec42` |
| 版本 / build | 1.4.27 / 51 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.27` |

### 1.4.27 清掉遗留的「按名字搜歌单」流程

1.4.26 已经把更新逻辑改成「只认 sourceListId」，但失败时仍返回 `needSource: true`，
UI 会弹「选择来源平台」对话框 —— 用户点更新看到这个弹窗，等于旧逻辑没删干净。

清理：
- `updateUserListFromSource` 去掉 `forcedSource` 参数与 `needSource` 字段；
  失败只返回具体原因；
- `favorites` 的「选择来源平台」Alert 整段删除，改为直接 toast 显示失败原因；
- 删除 `musicSdk.searchSongLists`（已无调用方，防止以后被误用）。

**实测**

```
试音个人精选（完整链接） → ok count=50 sourceListId=9644770211
just do it（QQ 短链）    → ok=false，提示「来源是短链接…请用含 id= 的完整链接重新导入」
```

**不再出现「选择来源平台」弹窗。**


