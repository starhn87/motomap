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
