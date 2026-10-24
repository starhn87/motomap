#import <UIKit/UIKit.h>
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNNaviView.h>
#import <AVFoundation/AVFoundation.h>
#import <objc/runtime.h>
#import "KNNaviArrivalRecovery.h"
#import "KNNaviPresenter.h"
#import "KNSDKBridge.h"
#import "KNNaviRouteView.h"
#import <KNSDK/KNComponentView.h>

// 실제 presenter 콜백을 실행한다. GPS·SDK 경로 탐색은 요청하지 않는다.
@interface KNNaviViewController : UIViewController
@property(nonatomic, strong) KNNaviView *naviView;
- (void)guidanceGuideEnded:(KNGuidance *)guidance;
- (void)guidanceGuideStarted:(KNGuidance *)guidance;
- (void)naviViewScreenState:(KNNaviViewState)state;
- (void)setBottomMenuVisible:(BOOL)visible;
- (void)updateBottomPanel;
- (void)updateCurrentLocationWithGuide:(KNGuide_Location *)guide;
- (void)refreshCurrentRoute;
- (BOOL)hasCurrentRegion;
- (void)lookupRegionAt:(IntPoint)point completion:(void (^)(NSString *))completion;
- (BOOL)usableRecoveryGPS:(KNGPSData *)gps;
- (BOOL)guidance:(KNGuidance *)guidance shouldPlayVoiceGuide:(KNGuide_Voice *)voice replaceSndData:(NSData **)data;
@end
@interface KNNaviPresenter (PreviewTest)
+ (void)openGuidePreviewForController:(KNNaviViewController *)vc gps:(KNGPSData *)gps completion:(void (^)(NSDictionary *, NSString *))completion;
@end
@interface KNNaviView (MapStateTest)
- (void)naviMapView:(KNNaviMapView *)map mapState:(MapState)state;
@end
@interface KNNaviRouteView (TrackingTest)
+ (BOOL)isSDKMapStateBoundaryCompatible;
@end
@interface RuntimeModeProbe : KNNaviRouteView @end
@implementation RuntimeModeProbe
- (void)accessibilityWithType:(NSInteger)type view:(UIView *)view {}
@end
@interface SessionViewProbe : UIView
@property(nonatomic) NSUInteger safetyTransitions;
@property(nonatomic, strong) UIView *curDirView;
@property(nonatomic, strong) UIView *nextDirView;
@property(nonatomic, strong) UIView *bottomView;
@property(nonatomic, strong) UIView *menuView;
@property(nonatomic, strong) UIView *mapView;
@end
@implementation SessionViewProbe
- (void)guidanceGuideEnded:(id)guidance isShowDriveResultDialog:(BOOL)show { self.safetyTransitions++; }
- (void)trafficMode:(BOOL)enabled {}
- (void)guidanceGuideStarted:(id)guidance {}
- (void)resumeRouteModeForPreview:(BOOL)preview {}
@end
@interface MapActionProbe : NSObject
@property(nonatomic) NSUInteger calls;
- (void)recenter:(id)sender;
@end
@implementation MapActionProbe
- (void)recenter:(id)sender { self.calls++; }
@end

@interface VoiceProbe : NSObject
@property(nonatomic) KNVoiceCode voiceCode;
@end
@implementation VoiceProbe @end

@interface GPSProbe : NSObject
@property(nonatomic) BOOL valid;
@property(nonatomic) BOOL posTrust;
@property(nonatomic) DoublePoint pos;
@property(nonatomic, strong) NSDate *timestamp;
@end
@implementation GPSProbe @end
@interface LocationNameProbe : NSObject
@property(nonatomic, copy) NSString *roadName;
@property(nonatomic, copy) NSString *facilityName;
@end
@implementation LocationNameProbe @end
@interface LocationGuideProbe : NSObject
@property(nonatomic, strong) GPSProbe *gpsOrigin;
@property(nonatomic, strong) LocationNameProbe *location;
@end
@implementation LocationGuideProbe @end

@interface PreviewTripProbe : NSObject
@property(nonatomic, strong) KNPOI *goal;
@property(nonatomic, strong) NSArray *vias;
@property(nonatomic, strong) NSArray *passedVias;
@property(nonatomic) double remainTime;
@property(nonatomic) double remainDist;
@end
@implementation PreviewTripProbe @end
@interface PreviewGuidanceProbe : NSObject
@property(nonatomic, strong) PreviewTripProbe *trip;
@property(nonatomic) NSUInteger refreshCalls;
@end
@implementation PreviewGuidanceProbe
- (void)reRoute { self.refreshCalls++; }
@end

@interface SessionControllerProbe : KNNaviViewController
@property(nonatomic) NSUInteger regionCalls;
@property(nonatomic, copy) void (^regionCompletion)(NSString *);
@end
@implementation SessionControllerProbe
- (void)lookupRegionAt:(IntPoint)point completion:(void (^)(NSString *))completion { self.regionCalls++; self.regionCompletion = completion; }
- (void)viewDidLoad {}
- (void)viewDidAppear:(BOOL)animated {}
- (void)viewWillDisappear:(BOOL)animated {}
- (void)dismissViewControllerAnimated:(BOOL)animated completion:(void (^)(void))completion { if (completion) completion(); }
@end

int RunKNNaviSessionTests(void) {
  int failures = 0;
  // 실제 SDK 렌더 메서드에 진입한다. SDK 초기화/GPS/경로 탐색만 생략한 뷰다.
  if (![KNNaviRouteView isSDKModeBoundaryCompatible]) { NSLog(@"FAIL SDK mode ABI changed"); failures++; }
  RuntimeModeProbe *sdkView = [RuntimeModeProbe alloc];
  sdkView = ((id (*)(id,SEL,CGRect))class_getMethodImplementation(UIView.class, @selector(initWithFrame:)))(sdkView,@selector(initWithFrame:),CGRectMake(0,0,390,844));
  __block NSUInteger blocked = 0;
  sdkView.onSafetyModeBlocked = ^{ blocked++; };
  SEL modeSelector = NSSelectorFromString(@"naviMode:");
  void (*setMode)(id,SEL,NSUInteger) = (void (*)(id,SEL,NSUInteger))[sdkView methodForSelector:modeSelector];
  setMode(sdkView, modeSelector, KNNaviMode_Drive);
  for (int i=0; i<3; i++) setMode(sdkView, modeSelector, KNNaviMode_Safety);
  if ([[sdkView valueForKey:@"naviMode"] unsignedIntegerValue] == KNNaviMode_Safety ||
      [sdkView valueForKey:@"safetyView2"] != nil || blocked != 3 || !sdkView.didBlockSafetyMode) {
    NSLog(@"FAIL actual SDK safety renderer entered"); failures++;
  }
  // 미지의 SDK 모드도 화면에 통과시키지 않는다.
  setMode(sdkView, modeSelector, NSUIntegerMax);
  if (blocked != 4) { NSLog(@"FAIL unknown SDK mode allowed"); failures++; }
  setMode(sdkView, modeSelector, KNNaviMode_RouteSimul);
  if ([[sdkView valueForKey:@"naviMode"] unsignedIntegerValue] != KNNaviMode_RouteSimul) {
    NSLog(@"FAIL simulation mode broken"); failures++;
  }
  setMode(sdkView, modeSelector, KNNaviMode_Drive);
  if ([[sdkView valueForKey:@"naviMode"] unsignedIntegerValue] != KNNaviMode_Drive) failures++;
  KNNaviViewController *controller = [SessionControllerProbe new];
  SessionViewProbe *view = [SessionViewProbe new];
  view.curDirView = [UIView new]; view.nextDirView = [UIView new]; view.bottomView = [UIView new];
  controller.naviView = (id)view;
  VoiceProbe *voice = [VoiceProbe new]; voice.voiceCode = KNVoiceCode_StartGuide;
  NSData *replacement = nil;
  if (![controller guidance:nil shouldPlayVoiceGuide:(id)voice replaceSndData:&replacement]) {
    NSLog(@"FAIL start announcement suppressed"); failures++;
  }
  AVAudioPlayer *decoded = replacement ? [[AVAudioPlayer alloc] initWithData:replacement error:nil] : nil;
  if (!decoded || decoded.duration < 1 || decoded.numberOfChannels != 1) {
    NSLog(@"FAIL custom intro audio missing or invalid"); failures++;
  }
  if ([controller guidance:nil shouldPlayVoiceGuide:(id)voice replaceSndData:&replacement]) {
    NSLog(@"FAIL duplicate start announcement"); failures++;
  }
  voice.voiceCode = KNVoiceCode_EndGuide;
  if ([controller guidance:nil shouldPlayVoiceGuide:(id)voice replaceSndData:&replacement]) failures++;
  voice.voiceCode = (KNVoiceCode)999;
  if (![controller guidance:nil shouldPlayVoiceGuide:(id)voice replaceSndData:&replacement]) failures++;
  [controller guidanceGuideEnded:nil];
  if (view.safetyTransitions != 0) { NSLog(@"FAIL arrival entered safety UI"); failures++; }
  if (!view.curDirView.hidden || !view.nextDirView.hidden || !view.bottomView.hidden) {
    NSLog(@"FAIL stale route instructions remain after arrival"); failures++;
  }
  UIButton *end = [UIButton new]; UIButton *hazard = [UIButton new];
  [controller setValue:end forKey:@"endButton"]; [controller setValue:hazard forKey:@"hazardButton"];
  [controller naviViewScreenState:DriveTouch];
  if (!end.hidden || !hazard.hidden) { NSLog(@"FAIL arrival touch controls remain"); failures++; }
  [controller naviViewScreenState:DriveNormal];
  if (end.hidden || hazard.hidden) { NSLog(@"FAIL arrival exit controls unavailable"); failures++; }
  // 새 SDK 경로가 사후 Safety 통지를 보내도 SDK 화면 자체를 숨겨야 한다.
  [controller naviViewScreenState:SafetyNormal];
  if (!view.hidden || end.hidden || hazard.hidden) { NSLog(@"FAIL safety fallback exposed SDK UI or exit hidden"); failures++; }
  [controller naviViewScreenState:SafetyTouch];
  if (!view.hidden) failures++;
  [controller guidanceGuideStarted:nil];
  [controller naviViewScreenState:DriveNormal];
  if (view.hidden || end.hidden || hazard.hidden) { NSLog(@"FAIL route UI not restored"); failures++; }
  GPSProbe *gps = [GPSProbe new]; gps.valid = YES; gps.posTrust = YES;
  gps.timestamp = [NSDate dateWithTimeIntervalSinceNow:-60];
  if ([controller usableRecoveryGPS:(id)gps]) failures++;
  gps.timestamp = NSDate.date; gps.posTrust = NO;
  if ([controller usableRecoveryGPS:(id)gps]) failures++;
  gps.posTrust = YES;
  if (![controller usableRecoveryGPS:(id)gps]) failures++;
  // 실제 미리보기 진입 분기: GPS가 없어도 목적지 편집을 열고 새 좌표는 비워둔다.
  [KNSDKBridge setLocationUseAllowed:YES];
  KNPOI *goal = [[KNPOI alloc] initWithName:@"목적지" x:300000 y:400000];
  // SDK Trip 생성은 네트워크를 요구하므로 읽기 전용 속성만 제공하는 대역을 쓴다.
  PreviewTripProbe *previewTrip = [PreviewTripProbe new]; previewTrip.goal = goal;
  SessionControllerProbe *editor = [SessionControllerProbe new];
  [editor setValue:previewTrip forKey:@"trip"];
  __block BOOL opened = NO;
  [KNNaviPresenter openGuidePreviewForController:editor gps:nil completion:^(NSDictionary *snapshot, NSString *error) {
    opened = !error && [snapshot[@"start"] isEqual:NSNull.null] && [snapshot[@"goal"][@"name"] isEqual:@"목적지"];
  }];
  if (!opened || ![[editor valueForKey:@"suspended"] boolValue]) { NSLog(@"FAIL editor blocked by unavailable GPS"); failures++; }
  __block BOOL rejectedApply = NO;
  [KNNaviPresenter resumeGuide:[[editor valueForKey:@"previewToken"] integerValue] toLng:127 lat:37.5 name:@"새 목적지" vias:@[] priority:0
                   completion:^(NSDictionary *result, NSString *error) { rejectedApply = !result && [error containsString:@"현재 위치"]; }];
  if (!rejectedApply || [[editor valueForKey:@"changingDestination"] boolValue]) { NSLog(@"FAIL GPS-free route applied"); failures++; }
  [editor setValue:@YES forKey:@"finished"];
  SessionControllerProbe *regionController = [SessionControllerProbe new];
  LocationNameProbe *road = [LocationNameProbe new]; road.facilityName = @"시설 이름";
  LocationGuideProbe *sample = [LocationGuideProbe new]; sample.location = road;
  GPSProbe *regionGPS = [GPSProbe new]; regionGPS.valid = YES; regionGPS.posTrust = YES; regionGPS.timestamp = NSDate.date;
  regionGPS.pos = (DoublePoint){300000,400000}; sample.gpsOrigin = regionGPS;
  [regionController updateCurrentLocationWithGuide:(id)sample];
  if (regionController.regionCalls != 1) { NSLog(@"FAIL missing road did not request dong"); failures++; }
  if (regionController.regionCompletion) regionController.regionCompletion(@"중구 명동");
  if (![[regionController valueForKey:@"currentRegionName"] isEqual:@"중구 명동"] || ![regionController hasCurrentRegion]) { NSLog(@"FAIL dong response not applied"); failures++; }
  for (int i=0;i<10;i++) [regionController updateCurrentLocationWithGuide:(id)sample];
  if (regionController.regionCalls != 1) { NSLog(@"FAIL dong cache did not coalesce"); failures++; }
  regionGPS.pos = (DoublePoint){300250,400000};
  [regionController updateCurrentLocationWithGuide:(id)sample];
  if ([regionController hasCurrentRegion] || regionController.regionCalls != 1) { NSLog(@"FAIL moved dong cache or throttle"); failures++; }
  [regionController setValue:[NSDate dateWithTimeIntervalSinceNow:-31] forKey:@"regionRequestAt"];
  [regionController updateCurrentLocationWithGuide:(id)sample];
  if (regionController.regionCalls != 2) { NSLog(@"FAIL dong retry after throttle"); failures++; }
  void (^oldRegion)(NSString *) = regionController.regionCompletion;
  regionGPS.pos = (DoublePoint){300500,400000};
  [regionController updateCurrentLocationWithGuide:(id)sample];
  if (oldRegion) oldRegion(@"이전 동");
  if ([[regionController valueForKey:@"currentRegionName"] isEqual:@"이전 동"]) { NSLog(@"FAIL stale moved dong response accepted"); failures++; }
  regionGPS.valid = NO; [regionController updateCurrentLocationWithGuide:(id)sample];
  if (oldRegion) oldRegion(@"무효 동");
  if ([regionController valueForKey:@"currentRegionName"]) { NSLog(@"FAIL invalid GPS retained dong"); failures++; }
  regionGPS.valid = YES; [regionController setValue:nil forKey:@"regionRequestAt"];
  [regionController updateCurrentLocationWithGuide:(id)sample];
  [KNSDKBridge setLocationUseAllowed:NO];
  if (regionController.regionCompletion) regionController.regionCompletion(@"동의 철회 후 응답");
  if ([regionController valueForKey:@"currentRegionName"]) { NSLog(@"FAIL revoked region response accepted"); failures++; }
  [regionController setValue:@YES forKey:@"finished"]; [regionController updateBottomPanel];
  [controller setValue:@YES forKey:@"finished"];
  if ([controller guidance:nil shouldPlayVoiceGuide:(id)voice replaceSndData:&replacement]) failures++;
  KNNaviArrivalRecovery *policy = [KNNaviArrivalRecovery new];
  [policy guideEndedAtDistance:20];
  if ([policy shouldRecoverAtDistance:NAN time:1]) failures++;
  for (int i=0;i<20;i++) if ([policy shouldRecoverAtDistance:25 time:i]) failures++;
  if ([policy shouldRecoverAtDistance:65 time:30]) failures++;
  if ([policy shouldRecoverAtDistance:65 time:31]) failures++;
  if (![policy shouldRecoverAtDistance:65 time:32]) failures++;
  if ([policy shouldRecoverAtDistance:100 time:50]) failures++; // 중복 요청 금지
  [policy requestFailed];
  for (int i=0;i<3;i++) if ([policy shouldRecoverAtDistance:100 time:35+i]) failures++;
  if (![policy shouldRecoverAtDistance:100 time:50]) failures++;
  [policy requestFailed];
  for (int i=0;i<3;i++) [policy shouldRecoverAtDistance:100 time:70+i];
  [policy requestFailed];
  for (int i=0;i<10;i++) if ([policy shouldRecoverAtDistance:150 time:100+i]) failures++;
  if (![policy beginManualRecoveryAtTime:200]) failures++; // 상한 뒤 명시 재시도
  [policy guideStarted];
  if (policy.waiting || policy.requesting || [policy shouldRecoverAtDistance:200 time:220]) failures++;
  return failures;
}

// 로컬 HTML을 실제 WKWebView에 로드해 DOM 조작→native 메시지까지 검사한다.
#import "KNNaviBottomPanel.h"
#import "KNNaviHiddenViews.h"
#import <WebKit/WebKit.h>

static void WaitAsync(BOOL (^condition)(void), NSTimeInterval deadline, void (^done)(BOOL)) {
  if (condition()) { done(YES); return; }
  if (NSDate.timeIntervalSinceReferenceDate >= deadline) { done(NO); return; }
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 50 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{ WaitAsync(condition,deadline,done); });
}
static UIView *BareAuxView(Class type) {
  return ((id (*)(id, SEL, CGRect))class_getMethodImplementation(UIView.class, @selector(initWithFrame:)))(
    [type alloc], @selector(initWithFrame:), CGRectMake(0,0,390,844));
}
extern NSArray<NSNumber *> *KNNaviRemainingVias(NSArray<NSNumber *> *, NSArray<NSDictionary *> *, NSArray<NSDictionary *> *);
extern NSArray<NSDictionary *> *KNNaviNewPassedVias(NSArray<NSDictionary *> *, NSArray<NSDictionary *> *);
void RunKNNaviBottomTests(UIWindow *window, void (^completion)(int)) {
  __block int failures = 0;
  NSDictionary *loopPoint = @{@"longitude":@127.1,@"latitude":@37.5};
  NSDictionary *otherPoint = @{@"longitude":@127.2,@"latitude":@37.6};
  NSArray *flatLoop = @[@127.1,@37.5,@127.2,@37.6,@127.1,@37.5];
  NSArray *filteredLoop = KNNaviRemainingVias(flatLoop,@[loopPoint,otherPoint,loopPoint],@[loopPoint]);
  if (![filteredLoop isEqual:@[@127.2,@37.6,@127.1,@37.5]]) { NSLog(@"FAIL loop visit count"); failures++; }
  if (KNNaviNewPassedVias(@[loopPoint],@[loopPoint,otherPoint,loopPoint]).count != 2) failures++;

  RuntimeModeProbe *sdkView = (id)BareAuxView(RuntimeModeProbe.class);
  KNNaviHiddenViews *locks = [KNNaviHiddenViews new];
  for (NSString *key in @[@"recommandOilView", @"aroundButtonView"]) {
    NSString *name = [key isEqualToString:@"recommandOilView"] ? @"KNRecommandOilView" : @"KNAroundButtonView";
    UIView *target = BareAuxView(NSClassFromString(name));
    [sdkView setValue:target forKey:key];
    [locks hideAuxiliaryViewsIn:sdkView];
    SEL selector = NSSelectorFromString(@"show:");
    for (int i=0;i<5;i++) {
      ((void (*)(id,SEL,BOOL))[target methodForSelector:selector])(target,selector,YES);
      if (!target.hidden || sdkView.hidden) { NSLog(@"FAIL SDK aux reappeared %@",key); failures++; }
    }
  }
  [sdkView resumeRouteModeForPreview:NO];
  [locks restore];
  for (NSString *key in @[@"recommandOilView", @"aroundButtonView"]) if ([[sdkView valueForKey:key] isHidden]) failures++;

  // 실제 SDK 클래스/ivar를 사용하고 원래 버튼 이벤트의 target만 위치 요청 없는 대역으로 바꾼다.
  UIView *map = BareAuxView(NSClassFromString(@"KNNaviMapView"));
  UIButton *current = [UIButton new];
  UIView *zoom = BareAuxView(NSClassFromString(@"UIMapButton"));
  UIView *mapStyle = BareAuxView(NSClassFromString(@"UIMapButton"));
  MapActionProbe *mapAction = [MapActionProbe new];
  [current addTarget:mapAction action:@selector(recenter:) forControlEvents:UIControlEventTouchUpInside];
  [map setValue:current forKey:@"curPosBtn"]; [map setValue:zoom forKey:@"zoomBtn"]; [map setValue:mapStyle forKey:@"mapStyleBtn"];
  // 화면 모드 callback 없이 실제 SDK map-state 수신 경계만 실행한다.
  if (![KNNaviRouteView respondsToSelector:@selector(isSDKMapStateBoundaryCompatible)] ||
      ![KNNaviRouteView isSDKMapStateBoundaryCompatible] || ![sdkView respondsToSelector:NSSelectorFromString(@"setOnMapTrackingChanged:")]) {
    NSLog(@"FAIL missing actual SDK map-state observation"); failures++;
  } else {
    __block NSUInteger changes = 0;
    [sdkView setValue:map forKey:@"mapView"];
    [sdkView setValue:[^(BOOL detached) { changes++; } copy] forKey:@"onMapTrackingChanged"];
    [sdkView naviMapView:(id)map mapState:MapState_Panning];
    if (![[sdkView valueForKey:@"mapDetached"] boolValue]) { NSLog(@"FAIL panning not detached"); failures++; }
    [sdkView naviMapView:(id)map mapState:MapState_Zoom];
    [sdkView naviMapView:(id)map mapState:MapState_CurPos];
    if ([[sdkView valueForKey:@"mapDetached"] boolValue] || changes != 2) { NSLog(@"FAIL follow state not restored"); failures++; }
    [sdkView naviMapView:(id)map mapState:MapState_Rotate];
    [sdkView naviMapView:(id)map mapState:MapState_None];
    if ([[sdkView valueForKey:@"mapDetached"] boolValue] || changes != 4) { NSLog(@"FAIL automatic recenter not restored"); failures++; }
  }
  KNNaviHiddenViews *mapLocks = [KNNaviHiddenViews new];
  if (![mapLocks hideMapControlsIn:map]) { NSLog(@"FAIL map control contract"); failures++; }
  for (UIView *control in @[current,zoom,mapStyle]) {
    control.hidden = NO;
    if (!control.hidden || map.hidden) { NSLog(@"FAIL map controls reappeared"); failures++; }
  }
  // SDK가 이후 숨기기를 요청했다면 복원 시 과거의 visible 값으로 되돌리지 않는다.
  UIView *visibilityProbe = [UIView new];
  KNNaviHiddenViews *visibilityLocks = [KNNaviHiddenViews new];
  [visibilityLocks hideView:visibilityProbe]; visibilityProbe.hidden = YES; [visibilityLocks restore];
  if (!visibilityProbe.hidden) { NSLog(@"FAIL restored outdated SDK visibility"); failures++; }
  if ([mapLocks hideMapControlsIn:[UIView new]]) { NSLog(@"FAIL unsafe map control access"); failures++; }

  SessionControllerProbe *controller = [SessionControllerProbe new];
  [window.rootViewController addChildViewController:controller];
  controller.view.frame = window.bounds;
  controller.additionalSafeAreaInsets = UIEdgeInsetsMake(0, 0, 0, 20);
  [window.rootViewController.view addSubview:controller.view];
  [controller didMoveToParentViewController:window.rootViewController];
  SessionViewProbe *navigation = [SessionViewProbe new]; navigation.mapView = map;
  controller.naviView = (id)navigation;
  [controller setValue:mapLocks forKey:@"mapHiddenViews"];
  [controller setValue:@YES forKey:@"mapControlsHidden"];
  [controller setValue:@0.7 forKey:@"volume"];
  [controller setValue:@"테헤란로" forKey:@"currentLocationName"];
  [controller setValue:NSDate.date forKey:@"currentLocationAt"];
  [controller setValue:NSDate.date forKey:@"currentLocationGPSAt"];
  PreviewTripProbe *trip = [PreviewTripProbe new]; trip.remainTime = 480; trip.remainDist = 2100;
  trip.goal = [[KNPOI alloc] initWithName:@"도착 카페" x:300000 y:400000];
  PreviewGuidanceProbe *guide = [PreviewGuidanceProbe new]; guide.trip = trip;
  [controller setValue:trip forKey:@"trip"]; [controller setValue:guide forKey:@"guidance"];
  UIControl *backdrop = [UIControl new]; backdrop.backgroundColor = [UIColor colorWithWhite:0 alpha:0.28];
  backdrop.hidden = YES; backdrop.alpha = 0;
  [controller setValue:backdrop forKey:@"menuBackdrop"]; [controller.view addSubview:backdrop];
  KNNaviBottomPanel *panel = [[KNNaviBottomPanel alloc] initWithFrame:CGRectMake(0,400,390,80)];
  [controller setValue:panel forKey:@"bottomPanel"];
  [controller.view addSubview:panel]; [controller.view addSubview:panel.menuView];
  NSMutableArray *actions = [NSMutableArray new];
  __block float volume = -1; __block CGFloat height = 0; __block BOOL failure = NO;
  panel.onAction = ^(NSString *action, NSDictionary *payload) {
    [actions addObject:action];
    if ([action isEqualToString:@"volume"]) volume = [payload[@"value"] floatValue];
    if ([action isEqualToString:@"recenter"]) {
      if (![KNNaviHiddenViews recenterMap:map]) failures++;
      [sdkView naviMapView:(id)map mapState:MapState_CurPos];
    }
  };
  __weak SessionControllerProbe *weakController = controller;
  panel.onHeight = ^(CGFloat value) { height = value; [weakController setValue:@(value) forKey:@"panelHeight"]; [weakController.view setNeedsLayout]; };
  panel.onMenuVisibility = ^(BOOL visible) { [weakController setBottomMenuVisible:visible]; };
  panel.onFailure = ^{ failure = YES; weakController.view.hidden = YES; backdrop.hidden = YES; };
  [sdkView setValue:[^(BOOL detached) {
    [weakController setValue:@(detached) forKey:@"mapDetached"];
    [weakController updateBottomPanel];
  } copy] forKey:@"onMapTrackingChanged"];
  [controller updateBottomPanel];
  WKWebView *web = [panel valueForKey:@"webView"];
  WKWebView *menuWeb = (id)panel.menuView;
  WaitAsync(^BOOL{ return panel.ready || panel.failed; }, NSDate.timeIntervalSinceReferenceDate + 15, ^(BOOL loaded) {
    if (!loaded || !panel.ready) { NSLog(@"FAIL WK not ready"); [panel invalidate]; completion(failures+1); return; }
    [sdkView naviMapView:(id)map mapState:MapState_Panning];
    [controller.view layoutIfNeeded];
    if (height != KNNaviBottomCollapsedHeight + KNNaviBottomRecenterHeight ||
        [panel pointInside:CGPointMake(0,10) withEvent:nil] ||
        [panel pointInside:CGPointMake(panel.bounds.size.width/2+70,10) withEvent:nil] ||
        [panel pointInside:CGPointMake(panel.bounds.size.width/2,50) withEvent:nil] ||
        ![panel pointInside:CGPointMake(panel.bounds.size.width/2,10) withEvent:nil]) {
      NSLog(@"FAIL actual map pan did not expose web recenter"); failures++;
    }
    if (CGRectGetMaxY(panel.frame) > window.bounds.size.height - 20 || panel.frame.origin.x != 12 ||
        !CGRectEqualToRect(controller.naviView.frame, controller.view.bounds)) { NSLog(@"FAIL floating panel frame"); failures++; }
    // 실제 위치 수집 경계: 빈 SDK 이름은 최근 값의 수명을 연장하거나 즉시 지우지 않는다.
    if ([controller respondsToSelector:@selector(updateCurrentLocationWithGuide:)]) {
      GPSProbe *gps = [GPSProbe new]; gps.valid = YES; gps.posTrust = YES; gps.timestamp = NSDate.date;
      LocationNameProbe *location = [LocationNameProbe new]; location.roadName = @"테헤란로";
      LocationGuideProbe *locationGuide = [LocationGuideProbe new]; locationGuide.gpsOrigin = gps; locationGuide.location = location;
      [controller updateCurrentLocationWithGuide:(id)locationGuide];
      NSDate *namedAt = [controller valueForKey:@"currentLocationAt"];
      location.roadName = @"   ";
      [controller updateCurrentLocationWithGuide:(id)locationGuide]; [controller updateBottomPanel];
      NSDictionary *state = [panel valueForKey:@"state"];
      if (![state[@"currentLocationName"] isEqual:@"테헤란로"] || ![[controller valueForKey:@"currentLocationAt"] isEqual:namedAt]) { NSLog(@"FAIL sparse road name lost or freshness extended"); failures++; }
      [controller setValue:[NSDate dateWithTimeIntervalSinceNow:-11] forKey:@"currentLocationAt"];
      [controller updateBottomPanel]; state = [panel valueForKey:@"state"];
      if ([state[@"currentLocationName"] length] || ![state[@"currentLocationStatus"] isEqual:@"주소 정보 없음"]) { NSLog(@"FAIL stale road name used as current"); failures++; }
      gps.valid = NO; [controller updateCurrentLocationWithGuide:(id)locationGuide]; [controller updateBottomPanel];
      if (![[panel valueForKey:@"state"][@"currentLocationStatus"] isEqual:@"GPS 수신 대기"]) { NSLog(@"FAIL missing GPS status"); failures++; }
      gps.valid = YES; gps.timestamp = [NSDate dateWithTimeIntervalSinceNow:-11];
      [controller updateCurrentLocationWithGuide:(id)locationGuide]; [controller updateBottomPanel];
      if (![[panel valueForKey:@"state"][@"currentLocationStatus"] isEqual:@"GPS 수신 대기"]) { NSLog(@"FAIL stale GPS presented as current"); failures++; }
      gps.timestamp = NSDate.date; location.roadName = nil; location.facilityName = @"지하주차장";
      [controller updateCurrentLocationWithGuide:(id)locationGuide]; [controller updateBottomPanel];
      if ([[panel valueForKey:@"state"][@"currentLocationName"] length]) { NSLog(@"FAIL facility presented instead of dong"); failures++; }
    } else { NSLog(@"FAIL current location update boundary missing"); failures++; }
    // 새 콜백/수동 갱신 없이도 1초 뒤 이름과 GPS가 만료돼야 한다.
    [controller setValue:[NSDate dateWithTimeIntervalSinceNow:-9] forKey:@"currentLocationAt"];
    [controller setValue:[NSDate dateWithTimeIntervalSinceNow:-9] forKey:@"currentLocationGPSAt"];
    [controller updateBottomPanel];
    controller.overrideUserInterfaceStyle = UIUserInterfaceStyleDark;
    [controller refreshCurrentRoute];
    if (guide.refreshCalls != 1) { NSLog(@"FAIL native refresh not requested"); failures++; }
    NSString *metrics = @"const recenter=document.getElementById('recenter');const recenterStyle=getComputedStyle(recenter);const compactRecenter=recenter.getBoundingClientRect().width===132&&recenter.getBoundingClientRect().height===44&&recenterStyle.paddingLeft==='10px'&&recenterStyle.backgroundColor.includes('0.8');const matchingIcon=recenter.querySelector('path').getAttribute('d')===document.getElementById('currentIcon').querySelector('path').getAttribute('d');const recenterGap=document.getElementById('panel').getBoundingClientRect().top-recenter.getBoundingClientRect().bottom;const toast=document.getElementById('toast');const toastText=toast.textContent;const toastVisible=!toast.hidden;const dark=matchMedia('(prefers-color-scheme: dark)').matches;const barColor=getComputedStyle(document.getElementById('panel')).backgroundColor.replaceAll(' ','');const toastColor=getComputedStyle(toast).backgroundColor.replaceAll(' ','');const brandColor=barColor===(dark?'rgb(24,24,27)':'rgb(250,250,250)');const darkerToast=toastColor===(dark?'rgb(10,10,10)':'rgb(24,24,27)');const times=[0,1,60,3600,3661,90000].map(seconds=>{window.MotoMapBottom.render({remainingTime:seconds,remainingDistance:2100});return document.getElementById('arrival').textContent;});window.MotoMapBottom.render({remainingTime:480,remainingDistance:2100,goalName:'도착 카페',currentLocationName:'테헤란로',volume:.7,showRecenter:true});window.MotoMapBottom.render({currentLocationName:'',currentLocationStatus:'GPS 수신 대기'});const missing=document.getElementById('placeName').textContent;window.MotoMapBottom.render({remainingTime:480,remainingDistance:2100,goalName:'도착 카페',currentLocationName:'테헤란로',volume:.7,showRecenter:true});const first=document.getElementById('placeName').textContent;const currentIcon=!document.getElementById('currentIcon').hasAttribute('hidden');await new Promise(resolve=>setTimeout(resolve,5300));const second=document.getElementById('placeName').textContent;const longName='아주 긴 행정동 주소와 목적지 이름 '.repeat(30);window.MotoMapBottom.render({goalName:longName,currentLocationName:longName});const name=document.getElementById('placeName');const line=name.getBoundingClientRect();const oneLine=getComputedStyle(name).whiteSpace==='nowrap'&&line.height<=23.5&&line.width<=document.getElementById('destination').clientWidth;window.MotoMapBottom.render({remainingTime:480,remainingDistance:2100,goalName:'도착 카페',currentLocationName:'테헤란로',volume:.7,showRecenter:true});return JSON.stringify({first,second,missing,times,matchingIcon,compactRecenter,recenterGap,oneLine,brandColor,darkerToast,toastText,toastVisible,toastExpired:toast.hidden,currentIcon,goalIcon:!document.getElementById('goalIcon').hasAttribute('hidden'),recenterVisible:!document.getElementById('recenter').hidden,remaining:document.getElementById('arrival').textContent,distance:document.getElementById('distance').textContent,noDuration:!document.getElementById('duration'),noClose:!document.querySelector('.close')})";
    [web callAsyncJavaScript:metrics arguments:@{} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:^(id result, NSError *error) {
      if (error || ![result containsString:@"\"compactRecenter\":true"] || ![result containsString:@"\"matchingIcon\":true"] || ![result containsString:@"\"recenterGap\":10"] || ![result containsString:@"\"brandColor\":true"] || ![result containsString:@"\"darkerToast\":true"] || ![result containsString:@"\"oneLine\":true"] || ![result containsString:@"경로 새로고침을 요청했어요"] || ![result containsString:@"\"toastVisible\":true"] || ![result containsString:@"\"toastExpired\":true"] || ![result containsString:@"GPS 수신 대기"] || ![result containsString:@"\"recenterVisible\":true"] ||
          ![result containsString:@"\"times\":[\"0분\",\"1분\",\"1분\",\"1시간\",\"1시간2분\",\"25시간\"]"] ||
          ![result containsString:@"테헤란로"] || ![result containsString:@"도착 카페"]) { NSLog(@"FAIL WK metrics %@ %@",result,error); failures++; }
      NSDictionary *expiredState = [panel valueForKey:@"state"];
      if ([expiredState[@"currentLocationName"] length] || ![expiredState[@"currentLocationStatus"] isEqual:@"GPS 수신 대기"]) { NSLog(@"FAIL location did not expire without SDK callbacks"); failures++; }
      [panel layoutIfNeeded];
      [web takeSnapshotWithConfiguration:nil completionHandler:^(UIImage *image, NSError *error) {
        NSString *path = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"bottom-collapsed.png"];
        if (image) [UIImagePNGRepresentation(image) writeToFile:path atomically:YES];
        [web evaluateJavaScript:@"document.getElementById('recenter').click()" completionHandler:nil];
        WaitAsync(^BOOL{ return height == 68 && mapAction.calls == 1; },NSDate.timeIntervalSinceReferenceDate+2,^(BOOL centered) {
          if (!centered) { NSLog(@"FAIL recenter did not restore footer"); failures++; }
          CGRect footerFrame = panel.frame;
          NSTimeInterval openedAt = NSDate.timeIntervalSinceReferenceDate;
          [web evaluateJavaScript:@"document.getElementById('menuButton').click()" completionHandler:nil];
          WaitAsync(^BOOL{ return NSDate.timeIntervalSinceReferenceDate - openedAt >= 0.3 && panel.expanded && !panel.menuView.hidden && CGAffineTransformIsIdentity(panel.menuView.transform); },NSDate.timeIntervalSinceReferenceDate+2,^(BOOL expanded) {
            if (!expanded || !panel.menuView.accessibilityViewIsModal || height != 68 ||
                !CGRectEqualToRect(footerFrame,panel.frame) || menuWeb == web ||
                fabs(CGRectGetMaxY(panel.menuView.frame) - controller.view.bounds.size.height) > 0.5 ||
                CGRectGetMinX(panel.menuView.frame) != 0 || panel.menuView.bounds.size.width != controller.view.bounds.size.width) { NSLog(@"FAIL separate native sheet"); failures++; }
            [web evaluateJavaScript:@"getComputedStyle(document.querySelector('.bar')).display" completionHandler:^(id value, NSError *error) {
              if (error || [value isEqual:@"none"]) { NSLog(@"FAIL footer replaced by drawer"); failures++; }
              [menuWeb takeSnapshotWithConfiguration:nil completionHandler:^(UIImage *image, NSError *error) {
                NSString *path = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"bottom-expanded.png"];
                if (image) [UIImagePNGRepresentation(image) writeToFile:path atomically:YES];
                NSString *script = @"const safe=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe'));const end=document.querySelector('.end').getBoundingClientRect();const safeEnd=safe>=20&&end.bottom<=innerHeight-safe;const buttons=[...document.querySelectorAll('.actions button')].map(b=>b.getBoundingClientRect());const row=buttons.every(b=>Math.abs(b.top-buttons[0].top)<1);const footer=getComputedStyle(document.querySelector('.bar')).display==='none';document.getElementById('volume').value=35;document.getElementById('volume').dispatchEvent(new Event('input'));document.getElementById('mute').click();const muted=document.getElementById('volume').value==='0'&&document.getElementById('mute').getAttribute('aria-pressed')==='true';document.getElementById('mute').click();const restored=document.getElementById('volume').value==='100'&&document.getElementById('mute').getAttribute('aria-label').includes('음소거');['hazard','routePreview','destination','vias','end'].forEach(action=>document.querySelector('[data-action='+action+']').click());JSON.stringify({row,footer,safeEnd,muted,restored,noClose:!document.querySelector('.close')})";
                [menuWeb evaluateJavaScript:script completionHandler:^(id value, NSError *error) {
                  if (error || ![value containsString:@"\"muted\":true"] || ![value containsString:@"\"restored\":true"] || ![value containsString:@"\"row\":true"] || ![value containsString:@"\"footer\":true"] || ![value containsString:@"\"safeEnd\":true"]) { NSLog(@"FAIL menu layout %@ %@",value,error); failures++; }
                  WaitAsync(^BOOL{ return actions.count == 10 && fabs(volume-1)<.001 && panel.menuView.hidden; },NSDate.timeIntervalSinceReferenceDate+3,^(BOOL sent) {
                    if (!sent) { NSLog(@"FAIL WK actions %@ volume=%f",actions,volume); failures++; }
                    [mapLocks restore];
                    if (current.hidden || zoom.hidden || mapStyle.hidden) { NSLog(@"FAIL map controls fallback restore"); failures++; }
                    [current removeTarget:mapAction action:@selector(recenter:) forControlEvents:UIControlEventTouchUpInside];
                    if ([mapLocks hideMapControlsIn:map] || current.hidden || zoom.hidden || mapStyle.hidden) { NSLog(@"FAIL missing recenter event hid native controls"); failures++; }
                    [(id<WKNavigationDelegate>)panel webViewWebContentProcessDidTerminate:menuWeb];
                    if (!failure || !panel.failed || panel.ready) { NSLog(@"FAIL WK fallback"); failures++; }
                    [panel invalidate]; [panel removeFromSuperview]; [panel.menuView removeFromSuperview];
                    [controller setValue:nil forKey:@"bottomPanel"];
                    [controller willMoveToParentViewController:nil]; [controller.view removeFromSuperview]; [controller removeFromParentViewController];
                    completion(failures);
                  });
                }];
              }];
            }];
          });
        });
      }];
    }];
  });
}
