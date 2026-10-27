#import <UIKit/UIKit.h>
#import <objc/runtime.h>
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNMapMarker.h>
#import <KNSDK/KNMapMarkerEventListener.h>
#import "KNNaviGasPriceLayer.h"
#import "KNNaviHazardSheet.h"
#import "KNSDKBridge.h"

@interface PriceMapProbe : UIView
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
  NSArray *owned=[layer valueForKey:@"owned"];
  UIButton *own=owned.firstObject[@"button"];UIImage *image=owned.firstObject[@"image"];
  UIView *content=owned.firstObject[@"content"];UIView *overlay=[layer valueForKey:@"overlay"];
  if (![own isDescendantOfView:map] || owned.count!=1 || image.size.width!=116 || image.size.height!=34 || map.markers.count!=1 || map.markerEventListener!=previous) { NSLog(@"FAIL price overlay touched SDK markers/listener"); failures++; }
  [own sendActionsForControlEvents:UIControlEventTouchUpInside];
  CGFloat lastScale=2;
  for (NSNumber *zoom in @[@1,@2,@3,@4,@8,@16]) {
    map.zoom=zoom.floatValue;[layer performSelector:NSSelectorFromString(@"updateScreenPositions")];
    CGFloat scale=content.transform.a;
    if (scale>=lastScale || own.bounds.size.height!=44 || ((NSArray *)[layer valueForKey:@"owned"]).firstObject[@"image"]!=image) { NSLog(@"FAIL continuous price scale/image/touch area"); failures++; }
    lastScale=scale;
  }
  map.zoom=32;[layer performSelector:NSSelectorFromString(@"updateScreenPositions")];
  if (!overlay.hidden) { NSLog(@"FAIL regional overview retained prices"); failures++; }
  map.zoom=1;[layer performSelector:NSSelectorFromString(@"updateScreenPositions")];
  CGPoint buttonPoint=[own convertPoint:CGPointMake(own.bounds.size.width/2,22) toView:overlay];
  if ([overlay hitTest:buttonPoint withEvent:nil]!=own || [overlay hitTest:CGPointMake(1,1) withEvent:nil]!=nil) { NSLog(@"FAIL price touch/passthrough"); failures++; }
  for (int i=0;i<50;i++) [layer updatePosition:position timestamp:NSDate.date active:YES];
  if (requests!=1 || ((NSArray *)[layer valueForKey:@"owned"]).firstObject[@"button"]!=own || [[layer valueForKey:@"expiresAt"] timeIntervalSince1970]>now/1000+1801) { NSLog(@"FAIL price cache restarted TTL or rebuilt per GPS"); failures++; }
  id<KNMapMarkerEventListener> listener=map.markerEventListener;
  [listener mapView:(id)map onSingleTappedWithMarker:foreign];[listener mapView:(id)map onDoubleTappedWithMarker:foreign];[listener mapView:(id)map onLongPressedWithMarker:foreign];[listener mapView:(id)map onMarkerAnimationEnded:foreign];[listener mapView:(id)map onCalloutBubbleSelected:foreign];
  if (selections!=1 || previous.forwarded!=5) { NSLog(@"FAIL price selection/SDK listener preservation"); failures++; }
  [layer pause];
  if ([[layer valueForKey:@"owned"] count] || [layer valueForKey:@"displayLink"] || layer.context) { NSLog(@"FAIL hidden price marker/pending cleanup"); failures++; }
  [layer updatePosition:position timestamp:NSDate.date active:YES];
  if (requests!=1 || [[layer valueForKey:@"owned"] count]!=1) { NSLog(@"FAIL foreground price cache reuse"); failures++; }
  [layer setValue:[NSDate dateWithTimeIntervalSinceNow:-1] forKey:@"expiresAt"];
  [layer updatePosition:position timestamp:NSDate.date active:YES];
  if ([[layer valueForKey:@"owned"] count]) { NSLog(@"FAIL expired price remained visible"); failures++; }
  [layer setValue:[NSDate dateWithTimeIntervalSinceNow:-31] forKey:@"requestedAt"];
  [layer updatePosition:position timestamp:NSDate.date active:YES];NSString *second=layer.context[@"requestId"];
  [layer pause];[layer applyResponse:@{@"requestId":second,@"stations":@[station],@"fetchedAt":@(now),@"expiresAt":@(now+3600000)}];
  if ([[layer valueForKey:@"owned"] count]) { NSLog(@"FAIL late inactive response recreated markers"); failures++; }
  [layer setValue:nil forKey:@"requestedAt"];[layer updatePosition:position timestamp:NSDate.date active:YES];
  NSString *third=layer.context[@"requestId"];
  [layer applyResponse:@{@"requestId":first,@"stations":@[station],@"fetchedAt":@(now),@"expiresAt":@(now+3600000)}];
  if (![layer.context[@"requestId"] isEqual:third]) { NSLog(@"FAIL stale request cleared newer price request"); failures++; }
  [KNSDKBridge setLocationUseAllowed:NO];[layer applyResponse:@{@"requestId":third,@"stations":@[station],@"fetchedAt":@(now),@"expiresAt":@(now+3600000)}];
  if ([[layer valueForKey:@"owned"] count]) { NSLog(@"FAIL revoked location showed prices"); failures++; }
  [layer invalidate];
  if (map.markerEventListener!=previous || map.markers.count!=1) { NSLog(@"FAIL price teardown touched SDK marker/listener"); failures++; }
  [KNSDKBridge setLocationUseAllowed:YES];
  KNNaviGasPriceLayer *dense=[[KNNaviGasPriceLayer alloc] initWithMap:(id)map];
  [dense updatePosition:position timestamp:NSDate.date active:YES];
  NSMutableArray *many=[NSMutableArray new];
  for (int i=0;i<30;i++) { NSMutableDictionary *row=[station mutableCopy];row[@"id"]=[NSString stringWithFormat:@"station-%d",i];row[@"latitude"]=@(37.501+i*0.001);[many addObject:row]; }
  [dense applyResponse:@{@"requestId":dense.context[@"requestId"],@"stations":many,@"fetchedAt":@(now),@"expiresAt":@(now+3600000)}];
  NSArray *items=[dense valueForKey:@"owned"];map.zoom=8;[dense performSelector:NSSelectorFromString(@"updateScreenPositions")];
  NSUInteger visible=0;for (NSDictionary *item in items) if (![item[@"button"] isHidden]) visible++;
  if (items.count!=24 || visible>8) { NSLog(@"FAIL zoomed-out price density"); failures++; }
  [dense invalidate];
  KNNaviGasPriceLayer *empty=[[KNNaviGasPriceLayer alloc] initWithMap:(id)map];
  [empty updatePosition:position timestamp:NSDate.date active:YES];
  [empty applyResponse:@{@"requestId":empty.context[@"requestId"],@"stations":@[],@"fetchedAt":@(now),@"expiresAt":@(now+300000)}];
  if ([empty valueForKey:@"overlay"] || [empty valueForKey:@"displayLink"]) { NSLog(@"FAIL empty results kept visual polling alive"); failures++; }
  [empty invalidate];
  window.hidden=YES;
  method_setImplementation(method,original);imp_removeBlock(replacement);
  [KNSDKBridge setLocationUseAllowed:YES];
  return failures;
}
