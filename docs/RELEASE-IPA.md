> **LATEST：1.4.19 / build 43**
> 文件 `artifacts/ipa/JKMUSIC-1.4.19-unsigned-20261122.ipa`
> sha256 `4b902f75b7bcdb10b61671f99cead8cf498f3104fe248ebb42fe70d5adbb4558`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.19（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.19-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `4b902f75b7bcdb10b61671f99cead8cf498f3104fe248ebb42fe70d5adbb4558` |
| 版本 / build | 1.4.19 / 43 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.19` |

### 1.4.19 底栏改了几次都不生效：根因是 tabBarStyle 被内部覆盖

**反复无效的原因**

1.4.16 / 1.4.17 改的都是 `tabBarStyle` 里的 `left` / `right` / `width`，
但 `@react-navigation/bottom-tabs`（expo-router 内联版）渲染大概是：

```js
style: [styles.tabBar, { height, padding... }, tabBarStyle]
```

`styles.tabBar` 自带整行布局与 `flex`，`left/right/width` 在绝对定位 + flex 组合下被忽略，
所以改多少次视觉都不变（只有高度、圆角这类值生效）。

**修复：自定义 tabBar**

```tsx
<Tabs tabBar={(props) => <CustomTabBar {...props} />} />
```

`CustomTabBar` 自己渲染绝对定位容器（`left/right = 屏宽 × 0.155`），
内部玻璃胶囊 + Blur + 高光渐变不变，图标/文字按 6 个 tab 均分。

**额外修的一个坑**：`state.routes` 里包含 `(tabs)` 下的遗留路由 `(songs)` 和 `radio`，
自定义后会多出两个无效项（截图上出现 `(son... radio`）。
用排除法过滤：`!['(songs)', 'radio'].includes(route.name)`。

**结果**：功能条宽度从整屏缩到左右各约 62pt（393pt 屏），6 个 tab 完整显示，
播放条保持 1.1 倍长度不变。


