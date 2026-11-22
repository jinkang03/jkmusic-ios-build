> **LATEST：1.4.21 / build 45**
> 文件 `artifacts/ipa/JKMUSIC-1.4.21-unsigned-20261122.ipa`
> sha256 `a247c376be52a335d6f88c99a92917ae5b0d1921f019722accc0aa70a7b09df9`
> 固定别名 `artifacts/ipa/JKMUSIC-ios-unsigned.ipa` 与最新版字节相同（`./scripts/sync-latest-ipa.sh`）。
> 安装前在 App 内确认版本号（设置 → 其他 → App Version）。

## v1.4.21（2026-11-22）

| 项 | 值 |
|---|---|
| 产物 | `artifacts/ipa/JKMUSIC-1.4.21-unsigned-20261122.ipa` |
| 大小 | 18 MB |
| sha256 | `a247c376be52a335d6f88c99a92917ae5b0d1921f019722accc0aa70a7b09df9` |
| 版本 / build | 1.4.21 / 45 |
| 架构 | arm64 + JKMUSICWidget.appex + ShareExtension.appex，最低 iOS 16.4，未签名 |
| commit | 见 tag `v1.4.21` |

### 1.4.21 玻璃亮度滑块：能完全透、也能完全不透

**白遮罩的三个来源**

1. `LinearGradient` 高光固定 `rgba(255,255,255,0.32)`，不跟随滑块；
2. `glass()` 的描边固定 `rgba(255,255,255,0.65)`；
3. `BlurView` 的 `intensity` 固定 95/100，iOS 的 `tint="light"` 自带白色叠加——
   即使填充色是全透明，视觉上仍有一层白。

**修复**

| 项 | 改法 |
|---|---|
| 滑块范围 | 10..95 → **0..100** |
| `glass()` | `MIN_ALPHA = 0`；`stroke` / `highlight` 都乘以 `alpha` |
| 高光渐变 | 颜色 alpha = `glassAlpha × 0.45`，`alpha < 0.02` 时不渲染 |
| BlurView | `intensity = alpha × 100`；`alpha < 0.02` 时**完全不渲染**（否则 light blur 仍会发白） |

**效果**

- 0%：只有壁纸，播放条/功能条完全透明（无模糊、无边框、无高光）
- 50%：半透明玻璃 + 中等模糊
- 100%：纯白不透明（实测截图确认）


