#import <UIKit/UIKit.h>
#import <objc/runtime.h>
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNMapMarker.h>
#import <KNSDK/KNMapMarkerEventListener.h>
#import "KNNaviGasPriceLayer.h"
#import "KNNaviGuidePoiOverlay.h"
#import "KNNaviOwnedPoiFixtures.h"
#import "KNNaviOwnedPoiLayer.h"
#import "KNNaviGuidePoiArtwork.h"
#import "KNNaviHazardSheet.h"
#import "KNSDKBridge.h"

@interface PoiPropertiesProbe:NSObject
@property(nonatomic) BOOL isVisible;
@end
@implementation PoiPropertiesProbe @end
@interface PriceMapProbe : UIView
@property(nonatomic, strong) PoiPropertiesProbe *poiProperties;
@property(nonatomic, weak) id<KNMapMarkerEventListener> markerEventListener;
@property(nonatomic, strong) NSMutableArray *markers;
@property(nonatomic)float zoom;
@property(nonatomic)FloatPoint coordinate;
@property(nonatomic)FloatPoint anchor;
@property(nonatomic)float bearing;
@property(nonatomic)float tilt;
@end
@implementation PriceMapProbe
- (CGPoint)katecToScreen:(FloatPoint)p { return CGPointMake(self.bounds.size.width/2+(p.x-300000)/self.zoom,self.bounds.size.height/2-(p.y-400000)/self.zoom); }
- (FloatPoint)screenToKatec:(CGPoint)p { return (FloatPoint){300000+(p.x-self.bounds.size.width/2)*self.zoom,400000-(p.y-self.bounds.size.height/2)*self.zoom}; }
- (void)addMarker:(KNMapMarker *)marker { [self.markers addObject:marker]; }
- (void)removeMarker:(KNMapMarker *)marker { [self.markers removeObjectIdenticalTo:marker]; }
@end
@interface PriceSDKProbe : NSObject @end
@implementation PriceSDKProbe
- (DoublePoint)convertKATECToWGS84WithX:(SInt32)x y:(SInt32)y { return (DoublePoint){127+(x-300000)/100000.0,37.5+(y-400000)/100000.0}; }
- (IntPoint)convertWGS84ToKATECWithLongitude:(double)lng latitude:(double)lat { return (IntPoint){300000+(lng-127)*100000,400000+(lat-37.5)*100000}; }
@end
@interface PriceListenerProbe : NSObject <KNMapMarkerEventListener>
@property(nonatomic) NSUInteger forwarded;
@end
@implementation PriceListenerProbe
- (void)mapView:(KNMapView *)map onSingleTappedWithMarker:(KNMapMarker *)marker { self.forwarded++; }
- (void)mapView:(KNMapView *)map onDoubleTappedWithMarker:(KNMapMarker *)marker { self.forwarded++; }
- (void)mapView:(KNMapView *)map onLongPressedWithMarker:(KNMapMarker *)marker { self.forwarded++; }
- (void)mapView:(KNMapView *)map onMarkerAnimationEnded:(KNMapMarker *)marker { self.forwarded++; }
- (void)mapView:(KNMapView *)map onCalloutBubbleSelected:(KNMapMarker *)marker { self.forwarded++; }
@end
static BOOL HasLabel(UIView *view,NSString *text) {
  if ([view isKindOfClass:UILabel.class] && [((UILabel *)view).text isEqual:text]) return YES;
  for (UIView *child in view.subviews) if (HasLabel(child,text)) return YES;
  return NO;
}
int RunKNNaviGasPriceTests(void) {
  int failures=0;
  [KNSDKBridge setLocationUseAllowed:YES];
  KNNaviHazardSheet *poi=[[KNNaviHazardSheet alloc] initWithTitle:@"지도 테스트 장소" detail:@"미리보기에서 확인 후 안내를 변경해요" options:@[@{@"key":@"goal",@"label":@"목적지로 설정",@"symbol":@"motomap.destination"},@{@"key":@"via",@"label":@"경유지로 추가",@"symbol":@"plus.circle"}] completion:^(NSInteger picked) {}];
  [poi loadViewIfNeeded];
  if (!HasLabel(poi.view,@"지도 테스트 장소") || !HasLabel(poi.view,@"목적지로 설정") || !HasLabel(poi.view,@"경유지로 추가") || poi.modalPresentationStyle!=UIModalPresentationOverFullScreen) { NSLog(@"FAIL app-owned POI sheet title/actions"); failures++; }
  PriceSDKProbe *sdk=[PriceSDKProbe new];
  Method method=class_getClassMethod(KNSDK.class,@selector(sharedInstance)); IMP original=method_getImplementation(method);
  IMP replacement=imp_implementationWithBlock(^id(id object){ return sdk; });method_setImplementation(method,replacement);
  UIWindow *window=[[UIWindow alloc] initWithFrame:CGRectMake(0,0,390,844)];
  UIViewController *host=[UIViewController new];window.rootViewController=host;[window makeKeyAndVisible];
  PriceMapProbe *map=[[PriceMapProbe alloc] initWithFrame:host.view.bounds];map.zoom=1;[host.view addSubview:map];map.markers=[NSMutableArray new];
  PriceListenerProbe *previous=[PriceListenerProbe new];map.markerEventListener=previous;
  KNMapMarker *foreign=[KNMapMarker marker];[map.markers addObject:foreign];
  KNNaviGasPriceLayer *layer=[[KNNaviGasPriceLayer alloc] initWithMap:(id)map];
  __block NSUInteger requests=0,selections=0;layer.onFetch=^{requests++;};layer.onSelect=^(NSDictionary *station){if ([station[@"id"] isEqual:@"fixture"]) selections++;};
  DoublePoint position={300000,400000};
  [layer updatePosition:position timestamp:NSDate.date active:YES];
  NSString *first=layer.context[@"requestId"];
  if (requests!=1 || ![layer.context[@"prod"] isEqual:@"B027"]) { NSLog(@"FAIL price request missing/incorrect fuel"); failures++; }
  double now=NSDate.date.timeIntervalSince1970*1000;
  NSDictionary *station=@{@"id":@"fixture",@"name":@"공개 검사 주유소",@"brand":@"S-OIL",@"price":@1699,@"latitude":@37.501,@"longitude":@127.001};
  NSMutableDictionary *zero=[station mutableCopy];zero[@"id"]=@"zero";zero[@"price"]=@0;
  [layer applyResponse:@{@"requestId":first,@"stations":@[station,zero],@"fetchedAt":@(now-1800000),@"expiresAt":@(now+1800000)}];
  NSArray *owned=[[layer valueForKey:@"renderer"] valueForKey:@"owned"];
  UIButton *own=owned.firstObject[@"button"];UIImage *image=owned.firstObject[@"image"];
  UIView *content=owned.firstObject[@"content"];UIView *overlay=[[layer valueForKey:@"renderer"] valueForKey:@"overlay"];
  if (![own isDescendantOfView:map] || owned.count!=1 || image.size.width!=116 || image.size.height!=34 || map.markers.count!=1 || map.markerEventListener!=previous) { NSLog(@"FAIL price overlay touched SDK markers/listener"); failures++; }
  [own sendActionsForControlEvents:UIControlEventTouchUpInside];
  CGFloat lastScale=2;
  for (NSNumber *zoom in @[@1,@2,@3,@4,@8,@16]) {
    map.zoom=zoom.floatValue;[[layer valueForKey:@"renderer"] performSelector:NSSelectorFromString(@"updateScreenPositions")];
    CGFloat scale=content.transform.a;
    if (scale>=lastScale || own.bounds.size.height!=44 || ((NSArray *)[[layer valueForKey:@"renderer"] valueForKey:@"owned"]).firstObject[@"image"]!=image) { NSLog(@"FAIL continuous price scale/image/touch area"); failures++; }
    lastScale=scale;
  }
  map.zoom=32;[[layer valueForKey:@"renderer"] performSelector:NSSelectorFromString(@"updateScreenPositions")];
  if (!overlay.hidden) { NSLog(@"FAIL regional overview retained prices"); failures++; }
  map.zoom=1;[[layer valueForKey:@"renderer"] performSelector:NSSelectorFromString(@"updateScreenPositions")];
  CGPoint buttonPoint=[own convertPoint:CGPointMake(own.bounds.size.width/2,22) toView:overlay];
  if ([overlay hitTest:buttonPoint withEvent:nil]!=own || [overlay hitTest:CGPointMake(1,1) withEvent:nil]!=nil) { NSLog(@"FAIL price touch/passthrough"); failures++; }
  [overlay removeFromSuperview];
  [[layer valueForKey:@"renderer"] performSelector:NSSelectorFromString(@"updateScreenPositions")];
  if (overlay.superview!=map) { NSLog(@"FAIL SDK child cleanup lost cached POI overlay");failures++; }
  for (int i=0;i<50;i++) [layer updatePosition:position timestamp:NSDate.date active:YES];
  if (requests!=1 || ((NSArray *)[[layer valueForKey:@"renderer"] valueForKey:@"owned"]).firstObject[@"button"]!=own || [[layer valueForKey:@"expiresAt"] timeIntervalSince1970]>now/1000+1801) { NSLog(@"FAIL price cache restarted TTL or rebuilt per GPS"); failures++; }
  id<KNMapMarkerEventListener> listener=map.markerEventListener;
  [listener mapView:(id)map onSingleTappedWithMarker:foreign];[listener mapView:(id)map onDoubleTappedWithMarker:foreign];[listener mapView:(id)map onLongPressedWithMarker:foreign];[listener mapView:(id)map onMarkerAnimationEnded:foreign];[listener mapView:(id)map onCalloutBubbleSelected:foreign];
  if (selections!=1 || previous.forwarded!=5) { NSLog(@"FAIL price selection/SDK listener preservation"); failures++; }
  [layer pause];
  if ([[[layer valueForKey:@"renderer"] valueForKey:@"owned"] count] || [[layer valueForKey:@"renderer"] valueForKey:@"displayLink"] || layer.context) { NSLog(@"FAIL hidden price marker/pending cleanup"); failures++; }
  [layer updatePosition:position timestamp:NSDate.date active:YES];
  if (requests!=1 || [[[layer valueForKey:@"renderer"] valueForKey:@"owned"] count]!=1) { NSLog(@"FAIL foreground price cache reuse"); failures++; }
  [layer setValue:[NSDate dateWithTimeIntervalSinceNow:-1] forKey:@"expiresAt"];
  [layer updatePosition:position timestamp:NSDate.date active:YES];
  if ([[[layer valueForKey:@"renderer"] valueForKey:@"owned"] count]) { NSLog(@"FAIL expired price remained visible"); failures++; }
  [layer setValue:[NSDate dateWithTimeIntervalSinceNow:-31] forKey:@"requestedAt"];
  [layer updatePosition:position timestamp:NSDate.date active:YES];NSString *second=layer.context[@"requestId"];
  [layer pause];[layer applyResponse:@{@"requestId":second,@"stations":@[station],@"fetchedAt":@(now),@"expiresAt":@(now+3600000)}];
  if ([[[layer valueForKey:@"renderer"] valueForKey:@"owned"] count]) { NSLog(@"FAIL late inactive response recreated markers"); failures++; }
  [layer setValue:nil forKey:@"requestedAt"];[layer updatePosition:position timestamp:NSDate.date active:YES];
  NSString *third=layer.context[@"requestId"];
  [layer applyResponse:@{@"requestId":first,@"stations":@[station],@"fetchedAt":@(now),@"expiresAt":@(now+3600000)}];
  if (![layer.context[@"requestId"] isEqual:third]) { NSLog(@"FAIL stale request cleared newer price request"); failures++; }
  [KNSDKBridge setLocationUseAllowed:NO];[layer applyResponse:@{@"requestId":third,@"stations":@[station],@"fetchedAt":@(now),@"expiresAt":@(now+3600000)}];
  if ([[[layer valueForKey:@"renderer"] valueForKey:@"owned"] count]) { NSLog(@"FAIL revoked location showed prices"); failures++; }
  [layer invalidate];
  if (map.markerEventListener!=previous || map.markers.count!=1) { NSLog(@"FAIL price teardown touched SDK marker/listener"); failures++; }
  [KNSDKBridge setLocationUseAllowed:YES];
  KNNaviGasPriceLayer *dense=[[KNNaviGasPriceLayer alloc] initWithMap:(id)map];
  [dense updatePosition:position timestamp:NSDate.date active:YES];
  NSMutableArray *many=[NSMutableArray new];
  for (int i=0;i<30;i++) { NSMutableDictionary *row=[station mutableCopy];row[@"id"]=[NSString stringWithFormat:@"station-%d",i];row[@"latitude"]=@(37.501+i*0.001);[many addObject:row]; }
  [dense applyResponse:@{@"requestId":dense.context[@"requestId"],@"stations":many,@"fetchedAt":@(now),@"expiresAt":@(now+3600000)}];
  NSArray *items=[[dense valueForKey:@"renderer"] valueForKey:@"owned"];map.zoom=8;[[dense valueForKey:@"renderer"] performSelector:NSSelectorFromString(@"updateScreenPositions")];
  NSUInteger visible=0;for (NSDictionary *item in items) if (![item[@"button"] isHidden]) visible++;
  if (items.count!=24 || visible>8) { NSLog(@"FAIL zoomed-out price density"); failures++; }
  [dense invalidate];
  KNNaviGasPriceLayer *empty=[[KNNaviGasPriceLayer alloc] initWithMap:(id)map];
  [empty updatePosition:position timestamp:NSDate.date active:YES];
  [empty applyResponse:@{@"requestId":empty.context[@"requestId"],@"stations":@[],@"fetchedAt":@(now),@"expiresAt":@(now+300000)}];
  if ([[empty valueForKey:@"renderer"] valueForKey:@"overlay"] || [[empty valueForKey:@"renderer"] valueForKey:@"displayLink"]) { NSLog(@"FAIL empty results kept visual polling alive"); failures++; }
  [empty invalidate];
  // 다종 POI는 같은 표시 계층을 사용하고 가격 없는 주유소도 유효한 항목이다.
  KNNaviGuidePoiOverlay *mixed=[[KNNaviGuidePoiOverlay alloc] initWithMap:(id)map];map.zoom=0.5;
  NSArray *fixtures=KNNaviOwnedPoiFixtures((IntPoint){300000,400000});
  UIGraphicsImageRenderer *labelRenderer=[[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(360,204)];
  UIImage *labelSheet=[labelRenderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
    [[UIColor colorWithWhite:0.93 alpha:1] setFill];UIRectFill(CGRectMake(0,0,360,204));
    for(NSUInteger i=0;i<fixtures.count;i++)[fixtures[i][@"image"] drawAtPoint:CGPointMake(12+(i%2)*178,18+(i/2)*64)];
  }];
  NSString *labelFile=[NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"owned-poi-labels.png"];
  [UIImagePNGRepresentation(labelSheet) writeToFile:labelFile atomically:YES];
  [mixed showItems:fixtures expiresAt:[NSDate dateWithTimeIntervalSinceNow:60]];
  NSArray *mixedItems=[mixed valueForKey:@"owned"];
  if (mixedItems.count!=6 || ![mixedItems.firstObject[@"key"] isEqual:@"home"]) { NSLog(@"FAIL mixed POI snapshot/priority");failures++; }
  __block NSString *selectedKey=nil;mixed.onSelect=^(NSString *key){selectedKey=key;};
  for (NSDictionary *item in mixedItems) {
    UIButton *button=item[@"button"];
    if (button.bounds.size.width<44 || button.bounds.size.height<44) { NSLog(@"FAIL POI touch target below44");failures++; }
    if ([item[@"key"] isEqual:@"no-price"]) {
      [button sendActionsForControlEvents:UIControlEventTouchUpInside];
      if (![selectedKey isEqual:@"no-price"]) { NSLog(@"FAIL no-price POI selection identity");failures++; }
    }
  }
  map.bearing=90;map.tilt=50;map.coordinate=(FloatPoint){300010,400010};
  [mixed performSelector:NSSelectorFromString(@"updateScreenPositions")];
  if ([[mixed valueForKey:@"owned"] count]!=6 || ![[mixed valueForKey:@"cameraKnown"] boolValue]) { NSLog(@"FAIL camera change removed POI snapshot");failures++; }
  [KNSDKBridge setLocationUseAllowed:NO];[mixed performSelector:NSSelectorFromString(@"updateScreenPositions")];
  if (mixed.hasItems || [mixed valueForKey:@"displayLink"]) { NSLog(@"FAIL revoked POI snapshot retained");failures++; }
  [KNSDKBridge setLocationUseAllowed:YES];[mixed invalidate];
  map.zoom=1;map.coordinate=(FloatPoint){300000,400000};
  map.poiProperties=[PoiPropertiesProbe new];map.poiProperties.isVisible=YES;
  KNNaviOwnedPoiLayer *coordinator=[[KNNaviOwnedPoiLayer alloc] initWithMap:(id)map];
  __block BOOL active=YES;coordinator.isActive=^BOOL{return active;};
  __block NSUInteger viewportRequests=0;coordinator.onRequest=^{viewportRequests++;};
  [coordinator performSelector:NSSelectorFromString(@"poll")];
  if(coordinator.context || !map.poiProperties.isVisible){NSLog(@"FAIL owned POI fetched before camera settled");failures++;}
  [coordinator setValue:[NSDate dateWithTimeIntervalSinceNow:-1] forKey:@"settledAt"];
  [coordinator performSelector:NSSelectorFromString(@"poll")];
  NSString *viewportId=coordinator.context[@"requestId"]?:@"missing";
  if([viewportId isEqual:@"missing"] || viewportRequests!=1){NSLog(@"FAIL viewport context missing");failures++;}
  double expiry=NSDate.date.timeIntervalSince1970*1000+60000;
  NSDictionary *place=@{@"key":@"place:fixture",@"name":@"카페",@"latitude":@37.5,@"longitude":@127,@"category":@"cafe"};
  if([coordinator applyResponse:@{@"requestId":@"stale",@"pois":@[place],@"expiresAt":@(expiry)}] || !map.poiProperties.isVisible){NSLog(@"FAIL stale snapshot changed base POIs");failures++;}
  BOOL accepted=[coordinator applyResponse:@{@"requestId":viewportId,@"pois":@[place],@"expiresAt":@(expiry)}];
  if(!accepted || map.poiProperties.isVisible || !coordinator.ownsPoiVisibility){NSLog(@"FAIL ready snapshot did not own base POIs");failures++;}
  __block NSString *selectedPoiKey=nil;coordinator.onSelect=^(NSString *key,NSString *snapshotId){if([snapshotId isEqual:viewportId])selectedPoiKey=key;};
  KNNaviGuidePoiOverlay *presentation=[coordinator valueForKey:@"renderer"];
  UIButton *poiButton=((NSArray *)[presentation valueForKey:@"owned"]).firstObject[@"button"];
  [poiButton sendActionsForControlEvents:UIControlEventTouchUpInside];
  if(![selectedPoiKey isEqual:@"place:fixture"]){NSLog(@"FAIL owned POI stable selection key");failures++;}
  presentation.exclusionRects=@[[NSValue valueWithCGRect:map.bounds]];
  [presentation performSelector:NSSelectorFromString(@"updateScreenPositions")];
  if(!poiButton.hidden){NSLog(@"FAIL protected navigation UI covered by POI");failures++;}
  [coordinator setValue:[NSDate dateWithTimeIntervalSinceNow:-1] forKey:@"expiresAt"];
  map.coordinate=(FloatPoint){300001,400001};[coordinator performSelector:NSSelectorFromString(@"poll")];
  if(!map.poiProperties.isVisible || coordinator.ownsPoiVisibility){NSLog(@"FAIL moving camera skipped expired POI restoration");failures++;}
  [coordinator refresh];
  if(!map.poiProperties.isVisible || coordinator.ownsPoiVisibility){NSLog(@"FAIL explicit reset failed to restore SDK POIs");failures++;}
  [coordinator performSelector:NSSelectorFromString(@"poll")];[coordinator setValue:[NSDate dateWithTimeIntervalSinceNow:-1] forKey:@"settledAt"];
  [coordinator performSelector:NSSelectorFromString(@"poll")];
  [coordinator applyResponse:@{@"requestId":coordinator.context[@"requestId"]?:@"missing",@"error":@"unavailable"}];
  if(!map.poiProperties.isVisible){NSLog(@"FAIL provider failure failed to restore SDK POIs");failures++;}
  [coordinator refresh];map.coordinate=(FloatPoint){300002,400002};[coordinator performSelector:NSSelectorFromString(@"poll")];
  [coordinator setValue:[NSDate dateWithTimeIntervalSinceNow:-3] forKey:@"dirtySince"];
  map.coordinate=(FloatPoint){300003,400003};[coordinator performSelector:NSSelectorFromString(@"poll")];
  NSString *movingId=coordinator.context[@"requestId"]?:@"missing";
  map.coordinate=(FloatPoint){300004,400004};[coordinator performSelector:NSSelectorFromString(@"poll")];
  if(![coordinator.context[@"requestId"] isEqual:movingId] || [movingId isEqual:@"missing"] ||
    ![coordinator applyResponse:@{@"requestId":movingId,@"pois":@[place],@"expiresAt":@(expiry)}]) {
    NSLog(@"FAIL auto-follow starved or rejected in-coverage POI response");failures++;
  }
  if(![coordinator applyResponse:@{@"requestId":movingId,@"pois":@[place],@"expiresAt":@(expiry)}]){NSLog(@"FAIL gas followup rejected current snapshot");failures++;}
  active=NO;[coordinator performSelector:NSSelectorFromString(@"poll")];
  if(coordinator.context || !map.poiProperties.isVisible){NSLog(@"FAIL inactive viewport was retained");failures++;}
  [coordinator invalidate];
  window.hidden=YES;
  method_setImplementation(method,original);imp_removeBlock(replacement);
  [KNSDKBridge setLocationUseAllowed:YES];
  return failures;
}
