internal import Expo
import React
import ReactAppDependencyProvider
import Darwin

/**
 崩溃取证：后台被系统杀掉 / 音频线程崩溃时，App 是「直接消失」的，
 用户只能看到「重开之后进度还在、但没在播」。
 这里做两件事，都不改变播放行为：
   1) 安装未捕获异常 + 致命信号处理，把栈写到 Documents/jk-last-crash.txt
   2) 启动时写运行标记 jk-run.marker；正常退出才删。
      下次启动发现标记还在 → 上次是异常结束，写到 jk-last-abnormal-exit.txt
 JS 侧启动时读这两个文件，写进「播放诊断」页。
 */
final class CrashForensics {
  static let shared = CrashForensics()

  private var signalFd: Int32 = -1
  private let fm = FileManager.default

  private var documents: String {
    NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true).first ?? NSTemporaryDirectory()
  }
  private var markerPath: String { (documents as NSString).appendingPathComponent("jk-run.marker") }
  private var abnormalPath: String { (documents as NSString).appendingPathComponent("jk-last-abnormal-exit.txt") }
  private var crashPath: String { (documents as NSString).appendingPathComponent("jk-last-crash.txt") }

  func install() {
    installUncaughtExceptionHandler()
    installSignalHandlers()
    checkPreviousRun()
  }

  /// 正常退出（用户上划关闭）才会走这里
  func markCleanExit() {
    try? fm.removeItem(atPath: markerPath)
  }

  private func checkPreviousRun() {
    let exists = fm.fileExists(atPath: markerPath)
    if exists {
      let prev = (try? String(contentsOfFile: markerPath, encoding: .utf8)) ?? "unknown"
      let line = "abnormal-exit|\(ISO8601DateFormatter().string(from: Date()))|\(prev)\n"
      appendFile(abnormalPath, line)
    }
    let now = "\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?")|\(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?")|\(ISO8601DateFormatter().string(from: Date()))"
    try? now.write(toFile: markerPath, atomically: true, encoding: .utf8)
  }

  private func appendFile(_ path: String, _ text: String) {
    if let handle = FileHandle(forWritingAtPath: path) {
      handle.seekToEndOfFile()
      handle.write(text.data(using: .utf8) ?? Data())
      try? handle.close()
    } else {
      try? text.write(toFile: path, atomically: true, encoding: .utf8)
    }
  }

  private func installUncaughtExceptionHandler() {
    NSSetUncaughtExceptionHandler { exception in
      let stack = exception.callStackSymbols.joined(separator: "\n")
      let text = "exception|\(exception.name.rawValue)|\(exception.reason ?? "")\n\(stack)\n"
      CrashForensics.shared.appendFile(CrashForensics.shared.crashPath, text)
    }
  }

  private func installSignalHandlers() {
    // 预先打开 fd：信号处理里只能用 async-signal-safe 的 write/backtrace
    signalFd = open(crashPath, O_CREAT | O_WRONLY | O_APPEND, 0o644)
    jkCrashSignalFd = signalFd
    let signals: [Int32] = [SIGABRT, SIGSEGV, SIGBUS, SIGILL, SIGFPE, SIGTRAP]
    for sig in signals {
      signal(sig, { s in
        // 注意：信号处理里不能碰 Foundation（格式化、加锁、分配都会死锁）
        let msg: StaticString
        switch s {
        case SIGABRT: msg = "\nsignal SIGABRT\n"
        case SIGSEGV: msg = "\nsignal SIGSEGV\n"
        case SIGBUS: msg = "\nsignal SIGBUS\n"
        case SIGILL: msg = "\nsignal SIGILL\n"
        case SIGFPE: msg = "\nsignal SIGFPE\n"
        case SIGTRAP: msg = "\nsignal SIGTRAP\n"
        default: msg = "\nsignal OTHER\n"
        }
        msg.withUTF8Buffer { buf in
          if let base = buf.baseAddress {
            _ = write(jkCrashSignalFd, base, buf.count)
          }
        }
        var frames = [UnsafeMutableRawPointer?](repeating: nil, count: 64)
        let n = backtrace(&frames, 64)
        backtrace_symbols_fd(frames, n, jkCrashSignalFd)
        // 恢复默认处理，让系统照常写 .ips
        signal(s, SIG_DFL)
        raise(s)
      })
    }
  }
}

/// 信号处理里要用的 fd（不能用实例属性，避免访问到未初始化/加锁的对象）
private var jkCrashSignalFd: Int32 = -1

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    CrashForensics.shared.install()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }

  public override func applicationWillTerminate(_ application: UIApplication) {
    CrashForensics.shared.markCleanExit()
    super.applicationWillTerminate(application)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
