#import "KNNaviGuideSurface.h"
#import <React-RCTAppDelegate/RCTRootViewFactory.h>
#import <ReactCommon/RCTHost.h>
#import <React/RCTFabricSurface.h>
#import <React/RCTSurfaceHostingProxyRootView.h>

@implementation KNNaviGuideSurface
+ (UIView *)viewWithRootFactory:(NSObject *)factory props:(NSDictionary *)props {
  // 앱의 기존 Hermes를 공유하고, 앱 시작용 SplashScreen 콜백은 호출하지 않는다.
  RCTHost *host = ((RCTRootViewFactory *)factory).reactHost;
  if (!host) return nil;
  return [[RCTSurfaceHostingProxyRootView alloc]
      initWithSurface:[host createSurfaceWithModuleName:@"MotoMapGuidePanel" initialProperties:props]];
}
@end
