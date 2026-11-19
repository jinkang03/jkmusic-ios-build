import ExpoModulesCore

/// 多脚本运行时管理：
/// 原生 runtime（JSContext）原先全局唯一，切换音源脚本会销毁上一个，
/// 导致「同一时刻只有一个音源能取流」。这里改为每个脚本一个独立 runtime，
/// 由 generation 路由事件/请求，实现多音源并存（按源选脚本 + 失败级联）。
public final class CyMusicSourceModule: Module {
  private var runtimes: [String: CyMusicUserApiRuntime] = [:]
  private var order: [String] = []
  private let maxRuntimes = 8
  private var preloadURL: URL?

  public override func didCreate() {
    preloadURL = Bundle.main.url(forResource: "user-api-preload", withExtension: "js")
  }

  public override func willDestroy() {
    for runtime in runtimes.values { runtime.invalidate() }
    runtimes.removeAll()
    order.removeAll()
  }

  public override func didStartListening(event: String) {
    guard event == "api-action" else { return }
    for runtime in runtimes.values { runtime.startObserving() }
  }

  public override func didStopListening(event: String) {
    guard event == "api-action" else { return }
    for runtime in runtimes.values { runtime.stopObserving() }
  }

  /// 超出上限时淘汰最早加载的 runtime，避免导入大量脚本后 JSContext 内存失控
  private func evictIfNeeded() {
    while order.count >= maxRuntimes, let oldest = order.first {
      order.removeFirst()
      runtimes[oldest]?.invalidate()
      runtimes.removeValue(forKey: oldest)
    }
  }

  public func definition() -> ModuleDefinition {
    Name("UserApiModule")
    Events("api-action")

    Function("loadScript") { (data: [String: String]) -> String in
      guard let preload = self.preloadURL else { return "" }
      self.evictIfNeeded()
      let runtime = CyMusicUserApiRuntime(preload: preload) { [weak self] event in
        self?.emit(event: "api-action", payload: event)
      }
      runtime.startObserving()
      let generation = runtime.loadScript(data)
      self.runtimes[generation] = runtime
      self.order.append(generation)
      return generation
    }

    Function("sendAction") { (action: String, info: String, generation: String) in
      self.runtimes[generation]?.sendAction(action, info: info, generation: generation)
    }

    /// 不传 generation 时销毁全部 runtime（兼容旧调用）
    Function("destroy") { (generation: String?) -> String in
      if let target = generation, !target.isEmpty {
        self.runtimes[target]?.invalidate()
        self.runtimes.removeValue(forKey: target)
        self.order.removeAll { $0 == target }
        return target
      }
      for runtime in self.runtimes.values { runtime.invalidate() }
      self.runtimes.removeAll()
      self.order.removeAll()
      return UUID().uuidString
    }
  }
}
