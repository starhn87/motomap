import ExpoModulesCore
import UIKit

// Expo가 생성하는 AppDelegate를 직접 수정하지 않고 KNSDK 공식 수명주기 훅을 전달한다.
// 초기화 여부 확인은 ObjC 브리지 안에 둬, 내비를 쓰지 않은 세션에서 SDK가 깨어나지 않게 한다.
public final class KNNaviAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func applicationWillResignActive(_ application: UIApplication) {
    KNSDKBridge.handleWillResignActive()
  }

  public func applicationDidEnterBackground(_ application: UIApplication) {
    KNSDKBridge.handleDidEnterBackground()
  }

  public func applicationWillEnterForeground(_ application: UIApplication) {
    KNSDKBridge.handleWillEnterForeground()
  }

  public func applicationDidBecomeActive(_ application: UIApplication) {
    KNSDKBridge.handleDidBecomeActive()
  }

  public func applicationWillTerminate(_ application: UIApplication) {
    KNSDKBridge.handleWillTerminate()
  }
}
