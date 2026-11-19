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
      (title: String, artist: String, primaryHex: String, duration: Double, progress: Double, isPlaying: Bool) in
      guard #available(iOS 16.1, *) else { return }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
      Self.endInternal()

      let attributes = JKMUSICLiveActivityAttributes(
        title: title,
        artist: artist,
        primaryHex: primaryHex,
        duration: duration
      )
      let state = JKMUSICLiveActivityAttributes.ContentState(progress: progress, isPlaying: isPlaying)
      do {
        let content = ActivityContent(state: state, staleDate: nil)
        let activity = try Activity<JKMUSICLiveActivityAttributes>.request(
          attributes: attributes,
          content: content,
          pushType: nil
        )
        Self.activity = activity
      } catch {
        NSLog("[LiveActivity] start failed: \(error.localizedDescription)")
      }
    }

    AsyncFunction("update") { (progress: Double, isPlaying: Bool) in
      guard #available(iOS 16.1, *) else { return }
      guard let activity = Self.activity as? Activity<JKMUSICLiveActivityAttributes> else { return }
      let state = JKMUSICLiveActivityAttributes.ContentState(progress: progress, isPlaying: isPlaying)
      await activity.update(ActivityContent(state: state, staleDate: nil))
    }

    AsyncFunction("end") {
      guard #available(iOS 16.1, *) else { return }
      Self.endInternal()
    }
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
