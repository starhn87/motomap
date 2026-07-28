#import "KNNaviPresenter.h"
#import "KNNaviTheme.h"
#import "KNSDKBridge.h"
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNNaviView.h>

// 안내 화면을 담는 뷰 컨트롤러. 델리게이트를 받아야 해서 별도 클래스로 둔다.
// KNNaviView 는 KNGuidance 를 스스로 구독하지 않는다. 가이드 델리게이트를 여기서
// 전부 받아 naviView 로 넘겨야 화면이 갱신된다. 게다가 델리게이트를 걸지 않으면
// guidance 의 locationGuide/routeGuide 자체가 갱신되지 않는다(헤더 주석).
@interface KNNaviViewController : UIViewController <KNNaviView_GuideStateDelegate,
                                                    KNNaviView_StateDelegate,
                                                    KNGuidance_GuideStateDelegate,
                                                    KNGuidance_LocationGuideDelegate,
                                                    KNGuidance_RouteGuideDelegate,
                                                    KNGuidance_SafetyGuideDelegate,
                                                    KNGuidance_VoiceGuideDelegate,
                                                    KNGuidance_CitsGuideDelegate>
@property(nonatomic, strong, nullable) KNNaviView *naviView;
@property(nonatomic, strong, nullable) KNDriveGuidance *guidance;
@property(nonatomic, strong, nullable) KNTrip *trip;
@property(nonatomic, copy, nullable) void (^onDismiss)(void);
@property(nonatomic, copy, nullable) void (^onMenu)(NSInteger);
@property(nonatomic, assign) BOOL carThemeApplied;
@property(nonatomic, assign) KNRoutePriority priority;
@end

// 안내 화면 위 상호작용(액션시트·알림·목적지 변경)을 모듈 함수가 쓸 수 있도록
// 살아 있는 컨트롤러를 하나 기억한다.
static __weak KNNaviViewController *gActiveNavi = nil;

@implementation KNNaviViewController

- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = UIColor.blackColor;

  KNDriveGuidance *guidance = [[KNSDK sharedInstance] sharedGuidance];
  guidance.guideStateDelegate = self;
  guidance.locationGuideDelegate = self;
  guidance.routeGuideDelegate = self;
  guidance.safetyGuideDelegate = self;
  guidance.voiceGuideDelegate = self;
  guidance.citsGuideDelegate = self;

  KNNaviView *naviView = [[KNNaviView alloc] initWithGuidance:guidance
                                                         trip:self.trip
                                                  routeOption:self.priority
                                                  avoidOption:KNRouteAvoidOption_None];
  [naviView sndVolume:1.0f];
  naviView.guideStateDelegate = self;
  naviView.stateDelegate = self;
  // 주의: [naviView carType:KNCarType_Bike] 를 부르면 자차 마커가 SDK 내장
  // 바이크 캐릭터(bike_on/off.png)로 바뀌는데, 그 분기는 setCustomCarImages 를
  // 무시한다. 경로 계산 차종은 trip.routeConfig 가 들고 있으므로 뷰 쪽은
  // 건드리지 않는다 — 그래야 커스텀 마커가 적용된다.
  naviView.frame = self.view.bounds;
  naviView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  [self.view addSubview:naviView];

  self.naviView = naviView;
  self.guidance = guidance;

  [guidance startWithTrip:self.trip
                 priority:self.priority
             avoidOptions:KNRouteAvoidOption_None];

  // 모토맵 메뉴 버튼 — 커스텀 슬롯이 하나뿐이라(실측) 버튼 하나로 합치고,
  // 위험 제보/근처 장소 분기는 JS 가 1차 액션시트로 가른다.
  UIImage *menuIcon = [UIImage systemImageNamed:@"mappin.and.ellipse"];
  KNCustomBottomMenuItem *motoItem =
      [[KNCustomBottomMenuItem alloc] initWithId:100
                                            name:@"모토맵"
                                            icon:menuIcon
                                       nightIcon:menuIcon
                                           style:MENU_BUTTON_TOUCH
                                        toggleOn:NO];
  [naviView.menuView setCustomMenu:@[ motoItem ]];
  [naviView.menuView useGuideCancel:NO];

  gActiveNavi = self;
}

- (void)viewDidAppear:(BOOL)animated {
  [super viewDidAppear:animated];
  [self.naviView resumeView];

  [self applyCarTheme];
}

// 안내가 시작되거나 위치가 처음 잡히면 SDK 가 자차를 다시 그리면서
// 기본 아이콘으로 되돌린다. 그 시점마다 다시 씌운다.
- (void)applyCarTheme {
  KNNaviMapView *mapView = self.naviView.mapView;
  [mapView setCustomCarImages:[KNNaviTheme carImages] anchor:[KNNaviTheme carAnchor]];

  // setCustomCarImages 는 내부에서 trip.routeConfig.carType 을 읽어 이륜차(6)면
  // carImageType 을 2(내장 바이크 아이콘)로 강제한다 — 1.10.9 디스어셈블로 확인.
  // 커스텀 배열은 이미 저장돼 있으므로 type 만 0(커스텀)으로 되돌리고 테마를 다시 그린다.
  SEL typeSel = NSSelectorFromString(@"carImageType:");
  SEL renewSel = NSSelectorFromString(@"renewTheme");
  if ([mapView respondsToSelector:typeSel] && [mapView respondsToSelector:renewSel]) {
    void (*setType)(id, SEL, NSInteger) =
        (void (*)(id, SEL, NSInteger))[mapView methodForSelector:typeSel];
    setType(mapView, typeSel, 0);
    void (*renew)(id, SEL) = (void (*)(id, SEL))[mapView methodForSelector:renewSel];
    renew(mapView, renewSel);
  }
}

- (void)naviViewGuideEnded:(KNNaviView *)aNaviView {
  [self finish];
}

- (void)naviViewGuideState:(KNGuideState)aGuideState {
}

#pragma mark - KNNaviView_StateDelegate (메뉴 탭 외에는 관심 없음)

- (void)naviViewDidMenuItemWithId:(int)aId toggle:(BOOL)aToggle {
  if (self.onMenu != nil) self.onMenu(aId);
}

- (void)naviViewDidUpdateSndVolume:(float)aVolume {
}

- (void)naviViewDidUpdateUseDarkMode:(BOOL)aDarkMode {
}

- (void)naviViewDidUpdateMapCameraMode:(MapViewCameraMode)aMapViewCameraMode {
}

- (void)naviViewScreenState:(KNNaviViewState)aKNNaviViewState {
}

- (void)naviViewPopupOpenCheck:(BOOL)aOpen {
}

- (void)naviViewIsArrival:(BOOL)aIsArrival {
}

#pragma mark - KNGuidance 델리게이트 → naviView 중계

- (void)guidanceGuideStarted:(KNGuidance *)aGuidance {
  [self.naviView guidanceGuideStarted:aGuidance];
  [self applyCarTheme];
}

- (void)guidanceCheckingRouteChange:(KNGuidance *)aGuidance {
  [self.naviView guidanceCheckingRouteChange:aGuidance];
}

- (void)guidanceOutOfRoute:(KNGuidance *)aGuidance {
  [self.naviView guidanceOutOfRoute:aGuidance];
}

- (void)guidanceRouteUnchanged:(KNGuidance *)aGuidance {
  [self.naviView guidanceRouteUnchanged:aGuidance];
}

- (void)guidance:(KNGuidance *)aGuidance routeUnchangedWithError:(KNError *)aError {
  [self.naviView guidance:aGuidance routeUnchangedWithError:aError];
}

- (void)guidanceRouteChanged:(KNGuidance *)aGuidance
                   fromRoute:(KNRoute *)aFromRoute
                fromLocation:(KNLocation *)aFromLocation
                     toRoute:(KNRoute *)aToRoute
                  toLocation:(KNLocation *)aToLocation
                      reason:(KNGuideRouteChangeReason)aChangeReason {
  [self.naviView guidanceRouteChanged:aGuidance];
}

- (void)guidanceGuideEnded:(KNGuidance *)aGuidance {
  [self.naviView guidanceGuideEnded:aGuidance isShowDriveResultDialog:NO];
  [self finish];
}

- (void)guidance:(KNGuidance *)aGuidance
    didUpdateRoutes:(NSArray<KNRoute *> *)aRoutes
     multiRouteInfo:(KNMultiRouteInfo *)aMultiRouteInfo {
  [self.naviView guidance:aGuidance didUpdateRoutes:aRoutes multiRouteInfo:aMultiRouteInfo];
}

- (void)guidance:(KNGuidance *)aGuidance didUpdateIndoorRoute:(KNRoute *)aRoute {
  [self.naviView guidance:aGuidance didUpdateIndoorRoute:aRoute];
}

- (void)guidance:(KNGuidance *)aGuidance didUpdateLocation:(KNGuide_Location *)aLocationGuide {
  [self.naviView guidance:aGuidance didUpdateLocation:aLocationGuide];

  if (!self.carThemeApplied) {
    self.carThemeApplied = YES;
    [self applyCarTheme];
  }
}

- (void)guidance:(KNGuidance *)aGuidance didUpdateRouteGuide:(KNGuide_Route *)aRouteGuide {
  [self.naviView guidance:aGuidance didUpdateRouteGuide:aRouteGuide];
}

- (void)guidance:(KNGuidance *)aGuidance didUpdateSafetyGuide:(KNGuide_Safety *)aSafetyGuide {
  [self.naviView guidance:aGuidance didUpdateSafetyGuide:aSafetyGuide];
}

- (void)guidance:(KNGuidance *)aGuidance
    didUpdateAroundSafeties:(NSArray<__kindof KNSafety *> *)aSafeties {
  [self.naviView guidance:aGuidance didUpdateAroundSafeties:aSafeties];
}

- (void)guidance:(KNGuidance *)aGuidance didUpdateCitsGuide:(KNGuide_Cits *)aCitsGuide {
}

- (BOOL)guidance:(KNGuidance *)aGuidance
    shouldPlayVoiceGuide:(KNGuide_Voice *)aVoiceGuide
          replaceSndData:(NSData **)aNewData {
  return YES;
}

- (void)guidance:(KNGuidance *)aGuidance willPlayVoiceGuide:(KNGuide_Voice *)aVoiceGuide {
}

- (void)guidance:(KNGuidance *)aGuidance didFinishPlayVoiceGuide:(KNGuide_Voice *)aVoiceGuide {
}

- (void)finish {
  if (gActiveNavi == self) gActiveNavi = nil;
  [self.guidance stop];
  [self.naviView releaseView];
  self.naviView = nil;
  self.guidance = nil;

  // JS 쪽 전환(지도 화면 이동)을 화면이 아직 덮인 동안 시작시킨다 —
  // 닫힘 애니메이션이 걷히면 이전 화면이 아니라 지도가 바로 보인다.
  void (^done)(void) = self.onDismiss;
  self.onDismiss = nil;
  if (done != nil) done();
  [self dismissViewControllerAnimated:YES completion:nil];
}

@end

@implementation KNNaviPresenter

+ (void)presentFromLng:(double)startLng
                   lat:(double)startLat
                 toLng:(double)goalLng
                   lat:(double)goalLat
                  name:(NSString *)goalName
                  vias:(NSArray<NSNumber *> *_Nullable)flatVias
              priority:(NSInteger)priority
                onMenu:(void (^_Nullable)(NSInteger))onMenu
             onDismiss:(void (^)(void))onDismiss
               onError:(void (^)(NSString *))onError {
  KNSDK *sdk = [KNSDK sharedInstance];
  if (sdk == nil) {
    onError(@"KNSDK 인스턴스를 가져오지 못했다");
    return;
  }

  IntPoint start = [sdk convertWGS84ToKATECWithLongitude:startLng latitude:startLat];
  IntPoint goal = [sdk convertWGS84ToKATECWithLongitude:goalLng latitude:goalLat];

  KNPOI *startPOI = [[KNPOI alloc] initWithName:@"출발" x:start.x y:start.y];
  KNPOI *goalPOI = [[KNPOI alloc] initWithName:goalName x:goal.x y:goal.y];

  [sdk makeTripWithStart:startPOI
                    goal:goalPOI
                    vias:[KNSDKBridge viasFromFlat:flatVias]
              completion:^(KNError *_Nullable tripError, KNTrip *_Nullable trip) {
                if (tripError != nil || trip == nil) {
                  onError(tripError ? [NSString stringWithFormat:@"[%@] %@", tripError.code, tripError.msg ?: @"경로 생성 실패"]
                                    : @"경로를 만들지 못했다");
                  return;
                }

                trip.routeConfig = [[KNRouteConfiguration alloc] initWithCarType:KNCarType_Bike];
                [trip routeWithPriority:(KNRoutePriority)priority
                           avoidOptions:KNRouteAvoidOption_None
                             completion:^(KNError *_Nullable routeError,
                                          NSArray<KNRoute *> *_Nullable routes) {
                               if (routeError != nil || routes.count == 0) {
                                 onError(routeError ? [NSString stringWithFormat:@"[%@] %@", routeError.code, routeError.msg ?: @"경로 탐색 실패"]
                                                    : @"경로를 찾지 못했다");
                                 return;
                               }
                               [self presentWithTrip:trip priority:(KNRoutePriority)priority onMenu:onMenu onDismiss:onDismiss onError:onError];
                             }];
              }];
}

+ (void)presentWithTrip:(KNTrip *)trip
               priority:(KNRoutePriority)priority
                 onMenu:(void (^_Nullable)(NSInteger))onMenu
              onDismiss:(void (^)(void))onDismiss
                onError:(void (^)(NSString *))onError {
  dispatch_async(dispatch_get_main_queue(), ^{
    UIWindow *window = UIApplication.sharedApplication.keyWindow;
    UIViewController *top = window.rootViewController;
    while (top.presentedViewController != nil) top = top.presentedViewController;
    if (top == nil) {
      onError(@"화면을 띄울 뷰 컨트롤러를 찾지 못했다");
      return;
    }

    KNNaviViewController *vc = [[KNNaviViewController alloc] init];
    vc.trip = trip;
    vc.priority = priority;
    vc.onMenu = onMenu;
    vc.onDismiss = onDismiss;
    vc.modalPresentationStyle = UIModalPresentationFullScreen;
    [top presentViewController:vc animated:YES completion:nil];
  });
}

+ (void)stopGuide {
  dispatch_async(dispatch_get_main_queue(), ^{
    [gActiveNavi finish];
  });
}

+ (void)showOptionsWithTitle:(NSString *)title
                      labels:(NSArray<NSString *> *)labels
                  completion:(void (^)(NSInteger))completion {
  dispatch_async(dispatch_get_main_queue(), ^{
    KNNaviViewController *navi = gActiveNavi;
    if (navi == nil) {
      completion(-1);
      return;
    }
    UIAlertController *sheet =
        [UIAlertController alertControllerWithTitle:title
                                            message:nil
                                     preferredStyle:UIAlertControllerStyleActionSheet];
    [labels enumerateObjectsUsingBlock:^(NSString *label, NSUInteger idx, BOOL *stop) {
      [sheet addAction:[UIAlertAction actionWithTitle:label
                                                style:UIAlertActionStyleDefault
                                              handler:^(UIAlertAction *action) {
                                                completion((NSInteger)idx);
                                              }]];
    }];
    [sheet addAction:[UIAlertAction actionWithTitle:@"취소"
                                              style:UIAlertActionStyleCancel
                                            handler:^(UIAlertAction *action) {
                                              completion(-1);
                                            }]];
    [navi presentViewController:sheet animated:YES completion:nil];
  });
}

+ (void)showNotice:(NSString *)message {
  dispatch_async(dispatch_get_main_queue(), ^{
    KNNaviViewController *navi = gActiveNavi;
    if (navi == nil) return;
    UIAlertController *alert = [UIAlertController alertControllerWithTitle:nil
                                                                   message:message
                                                            preferredStyle:UIAlertControllerStyleAlert];
    [navi presentViewController:alert animated:YES completion:nil];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.8 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
                     [alert dismissViewControllerAnimated:YES completion:nil];
                   });
  });
}

+ (void)changeDestinationToLng:(double)lng
                           lat:(double)lat
                          name:(NSString *)name
                      priority:(NSInteger)priority
                    completion:(void (^)(NSString *_Nullable))completion {
  dispatch_async(dispatch_get_main_queue(), ^{
    KNNaviViewController *navi = gActiveNavi;
    KNSDK *sdk = [KNSDK sharedInstance];
    if (navi == nil || navi.naviView == nil || sdk == nil) {
      completion(@"안내 화면이 없다");
      return;
    }

    // 출발점은 현 위치 — SDK 가 KATEC 으로 들고 있어 변환이 필요 없다
    KNGPSData *gps = [sdk sharedGpsManager].lastValidGpsData ?: [sdk sharedGpsManager].recentGpsData;
    if (gps == nil) {
      completion(@"현재 위치를 아직 못 잡았다");
      return;
    }
    IntPoint startPos = IntPointMakeWithDoublePoint(gps.pos);
    KNPOI *startPOI = [[KNPOI alloc] initWithName:@"출발" x:startPos.x y:startPos.y];

    IntPoint goalPos = [sdk convertWGS84ToKATECWithLongitude:lng latitude:lat];
    KNPOI *goalPOI = [[KNPOI alloc] initWithName:name x:goalPos.x y:goalPos.y];

    [sdk makeTripWithStart:startPOI
                      goal:goalPOI
                      vias:nil
                completion:^(KNError *_Nullable error, KNTrip *_Nullable trip) {
                  dispatch_async(dispatch_get_main_queue(), ^{
                    if (error != nil || trip == nil) {
                      completion(error ? [NSString stringWithFormat:@"[%@] %@", error.code, error.msg ?: @"경로 생성 실패"]
                                       : @"경로를 만들지 못했다");
                      return;
                    }
                    trip.routeConfig = [[KNRouteConfiguration alloc] initWithCarType:KNCarType_Bike];
                    [navi.naviView guideNewDestinations:trip
                                               priority:(KNRoutePriority)priority
                                           avoidOptions:KNRouteAvoidOption_None];
                    completion(nil);
                  });
                }];
  });
}

@end
