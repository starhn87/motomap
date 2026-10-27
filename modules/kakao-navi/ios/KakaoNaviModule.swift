import ExpoModulesCore

// KNSDK 코드를 reject 코드 뒤에 붙인다 — JS 는 문구가 아니라 이 코드로 분기한다
// (예: E_KNSDK_ROUTE_20413). SDK 밖에서 난 실패는 접미사 없이 그대로.
private func rejectCode(_ base: String, _ knCode: String?) -> String {
  guard let knCode, !knCode.isEmpty else { return base }
  return "\(base)_\(knCode)"
}

// 카카오내비 SDK 브리지. 우선 초기화(인증)만 노출해 앱 키·번들 ID 조합이
// 통과하는지 확인한다 — 여기서 막히면 길안내 화면을 붙일 이유가 없다.
// KNSDK 호출은 KNSDKBridge(ObjC)를 거친다. 이유는 그 헤더 주석 참고.
public class KakaoNaviModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KakaoNavi")

    // JS가 앱 버전 문자열을 추측하지 않고 실제 바이너리 기능을 확인한다.
    // 기능을 추가·삭제하거나 wire 계약이 바뀌면 bridgeVersion을 올린다.
    Constants([
      "bridgeVersion": 30,
      "features": [
        "bike_route_preview",
        "guide_options",
        "custom_car_image_guard",
        "app_lifecycle_forwarding",
        "accessibility_nil_guard",
        "location_privacy_stop",
        "guide_web_bottom",
        "guide_route_editing",
        "guide_poi_tap",
        "guide_gas_price_markers",
        "guide_arrival_record",
      ],
    ])

    AsyncFunction("initialize") { (appKey: String, promise: Promise) in
      let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
      KNSDKBridge.initialize(withAppKey: appKey, clientVersion: version) { errorCode, errorMessage in
        if let errorMessage {
          promise.reject(rejectCode("E_KNSDK_INIT", errorCode), errorMessage)
        } else {
          promise.resolve(true)
        }
      }
    }.runOnQueue(.main)

    AsyncFunction("setLocationUseAllowed") { (allowed: Bool) in
      KNSDKBridge.setLocationUseAllowed(allowed)
    }.runOnQueue(.main)

    AsyncFunction("stopLocationUse") { (promise: Promise) in
      KNNaviPresenter.stopLocationUse {
        promise.resolve(nil)
      }
    }.runOnQueue(.main)

    // 이륜차 경로 — 길안내 전 미리보기용. 안내와 같은 엔진이라 결과가 일치한다.
    AsyncFunction("requestBikeRoute") {
      (startLng: Double, startLat: Double, goalLng: Double, goalLat: Double, vias: [Double],
       priority: Int, promise: Promise) in
      KNSDKBridge.requestBikeRoute(
        fromLng: startLng, lat: startLat, toLng: goalLng, lat: goalLat,
        vias: vias.map { NSNumber(value: $0) }, priority: priority
      ) { errorCode, errorMessage, distance, duration, polyline in
        if let errorMessage {
          promise.reject(rejectCode("E_KNSDK_ROUTE", errorCode), errorMessage)
        } else {
          promise.resolve([
            "distance": distance,
            "duration": duration,
            "polyline": polyline ?? [],
          ])
        }
      }
    }.runOnQueue(.main)

    // 길안내는 네이티브 전체화면으로 띄운다(이유는 KNNaviPresenter.h 참고).
    // 경로 탐색이 비동기라 결과는 이벤트로 알린다.
    Events("onGuideStarted", "onGuideArrival", "onGuideEnd", "onGuideFailed", "onGuideMenu", "onGuidePoiTap")

    AsyncFunction("startGuide") {
      (startLng: Double, startLat: Double, goalLng: Double, goalLat: Double, goalName: String,
       vias: [Double], priority: Int, preview: Bool) in
      KNNaviPresenter.present(
        fromLng: startLng, lat: startLat, toLng: goalLng, lat: goalLat, name: goalName,
        vias: vias.map { NSNumber(value: $0) },
        priority: priority,
        preview: preview,
        onStarted: { [weak self] in
          self?.sendEvent("onGuideStarted", [:])
        },
        onMenu: { [weak self] menuId in
          self?.sendEvent("onGuideMenu", ["id": menuId])
        },
        onPoiTap: { [weak self] name, lng, lat in
          self?.sendEvent("onGuidePoiTap", ["name": name, "longitude": lng, "latitude": lat])
        },
        onArrival: { [weak self] event in
          self?.sendEvent("onGuideArrival", [
            "latitude": event["latitude"], "longitude": event["longitude"],
            "name": event["name"], "distance": event["distance"],
          ])
        },
        onDismiss: { [weak self] in
          self?.sendEvent("onGuideEnd", [:])
        },
        onError: { [weak self] code, message in
          self?.sendEvent("onGuideFailed", ["code": code as Any, "message": message, "preserveActive": code == "ACTIVE_GUIDE"])
        }
      )
    }.runOnQueue(.main)

    AsyncFunction("openGuidePreview") { (promise: Promise) in
      KNNaviPresenter.openGuidePreview { snapshot, error in
        if let error { promise.reject("E_KNSDK_PREVIEW", error) }
        else { promise.resolve(snapshot) }
      }
    }.runOnQueue(.main)

    AsyncFunction("returnToGuide") { (token: Int, promise: Promise) in
      KNNaviPresenter.returnToGuide(token) { restored in promise.resolve(restored) }
    }.runOnQueue(.main)

    AsyncFunction("resumeGuide") { (token: Int, lng: Double, lat: Double, name: String,
      vias: [Double], priority: Int, promise: Promise) in
      KNNaviPresenter.resumeGuide(token, toLng: lng, lat: lat, name: name,
        vias: vias.map { NSNumber(value: $0) }, priority: priority) { result, error in
        if let error {
          let failure = error as NSError
          promise.reject(failure.domain, failure.localizedDescription)
        }
        else { promise.resolve(result) }
      }
    }.runOnQueue(.main)

    // 안내 화면 위 액션시트 — JS 가 항목을 채우고, 고른 인덱스를 받는다(취소 -1)
    AsyncFunction("showGuideOptions") { (title: String, labels: [String], promise: Promise) in
      KNNaviPresenter.showOptions(withTitle: title, labels: labels) { picked in
        promise.resolve(picked)
      }
    }

    AsyncFunction("showGuidePoiOptions") { (title: String, canAddVia: Bool, promise: Promise) in
      KNNaviPresenter.showPoiOptions(title: title, canAddVia: canAddVia) { picked in promise.resolve(picked) }
    }.runOnQueue(.main)

    AsyncFunction("showGuideHazardOptions") { (options: [[String: String]], promise: Promise) in
      KNNaviPresenter.showHazardOptions(options) { picked in promise.resolve(picked) }
    }.runOnQueue(.main)

    AsyncFunction("getGuideGasPriceContext") { () -> [AnyHashable: Any]? in
      return KNNaviPresenter.guideGasPriceContext()
    }.runOnQueue(.main)
    AsyncFunction("updateGuideGasPriceMarkers") { (json: String) in
      KNNaviPresenter.updateGuideGasPriceMarkers(json)
    }.runOnQueue(.main)

    AsyncFunction("getGuideGasContext") { () -> [AnyHashable: Any]? in
      return KNNaviPresenter.guideGasContext()
    }.runOnQueue(.main)
    AsyncFunction("takeGuideGasSelection") { () -> [AnyHashable: Any]? in
      return KNNaviPresenter.takeGuideGasSelection()
    }.runOnQueue(.main)
    AsyncFunction("updateGuideGasStations") { (json: String) in
      KNNaviPresenter.updateGuideGasStations(json)
    }.runOnQueue(.main)

    AsyncFunction("showGuideToast") { (message: String) in
      KNNaviPresenter.showToast(message)
    }.runOnQueue(.main)

    AsyncFunction("showGuideNotice") { (message: String) in
      KNNaviPresenter.showNotice(message)
    }

    AsyncFunction("changeGuideDestination") {
      (lng: Double, lat: Double, name: String, priority: Int, promise: Promise) in
      KNNaviPresenter.changeDestination(toLng: lng, lat: lat, name: name, priority: priority) {
        errorCode, errorMessage in
        if let errorMessage {
          promise.reject(rejectCode("E_KNSDK_DEST", errorCode), errorMessage)
        } else {
          promise.resolve(true)
        }
      }
    }
  }
}
