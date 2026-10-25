#import <UIKit/UIKit.h>
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNNaviView.h>
#import <KNSDK/KNMapView.h>
#import <KNSDK/KNMapMarker.h>
#import "KNSDKBridge.h"
#import "KNNaviPresenter.h"
#import "KNNaviGasLayer.h"
@interface UIViewController (Probe)
- (KNMapView *)findInnerMapViewIn:(UIView *)view depth:(int)depth;
@end
@interface ProbeGPS : NSObject
@property(nonatomic) BOOL valid;
@property(nonatomic) BOOL posTrust;
@property(nonatomic) DoublePoint pos;
@property(nonatomic, strong) NSDate *timestamp;
@end
@implementation ProbeGPS @end
@interface ProbeGasLayer : KNNaviGasLayer @end
@implementation ProbeGasLayer
- (UIImage *)imageForStation:(NSDictionary *)station selected:(BOOL)selected {
 return [[[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(96,40)] imageWithActions:^(UIGraphicsImageRendererContext *ctx){
  [[UIColor colorWithRed:1 green:0 blue:1 alpha:1] setFill]; UIRectFill(CGRectMake(0,0,96,40));
  [@"3,579원" drawAtPoint:CGPointMake(6,9) withAttributes:@{NSFontAttributeName:[UIFont boldSystemFontOfSize:17],NSForegroundColorAttributeName:UIColor.blackColor}];
 }];
}
@end
@interface ProbeScene : UIResponder <UIWindowSceneDelegate>
@property(nonatomic,strong) UIWindow *window;
@property(nonatomic,strong) ProbeGasLayer *layer;
@property(nonatomic,strong) KNMapView *map;
@property(nonatomic,strong) NSTimer *gpsTimer;
@end
@implementation ProbeScene
- (void)record:(NSDictionary *)value {
 NSData *json=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
 NSString *path=[NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"probe-stage.json"];
 [json writeToFile:path atomically:YES];
}
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
 self.window=[[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];self.window.rootViewController=[UIViewController new];[self.window makeKeyAndVisible];
 NSDictionary *config=[NSDictionary dictionaryWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"ProbeConfig" ofType:@"plist"]];
 [KNSDKBridge setLocationUseAllowed:YES];
 [KNSDKBridge initializeWithAppKey:config[@"key"] clientVersion:@"1.2.10" completion:^(NSString *code,NSString *error){
  dispatch_async(dispatch_get_main_queue(),^{
   if(error) { [self record:@{@"stage":@"ERROR",@"phase":@"auth",@"code":code ?: @"unknown"}];return; }
   KNSDK *sdk=[KNSDK sharedInstance];
   IntPoint start=[sdk convertWGS84ToKATECWithLongitude:127.0276 latitude:37.4977];
   IntPoint goal=[sdk convertWGS84ToKATECWithLongitude:127.0592 latitude:37.5081];
   KNPOI *origin=[[KNPOI alloc] initWithName:@"출발" pos:start];
   KNPOI *destination=[[KNPOI alloc] initWithName:@"목적지" pos:goal];
   [sdk makeTripWithStart:origin goal:destination vias:nil completion:^(KNError *tripError,KNTrip *trip){
    if(tripError||!trip){[self record:@{@"stage":@"ERROR",@"phase":@"trip"}];return;}
    trip.routeConfig=[[KNRouteConfiguration alloc] initWithCarType:KNCarType_Bike];
    [trip routeWithPriority:0 avoidOptions:KNRouteAvoidOption_None completion:^(KNError *routeError,NSArray *routes){
     dispatch_async(dispatch_get_main_queue(),^{
      if(routeError||!routes.count){[self record:@{@"stage":@"ERROR",@"phase":@"route",@"code":[KNSDKBridge errorCodeOf:routeError] ?: @"unknown"}];return;}
      [self record:@{@"stage":@"HOST_SETUP"}];
      UIViewController *host=[NSClassFromString(@"KNNaviViewController") new];
      [host setValue:trip forKey:@"trip"];[host setValue:@YES forKey:@"preview"];
      self.window.rootViewController=host;[self.window makeKeyAndVisible];
      [self record:@{@"stage":@"HOST_READY"}];
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW,3*NSEC_PER_SEC),dispatch_get_main_queue(),^{[self probe];});
     });
    }];
   }];
  });
 }];
}
- (void)probe {
 [self record:@{@"stage":@"PROBE_ENTER"}];
 UIViewController *host=self.window.rootViewController;
 KNNaviView *nav=[host valueForKey:@"naviView"];
 self.map=[host findInnerMapViewIn:nav.mapView depth:0];
 if(!self.map) { [self record:@{@"stage":@"ERROR",@"phase":@"map_missing"}];return; }
 self.layer=[[ProbeGasLayer alloc] initWithHost:host]; self.layer.isActive=^BOOL{return YES;};[self.layer attachMap:self.map];
 FloatPoint center=[self.map screenToKatec:CGPointMake(self.map.bounds.size.width*0.5,self.map.bounds.size.height*0.45)];
 ProbeGPS *gps=[ProbeGPS new];gps.valid=YES;gps.posTrust=YES;gps.timestamp=NSDate.date;gps.pos=DoublePointMake(center.x,center.y);
 [self.layer updateGPS:(id)gps];
 DoublePoint wgs=[[KNSDK sharedInstance] convertKATECToWGS84WithX:lround(center.x) y:lround(center.y)];
 [self.layer applyResponse:@{@"requestId":self.layer.context[@"requestId"],@"stations":@[@{@"id":@"fixture",@"name":@"가격 마커 테스트",@"brand":@"GS칼텍스",@"price":@3579,@"distance":@0,@"latitude":@(wgs.y),@"longitude":@(wgs.x)}]}];
 self.gpsTimer=[NSTimer scheduledTimerWithTimeInterval:1 repeats:YES block:^(NSTimer *timer){gps.timestamp=NSDate.date;[self.layer updateGPS:(id)gps];}];
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,3*NSEC_PER_SEC),dispatch_get_main_queue(),^{
  for(KNMapMarker *marker in [self.layer valueForKey:@"markers"]) marker.coordinate=[self.map screenToKatec:CGPointMake(self.map.bounds.size.width*0.5,self.map.bounds.size.height*0.45)];
  [self record:@{@"stage":@"PRODUCT",@"zoom":@(self.map.zoom),@"markers":@([self.map getMarkers].count)}];
  // 제품 설정의 캡처가 끝나기 전에는 대조군으로 전환하지 않는다.
  [NSTimer scheduledTimerWithTimeInterval:0.1 repeats:YES block:^(NSTimer *step) {
   NSString *ack=[NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"render-control.flag"];
   if (![NSFileManager.defaultManager fileExistsAtPath:ack]) return;
   [step invalidate];
   for(KNMapMarker *marker in [self.layer valueForKey:@"markers"]) { marker.coordinate=[self.map screenToKatec:CGPointMake(self.map.bounds.size.width*0.5,self.map.bounds.size.height*0.45)]; [marker setVisibleRangeWithMinZoom:0.1 maxZoom:9999]; }
   dispatch_after(dispatch_time(DISPATCH_TIME_NOW,2*NSEC_PER_SEC),dispatch_get_main_queue(),^{
    [self record:@{@"stage":@"CONTROL",@"zoom":@(self.map.zoom),@"markers":@([self.map getMarkers].count)}];
   });
  }];
 });
}
@end
@interface ProbeApp : UIResponder <UIApplicationDelegate> @end
@implementation ProbeApp
- (UISceneConfiguration *)application:(UIApplication *)application configurationForConnectingSceneSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
 UISceneConfiguration *config=[[UISceneConfiguration alloc] initWithName:@"SessionTests" sessionRole:session.role];config.delegateClass=ProbeScene.class;return config;
}
@end
int main(int argc,char *argv[]) { @autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(ProbeApp.class));} }
