# CI 工作流状态：已下线

本阶段（P0）的构建与验收**全部在本机完成**，入口是：

```bash
./scripts/dev-sim.sh
```

下面三个 workflow 保留不动（P6 出正式未签名 IPA 时可能复用）：

- `build-ios-jkmusic.yml` —— Release 设备包（xcodebuild + 打包 ipa）
- `build-ios-sim.yml` —— 模拟器包（用于无本机 Xcode 时的兜底）
- `build-ios.yml` —— 上游 CyMusic 原始流水线

## 本阶段约定

- 不 push 触发 workflow，不 `gh workflow run`
- 不下载 CI artifact
- 本机回路见 `docs/JKMUSIC-PORT.md` 的「本机构建（唯一回路）」

CI 若将来重新启用，环境变量需显式覆盖为 prebuilt：

```yaml
env:
  RCT_USE_RN_DEP: '1'
  RCT_USE_PREBUILT_RNCORE: '1'
```

原因：`ios/Podfile.properties.json` 里本机设了 `ios.buildReactNativeFromSource: true`，
而 Podfile 中 `ENV['RCT_USE_RN_DEP'] ||= ...`，env 优先级高于 properties。
