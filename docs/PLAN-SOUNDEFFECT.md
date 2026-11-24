# 音效功能（对齐 Mac 端）— 逆向结论与实施方案（待确认）

版本目标：1.4.49 起，分 4 批（含 1 个验证批）。

---

## 一、Mac 端是怎么实现的（逆向结论）

数据来源：`/Applications/JKMUSIC.app/Contents/Resources/app.asar` 的 sourcemap（`dist/renderer.js.map`、
`dist/pitch_shifter.audioWorklet.js.map`），原始源码完整可读。

### 1.1 音频图

Mac 端不是用系统级 EQ，而是把 `<audio>` 接到 **Web Audio API**，用节点串出整条链：

```
<audio> ──MediaElementSource
   └─ Analyser（仅可视化，不影响声音）
      └─ BiquadFilter ×10（串联，peaking，Q=1.4）
         └─ [AudioWorklet 变调（仅在变调≠1 时插入）]
            ├─ dry  → Gain(mainGain) ─┐
            └─ wet  → Convolver ─ Gain(sendGain) ─┤
                                                  ├─ DynamicsCompressor（常驻）
                                                  └─ Panner（3D 环绕）
                                                     └─ Gain(音量) → 输出
```

关键事实：

- **整条链常驻**：没有总开关。就算什么效果都不选，声音也过了压缩器。
- 干声增益 / 湿声增益都来自设置值 ÷10（设置里存 0–50，界面显示 0–500%，DSP 里是 0–5）。
- 混响是**卷积混响**，IR 是随包分发的 14 个 WAV。
- 变调是 **phase vocoder**（olvb/phaze），blockSize 4096、hop 128、0.8 的 Hann 窗，
  只改音高不改速度（和播放倍速是两套东西）。
- 3D 环绕是 PannerNode 每 `speed*10` ms 绕一圈，半径/速度可调。

### 1.2 设置项（key 与默认值，与 Mac 完全一致）

| key | 含义 | 范围 / 默认 |
|---|---|---|
| `player.soundEffect.convolution.fileName` | 环境混响 IR 文件名 | 空 = 关闭 |
| `player.soundEffect.convolution.mainGain` | 原始音频增益 | 0–50，默认 10（=100%） |
| `player.soundEffect.convolution.sendGain` | 环境音效增益 | 0–50，默认 0 |
| `player.soundEffect.biquadFilter.hz31/62/125/250/500/1000/2000/4000/8000/16000` | 10 段 EQ | -15–15 dB，默认 0 |
| `player.soundEffect.panner.enable` | 3D 环绕开关 | 默认 false |
| `player.soundEffect.panner.soundR` | 声音距离 | 1–30，默认 5（÷10 后是半径 0.5–3） |
| `player.soundEffect.panner.speed` | 环绕速度 | 1–50，默认 25 |
| `player.soundEffect.pitchShifter.playbackRate` | 变调 | 0.50–1.50，默认 1 |

### 1.3 环境混响预设（13 个，单选）

| 界面名 | IR 文件 | 时长 / 声道 | mainGain / sendGain |
|---|---|---|---|
| 电话 | filter-telephone.wav | 1.64s / 2ch | 0.0 / 3.0 |
| 教堂 | s2_r4_bd.wav | 4.00s / 2ch / **48k** | 1.8 / 0.9 |
| 大厅 | bright-hall.wav | 1.49s / **4ch** | 0.8 / 2.4 |
| 电影院 | cinema-diningroom.wav | 1.47s / 2ch | 0.6 / 2.3 |
| 餐厅 | dining-living-true-stereo.wav | 1.55s / **4ch** | 0.6 / 1.8 |
| 卫生间 | living-bedroom-leveled.wav | 1.23s / 2ch | 0.6 / 2.1 |
| 室内 | spreader50-65ms.wav | 1.00s / **4ch** | 1.0 / 2.5 |
| 立体声 | s3_r1_bd.wav | 4.00s / 2ch / **48k** | 1.8 / 0.8 |
| 矩阵混响（1） | matrix-reverb1.wav | 3.34s / 2ch | 1.5 / 0.9 |
| 矩阵混响（2） | matrix-reverb2.wav | 2.83s / 2ch | 1.3 / 1.0 |
| 心形扩散 | cardiod-35-10-spread.wav | 3.59s / 2ch | 1.8 / 0.6 |
| 磁性立体声 | tim-omni-35-10-magnetic.wav | 3.81s / 2ch | 1.0 / 0.2 |
| 反馈弹簧 | feedback-spring.wav | 4.00s / 2ch | 1.8 / 0.8 |

- 4 声道 IR 在 Web Audio 里走「真立体声」矩阵卷积（左入 × IR0/1，右入 × IR2/3）。
- Web Audio 的 ConvolverNode 默认 `normalize = true`，会按响应功率做归一化
  （power → `scale = 1/sqrt(power) × 0.00125`，再按采样率修正），**不是**直接拿原始 IR 卷积。
  不还原这一步，湿声电平会差 20dB 以上。
- 14 个文件合计约 6.6MB（`medium-room1.wav` 当前未使用）。

### 1.4 EQ 预设（9 个，单位 dB）

| 预设 | 31 | 62 | 125 | 250 | 500 | 1k | 2k | 4k | 8k | 16k |
|---|---|---|---|---|---|---|---|---|---|---|
| 流行 | 6 | 5 | -3 | -2 | 5 | 4 | -4 | -3 | 6 | 4 |
| 舞曲 | 4 | 3 | -4 | -6 | 0 | 0 | 3 | 4 | 4 | 5 |
| 摇滚 | 7 | 6 | 2 | 1 | -3 | -4 | 2 | 1 | 4 | 5 |
| 古典 | 6 | 7 | 1 | 2 | -1 | 1 | -4 | -6 | -7 | -8 |
| 人声 | -5 | -6 | -4 | -3 | 3 | 4 | 5 | 4 | -3 | -3 |
| 慢歌 | 5 | 4 | 2 | 0 | -2 | 0 | 3 | 6 | 7 | 8 |
| 电子乐 | 6 | 5 | 0 | -5 | -4 | 0 | 6 | 8 | 8 | 7 |
| 重低音 | 8 | 7 | 5 | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| 柔和 | -5 | -5 | -4 | -4 | 3 | 2 | 4 | 4 | 0 | 0 |

滤波参数：`peaking`、`Q = 1.4`、中心频率为表头。

### 1.5 压缩器与声像

- 压缩器用 Web Audio 默认值：threshold -24dB、knee 30dB、ratio 12、attack 3ms、release 250ms。
  Chrome 的实现还有 6ms 预延迟（lookahead）和软拐点曲线。
- 声像：`panningModel = equalpower`、`distanceModel = inverse`、refDistance 1、rolloff 1。
  每 tick 把位置设成 `x=sin θ·R, y=cos θ·R, z=cos θ·R`，θ 每 tick +1°，
  tick 间隔 = `2×(speed/10)×10` ms（speed=25 → 50ms，约 18 秒一圈）。

### 1.6 变调

phase vocoder（phaze）：FFT 4096、hop 128、Hann 0.8、峰值相位推进，
每帧把频谱按 `pitchFactor` 搬移。只改音高，时长不变。

---

## 二、iOS 现状与可行性

### 2.1 现在的播放通路

- 播放器是 vendored 的 `@rntp/player 5.9.2`（用 patch-package 维护），iOS 侧 `AVPlayerEngine`
  用 `AVPlayer` + 本地缓存代理（`CacheProxyServer`）拉流，**没有任何 DSP 通路**。
- `AVPlayer` 的输出无法直接接管，系统层面只有一条合法通路能做实时处理：
  **`AVPlayerItem.audioMix` + `MTAudioProcessingTap`**（MediaToolbox，iOS 6+，未废弃）。
- 它能拿到解码后的 PCM（float32），原地处理后再交给 AVPlayer 输出；
  流式/缓冲/缓存/后台/锁屏/车机全都不受影响。

### 2.2 为什么不用别的方案

| 方案 | 结论 |
|---|---|
| 换 AVAudioEngine 自建播放器 | 要自己实现流式解码、缓存、换源、后台，等于重写播放器，风险不可接受 |
| react-native-audio-api（Web Audio 的 RN 实现） | 需要把整首歌解码进内存（5 分钟 ≈ 100MB），且和现有播放器二选一，等于重写 |
| AVAudioUnitReverb | 只有内置房间预设，无法加载自定义 IR，效果不可能一致 |
| 只做 Android/桌面 | 不满足需求 |

**结论：用 audioMix + MTAudioProcessingTap，把 Mac 的节点链在 Swift 里重建。**

---

## 三、实施方案

### 3.1 架构

```
JS（设置页 / 预设 / 持久化）
  └─ setSoundEffect(config)  ──►  RNTP fork: TrackPlayer.swift（新方法）
                                   └─ AVPlayerEngine：installItem 时挂 audioMix + tap
                                        └─ SoundEffectTap（Swift）
                                             EQ×10 → [变调] → dry/wet 卷积 → 压缩器 → 声像
```

- 参数改动走「配置快照 + 双缓冲」：主线程写好一份新配置，音频线程只在块边界读指针，
  不在实时线程里分配内存、不加锁。
- IR 的分段卷积核在后台线程预算好（vDSP FFT），切换 IR 时原子替换。
- 采样率跟随音源（44.1k/48k），IR 按 Web Audio 规则做采样率修正。

### 3.2 各模块

| 模块 | 实现 | 备注 |
|---|---|---|
| 10 段 EQ | RBJ peaking biquad（与 Chrome 同一套系数公式），float32 处理、float64 算系数 | 系数在参数变化时预计算 |
| 干/湿增益 | 两个乘数 | 直接对应 mainGain/10、sendGain/10 |
| 卷积混响 | 分段 FFT 卷积（overlap-save，块 512/1024，vDSP） | 2ch 走立体声；**4ch 走真立体声矩阵**（左入×IR0/1，右入×IR2/3） |
| IR 归一化 | 复刻 Web Audio 公式（power → scale，含采样率修正） | 不做这一步电平会差很多 |
| 压缩器 | 移植 Chrome DynamicsCompressor 的曲线/检波/预延迟 | 保证「开着音效」时动态一致 |
| 声像 | equalpower + inverse 距离衰减，θ 每 tick +1°，位置公式与 Mac 相同 | 用系统时钟推进，不依赖 JS 定时器 |
| 变调 | 移植 phaze 相位声码器（FFT 4096 / hop 128 / Hann 0.8） | 用 vDSP；只改音高不改速度 |

### 3.3 开关策略（重要）

Mac 没有总开关，音效链常驻。iOS 上**新增一个总开关「启用音效」，默认关闭**：

- 关闭：**不挂 tap**，播放路径与现在逐字节相同，零风险、零开销。
- 打开：挂 tap，完整复刻 Mac 链（包括压缩器）。
- 这样既不影响现有用户，也能做到「打开后与 Mac 一致」。
- 需要你确认这条（见第六节）。

### 3.4 用户看到的样子

**入口**

- 设置 → 新增「音效」分区（`SETTINGS_SECTIONS` 加一项），标题「音效设置（实验性）」。
- 播放页底部工具行加一个 tune 图标，点开直接进这一页（对齐 Mac 播放条的音效按钮）。

**页面（自上而下，对齐 Mac 弹窗的分区与文案）**

1. 顶部：`启用音效` 开关 + 说明（关闭时下面所有项置灰）
2. 环境混响音效：13 个复选项（单选，再点一次取消）
   - 原始音频增益：0–500%，默认 100%
   - 环境音效增益：0–500%，默认 0%
   - 未选环境音效时两个滑块置灰
3. 音调升降调节：0.50x–1.50x 滑块 + 「重置」
4. 3D 立体环绕（需使用耳机）：启用开关 + 环绕速度 1–50 + 声音距离 1–30
5. 均衡器：10 段（31/62/125/250/500/1k/2k/4k/8k/16k），-15–15dB + 「重置」+ 9 个预设按钮

**行为**

- 任何改动**立即生效**（当前正在播的歌不用重开）
- 设置写入 `player.soundEffect.*`（与 Mac 同 key），随备份导出/导入
- 关闭总开关时参数保留，下次打开继续用

### 3.5 与现有功能的相互影响

| 现有功能 | 影响 |
|---|---|
| 流式播放 / 换源 / 备用队列 | 不动（tap 挂在 AVPlayerItem 上，换 item 时重挂） |
| 末段预取 / 连接预热 | 不动 |
| 缓存（musicCache）/ 已缓存勾 | 不动（tap 在解码之后，缓存的是原始字节） |
| 看门狗 / 0:00 卡死保护 | 不动（只处理音频样本，不改播放状态机） |
| 播完自动切歌 | 不动 |
| 后台播放 / 锁屏 / Live Activity | 不动（audioMix 支持后台） |
| AirPlay / 蓝牙 | 可能不支持自定义音频混合，系统会回退成立体声或忽略音效 —— 需实测，作为已知限制写进说明 |
| CPU / 耗电 | 只在实际启用时：EQ≈1%、卷积 5–15%、变调 3–8%（按机型浮动） |
| 包体积 | +6.6MB（13 个 IR） |

### 3.6 一致性怎么保证

1. **同一套数学**：EQ 系数、卷积归一化、声像位置/距离、压缩器曲线都按 Mac 的公式实现。
2. **离线对拍**：
   - 用 Chrome 的 `OfflineAudioContext` 跑 Mac 那条链（同一段 30s 素材、同一组参数），导出 WAV；
   - 用 Swift 侧离线渲染同一段素材（DSP 代码复用，加一个离线入口）；
   - 对比：总 RMS 差 < 0.2dB，10 个频段能量差 < 0.5dB，前 100ms 波形互相关 > 0.99。
3. **实机 A/B**：同一首歌、同一预设，Mac 与 iPhone 各录 30s，看频谱与主观听感。
4. **关闭时**：不挂 tap，输出与 1.4.48 完全一致（可用录音对比验证 bit 级一致）。

### 3.7 风险与回退

| 风险 | 应对 |
|---|---|
| tap 与缓存代理（本地 HTTP 流）不兼容 | **批次 0 先验证**；不行就只对直连音源生效，并如实说明 |
| 4 声道 IR 的矩阵顺序与 Chrome 不同 | 对拍阶段用冲激响应定位通道映射 |
| 变调质量/CPU 不达标 | 单独一批，可只发其余效果；变调保留入口但标注「实验性」 |
| 老机型卷积吃力 | IR 卷积块大小自适应 + 单声道降级开关（内部） |
| 相位声码器延迟影响歌词同步 | 延迟约 93ms，与 Mac 相同；歌词本来就按 0.1s 粒度 |

---

## 四、批次与产出

| 批次 | 内容 | 验收 |
|---|---|---|
| **0（验证，先做）** | RNTP fork 里挂一个最小 tap（只做增益），跑通网络流、seek、切歌、后台 | 出声正常、无爆音、seek 正常、切歌正常 → 才继续 |
| 1 | EQ + 干湿增益 + 压缩器 + 声像 + 设置页 + 总开关 + 播放页入口 | 开关立即生效；预设切换与 Mac 数值一致 |
| 2 | 卷积混响（13 个 IR、4ch 真立体声、Web Audio 归一化） | 与 Mac 对拍达标；切 IR 无爆音 |
| 3 | 变调 + 离线对拍 + 实机 A/B | 对拍指标达标；CPU 在可接受范围 |

每批都会：`tsc` + `eslint` → 模拟器实测 → 出 IPA → 更新 `docs/RELEASE-IPA.md` → commit + tag。

---

## 五、明确不做（本功能范围外）

- Mac 的「另存预设 / 右键删除预设」（用户自定义预设存在主进程配置文件里，iOS 没有对应 UI）
- 音频输出设备选择（iOS 由系统控制）
- 音频可视化（AnalyserNode 那部分）
- 桌面歌词的音效联动

---

## 六、已确认（2026-11-23）

1. **总开关**：加「启用音效」，默认关；关 = 不挂 tap，播放路径与 1.4.48 完全一致。
2. **变调**：分两批，先上 EQ / 混响 / 环绕 / 增益，变调单独一批，质量不达标就不发。
3. **入口**：设置 → 音效 分区 + 播放页 tune 图标。

---

## 七、进度

- **批次 0（验证）通过**：MTAudioProcessingTap 与缓存代理兼容；seek / 切歌 / 后台正常。
- **批次 1 已完成（1.4.49 / build 73）**：EQ×10、干声增益、压缩器、3D 环绕、设置页、播放页入口、总开关。
- **批次 2 已完成（1.4.50 / build 74）**：13 个 IR、4ch 真立体声、Web Audio 归一化、
  环境音效增益、48k IR 重采样、后台建核。
- **批次 3 已完成（1.4.51 / build 75）**：相位声码器变调（0.5x–1.5x），离线频率验证通过。
- **整链离线对拍已完成（1.4.52）**：见 `docs/AUDIO-AB.md`，总电平差 0.30dB、波形相关 0.9992。
- 1.4.52：播放速度并入「变调和变速」区块。
