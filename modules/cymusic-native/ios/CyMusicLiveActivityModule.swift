import ActivityKit
import ExpoModulesCore
import Foundation

/// 灵动岛 / 锁屏实时活动桥接。
/// JS 侧在播放状态变化时调用；不支持 Live Activity 时所有调用静默跳过。
public final class CyMusicLiveActivityModule: Module {
  private static var activity: Any? = nil

  public func definition() -> ModuleDefinition {
    Name("CyMusicLiveActivity")

    Function("isSupported") { () -> Bool in
      if #available(iOS 16.1, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("start") {
      (title: String, artist: String, primaryHex: String, duration: Double, progress: Double, isPlaying: Bool, artworkBase64: String) in
      guard #available(iOS 16.1, *) else { return }
      let enabled = ActivityAuthorizationInfo().areActivitiesEnabled
      NSLog("[LiveActivity] start enabled=\(enabled) existing=\(Activity<JKMUSICLiveActivityAttributes>.activities.count)")
      guard enabled else { return }
      // 进程重启后 static 引用是 nil，这里把系统里残留的活动一起清掉再开新的
      NSLog("[LiveActivity] existing before start=\(Activity<JKMUSICLiveActivityAttributes>.activities.count)")
      await Self.endAllAsync()

      let state = JKMUSICLiveActivityAttributes.ContentState(progress: progress, isPlaying: isPlaying)

      func request(artwork: String) throws -> Activity<JKMUSICLiveActivityAttributes> {
        let attributes = JKMUSICLiveActivityAttributes(
          title: title,
          artist: artist,
          primaryHex: primaryHex,
          duration: duration,
          artworkBase64: artwork
        )
        return try Activity<JKMUSICLiveActivityAttributes>.request(
          attributes: attributes,
          content: ActivityContent(state: state, staleDate: Date().addingTimeInterval(30 * 60)),
          pushType: nil
        )
      }

      do {
        Self.activity = try request(artwork: artworkBase64)
      } catch {
        NSLog("[LiveActivity] start failed: \(error.localizedDescription)")
        // ActivityAttributes 有 4KB 上限：封面过大时去掉封面重试，保证灵动岛仍能显示
        if !artworkBase64.isEmpty {
          do {
            Self.activity = try request(artwork: "")
            NSLog("[LiveActivity] retried without artwork")
          } catch {
            NSLog("[LiveActivity] retry failed: \(error.localizedDescription)")
          }
        }
      }
    }

    AsyncFunction("update") { (progress: Double, isPlaying: Bool) in
      guard #available(iOS 16.1, *) else { return }
      // App 被杀后重启：static 引用丢了，从系统活动列表里认领回来，否则进度永远不更新
      if Self.activity == nil {
        Self.activity = Activity<JKMUSICLiveActivityAttributes>.activities.first
      }
      guard let activity = Self.activity as? Activity<JKMUSICLiveActivityAttributes> else { return }
      let state = JKMUSICLiveActivityAttributes.ContentState(progress: progress, isPlaying: isPlaying)
      await activity.update(ActivityContent(state: state, staleDate: Date().addingTimeInterval(30 * 60)))
    }

    AsyncFunction("end") {
      guard #available(iOS 16.1, *) else { return }
      Self.endAll()
    }
  }

  /// 结束系统里所有本 App 的实时活动（包括进程重启前的残留）。
  /// 必须 await：否则新活动可能在旧活动还没结束时发起，岛上仍显示旧的封面。
  @available(iOS 16.1, *)
  private static func endAllAsync() async {
    for activity in Activity<JKMUSICLiveActivityAttributes>.activities {
      let state = JKMUSICLiveActivityAttributes.ContentState(progress: 0, isPlaying: false)
      await activity.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .immediate)
    }
    Self.activity = nil
  }

  @available(iOS 16.1, *)
  private static func endAll() {
    Task { await endAllAsync() }
  }

  @available(iOS 16.1, *)
  private static func endInternal() {
    guard let current = activity as? Activity<JKMUSICLiveActivityAttributes> else { return }
    let state = JKMUSICLiveActivityAttributes.ContentState(progress: 0, isPlaying: false)
    Task {
      await current.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .immediate)
    }
    activity = nil
  }
}
