// 실기기 손가락 검증 전용. 가짜 장소는 제품 경로에 포함하지 않는다.
#import <UIKit/UIKit.h>
#import <float.h>
#import <math.h>
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNNaviView.h>
#import <KNSDK/KNMapView.h>
#import <KNSDK/KNMapCameraUpdate.h>
#import "KNNaviGuidePoiOverlay.h"
#import "KNNaviOwnedPoiLayer.h"
#import "KNNaviOwnedPoiFixtures.h"
#import "KNNaviPresenter.h"
#import "KNSDKBridge.h"
static BOOL finished=NO;
static void Record(NSDictionary *d) {
 NSMutableDictionary *record=[d mutableCopy];
 NSDictionary *config=[NSDictionary dictionaryWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"ProbeConfig" ofType:@"plist"]];
 record[@"runId"]=config[@"runId"]?:@"missing";
 NSData *data=[NSJSONSerialization dataWithJSONObject:record options:0 error:nil];
 if (([d[@"event"] isEqual:@"prototype_ready"] && (![config[@"autoSmoke"] boolValue] || [d[@"smoke"] boolValue])) || d[@"error"]) {
  NSString *path=[NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"owned-poi-ready.json"];
  [data writeToFile:path atomically:YES];
 }
 printf("MOTO_POI_QA %s\n",[[[NSString alloc]initWithData:data encoding:NSUTF8StringEncoding] UTF8String]);fflush(stdout);
}
static void Finish(BOOL pass,NSString *reason) { finished=YES;Record(@{@"error":reason,@"pass":@(pass)}); }
static NSArray *targetA,*targetB;
@interface KNNaviViewController:UIViewController
@property(nonatomic,strong) KNTrip *trip;
@property(nonatomic,strong) KNGuidance *guidance;
@property(nonatomic,copy) void (^onMenu)(NSInteger);
@property(nonatomic,copy) void (^onPoiTap)(NSString*,double,double);
- (void)guidanceGuideStarted:(KNGuidance*)guidance;
- (KNMapView *)findInnerMapViewIn:(UIView *)view depth:(int)depth;
@end
@interface ProbeHost:KNNaviViewController
@property(nonatomic,strong) KNNaviGuidePoiOverlay *fixtureLayer;
@property(nonatomic,strong) KNNaviOwnedPoiLayer *ownedProbe;
@property(nonatomic,weak) KNMapView *fixtureMap;
@property(nonatomic,strong) UILabel *status;
@property(nonatomic) FloatPoint initialCenter;
@end
@implementation ProbeHost
- (void)guidanceGuideStarted:(KNGuidance *)guidance {
 [super guidanceGuideStarted:guidance];
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,2*NSEC_PER_SEC),dispatch_get_main_queue(),^{[self showFixtures];});
}
- (void)showFixtures {
 if(self.fixtureLayer)return;
 UIView *mapContainer=[[self valueForKey:@"naviView"] valueForKey:@"mapView"];
 KNMapView *map=[self findInnerMapViewIn:mapContainer depth:0];
 if(!map){Finish(NO,@"inner_map_missing");return;}
 self.fixtureMap=map;self.initialCenter=map.coordinate;
 self.fixtureLayer=[[KNNaviGuidePoiOverlay alloc]initWithMap:map];
 [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(restoreFixtures) name:UIApplicationDidBecomeActiveNotification object:nil];
 __weak ProbeHost *weakSelf=self;
 self.fixtureLayer.isActive=^BOOL{return weakSelf.view.window && UIApplication.sharedApplication.applicationState==UIApplicationStateActive;};
 self.fixtureLayer.onSelect=^(NSString *key){
  Record(@{@"event":@"finger_selection_callback",@"key":key});
  weakSelf.status.text=[NSString stringWithFormat:@"선택: %@ · 가상 장소",key];
  [KNNaviPresenter showPoiOptionsWithTitle:@"가상 POI · 터치 검사" canAddVia:YES completion:^(NSInteger picked){
   weakSelf.status.text=[NSString stringWithFormat:@"선택 %ld · 실제 안내 변경 없음",(long)picked];
   Record(@{@"event":@"picker_result",@"picked":@(picked)});
  }];
 };
 [self.fixtureLayer showItems:KNNaviOwnedPoiFixtures((IntPoint){(int)self.initialCenter.x,(int)self.initialCenter.y}) expiresAt:[NSDate dateWithTimeIntervalSinceNow:1800]];
 if (!self.fixtureLayer.hasItems) { Finish(NO,@"fixture_snapshot_missing");return; }
 self.status=[[UILabel alloc]initWithFrame:CGRectMake(12,self.view.bounds.size.height-190,self.view.bounds.size.width-24,48)];
 self.status.autoresizingMask=UIViewAutoresizingFlexibleTopMargin|UIViewAutoresizingFlexibleWidth;
 self.status.text=@"POI 시제품 · 모두 가상 장소\n탭 / POI 위에서 드래그·핀치 / 3D 검사";
 self.status.numberOfLines=2;self.status.textAlignment=NSTextAlignmentCenter;
 self.status.font=[UIFont systemFontOfSize:12 weight:UIFontWeightSemibold];
 self.status.backgroundColor=UIColor.systemOrangeColor;self.status.textColor=UIColor.blackColor;
 self.status.userInteractionEnabled=NO;[self.view addSubview:self.status];
 UIButton *tilt=[UIButton buttonWithType:UIButtonTypeSystem];tilt.frame=CGRectMake(self.view.bounds.size.width-80,180,68,44);
 tilt.autoresizingMask=UIViewAutoresizingFlexibleLeftMargin;[tilt setTitle:@"2D / 3D" forState:UIControlStateNormal];
 tilt.backgroundColor=UIColor.systemBackgroundColor;tilt.layer.cornerRadius=12;
 [tilt addTarget:self action:@selector(toggleTilt) forControlEvents:UIControlEventTouchUpInside];[self.view addSubview:tilt];
 UIButton *reset=[UIButton buttonWithType:UIButtonTypeSystem];reset.frame=CGRectMake(self.view.bounds.size.width-80,232,68,44);
 reset.autoresizingMask=UIViewAutoresizingFlexibleLeftMargin;[reset setTitle:@"샘플 위치" forState:UIControlStateNormal];
 reset.backgroundColor=UIColor.systemBackgroundColor;reset.layer.cornerRadius=12;
 [reset addTarget:self action:@selector(resetCamera) forControlEvents:UIControlEventTouchUpInside];[self.view addSubview:reset];
 [self resetCamera];Record(@{@"event":@"prototype_ready",@"fixtureCount":@6,@"basePoiKept":@YES});
 NSDictionary *config=[NSDictionary dictionaryWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"ProbeConfig" ofType:@"plist"]];
 if([config[@"autoSmoke"] boolValue])dispatch_after(dispatch_time(DISPATCH_TIME_NOW,NSEC_PER_SEC),dispatch_get_main_queue(),^{[self runOwnedSmoke];});
}
- (void)runOwnedSmoke {
 [self.fixtureLayer invalidate];self.fixtureLayer=nil;
 KNMapView *map=self.fixtureMap;BOOL previous=map.poiProperties.isVisible;
 self.ownedProbe=[[KNNaviOwnedPoiLayer alloc] initWithMap:map];
 __weak ProbeHost *weakSelf=self;
 self.ownedProbe.isActive=^BOOL{return weakSelf.view.window!=nil;};
 [self.ownedProbe performSelector:NSSelectorFromString(@"poll")];
 [self.ownedProbe setValue:[NSDate dateWithTimeIntervalSinceNow:-3] forKey:@"dirtySince"];
 [self.ownedProbe setValue:[NSDate dateWithTimeIntervalSinceNow:-1] forKey:@"settledAt"];
 [self.ownedProbe performSelector:NSSelectorFromString(@"poll")];
 NSString *requestId=self.ownedProbe.context[@"requestId"];
 if(!requestId){Finish(NO,@"smoke_context_missing");return;}
 NSMutableArray *pois=[NSMutableArray new];
 for(NSDictionary *item in KNNaviOwnedPoiFixtures((IntPoint){(int)self.initialCenter.x,(int)self.initialCenter.y})) {
  DoublePoint w=[[KNSDK sharedInstance] convertKATECToWGS84WithX:[item[@"x"] intValue] y:[item[@"y"] intValue]];
  NSMutableDictionary *row=[@{@"key":item[@"key"],@"name":item[@"label"],@"latitude":@(w.y),@"longitude":@(w.x)} mutableCopy];
  NSString *key=item[@"key"];
  if([key isEqual:@"home"]||[key isEqual:@"work"])row[@"personal"]=key;
  else if([key isEqual:@"favorite"])row[@"favorite"]=@YES;
  else if([key isEqual:@"cafe"])row[@"category"]=@"cafe";
  else {row[@"category"]=@"gas_station";row[@"brand"]=@"S-OIL";if([key isEqual:@"gas"])row[@"price"]=@1699;}
  [pois addObject:row];
 }
 BOOL accepted=[self.ownedProbe applyResponse:@{@"requestId":requestId,@"pois":pois,@"expiresAt":@(NSDate.date.timeIntervalSince1970*1000+60000)}];
 BOOL hidden=!map.poiProperties.isVisible && self.ownedProbe.ownsPoiVisibility;
 KNNaviGuidePoiOverlay *renderer=[self.ownedProbe valueForKey:@"renderer"];
 NSArray *items=[[renderer valueForKey:@"owned"] copy];
 __block BOOL selected=NO;
 self.ownedProbe.onSelect=^(NSString *key,NSString *snapshotId){selected=[snapshotId isEqual:requestId] && key.length>0;};
 for(NSDictionary *item in items){UIButton *button=item[@"button"];if(!button.hidden){[button sendActionsForControlEvents:UIControlEventTouchUpInside];break;}}
 [self.ownedProbe setValue:[NSDate dateWithTimeIntervalSinceNow:-1] forKey:@"expiresAt"];
 [map moveCamera:[KNMapCameraUpdate zoomTo:map.zoom*1.01] withUserLocation:NO];
 [self.ownedProbe performSelector:NSSelectorFromString(@"poll")];
 BOOL restored=map.poiProperties.isVisible==previous && !self.ownedProbe.ownsPoiVisibility;
 [self.ownedProbe invalidate];
 if(!accepted || !hidden || items.count!=6 || !selected || !restored){Finish(NO,@"smoke_owned_poi_failed");return;}
 Record(@{@"event":@"prototype_ready",@"smoke":@YES,@"sdkSnapshotAccepted":@(accepted),@"fixtureCount":@6,
  @"baseHiddenAfterAck":@(hidden),@"selectionCallback":@(selected),@"expiryRestoredDuringMove":@(restored),@"syntheticSelection":@YES});
}
- (void)toggleTilt { [self.fixtureMap moveCamera:[KNMapCameraUpdate tiltTo:self.fixtureMap.tilt>20?0:45] withUserLocation:NO]; }
- (void)resetCamera {
 [self.fixtureMap moveCamera:[[[KNMapCameraUpdate targetTo:self.initialCenter] zoomTo:1] tiltTo:0] withUserLocation:NO];
 [self restoreFixtures];
}
- (void)restoreFixtures {
 if (!self.fixtureLayer.hasItems) [self.fixtureLayer showItems:KNNaviOwnedPoiFixtures((IntPoint){(int)self.initialCenter.x,(int)self.initialCenter.y}) expiresAt:[NSDate dateWithTimeIntervalSinceNow:1800]];
}
- (void)dealloc { [NSNotificationCenter.defaultCenter removeObserver:self];[self.fixtureLayer invalidate];[self.ownedProbe invalidate]; }
@end
@interface ProbeScene:UIResponder<UIWindowSceneDelegate,CLLocationManagerDelegate>
@property(nonatomic,strong)UIWindow *window;
@property(nonatomic)BOOL starting;
@property(nonatomic,strong)CLLocationManager *startLocationManager;
@property(nonatomic,strong)CLLocation *startLocation;
@property(nonatomic,strong)NSTimer *gpsTimer;
@end
@implementation ProbeScene
- (void)scene:(UIScene*)scene willConnectToSession:(UISceneSession*)session options:(UISceneConnectionOptions*)options {
 self.window=[[UIWindow alloc]initWithWindowScene:(id)scene];self.window.rootViewController=[UIViewController new];[self.window makeKeyAndVisible];
 NSDictionary *config=[NSDictionary dictionaryWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"ProbeConfig" ofType:@"plist"]];
 [KNSDKBridge setLocationUseAllowed:YES];
 [KNSDKBridge initializeWithAppKey:config[@"key"] clientVersion:@"1.2.11" completion:^(NSString *code,NSString *error){dispatch_async(dispatch_get_main_queue(),^{
 if(error){Record(@{@"event":@"auth_error",@"code":code?:@"unknown"});Finish(NO,@"auth_failed");return;}
 Record(@{@"event":@"sdk_authenticated"});
 self.startLocationManager=[CLLocationManager new];self.startLocationManager.delegate=self;
 self.startLocationManager.desiredAccuracy=kCLLocationAccuracyBest;
 [self.startLocationManager requestWhenInUseAuthorization];[self.startLocationManager startUpdatingLocation];
 self.gpsTimer=[NSTimer scheduledTimerWithTimeInterval:1 repeats:YES block:^(NSTimer *timer){[self prepare];}];[self prepare];
 });}];

}
- (void)locationManager:(CLLocationManager*)manager didUpdateLocations:(NSArray<CLLocation*>*)locations {
 self.startLocation=locations.lastObject;[self prepare];
}
- (void)locationManager:(CLLocationManager*)manager didFailWithError:(NSError*)error {
 Record(@{@"event":@"core_location_error",@"code":@(error.code)});
 if(error.code==kCLErrorDenied)Finish(NO,@"device_location_permission_denied");
}
- (void)prepare {
 if(self.starting||finished)return;
 KNSDK *sdk=[KNSDK sharedInstance];CLLocation *location=self.startLocation;
 if(!location||location.horizontalAccuracy<0||location.horizontalAccuracy>100||fabs(location.timestamp.timeIntervalSinceNow)>10||!CLLocationCoordinate2DIsValid(location.coordinate))return;
 IntPoint start=[sdk convertWGS84ToKATECWithLongitude:location.coordinate.longitude latitude:location.coordinate.latitude];
 self.starting=YES;[self.gpsTimer invalidate];[self.startLocationManager stopUpdatingLocation];
 Record(@{@"event":@"device_start_location_received",@"source":@"core_location",@"accuracyWithin100m":@YES});
 // 공개 지점 중 현재 위치와 가까운 지역을 선택하며 좌표 자체는 기록하지 않는다.
 NSArray *pairs=@[
 @[@[@127.0276,@37.4977],@[@127.0592,@37.5081]],
 @[@[@129.0756,@35.1796],@[@129.1298,@35.1631]],
 @[@[@128.6014,@35.8714],@[@128.5909,@35.8542]],
 @[@[@127.3845,@36.3504],@[@127.3789,@36.3624]],
 @[@[@126.8526,@35.1595],@[@126.8784,@35.1460]],
 @[@[@126.5312,@33.4996],@[@126.5219,@33.5052]],
 @[@[@127.7298,@37.8813],@[@127.7205,@37.8740]],
 @[@[@127.9202,@37.3422],@[@127.9291,@37.3493]],
 @[@[@128.8761,@37.7519],@[@128.8967,@37.7710]]];
 double nearest=DBL_MAX;
 for(NSArray *pair in pairs){NSArray *p=pair[0];IntPoint c=[sdk convertWGS84ToKATECWithLongitude:[p[0]doubleValue] latitude:[p[1]doubleValue]];double d=hypot(c.x-start.x,c.y-start.y);if(d<nearest){nearest=d;targetA=pair[0];targetB=pair[1];}}
 if(nearest<1000){NSArray *swap=targetA;targetA=targetB;targetB=swap;}
 KNPOI *origin=[[KNPOI alloc]initWithName:@"현재 위치" pos:start];
 KNPOI *goal=[[KNPOI alloc]initWithName:@"공개 검사 지점" pos:[sdk convertWGS84ToKATECWithLongitude:[targetA[0]doubleValue] latitude:[targetA[1]doubleValue]]];
 [sdk makeTripWithStart:origin goal:goal vias:nil completion:^(KNError *e,KNTrip *trip){dispatch_async(dispatch_get_main_queue(),^{
 if(e||!trip){Finish(NO,@"initial_trip_failed");return;}
 trip.routeConfig=[[KNRouteConfiguration alloc]initWithCarType:KNCarType_Bike];
 [trip routeWithPriority:0 avoidOptions:0 completion:^(KNError *e,NSArray *routes){dispatch_async(dispatch_get_main_queue(),^{
 if(e||!routes.count){Record(@{@"event":@"initial_route_error",@"code":e.code?:@"missing"});Finish(NO,@"initial_route_failed");return;}
 ProbeHost *host=[ProbeHost new]; __weak ProbeHost *weakHost=host; host.onMenu=^(NSInteger item){};host.onPoiTap=^(NSString *name,double lng,double lat){};host.trip=trip;host.modalPresentationStyle=UIModalPresentationOverFullScreen;
 [self.window.rootViewController presentViewController:host animated:NO completion:nil];
 });}];
 });}];
}
@end
@interface ProbeApp:UIResponder<UIApplicationDelegate>@end
@implementation ProbeApp
- (UISceneConfiguration*)application:(UIApplication*)app configurationForConnectingSceneSession:(UISceneSession*)session options:(UISceneConnectionOptions*)options {UISceneConfiguration *c=[[UISceneConfiguration alloc]initWithName:@"RerouteChecks" sessionRole:session.role];c.delegateClass=ProbeScene.class;return c;}
- (void)applicationWillResignActive:(UIApplication*)app{[KNSDKBridge handleWillResignActive];}
- (void)applicationDidEnterBackground:(UIApplication*)app{[KNSDKBridge handleDidEnterBackground];}
- (void)applicationWillEnterForeground:(UIApplication*)app{[KNSDKBridge handleWillEnterForeground];}
- (void)applicationDidBecomeActive:(UIApplication*)app{[KNSDKBridge handleDidBecomeActive];}
@end
int main(int argc,char *argv[]){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(ProbeApp.class));}}
