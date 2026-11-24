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
                    // 只保留播放状态图标：进度与倒计时由 App 推送，后台会被系统限流后停住
                    Image(systemName: context.state.isPlaying ? "waveform" : "pause.fill")
                        .font(.caption)
                        .foregroundStyle(Color(jkHex: context.attributes.primaryHex))
                }
            }
            .padding(14)
            .activityBackgroundTint(Color.black.opacity(0.6))
            .activitySystemActionForegroundColor(Color(jkHex: context.attributes.primaryHex))
        } dynamicIsland: { context in
            let accent = Color(jkHex: context.attributes.primaryHex)
            return DynamicIsland {
                // 展开态：顶部封面 + 歌名
                DynamicIslandExpandedRegion(.leading) {
                    ArtworkView(base64: context.attributes.artworkBase64, size: 44, corner: 10)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Image(systemName: context.state.isPlaying ? "waveform" : "pause.fill")
                        .font(.caption2)
                        .foregroundStyle(accent)
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
                    // 进度条已移除：App 后台被限流后进度会停住，只保留播放状态
                    HStack(spacing: 6) {
                        Image(systemName: context.state.isPlaying ? "waveform" : "pause.fill")
                            .font(.caption2)
                            .foregroundStyle(accent)
                        Text(context.state.isPlaying ? "正在播放" : "已暂停")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                ArtworkView(base64: context.attributes.artworkBase64, size: 20, corner: 5)
            } compactTrailing: {
                // 不再显示倒计时（App 推送的进度在后台会被系统限流）
                Image(systemName: context.state.isPlaying ? "waveform" : "pause.fill")
                    .font(.caption2)
                    .foregroundStyle(accent)
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
