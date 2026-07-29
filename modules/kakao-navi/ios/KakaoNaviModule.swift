import ExpoModulesCore

// 카카오내비 SDK 브리지. 우선 초기화(인증)만 노출해 앱 키·번들 ID 조합이
// 통과하는지 확인한다 — 여기서 막히면 길안내 화면을 붙일 이유가 없다.
// KNSDK 호출은 KNSDKBridge(ObjC)를 거친다. 이유는 그 헤더 주석 참고.
public class KakaoNaviModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KakaoNavi")

    AsyncFunction("initialize") { (appKey: String, promise: Promise) in
      let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
      KNSDKBridge.initialize(withAppKey: appKey, clientVersion: version) { errorMessage in
        if let errorMessage {
          promise.reject("E_KNSDK_INIT", errorMessage)
        } else {
          promise.resolve(true)
        }
      }
    }

    // 이륜차 경로 — 길안내 전 미리보기용. 안내와 같은 엔진이라 결과가 일치한다.
    AsyncFunction("requestBikeRoute") {
      (startLng: Double, startLat: Double, goalLng: Double, goalLat: Double, vias: [Double],
       priority: Int, promise: Promise) in
      KNSDKBridge.requestBikeRoute(
        fromLng: startLng, lat: startLat, toLng: goalLng, lat: goalLat,
        vias: vias.map { NSNumber(value: $0) }, priority: priority
      ) { errorMessage, distance, duration, polyline in
        if let errorMessage {
          promise.reject("E_KNSDK_ROUTE", errorMessage)
        } else {
          promise.resolve([
            "distance": distance,
            "duration": duration,
            "polyline": polyline ?? [],
          ])
        }
      }
    }

    // 길안내는 네이티브 전체화면으로 띄운다(이유는 KNNaviPresenter.h 참고).
    // 경로 탐색이 비동기라 결과는 이벤트로 알린다.
    Events("onGuideStarted", "onGuideEnd", "onGuideFailed", "onGuideMenu")

    AsyncFunction("startGuide") {
      (startLng: Double, startLat: Double, goalLng: Double, goalLat: Double, goalName: String,
       vias: [Double], priority: Int) in
      KNNaviPresenter.present(
        fromLng: startLng, lat: startLat, toLng: goalLng, lat: goalLat, name: goalName,
        vias: vias.map { NSNumber(value: $0) },
        priority: priority,
        onStarted: { [weak self] in
          self?.sendEvent("onGuideStarted", [:])
        },
        onMenu: { [weak self] menuId in
          self?.sendEvent("onGuideMenu", ["id": menuId])
        },
        onDismiss: { [weak self] in
          self?.sendEvent("onGuideEnd", [:])
        },
        onError: { [weak self] message in
          self?.sendEvent("onGuideFailed", ["message": message])
        }
      )
    }

    // 안내 화면 위 액션시트 — JS 가 항목을 채우고, 고른 인덱스를 받는다(취소 -1)
    AsyncFunction("showGuideOptions") { (title: String, labels: [String], promise: Promise) in
      KNNaviPresenter.showOptions(withTitle: title, labels: labels) { picked in
        promise.resolve(picked)
      }
    }

    AsyncFunction("showGuideNotice") { (message: String) in
      KNNaviPresenter.showNotice(message)
    }

    AsyncFunction("changeGuideDestination") {
      (lng: Double, lat: Double, name: String, priority: Int, promise: Promise) in
      KNNaviPresenter.changeDestination(toLng: lng, lat: lat, name: name, priority: priority) {
        errorMessage in
        if let errorMessage {
          promise.reject("E_KNSDK_DEST", errorMessage)
        } else {
          promise.resolve(true)
        }
      }
    }
  }
}
