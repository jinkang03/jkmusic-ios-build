import ActivityKit
import SwiftUI
import WidgetKit

private extension Color {
    init(jkHex: String) {
        var s = jkHex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if s.hasPrefix("#") { s.removeFirst() }
        var value: UInt64 = 0
        Scanner(string: s).scanHexInt64(&value)
        let r = Double((value >> 16) & 0xFF) / 255.0
        let g = Double((value >> 8) & 0xFF) / 255.0
        let b = Double(value & 0xFF) / 255.0
        self.init(red: r, green: g, blue: b)
    }
}

/// 封面：直接用 attributes 里的 96x96 base64 解码，不依赖网络
private struct ArtworkView: View {
    let base64: String
    var size: CGFloat = 40
    var corner: CGFloat = 9

    var body: some View {
        Group {
            if let data = Data(base64Encoded: base64), let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    Color.white.opacity(0.14)
                    Image(systemName: "music.note")
                        .font(.system(size: size * 0.45))
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: corner, style: .continuous))
    }
}

/// 细线进度条（锁屏卡片用）
private struct ProgressLine: View {
    let progress: Double
    let color: Color

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(color.opacity(0.22))
                Capsule()
                    .fill(color)
                    .frame(width: max(0, min(1, progress)) * geo.size.width)
            }
        }
    }
}

private func remainingText(duration: Double, progress: Double) -> String {
    let left = max(0, duration * (1 - max(0, min(1, progress))))
    let total = Int(left.rounded())
    return String(format: "%d:%02d", total / 60, total % 60)
}

@available(iOS 16.1, *)
struct JKMUSICLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: JKMUSICLiveActivityAttributes.self) { context in
            // 锁屏 / 通知中心卡片：封面 + 歌名 + 进度 + 剩余时间
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .center, spacing: 10) {
                    ArtworkView(base64: context.attributes.artworkBase64, size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.title)
                            .font(.headline)
                            .lineLimit(1)
                        Text(context.attributes.artist)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Image(systemName: context.state.isPlaying ? "waveform" : "pause.fill")
                            .font(.caption)
                            .foregroundStyle(Color(jkHex: context.attributes.primaryHex))
                        Text(remainingText(duration: context.attributes.duration, progress: context.state.progress))
                            .font(.caption2)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                }
                ProgressLine(
                    progress: context.state.progress,
                    color: Color(jkHex: context.attributes.primaryHex)
                )
                .frame(height: 2)
            }
            .padding(14)
            .activityBackgroundTint(Color.black.opacity(0.6))
            .activitySystemActionForegroundColor(Color(jkHex: context.attributes.primaryHex))
        } dynamicIsland: { context in
            let accent = Color(jkHex: context.attributes.primaryHex)
            let progress = max(0, min(1, context.state.progress))
            let remaining = max(0, context.attributes.duration * (1 - progress))
            return DynamicIsland {
                // 展开态：顶部封面 + 歌名
                DynamicIslandExpandedRegion(.leading) {
                    ArtworkView(base64: context.attributes.artworkBase64, size: 44, corner: 10)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(remainingText(duration: context.attributes.duration, progress: progress))
                            .font(.caption2)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                        Image(systemName: context.state.isPlaying ? "waveform" : "pause.fill")
                            .font(.caption2)
                            .foregroundStyle(accent)
                    }
                    .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.title)
                            .font(.caption)
                            .fontWeight(.semibold)
                            .lineLimit(1)
                        Text(context.attributes.artist)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    // 边缘进度：沿圆角卡片边缘走一圈（trim 描边）
                    ZStack {
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .strokeBorder(.white.opacity(0.12), lineWidth: 1)
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .trim(from: 0, to: max(0.005, progress))
                            .stroke(
                                accent,
                                style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round)
                            )
                        HStack(spacing: 8) {
                            Text(context.attributes.title)
                                .font(.caption2)
                                .lineLimit(1)
                            Spacer(minLength: 6)
                            Text("\(Int(progress * 100))%")
                                .font(.caption2)
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 12)
                    }
                    .frame(height: 40)
                    .padding(.top, 2)
                }
            } compactLeading: {
                ArtworkView(base64: context.attributes.artworkBase64, size: 20, corner: 5)
            } compactTrailing: {
                // 紧凑态放不下「沿边缘」的进度（系统只给左右两个圆区），改为倒计时
                if context.state.isPlaying {
                    Text(timerInterval: Date.now...Date.now.addingTimeInterval(remaining), countsDown: true)
                        .font(.caption2)
                        .monospacedDigit()
                        .frame(width: 44)
                        .foregroundStyle(accent)
                } else {
                    Image(systemName: "pause.fill")
                        .font(.caption2)
                        .foregroundStyle(accent)
                }
            } minimal: {
                ArtworkView(base64: context.attributes.artworkBase64, size: 20, corner: 5)
            }
            .keylineTint(accent)
        }
    }
}

@main
struct JKMUSICWidgetBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.1, *) {
            JKMUSICLiveActivityWidget()
        }
    }
}
