#import "KNNaviTrafficBar.h"
#import <limits.h>
#import "KNSDKBridge.h"

@interface KNNaviViewController : UIViewController
- (void)refreshTrafficBar;
- (void)pauseForInactive;
- (void)updateBottomPanel;
@end
@interface TrafficControllerProbe : KNNaviViewController @end
@implementation TrafficControllerProbe
- (void)viewDidLoad {}
- (void)viewDidLayoutSubviews {}
- (void)viewDidAppear:(BOOL)animated {}
- (void)viewWillDisappear:(BOOL)animated {}
@end
@interface TrafficGPSProbe : NSObject
@property(nonatomic) BOOL valid;
@property(nonatomic) BOOL posTrust;
@property(nonatomic) DoublePoint pos;
@property(nonatomic, strong) NSDate *timestamp;
@end
@implementation TrafficGPSProbe @end
@interface TrafficGuideProbe : NSObject
@property(nonatomic, strong) TrafficGPSProbe *gpsOrigin;
@property(nonatomic, strong) KNLocation *locationForPrimaryRoute;
@end
@implementation TrafficGuideProbe @end
@interface TrafficTripProbe : NSObject
@property(nonatomic) SInt32 remainDist;
@property(nonatomic) SInt32 remainTime;
@end
@implementation TrafficTripProbe @end
@interface TrafficRoadProbe : NSObject
@property(nonatomic, strong) KNLocation *fromLocation;
@end
@implementation TrafficRoadProbe @end
@interface TrafficRouteProbe : NSObject
@property(nonatomic) SInt32 remaining;
@property(nonatomic) SInt32 totalOverride;
@property(nonatomic, strong) KNLocation *origin;
@end
@implementation TrafficRouteProbe
- (SInt32)remainDistFromLocation:(KNLocation *)location { return self.remaining; }
- (SInt32)totalDist { return self.totalOverride ?: self.remaining; }
- (NSArray *)mainRoadList {
  if (!self.origin) return @[];
  TrafficRoadProbe *road = [TrafficRoadProbe new]; road.fromLocation = self.origin; return @[road];
}
@end
@interface TrafficGuidanceProbe : NSObject
@property(nonatomic) KNGuideState guideState;
@property(nonatomic, strong) TrafficTripProbe *trip;
@property(nonatomic, strong) NSArray *routesOnGuide;
@end
@implementation TrafficGuidanceProbe @end
@interface TrafficPanelProbe : NSObject
@property(nonatomic) BOOL ready;
@property(nonatomic) BOOL expanded;
@end
@implementation TrafficPanelProbe
- (void)invalidate {}
- (void)updateState:(NSDictionary *)state {}
@end

// 경로 좌표·교통정보 요청 없이 공개 KNLocation 메시지의 거리·상태 계약을 대역한다.
@interface TrafficLocationProbe : NSObject
@property(nonatomic, weak) TrafficLocationProbe *root;
@property(nonatomic) SInt32 offset;
@property(nonatomic) SInt32 encoded;
@property(nonatomic) BOOL mixed;
@property(nonatomic) BOOL previewProfile;
@property(nonatomic) BOOL truncated;
@property(nonatomic) NSInteger missingAt;
@property(nonatomic) NSUInteger reads;
@property(nonatomic) SInt32 lastOffset;
@end
@implementation TrafficLocationProbe
- (instancetype)init { if ((self = [super init])) self.missingAt = -1; return self; }
- (KNLocation *)locationAfterDist:(SInt32)distance {
  TrafficLocationProbe *root = self.root ?: self;
  root.reads++;
  SInt32 offset = self.offset + distance;
  root.lastOffset = offset;
  if (root.missingAt >= 0 && offset == root.missingAt) return nil;
  TrafficLocationProbe *next = [TrafficLocationProbe new];
  next.root = root;
  next.offset = offset;
  return (KNLocation *)next;
}
- (SInt32)distToLocation:(TrafficLocationProbe *)location {
  TrafficLocationProbe *root = self.root ?: self;
  return root.truncated ? 0 : location.offset - self.offset;
}
- (SInt32)avrSpeedAndTrafStToLocation:(KNLocation *)location {
  TrafficLocationProbe *root = self.root ?: self;
  if (root.previewProfile) return 500 + [@[@4, @4, @3, @2, @1, @0][MIN(5, self.offset / 800)] intValue];
  return root.mixed ? 500 + self.offset / 100 % 6 : root.encoded;
}
@end

int RunKNNaviTrafficBarTests(UIWindow *window) {
  __block int failures = 0;
  void (^check)(BOOL, NSString *) = ^(BOOL pass, NSString *name) {
    if (!pass) { failures++; NSLog(@"FAIL traffic-bar %@", name); }
  };
  TrafficLocationProbe *location = [TrafficLocationProbe new];
  location.encoded = 1004;
  NSArray<NSNumber *> *states = KNNaviTrafficStates((KNLocation *)location, 4800);
  check(states.count == 48 && [NSSet setWithArray:states].count == 1 && states.firstObject.intValue == KNTrafficState_Blue,
        @"SDK encoded speed and state decoded without app speed thresholds");
  check(location.reads == 48 && location.lastOffset == 4800, @"bounded48 and exact goal distance");
  location.mixed = YES;
  states = KNNaviTrafficStates((KNLocation *)location, 4800);
  for (NSUInteger i = 0; i < states.count; i++) check(states[i].intValue == i % 6, @"current-to-goal order and all6 states");
  location.mixed = NO;
  check(KNNaviTrafficStates((KNLocation *)location, 2).count == 2, @"short route no zero-length bins");
  check(KNNaviTrafficStates((KNLocation *)location, 0).count == 0 && KNNaviTrafficStates((KNLocation *)location, -1).count == 0,
        @"empty and completed route");
  location.encoded = -1;
  check(KNNaviTrafficStates((KNLocation *)location, 100).firstObject.intValue == KNTrafficState_Unknown, @"negative sentinel unknown");
  location.encoded = 506;
  check(KNNaviTrafficStates((KNLocation *)location, 100).firstObject.intValue == KNTrafficState_Unknown, @"unknown future enum");
  location.encoded = 1004;
  location.missingAt = 100;
  states = KNNaviTrafficStates((KNLocation *)location, 4800);
  check(states[0].intValue == 0 && states[1].intValue == 0 && states[2].intValue == 4, @"missing endpoint preserves only unknown intervals");
  location.missingAt = -1;
  location.truncated = YES;
  check(KNNaviTrafficStates((KNLocation *)location, 4800).firstObject.intValue == 0, @"clamped end never assumed smooth");
  location.truncated = NO;
  states = KNNaviTrafficStates((KNLocation *)location, INT_MAX);
  check(states.count == 48 && location.lastOffset == INT_MAX, @"long distance uses64-bit interval arithmetic");

  KNNaviTrafficBar *bar = [[KNNaviTrafficBar alloc] initWithFrame:CGRectMake(0, 0, 24, 240)];
  NSUInteger before = location.reads;
  [bar updateFromLocation:(KNLocation *)location remainingDistance:4800 time:100];
  [bar updateFromLocation:(KNLocation *)location remainingDistance:4799 time:101];
  check(location.reads == before + 48, @"GPS cadence does not resample");
  [bar updateFromLocation:(KNLocation *)location remainingDistance:4799 time:110];
  check(location.reads == before + 96, @"traffic refresh at10sec even stationary");
  [bar updateFromLocation:(KNLocation *)location remainingDistance:4600 time:111];
  check(location.reads == before + 144, @"distance advance refreshes profile");
  check(!bar.userInteractionEnabled && [bar.accessibilityValue containsString:@"원활"], @"noninteractive and accessible traffic summary");
  [bar reset];
  check(bar.hidden && !bar.states.count && !bar.accessibilityValue, @"reset removes profile and accessibility value");
  [bar updateFromLocation:(KNLocation *)location remainingDistance:20 time:112];
  check(bar.states.count == 20, @"route replacement bypasses old cache");

  CGRect frame = KNNaviTrafficBarFrame(CGRectMake(0, 59, 393, 759), 200, 700);
  check(frame.size.width == 24 && frame.size.height <= 240 && CGRectGetMinY(frame) >= 216 && CGRectGetMaxY(frame) == 684 &&
        CGRectGetMaxX(frame) <= 381, @"bar stays between maneuver and footer with right inset");
  check(CGRectIsEmpty(KNNaviTrafficBarFrame(CGRectMake(0, 0, 600, 250), 100, 200)), @"hide in cramped layout");

  // 실제 presenter의 표시 경계를 실행한다. SDK 생성/위치 수신/네트워크는 대역한다.
  BOOL allowed = [KNSDKBridge isLocationUseAllowed];
  [KNSDKBridge setLocationUseAllowed:YES];
  TrafficControllerProbe *controller = [TrafficControllerProbe new];
  controller.view = [[UIView alloc] initWithFrame:window.bounds];
  [window.rootViewController addChildViewController:controller];
  [window.rootViewController.view addSubview:controller.view];
  [controller didMoveToParentViewController:window.rootViewController];
  KNNaviTrafficBar *activeBar = [[KNNaviTrafficBar alloc] initWithFrame:frame];
  [controller.view addSubview:activeBar];
  [controller setValue:activeBar forKey:@"trafficBar"];
  TrafficPanelProbe *panel = [TrafficPanelProbe new]; panel.ready = YES;
  [controller setValue:panel forKey:@"bottomPanel"];
  [controller setValue:@YES forKey:@"mapControlsHidden"];
  TrafficGuidanceProbe *guidance = [TrafficGuidanceProbe new];
  guidance.guideState = KNGuideState_OnRouteGuide;
  guidance.trip = [TrafficTripProbe new]; guidance.trip.remainDist = 9000;
  TrafficRouteProbe *route = [TrafficRouteProbe new]; route.remaining = 4800;
  guidance.routesOnGuide = @[route];
  [controller setValue:guidance forKey:@"guidance"];
  TrafficGuideProbe *guide = [TrafficGuideProbe new];
  guide.gpsOrigin = [TrafficGPSProbe new];
  guide.gpsOrigin.valid = YES; guide.gpsOrigin.posTrust = YES;
  guide.gpsOrigin.pos = (DoublePoint){300000, 400000}; guide.gpsOrigin.timestamp = NSDate.date;
  guide.locationForPrimaryRoute = (KNLocation *)location;
  void (^setGuide)(void) = ^{
    [controller setValue:guide forKey:@"trafficLocationGuide"];
    [controller setValue:route forKey:@"trafficMatchedRoute"];
  };
  setGuide();
  [controller refreshTrafficBar];
  check(!activeBar.hidden && activeBar.states.count == 48, @"presenter normal active guidance shows profile");
  check([activeBar.accessibilityValue containsString:@"4.8"], @"remaining distance belongs to matched primary route not trip");
  [controller setValue:@YES forKey:@"mapDetached"]; [controller refreshTrafficBar];
  check((activeBar.hidden || activeBar.alpha == 0) && !activeBar.isAccessibilityElement, @"map pan hides strip");
  [controller setValue:@NO forKey:@"mapDetached"]; [controller refreshTrafficBar];
  check(!activeBar.hidden, @"map recenter restores strip");
  panel.expanded = YES; [controller refreshTrafficBar]; check(activeBar.hidden, @"menu hides strip");
  panel.expanded = NO;
  [controller setValue:@YES forKey:@"trafficRouteChanging"]; [controller refreshTrafficBar];
  check(activeBar.hidden && !activeBar.states.count && ![controller valueForKey:@"trafficLocationGuide"], @"reroute clears old route data");
  [controller setValue:@NO forKey:@"trafficRouteChanging"]; [controller refreshTrafficBar];
  check(activeBar.hidden, @"new route waits for new matched location");
  setGuide(); [controller refreshTrafficBar];
  guide.gpsOrigin.timestamp = [NSDate dateWithTimeIntervalSinceNow:-11]; [controller refreshTrafficBar];
  check(activeBar.hidden && !activeBar.states.count, @"stale GPS clears profile");
  guide.gpsOrigin.timestamp = NSDate.date;
  guide.gpsOrigin.posTrust = NO;
  setGuide(); [controller refreshTrafficBar];
  check(activeBar.hidden && !activeBar.states.count, @"untrusted GPS never shows projected traffic");
  guide.gpsOrigin.posTrust = YES;
  guidance.routesOnGuide = @[[TrafficRouteProbe new]];
  setGuide(); [controller refreshTrafficBar];
  check(activeBar.hidden && !activeBar.states.count, @"old matched location cannot sample replacement route");
  guidance.routesOnGuide = @[route];
  setGuide(); [controller refreshTrafficBar];
  guide.gpsOrigin.timestamp = [NSDate dateWithTimeIntervalSinceNow:-9];
  [controller setValue:NSDate.date forKey:@"currentLocationGPSAt"];
  [controller setValue:NSDate.date forKey:@"currentLocationAt"];
  [controller updateBottomPanel];
  NSTimer *expiry = [controller valueForKey:@"currentLocationExpiryTimer"];
  check(expiry && expiry.fireDate.timeIntervalSinceNow <= 1.1, @"traffic expiry scheduled even when system footer GPS is newer");
  guide.gpsOrigin.timestamp = [NSDate dateWithTimeIntervalSinceNow:-11];
  [expiry fire];
  check(activeBar.hidden && !activeBar.states.count, @"scheduled expiry clears traffic without next SDK location callback");
  guide.gpsOrigin.timestamp = NSDate.date;
  setGuide(); [controller refreshTrafficBar];
  [controller pauseForInactive];
  check(activeBar.hidden && !activeBar.states.count && ![controller valueForKey:@"trafficLocationGuide"], @"inactive releases route snapshot");
  [controller setValue:@YES forKey:@"preview"]; setGuide(); [controller refreshTrafficBar];
  check(activeBar.hidden && !activeBar.states.count, @"simulation excluded");
  [controller setValue:@NO forKey:@"preview"];
  [controller setValue:@"도착" forKey:@"arrivalMessage"]; setGuide(); [controller refreshTrafficBar];
  check(activeBar.hidden && !activeBar.states.count, @"arrival waiting excludes old traffic");
  [controller setValue:nil forKey:@"arrivalMessage"];
  [KNSDKBridge setLocationUseAllowed:NO];
  setGuide(); [controller refreshTrafficBar];
  check(activeBar.hidden && !activeBar.states.count, @"consent suspension clears traffic");
  [KNSDKBridge setLocationUseAllowed:YES];
  route.origin = (KNLocation *)location;
  guide.gpsOrigin.valid = NO; guide.gpsOrigin.posTrust = NO; guide.gpsOrigin.timestamp = nil;
  setGuide(); [controller refreshTrafficBar];
  check(!activeBar.hidden && activeBar.states.count == 48, @"stationary startup shows known route before first GPS fix");
  check([activeBar.accessibilityValue containsString:@"GPS"], @"route overview does not claim a live current position");
  check(!activeBar.positionAvailable, @"GPS waiting position indicator stays gray");
  route.totalOverride = route.remaining + 20; [controller refreshTrafficBar];
  check(activeBar.hidden && !activeBar.states.count, @"first main road inside route is not treated as the origin");
  route.totalOverride = 0; [controller refreshTrafficBar];
  check(!activeBar.hidden && !activeBar.positionAvailable, @"verified route origin restores waiting overview");
  guide.gpsOrigin.valid = YES; guide.gpsOrigin.posTrust = YES; guide.gpsOrigin.timestamp = NSDate.date;
  setGuide(); [controller refreshTrafficBar];
  check(!activeBar.hidden && activeBar.positionAvailable && ![activeBar.accessibilityValue containsString:@"GPS"],
        @"trusted fix transitions to live remaining profile");
  guide.gpsOrigin.timestamp = [NSDate dateWithTimeIntervalSinceNow:-11]; [controller refreshTrafficBar];
  check(!activeBar.hidden && !activeBar.positionAvailable && ![controller valueForKey:@"trafficLocationGuide"],
        @"expired position is released while known whole route remains visible");
  [KNSDKBridge setLocationUseAllowed:NO]; [controller refreshTrafficBar];
  check(activeBar.hidden && !activeBar.states.count, @"location suspension still removes route overview");
  [KNSDKBridge setLocationUseAllowed:allowed];
  [controller willMoveToParentViewController:nil]; [controller.view removeFromSuperview]; [controller removeFromParentViewController];

  UIView *preview = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 240, 304)];
  preview.backgroundColor = UIColor.systemGray5Color;
  UIView *darkMap = [[UIView alloc] initWithFrame:CGRectMake(120, 0, 120, 304)];
  darkMap.backgroundColor = [UIColor colorWithWhite:0.15 alpha:1];
  [preview addSubview:darkMap];
  location.previewProfile = YES;
  for (NSUInteger i = 0; i < 2; i++) {
    KNNaviTrafficBar *sample = [[KNNaviTrafficBar alloc] initWithFrame:CGRectMake(56 + 96 * i, 32, 24, 240)];
    sample.overrideUserInterfaceStyle = i ? UIUserInterfaceStyleDark : UIUserInterfaceStyleLight;
    [sample updateFromLocation:(KNLocation *)location remainingDistance:4800 time:100];
    sample.hidden = NO;
    [preview addSubview:sample];
  }
  [window.rootViewController.view addSubview:preview];
  [preview layoutIfNeeded];
  UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:preview.bounds.size];
  UIImage *image = [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) { [preview.layer renderInContext:context.CGContext]; }];
  NSString *file = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject stringByAppendingPathComponent:@"traffic-bar.png"];
  [UIImagePNGRepresentation(image) writeToFile:file atomically:YES];
  [preview removeFromSuperview];
  return failures;
}
