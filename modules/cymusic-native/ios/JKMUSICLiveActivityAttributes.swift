import ActivityKit
import Foundation

/// 与 Widget Extension 中的同名类型保持结构一致：
/// ActivityKit 按 attributes 类型名匹配，两侧字段必须相同。
@available(iOS 16.1, *)
struct JKMUSICLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var progress: Double
        var isPlaying: Bool
    }

    var title: String
    var artist: String
    var primaryHex: String
    var duration: Double
}
