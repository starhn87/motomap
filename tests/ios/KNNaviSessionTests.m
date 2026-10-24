#import <UIKit/UIKit.h>
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNNaviView.h>
#import <AVFoundation/AVFoundation.h>
#import <objc/runtime.h>
#import "KNNaviArrivalRecovery.h"
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
@interface RuntimeModeProbe : KNNaviRouteView @end
@implementation RuntimeModeProbe
- (void)accessibilityWithType:(NSInteger)type view:(UIView *)view {}
@end
@interface SessionViewProbe : UIView
@property(nonatomic) NSUInteger safetyTransitions;
@property(nonatomic, strong) UIView *curDirView;
@property(nonatomic, strong) UIView *nextDirView;
@property(nonatomic, strong) UIView *bottomView;
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

@interface SessionControllerProbe : KNNaviViewController @end
@implementation SessionControllerProbe
- (void)viewDidLoad {}
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
  [panel updateState:@{@"remainingTime":@480, @"remainingDistance":@2100, @"volume":@0.7}];
  WKWebView *web = [panel valueForKey:@"webView"];
  WaitAsync(^BOOL{ return panel.ready || panel.failed; }, NSDate.timeIntervalSinceReferenceDate + 15, ^(BOOL loaded) {
    if (!loaded || !panel.ready) { NSLog(@"FAIL WK not ready"); [panel invalidate]; completion(failures+1); return; }
    [web evaluateJavaScript:@"document.querySelector('[data-action=menu]').click();document.getElementById('duration').textContent" completionHandler:^(id result, NSError *error) {
      if (error || ![result isEqual:@"8분"]) { NSLog(@"FAIL WK metrics %@ %@",result,error); failures++; }
      WaitAsync(^BOOL{ return height == 348; },NSDate.timeIntervalSinceReferenceDate+2,^(BOOL expanded) {
        if (!expanded) { NSLog(@"FAIL WK expansion"); failures++; }
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
        [panel layoutIfNeeded];
        [web takeSnapshotWithConfiguration:nil completionHandler:^(UIImage *image, NSError *error) {
          NSString *path = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"bottom-expanded.png"];
          if (image) [UIImagePNGRepresentation(image) writeToFile:path atomically:YES];
        NSString *script = @"document.getElementById('volume').value=35;document.getElementById('volume').dispatchEvent(new Event('input'));['refresh','hazard','routePreview','destination','vias','end'].forEach(action=>document.querySelector('[data-action='+action+']').click());true";
        [web evaluateJavaScript:script completionHandler:^(id result, NSError *error) {
          WaitAsync(^BOOL{ return actions.count == 8 && fabs(volume-.35)<.001; },NSDate.timeIntervalSinceReferenceDate+3,^(BOOL sent) {
            if (!sent) { NSLog(@"FAIL WK actions %@ volume=%f",actions,volume); failures++; }
            [panel updateState:@{@"status":@"목적지를 유지하고 있어요", @"detail":@"<script>quoted ' \"", @"volume":@0.35}];
            [web evaluateJavaScript:@"document.getElementById('duration').textContent" completionHandler:^(id result, NSError *error) {
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
