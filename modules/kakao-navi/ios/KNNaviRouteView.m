#import "KNNaviRouteView.h"
#import <KNSDK/KNComponentView.h>
#import <objc/runtime.h>
#import <string.h>

// 공개 화면 설정에는 안전운행 비활성화가 없다. 고정한 KNSDK 1.12.14의
// 모드 렌더 경계만 하위 클래스에서 제한하며 다른 SDK 인스턴스는 변경하지 않는다.
@interface KNNaviView (MotoMapModeBoundary)
- (void)naviMode:(NSUInteger)mode;
@end

@interface KNNaviRouteView ()
@property(nonatomic, readwrite) BOOL didBlockSafetyMode;
@property(nonatomic, readwrite) BOOL mapDetached;
@end

static IMP gOriginalMapState = NULL;
static void MotoMapMapState(KNNaviRouteView *view, SEL selector, KNNaviMapView *map, MapState state) {
  ((void (*)(id, SEL, id, MapState))gOriginalMapState)(view, selector, map, state);
  if (map != view.mapView || state > MapState_CurPos) return;
  BOOL detached = state != MapState_None && state != MapState_CurPos;
  if (view.mapDetached == detached) return;
  view.mapDetached = detached;
  if (view.onMapTrackingChanged) view.onMapTrackingChanged(detached);
}

@implementation KNNaviRouteView

+ (BOOL)isSDKMapStateBoundaryCompatible {
  static dispatch_once_t once;
  static BOOL installed = NO;
  dispatch_once(&once, ^{
    SEL selector = NSSelectorFromString(@"naviMapView:mapState:");
    Method method = class_getInstanceMethod(KNNaviView.class, selector);
    if (!method || method_getNumberOfArguments(method) != 4) return;
    char result[16] = {0}, map[16] = {0}, state[16] = {0};
    method_getReturnType(method, result, sizeof(result));
    method_getArgumentType(method, 2, map, sizeof(map));
    method_getArgumentType(method, 3, state, sizeof(state));
    if (strcmp(result, @encode(void)) || strcmp(map, @encode(id)) || strcmp(state, @encode(MapState))) return;
    gOriginalMapState = method_getImplementation(method);
    // 호환될 때만 우리 하위 클래스에 경계를 추가한다. SDK 전체나 다른 인스턴스는 바꾸지 않는다.
    installed = class_addMethod(KNNaviRouteView.class, selector, (IMP)MotoMapMapState, method_getTypeEncoding(method));
  });
  return installed;
}


+ (BOOL)isSDKModeBoundaryCompatible {
  Method method = class_getInstanceMethod(KNNaviView.class, @selector(naviMode:));
  if (!method || method_getNumberOfArguments(method) != 3) return NO;
  char result[16] = {0}, argument[16] = {0};
  method_getReturnType(method, result, sizeof(result));
  method_getArgumentType(method, 2, argument, sizeof(argument));
  return strcmp(result, @encode(void)) == 0 && strcmp(argument, @encode(NSUInteger)) == 0;
}

- (void)naviMode:(NSUInteger)mode {
  // 초기화 중 호출도 화면을 붙이기 전에 막는다. 안내 엔진 상태는 바꾸지 않는다.
  if (mode != KNNaviMode_Drive && mode != KNNaviMode_RouteSimul) {
    self.didBlockSafetyMode = YES;
    if (self.onSafetyModeBlocked) self.onSafetyModeBlocked();
    return;
  }
  [super naviMode:mode];
}

- (void)resumeRouteModeForPreview:(BOOL)preview {
  // 실제 guideStarted 뒤에만 호출한다. 끝난 경로를 안내 중으로 위장하지 않는다.
  [self naviMode:preview ? KNNaviMode_RouteSimul : KNNaviMode_Drive];
}

@end
