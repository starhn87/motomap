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
- (BOOL)usableRecoveryGPS:(KNGPSData *)gps;
- (BOOL)guidance:(KNGuidance *)guidance shouldPlayVoiceGuide:(KNGuide_Voice *)voice replaceSndData:(NSData **)data;
@end
@interface KNNaviPresenter (PreviewTest)
+ (void)openGuidePreviewForController:(KNNaviViewController *)vc gps:(KNGPSData *)gps completion:(void (^)(NSDictionary *, NSString *))completion;
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
@end
@implementation SessionViewProbe
- (void)guidanceGuideEnded:(id)guidance isShowDriveResultDialog:(BOOL)show { self.safetyTransitions++; }
- (id)mapView { return nil; }
- (void)trafficMode:(BOOL)enabled {}
- (void)guidanceGuideStarted:(id)guidance {}
- (void)resumeRouteModeForPreview:(BOOL)preview {}
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

@interface PreviewTripProbe : NSObject
@property(nonatomic, strong) KNPOI *goal;
@property(nonatomic, strong) NSArray *vias;
@property(nonatomic, strong) NSArray *passedVias;
@end
@implementation PreviewTripProbe @end

@interface SessionControllerProbe : KNNaviViewController @end
@implementation SessionControllerProbe
- (void)viewDidLoad {}
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
  [KNSDKBridge setLocationUseAllowed:NO];
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

  KNNaviBottomPanel *panel = [[KNNaviBottomPanel alloc] initWithFrame:CGRectMake(0,400,390,80)];
  NSMutableArray *actions = [NSMutableArray new];
  __block float volume = -1; __block CGFloat height = 0; __block BOOL failure = NO;
  panel.onAction = ^(NSString *action, NSDictionary *payload) { [actions addObject:action]; if ([action isEqualToString:@"volume"]) volume = [payload[@"value"] floatValue]; };
  __weak KNNaviBottomPanel *weakPanel = panel;
  panel.onHeight = ^(CGFloat value) { height = value; weakPanel.frame = CGRectMake(0,window.bounds.size.height-value,window.bounds.size.width,value); };
  panel.onFailure = ^{ failure = YES; };
  [window.rootViewController.view addSubview:panel];
  [panel updateState:@{@"remainingTime":@480, @"remainingDistance":@2100, @"volume":@0.7, @"goalName":@"도착 카페", @"currentLocationName":@"테헤란로"}];
  WKWebView *web = [panel valueForKey:@"webView"];
  WaitAsync(^BOOL{ return panel.ready || panel.failed; }, NSDate.timeIntervalSinceReferenceDate + 15, ^(BOOL loaded) {
    if (!loaded || !panel.ready) { NSLog(@"FAIL WK not ready"); [panel invalidate]; completion(failures+1); return; }
    // 실제 Presenter 배치가 홈 인디케이터 위 여백과 지도 전체 영역을 유지하는지 확인한다.
    SessionControllerProbe *layoutController = [SessionControllerProbe new];
    layoutController.view.frame = window.bounds;
    layoutController.naviView = (id)[SessionViewProbe new];
    [layoutController setValue:panel forKey:@"bottomPanel"];
    [layoutController viewDidLayoutSubviews];
    if (CGRectGetMaxY(panel.frame) > window.bounds.size.height - 20 || panel.frame.origin.x != 12 ||
        !CGRectEqualToRect(layoutController.naviView.frame, layoutController.view.bounds)) {
      NSLog(@"FAIL floating panel frame"); failures++;
    }
    // 배치 검사 컨트롤러의 dealloc이 아래 WK 검사 패널을 invalidate하지 않게 소유권을 돌려준다.
    [layoutController setValue:nil forKey:@"bottomPanel"];
    [web callAsyncJavaScript:@"const first=document.getElementById('destination').textContent;await new Promise(resolve=>setTimeout(resolve,5300));const second=document.getElementById('destination').textContent;document.querySelector('[data-action=refresh]').click();document.getElementById('menuButton').click();return JSON.stringify({first,second,distance:document.getElementById('distance').textContent,noDuration:!document.getElementById('duration'),noClose:!document.querySelector('.close')})"
                  arguments:@{} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:^(id result, NSError *error) {
      if (error || ![result containsString:@"테헤란로"] || ![result containsString:@"도착 카페"] || ![result containsString:@"\"distance\":\"2.1km\""] || ![result containsString:@"\"noDuration\":true"] || ![result containsString:@"\"noClose\":true"]) { NSLog(@"FAIL WK metrics %@ %@",result,error); failures++; }
      WaitAsync(^BOOL{ return height == 280; },NSDate.timeIntervalSinceReferenceDate+2,^(BOOL expanded) {
        if (!expanded) { NSLog(@"FAIL WK expansion"); failures++; }
        if (!panel.accessibilityViewIsModal) { NSLog(@"FAIL WK menu accessibility scope"); failures++; }

        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
        [panel layoutIfNeeded];
        [web takeSnapshotWithConfiguration:nil completionHandler:^(UIImage *image, NSError *error) {
          NSString *path = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"bottom-expanded.png"];
          if (image) [UIImagePNGRepresentation(image) writeToFile:path atomically:YES];
        NSString *script = @"const buttons=[...document.querySelectorAll('.actions button')].map(b=>b.getBoundingClientRect());const row=buttons.every(b=>Math.abs(b.top-buttons[0].top)<1);const order=document.querySelector('.volumeRange').getBoundingClientRect().bottom<=buttons[0].top;const footer=getComputedStyle(document.querySelector('.bar')).display==='none';const width=document.documentElement.scrollWidth<=innerWidth;document.getElementById('volume').value=35;document.getElementById('volume').dispatchEvent(new Event('input'));document.getElementById('mute').click();['hazard','routePreview','destination','vias','end'].forEach(action=>document.querySelector('[data-action='+action+']').click());JSON.stringify({distance:document.getElementById('distance').textContent,row,order,footer,width})";
        [web evaluateJavaScript:script completionHandler:^(id result, NSError *error) {
          NSDictionary *layout = [result isKindOfClass:NSString.class] ? [NSJSONSerialization JSONObjectWithData:[result dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil] : nil;
          if (error || ![layout[@"distance"] isEqual:@"2.1km"] || ![layout[@"row"] boolValue] ||
              ![layout[@"order"] boolValue] || ![layout[@"footer"] boolValue] || ![layout[@"width"] boolValue]) {
            NSLog(@"FAIL WK navigation layout %@ %@",layout,error); failures++;
          }
          WaitAsync(^BOOL{ return actions.count == 9 && fabs(volume)<.001; },NSDate.timeIntervalSinceReferenceDate+3,^(BOOL sent) {
            if (!sent) { NSLog(@"FAIL WK actions %@ volume=%f",actions,volume); failures++; }
            [panel updateState:@{@"status":@"목적지를 유지하고 있어요", @"detail":@"<script>quoted ' \"", @"volume":@0.35}];
            [web evaluateJavaScript:@"document.getElementById('arrival').textContent" completionHandler:^(id result, NSError *error) {
              if (error || ![result isEqual:@"목적지를 유지하고 있어요"]) { NSLog(@"FAIL WK state JSON"); failures++; }
              [(id<WKNavigationDelegate>)panel webViewWebContentProcessDidTerminate:web];
              if (!failure || !panel.failed || panel.ready) { NSLog(@"FAIL WK fallback"); failures++; }
              [panel invalidate]; [panel removeFromSuperview];
              completion(failures);
            }];
          });
        }];
        }];
        });
      });
    }];
  });
}
