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

/// 细线进度条（2pt，圆角胶囊）
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

@available(iOS 16.1, *)
struct JKMUSICLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: JKMUSICLiveActivityAttributes.self) { context in
            // 锁屏 / 通知中心卡片
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .center, spacing: 8) {
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
                    Image(systemName: context.state.isPlaying ? "waveform" : "pause.fill")
                        .font(.caption)
                        .foregroundStyle(Color(jkHex: context.attributes.primaryHex))
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
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "music.note")
                        .foregroundStyle(Color(jkHex: context.attributes.primaryHex))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(Int(context.state.progress * 100))%")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(context.attributes.title)
                            .font(.caption)
                            .lineLimit(1)
                        // 展开态：横跨整个岛的细线进度
                        ProgressLine(
                            progress: context.state.progress,
                            color: Color(jkHex: context.attributes.primaryHex)
                        )
                        .frame(height: 2)
                    }
                }
            } compactLeading: {
                Image(systemName: "music.note")
                    .foregroundStyle(Color(jkHex: context.attributes.primaryHex))
            } compactTrailing: {
                // 紧凑态：环形细进度（灵动岛宽度有限，跨岛横线由系统限制无法实现）
                ZStack {
                    Circle()
                        .stroke(Color(jkHex: context.attributes.primaryHex).opacity(0.25), lineWidth: 2)
                    Circle()
                        .trim(from: 0, to: max(0.02, min(1, context.state.progress)))
                        .stroke(Color(jkHex: context.attributes.primaryHex), style: StrokeStyle(lineWidth: 2, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
                .frame(width: 15, height: 15)
            } minimal: {
                Image(systemName: "music.note")
                    .foregroundStyle(Color(jkHex: context.attributes.primaryHex))
            }
            .keylineTint(Color(jkHex: context.attributes.primaryHex))
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
