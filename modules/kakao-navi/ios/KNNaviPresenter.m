#import "KNNaviPresenter.h"
#import "KNNaviTheme.h"
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNNaviView.h>

// 안내 화면을 담는 뷰 컨트롤러. 델리게이트를 받아야 해서 별도 클래스로 둔다.
// KNNaviView 는 KNGuidance 를 스스로 구독하지 않는다. 가이드 델리게이트를 여기서
// 전부 받아 naviView 로 넘겨야 화면이 갱신된다. 게다가 델리게이트를 걸지 않으면
// guidance 의 locationGuide/routeGuide 자체가 갱신되지 않는다(헤더 주석).
@interface KNNaviViewController : UIViewController <KNNaviView_GuideStateDelegate,
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
@property(nonatomic, assign) BOOL carThemeApplied;
@property(nonatomic, assign) KNRoutePriority priority;
@end

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
  [self.guidance stop];
  [self.naviView releaseView];
  self.naviView = nil;
  self.guidance = nil;

  void (^done)(void) = self.onDismiss;
  [self dismissViewControllerAnimated:YES
                           completion:^{
                             if (done != nil) done();
                           }];
}

@end

@implementation KNNaviPresenter

+ (void)presentFromLng:(double)startLng
                   lat:(double)startLat
                 toLng:(double)goalLng
                   lat:(double)goalLat
                  name:(NSString *)goalName
              priority:(NSInteger)priority
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
                    vias:nil
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
                               [self presentWithTrip:trip priority:(KNRoutePriority)priority onDismiss:onDismiss onError:onError];
                             }];
              }];
}

+ (void)presentWithTrip:(KNTrip *)trip
               priority:(KNRoutePriority)priority
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
    vc.onDismiss = onDismiss;
    vc.modalPresentationStyle = UIModalPresentationFullScreen;
    [top presentViewController:vc animated:YES completion:nil];
  });
}

@end
