#import <UIKit/UIKit.h>
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNNaviView.h>
#import "KNSDKBridge.h"
#import "KNNaviTrafficBar.h"
@interface KNNaviViewController : UIViewController
- (void)guidance:(KNGuidance *)guidance didUpdateLocation:(KNGuide_Location *)guide;
@end
@interface StationaryTrafficController : KNNaviViewController
@property(nonatomic) NSUInteger locationCallbacks;
@property(nonatomic) BOOL firstCallbackHadBar;
@end
@implementation StationaryTrafficController
- (void)guidance:(KNGuidance *)guidance didUpdateLocation:(KNGuide_Location *)guide {
 if(!self.locationCallbacks)self.firstCallbackHadBar=[self valueForKey:@"trafficBar"]!=nil;
 self.locationCallbacks++;
 [super guidance:guidance didUpdateLocation:guide];
}
- (BOOL)guidance:(KNGuidance *)guidance shouldPlayVoiceGuide:(KNGuide_Voice *)voice replaceSndData:(NSData **)data { return NO; }
@end
@interface ProbeScene : UIResponder <UIWindowSceneDelegate>
@property(nonatomic,strong) UIWindow *window;
@property(nonatomic,strong) NSTimer *timer;
@property(nonatomic) NSInteger samples;
@end
@implementation ProbeScene
- (void)write:(NSDictionary *)value file:(NSString *)file {
 NSData *json=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
 NSString *dir=NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject;
 [json writeToFile:[dir stringByAppendingPathComponent:file] atomically:YES];
}
- (void)fail:(NSString *)phase code:(NSString *)code { [self write:@{@"result":@"ERROR",@"phase":phase,@"code":code?:@"unknown"} file:@"traffic-result.json"]; }
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
 self.window=[[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene]; self.window.rootViewController=[UIViewController new]; [self.window makeKeyAndVisible];
 NSDictionary *config=[NSDictionary dictionaryWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"ProbeConfig" ofType:@"plist"]];
 [KNSDKBridge setLocationUseAllowed:YES];
 [KNSDKBridge initializeWithAppKey:config[@"key"] clientVersion:@"1.2.11" completion:^(NSString *code,NSString *error){
 dispatch_async(dispatch_get_main_queue(),^{
  if(error){[self fail:@"auth" code:code];return;}
  KNSDK *sdk=KNSDK.sharedInstance;
  IntPoint start=[sdk convertWGS84ToKATECWithLongitude:127.0276 latitude:37.4977];
  IntPoint goal=[sdk convertWGS84ToKATECWithLongitude:127.0592 latitude:37.5081];
  KNPOI *origin=[[KNPOI alloc] initWithName:@"Probe origin" x:start.x y:start.y];
  KNPOI *destination=[[KNPOI alloc] initWithName:@"Probe goal" x:goal.x y:goal.y];
  [sdk makeTripWithStart:origin goal:destination vias:nil completion:^(KNError *error,KNTrip *trip){
   if(error||!trip){[self fail:@"trip" code:[KNSDKBridge errorCodeOf:error]];return;}
   trip.routeConfig=[[KNRouteConfiguration alloc] initWithCarType:KNCarType_Bike];
   [trip routeWithPriority:KNRoutePriority_Recommand avoidOptions:KNRouteAvoidOption_None completion:^(KNError *error,NSArray<KNRoute *> *routes){
    dispatch_async(dispatch_get_main_queue(),^{
     if(error||!routes.count){[self fail:@"route" code:[KNSDKBridge errorCodeOf:error]];return;}
     StationaryTrafficController *host=[StationaryTrafficController new];
     [host setValue:trip forKey:@"trip"]; [host setValue:@NO forKey:@"preview"];
     self.window.rootViewController=host; [self.window makeKeyAndVisible];
     self.timer=[NSTimer scheduledTimerWithTimeInterval:1 repeats:YES block:^(NSTimer *timer){[self sample];}];
    });
   }];
  }];
 });
 }];
}
- (void)sample {
 StationaryTrafficController *host=(id)self.window.rootViewController;
 KNGuidance *guidance=[host valueForKey:@"guidance"];
 KNGuide_Location *guide=guidance.locationGuide;
 KNGPSData *gps=guide.gpsOrigin;
 KNNaviTrafficBar *bar=[host valueForKey:@"trafficBar"];
 id panel=[host valueForKey:@"bottomPanel"];
 id stored=[host valueForKey:@"trafficLocationGuide"];
 id matchedRoute=[host valueForKey:@"trafficMatchedRoute"];
 KNRoute *route=guidance.routesOnGuide.firstObject;
 KNLocation *origin=route.mainRoadList.firstObject.fromLocation;
 NSMutableDictionary *d=[@{@"samples":@(++self.samples),@"callbacks":@(host.locationCallbacks),@"firstCallbackHadBar":@(host.firstCallbackHadBar),
 @"barExists":@(bar!=nil),@"barHidden":@(bar.hidden),@"states":@(bar.states.count),@"barFrame":NSStringFromCGRect(bar.frame),
 @"panelReady":[panel valueForKey:@"ready"]?:@NO,@"panelExpanded":[panel valueForKey:@"expanded"]?:@NO,
 @"controlsHidden":[host valueForKey:@"mapControlsHidden"],@"mapDetached":[host valueForKey:@"mapDetached"],
 @"screenState":[host valueForKey:@"naviScreenState"],@"hasScreenState":[host valueForKey:@"hasNaviScreenState"],
 @"routeChanging":[host valueForKey:@"trafficRouteChanging"],@"guideState":@(guidance.guideState),
 @"primaryExists":@(guide.locationForPrimaryRoute!=nil),@"locationExists":@(guide.location!=nil),@"storedGuide":@(stored!=nil),
 @"sameRoute":@(matchedRoute!=nil&&matchedRoute==guidance.routesOnGuide.firstObject),@"routeCount":@(guidance.routesOnGuide.count),@"originExists":@(origin!=nil),@"originIsRouteStart":@(origin&&llabs((int64_t)[route remainDistFromLocation:origin]-route.totalDist)<=3),@"routeGetterStable":@(route==guidance.routesOnGuide.firstObject),
 @"gpsValid":@(gps.valid),@"gpsTrusted":@(gps.posTrust),@"gpsFresh":@(gps.timestamp&&fabs(gps.timestamp.timeIntervalSinceNow)<=10),
 @"active":@(UIApplication.sharedApplication.applicationState==UIApplicationStateActive)} mutableCopy];
 [self write:d file:@"traffic-state.json"];
 if(self.samples>=20){
  [self.timer invalidate];
  d[@"originProfileCount"]=@(origin?KNNaviTrafficStates(origin,[route remainDistFromLocation:origin]).count:0);
  BOOL visible=bar && !bar.hidden && bar.states.count;
  d[@"result"]=visible?@"VISIBLE":@"INVISIBLE";
  UIGraphicsImageRenderer *renderer=[[UIGraphicsImageRenderer alloc] initWithBounds:host.view.bounds];
  UIImage *image=[renderer imageWithActions:^(UIGraphicsImageRendererContext *context){[host.view drawViewHierarchyInRect:host.view.bounds afterScreenUpdates:YES];}];
  NSString *dir=NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject;
  BOOL captured=[UIImagePNGRepresentation(image) writeToFile:[dir stringByAppendingPathComponent:@"traffic-live.png"] atomically:YES];
  if(!captured)d[@"result"]=@"CAPTURE_FAILED";
  [self write:d file:@"traffic-result.json"];
 }
}
@end
@interface ProbeApp : UIResponder <UIApplicationDelegate> @end
@implementation ProbeApp
- (UISceneConfiguration *)application:(UIApplication *)application configurationForConnectingSceneSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
 UISceneConfiguration *c=[[UISceneConfiguration alloc] initWithName:@"TrafficProbe" sessionRole:session.role]; c.delegateClass=ProbeScene.class; return c;
}
@end
int main(int argc,char *argv[]){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(ProbeApp.class));}}
