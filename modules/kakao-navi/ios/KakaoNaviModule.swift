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

    // 이륜차 경로. 지금 쓰는 카카오 REST 길찾기와 결과를 견줘보기 위한 것이다.
    AsyncFunction("requestBikeRoute") {
      (startLng: Double, startLat: Double, goalLng: Double, goalLat: Double, promise: Promise) in
      KNSDKBridge.requestBikeRoute(
        fromLng: startLng, lat: startLat, toLng: goalLng, lat: goalLat
      ) { errorMessage, distance, duration in
        if let errorMessage {
          promise.reject("E_KNSDK_ROUTE", errorMessage)
        } else {
          promise.resolve(["distance": distance, "duration": duration])
        }
      }
    }
  }
}
