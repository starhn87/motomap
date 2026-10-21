#import <UIKit/UIKit.h>
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNNaviView.h>
#import <AVFoundation/AVFoundation.h>
#import "KNNaviArrivalRecovery.h"

// 실제 presenter 콜백을 실행한다. GPS·SDK 경로 탐색은 요청하지 않는다.
@interface KNNaviViewController : UIViewController
@property(nonatomic, strong) KNNaviView *naviView;
- (void)guidanceGuideEnded:(KNGuidance *)guidance;
- (void)naviViewScreenState:(KNNaviViewState)state;
- (BOOL)usableRecoveryGPS:(KNGPSData *)gps;
- (BOOL)guidance:(KNGuidance *)guidance shouldPlayVoiceGuide:(KNGuide_Voice *)voice replaceSndData:(NSData **)data;
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
