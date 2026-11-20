import ActivityKit
import Foundation

/// 灵动岛 / 锁屏实时活动的共享数据模型。
/// 这份文件同时编译进主 App 与 Widget Extension（两个 target 引用同一份 fileRef）。
@available(iOS 16.1, *)
struct JKMUSICLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// 0...1
        var progress: Double
        var isPlaying: Bool
    }

    /// 歌名
    var title: String
    /// 歌手
    var artist: String
    /// 主题色（#RRGGBB）
    var primaryHex: String
    /// 总时长（秒）
    var duration: Double
    /// 封面：96x96 JPEG 的 base64（灵动岛/锁屏直接解码，不依赖网络）
    var artworkBase64: String
}
