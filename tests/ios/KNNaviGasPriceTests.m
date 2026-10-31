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
static NSDictionary *PoiEntries(id owner) { return [[owner valueForKey:@"renderer"] valueForKey:@"entries"]; }
static NSUInteger PoiCount(id owner) { return PoiEntries(owner).count; }
static KNMapMarker *PoiMarker(id owner,NSString *key) { return [PoiEntries(owner)[key] valueForKey:@"marker"]; }
static void TapMarker(PriceMapProbe *map,KNMapMarker *marker) { [map.markerEventListener mapView:(id)map onSingleTappedWithMarker:marker]; }
int RunKNNaviGasPriceTests(void) {
  int failures=0;
  [KNSDKBridge setLocationUseAllowed:YES];
  KNNaviHazardSheet *poi=[[KNNaviHazardSheet alloc] initWithTitle:@"지도 테스트 장소" detail:@"미리보기에서 확인 후 안내를 변경해요" options:@[@{@"key":@"goal",@"label":@"목적지로 설정",@"symbol":@"motomap.destination"},@{@"key":@"via",@"label":@"경유지로 추가",@"symbol":@"plus.circle"}] completion:^(NSInteger picked) {}];
  [poi loadViewIfNeeded];
  if (!HasLabel(poi.view,@"지도 테스트 장소") || !HasLabel(poi.view,@"목적지로 설정") || !HasLabel(poi.view,@"경유지로 추가") || poi.modalPresentationStyle!=UIModalPresentationOverFullScreen) { NSLog(@"FAIL app-owned POI sheet title/actions"); failures++; }
  [poi updateTitle:@"GS칼텍스 삼성주유소" detail:@"휘발유 1,699원 · 고급휘발유 1,950원"];
  if (!HasLabel(poi.view,@"GS칼텍스 삼성주유소") || !HasLabel(poi.view,@"휘발유 1,699원 · 고급휘발유 1,950원")) { NSLog(@"FAIL POI sheet title/detail update"); failures++; }
  [poi updateTitle:nil detail:@"미리보기에서 확인 후 안내를 변경해요"];
  if (!HasLabel(poi.view,@"GS칼텍스 삼성주유소")) { NSLog(@"FAIL POI sheet kept title on detail-only update"); failures++; }
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
  id priceEntry=PoiEntries(layer)[@"fixture"];UIImage *image=[priceEntry valueForKey:@"image"];
  KNMapMarker *normalMarker=[priceEntry valueForKey:@"marker"],*compactMarker=[priceEntry valueForKey:@"compactMarker"];
  UIImage *compactImage=[priceEntry valueForKey:@"compactImage"];
  // 정상·축소 마커 두 개가 SDK 지도에 올라가고 기존 SDK 마커는 건드리지 않는다.
  if (PoiCount(layer)!=1 || image.size.width!=116 || image.size.height!=34 || !normalMarker || !compactMarker ||
      lround(compactImage.size.width)!=90 || map.markers.count!=3 || ![map.markers containsObject:foreign] ||
      normalMarker.icon!=image || compactMarker.icon!=compactImage) { NSLog(@"FAIL price SDK marker tiers/foreign marker"); failures++; }
  if ([map.subviews count]!=0) { NSLog(@"FAIL price rendering added UIKit children to the SDK map"); failures++; }
  TapMarker(map,normalMarker);
  for (int i=0;i<50;i++) [layer updatePosition:position timestamp:NSDate.date active:YES];
  if (requests!=1 || PoiEntries(layer)[@"fixture"]!=priceEntry || map.markers.count!=3 || [[layer valueForKey:@"expiresAt"] timeIntervalSince1970]>now/1000+1801) { NSLog(@"FAIL price cache restarted TTL or rebuilt per GPS"); failures++; }
  id<KNMapMarkerEventListener> listener=map.markerEventListener;
  if (listener==previous || listener==nil) { NSLog(@"FAIL marker router not installed while prices show"); failures++; }
  [listener mapView:(id)map onSingleTappedWithMarker:foreign];[listener mapView:(id)map onDoubleTappedWithMarker:foreign];[listener mapView:(id)map onLongPressedWithMarker:foreign];[listener mapView:(id)map onMarkerAnimationEnded:foreign];[listener mapView:(id)map onCalloutBubbleSelected:foreign];
  [listener mapView:(id)map onDoubleTappedWithMarker:normalMarker];
  if (selections!=1 || previous.forwarded!=5) { NSLog(@"FAIL price selection/SDK listener preservation"); failures++; }
  [layer pause];
  if (PoiCount(layer) || map.markers.count!=1 || map.markerEventListener!=previous || layer.context) { NSLog(@"FAIL hidden price marker/pending cleanup"); failures++; }
  [layer updatePosition:position timestamp:NSDate.date active:YES];
  if (requests!=1 || PoiCount(layer)!=1) { NSLog(@"FAIL foreground price cache reuse"); failures++; }
  [layer setValue:[NSDate dateWithTimeIntervalSinceNow:-1] forKey:@"expiresAt"];
  [layer updatePosition:position timestamp:NSDate.date active:YES];
  if (PoiCount(layer)) { NSLog(@"FAIL expired price remained visible"); failures++; }
  [layer setValue:[NSDate dateWithTimeIntervalSinceNow:-31] forKey:@"requestedAt"];
  [layer updatePosition:position timestamp:NSDate.date active:YES];NSString *second=layer.context[@"requestId"];
  [layer pause];[layer applyResponse:@{@"requestId":second,@"stations":@[station],@"fetchedAt":@(now),@"expiresAt":@(now+3600000)}];
  if (PoiCount(layer)) { NSLog(@"FAIL late inactive response recreated markers"); failures++; }
  [layer setValue:nil forKey:@"requestedAt"];[layer updatePosition:position timestamp:NSDate.date active:YES];
  NSString *third=layer.context[@"requestId"];
  [layer applyResponse:@{@"requestId":first,@"stations":@[station],@"fetchedAt":@(now),@"expiresAt":@(now+3600000)}];
  if (![layer.context[@"requestId"] isEqual:third]) { NSLog(@"FAIL stale request cleared newer price request"); failures++; }
  [KNSDKBridge setLocationUseAllowed:NO];[layer applyResponse:@{@"requestId":third,@"stations":@[station],@"fetchedAt":@(now),@"expiresAt":@(now+3600000)}];
  if (PoiCount(layer)) { NSLog(@"FAIL revoked location showed prices"); failures++; }
  [layer invalidate];
  if (map.markerEventListener!=previous || map.markers.count!=1) { NSLog(@"FAIL price teardown touched SDK marker/listener"); failures++; }
  [KNSDKBridge setLocationUseAllowed:YES];
  KNNaviGasPriceLayer *dense=[[KNNaviGasPriceLayer alloc] initWithMap:(id)map];
  [dense updatePosition:position timestamp:NSDate.date active:YES];
  NSMutableArray *many=[NSMutableArray new];
  for (int i=0;i<30;i++) { NSMutableDictionary *row=[station mutableCopy];row[@"id"]=[NSString stringWithFormat:@"station-%d",i];row[@"latitude"]=@(37.501+i*0.001);[many addObject:row]; }
  [dense applyResponse:@{@"requestId":dense.context[@"requestId"],@"stations":many,@"fetchedAt":@(now),@"expiresAt":@(now+3600000)}];
  NSUInteger compactMarkers=0;for (id entry in PoiEntries(dense).allValues) if ([entry valueForKey:@"compactMarker"]) compactMarkers++;
  if (PoiCount(dense)!=24 || compactMarkers!=8 || map.markers.count!=1+24+8) { NSLog(@"FAIL zoomed-out price density"); failures++; }
  [dense invalidate];
  KNNaviGasPriceLayer *empty=[[KNNaviGasPriceLayer alloc] initWithMap:(id)map];
  [empty updatePosition:position timestamp:NSDate.date active:YES];
  [empty applyResponse:@{@"requestId":empty.context[@"requestId"],@"stations":@[],@"fetchedAt":@(now),@"expiresAt":@(now+300000)}];
  if (PoiCount(empty) || [[empty valueForKey:@"renderer"] valueForKey:@"watchdog"] || map.markerEventListener!=previous || map.markers.count!=1) { NSLog(@"FAIL empty results kept markers/watchdog alive"); failures++; }
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
  NSDictionary *mixedEntries=[mixed valueForKey:@"entries"];
  KNMapMarker *homeMarker=[mixedEntries[@"home"] valueForKey:@"marker"];
  BOOL ordered=homeMarker!=nil;
  for (NSString *key in mixedEntries) if (((KNMapMarker *)[mixedEntries[key] valueForKey:@"marker"]).priority>homeMarker.priority) ordered=NO;
  if (mixedEntries.count!=6 || !ordered) { NSLog(@"FAIL mixed POI snapshot/priority");failures++; }
  __block NSString *selectedKey=nil;mixed.onSelect=^(NSString *key){selectedKey=key;};
  // 장소별 SDK 마커 탭이 같은 안정 key 로 선택된다.
  TapMarker(map,[mixedEntries[@"no-price"] valueForKey:@"marker"]);
  if (![selectedKey isEqual:@"no-price"]) { NSLog(@"FAIL no-price POI selection identity");failures++; }
  // 일반 장소 아이콘 중심이 좌표에 오도록 하단 중앙 기준 오프셋이 걸린다. 가격 말풍선은 하단 중앙을 쓴다.
  KNMapMarker *cafeMarker=[mixedEntries[@"cafe"] valueForKey:@"marker"],*gasMarker=[mixedEntries[@"gas"] valueForKey:@"marker"];
  if (cafeMarker.pixelOffset.y<=0 || cafeMarker.pixelOffset.x!=0 || gasMarker.pixelOffset.y!=0) { NSLog(@"FAIL marker anchor offsets");failures++; }
  // 선택은 우선순위와 확대 이미지만 바꾸고 마커 집합은 다시 만들지 않는다.
  NSInteger basePriority=cafeMarker.priority;UIImage *baseIcon=cafeMarker.icon;
  mixed.selectedKey=@"cafe";
  if (cafeMarker.priority<=basePriority || cafeMarker.icon==baseIcon || cafeMarker.icon.size.width<=baseIcon.size.width || [[mixed valueForKey:@"entries"] count]!=6 || map.markers.count!=1+6+1) { NSLog(@"FAIL selected marker emphasis");failures++; }
  mixed.selectedKey=nil;
  if (cafeMarker.priority!=basePriority || cafeMarker.icon!=baseIcon) { NSLog(@"FAIL selected marker restore");failures++; }
  // 같은 이미지·좌표의 후속 snapshot 은 마커를 새로 만들지 않아 깜빡이지 않는다.
  [mixed showItems:[fixtures arrayByAddingObject:@{@"key":@"extra",@"label":@"추가",@"priority":@9,@"image":fixtures[3][@"image"],@"price":@NO,@"anchor":[NSValue valueWithCGPoint:CGPointMake(0.5,0.5)],@"x":@300500,@"y":@400500}] expiresAt:[NSDate dateWithTimeIntervalSinceNow:60]];
  if ([[mixed valueForKey:@"entries"] count]!=7 || [[[mixed valueForKey:@"entries"][@"home"] valueForKey:@"marker"] isEqual:homeMarker]==NO) { NSLog(@"FAIL follow-up snapshot rebuilt unchanged markers");failures++; }
  map.bearing=90;map.tilt=50;map.coordinate=(FloatPoint){300010,400010};
  [mixed revalidate];
  if ([[mixed valueForKey:@"entries"] count]!=7) { NSLog(@"FAIL camera change removed POI snapshot");failures++; }
  [KNSDKBridge setLocationUseAllowed:NO];[mixed revalidate];
  if (mixed.hasItems || [mixed valueForKey:@"watchdog"] || map.markers.count!=1 || map.markerEventListener!=previous) { NSLog(@"FAIL revoked POI snapshot retained");failures++; }
  [KNSDKBridge setLocationUseAllowed:YES];[mixed invalidate];
  map.zoom=1;map.coordinate=(FloatPoint){300000,400000};
  UIImage *shortLabel=[KNNaviGuidePoiArtwork imageForPoi:@{@"name":@"카페",@"category":@"cafe"}];
  UIImage *longLabel=[KNNaviGuidePoiArtwork imageForPoi:@{@"name":@"라이더들이 쉬어가는 아주 긴 이름의 카페",@"category":@"cafe"}];
  NSURL *uiURL=[NSBundle.mainBundle URLForResource:@"MotoMapNavigationUI" withExtension:@"bundle"];
  UIImage *mapIcon=[UIImage imageWithContentsOfFile:[[NSBundle bundleWithURL:uiURL] pathForResource:@"cafe_circle" ofType:@"png"]];
  UIImage *guideIcon=[KNNaviGuidePoiArtwork markerImageForPoi:@{@"category":@"cafe"}];
  if(!mapIcon || ![UIImagePNGRepresentation(mapIcon) isEqual:UIImagePNGRepresentation(guideIcon)] ||
    longLabel.size.height<=shortLabel.size.height || longLabel.size.width>114 || longLabel.size.height>68){
    NSLog(@"FAIL map icon parity or two-line POI layout");failures++;
  }
  NSArray *industries=@[@"cafe",@"food",@"bakery",@"shop",@"lodging",@"bank",@"civic",@"beauty",@"toilet",@"park",@"transit",@"fuel",@"parking",@"repair",@"medical",@"pharmacy",@"culture",@"general"];
  for(NSString *industry in industries) {
    UIImage *icon=[KNNaviGuidePoiArtwork markerImageForPoi:@{@"industry":industry}];
    if(!icon || icon.size.width<28 || icon.size.height<28){NSLog(@"FAIL industry marker absent");failures++;}
  }
  UIImage *industryGrid=[[[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(400,600)] imageWithActions:^(UIGraphicsImageRendererContext *context){
    [[UIColor colorWithWhite:.94 alpha:1] setFill];UIRectFill(CGRectMake(0,0,400,600));
    [industries enumerateObjectsUsingBlock:^(NSString *industry,NSUInteger i,BOOL *stop){
      UIImage *image=[KNNaviGuidePoiArtwork imageForPoi:@{@"industry":industry,@"name":industry}];
      [image drawAtPoint:CGPointMake(15+(i%4)*100,15+(i/4)*110)];
    }];
  }];
  NSString *gridPath=[NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"owned-poi-industries.png"];
  [UIImagePNGRepresentation(industryGrid) writeToFile:gridPath atomically:YES];
  map.poiProperties=[PoiPropertiesProbe new];map.poiProperties.isVisible=YES;
  KNNaviOwnedPoiLayer *coordinator=[[KNNaviOwnedPoiLayer alloc] initWithMap:(id)map];
  __block BOOL active=YES;coordinator.isActive=^BOOL{return active;};
  __block NSUInteger viewportRequests=0;coordinator.onRequest=^{viewportRequests++;};
  [coordinator performSelector:NSSelectorFromString(@"poll")];
  if(coordinator.context || !map.poiProperties.isVisible){NSLog(@"FAIL pending POI hid SDK symbols or fetched before settle (SDK base POIs must stay visible)");failures++;}
  [coordinator setValue:[NSDate dateWithTimeIntervalSinceNow:-1] forKey:@"settledAt"];
  [coordinator performSelector:NSSelectorFromString(@"poll")];
  NSString *viewportId=coordinator.context[@"requestId"]?:@"missing";
  if([viewportId isEqual:@"missing"] || viewportRequests!=1 || !coordinator.context[@"center"]){NSLog(@"FAIL viewport context or screen center missing");failures++;}
  double expiry=NSDate.date.timeIntervalSince1970*1000+60000;
  NSDictionary *place=@{@"key":@"place:fixture",@"name":@"카페",@"latitude":@37.5,@"longitude":@127,@"category":@"cafe"};
  if([coordinator applyResponse:@{@"requestId":@"stale",@"pois":@[place],@"expiresAt":@(expiry)}] || !map.poiProperties.isVisible){NSLog(@"FAIL stale snapshot hid SDK POIs (SDK base POIs must stay visible)");failures++;}
  BOOL accepted=[coordinator applyResponse:@{@"requestId":viewportId,@"pois":@[place],@"expiresAt":@(expiry)}];
  if(!accepted || !map.poiProperties.isVisible || !coordinator.ownsPoiVisibility){NSLog(@"FAIL ready snapshot not accepted (SDK base POIs must stay visible)");failures++;}
  NSMutableDictionary *industryPlace=[place mutableCopy];industryPlace[@"industry"]=@"pharmacy";[industryPlace removeObjectForKey:@"category"];
  [coordinator applyResponse:@{@"requestId":viewportId,@"pois":@[industryPlace],@"expiresAt":@(expiry)}];
  NSDictionary *industryStyle=[coordinator valueForKey:@"artwork"][@"place:fixture"][@"style"];
  if(![industryStyle[@"industry"] isEqual:@"pharmacy"]){NSLog(@"FAIL industry dropped in native snapshot");failures++;}
  __block NSString *selectedPoiKey=nil;coordinator.onSelect=^(NSString *key,NSString *snapshotId){if([snapshotId isEqual:viewportId])selectedPoiKey=key;};
  KNNaviGuidePoiOverlay *presentation=[coordinator valueForKey:@"renderer"];
  KNMapMarker *poiMarker=[[presentation valueForKey:@"entries"][@"place:fixture"] valueForKey:@"marker"];
  TapMarker(map,poiMarker);
  if(![selectedPoiKey isEqual:@"place:fixture"]){NSLog(@"FAIL owned POI stable selection key");failures++;}
  presentation.selectedKey=@"place:fixture";
  if(poiMarker.priority!=60000 || !presentation.hasItems){NSLog(@"FAIL owned POI selection emphasis");failures++;}
  [coordinator setValue:[NSDate dateWithTimeIntervalSinceNow:-1] forKey:@"expiresAt"];
  map.coordinate=(FloatPoint){300001,400001};[coordinator performSelector:NSSelectorFromString(@"poll")];
  if(!map.poiProperties.isVisible || !coordinator.ownsPoiVisibility || presentation.hasItems){NSLog(@"FAIL expiry hid SDK POIs or retained expired labels (SDK base POIs must stay visible)");failures++;}
  [coordinator refresh];
  if(!map.poiProperties.isVisible || !coordinator.ownsPoiVisibility){NSLog(@"FAIL explicit reset hid SDK POIs (SDK base POIs must stay visible)");failures++;}
  [coordinator performSelector:NSSelectorFromString(@"poll")];[coordinator setValue:[NSDate dateWithTimeIntervalSinceNow:-1] forKey:@"settledAt"];
  [coordinator performSelector:NSSelectorFromString(@"poll")];
  [coordinator applyResponse:@{@"requestId":coordinator.context[@"requestId"]?:@"missing",@"error":@"unavailable"}];
  if(!map.poiProperties.isVisible){NSLog(@"FAIL provider failure hid SDK POIs (SDK base POIs must stay visible)");failures++;}
  map.zoom=32;[coordinator performSelector:NSSelectorFromString(@"poll")];
  if(!map.poiProperties.isVisible){NSLog(@"FAIL wide zoom hid SDK POIs (SDK base POIs must stay visible)");failures++;}
  map.zoom=1;
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
  // 조회 범위를 벗어나도 새 snapshot 이 올 때까지 기존 마커를 지우지 않고, 바뀌지 않은 마커는 그대로 둔다.
  KNMapMarker *keptMarker=[[presentation valueForKey:@"entries"][@"place:fixture"] valueForKey:@"marker"];
  map.zoom=3;[coordinator performSelector:NSSelectorFromString(@"poll")];
  if(!presentation.hasItems){NSLog(@"FAIL moving out of coverage cleared POIs");failures++;}
  [coordinator setValue:nil forKey:@"retryAfter"];
  [coordinator setValue:[NSDate dateWithTimeIntervalSinceNow:-1] forKey:@"settledAt"];
  [coordinator setValue:[NSDate dateWithTimeIntervalSinceNow:-3] forKey:@"requestedAt"];
  [coordinator performSelector:NSSelectorFromString(@"poll")];
  NSString *widerId=coordinator.context[@"requestId"]?:@"missing";
  if([widerId isEqual:@"missing"] || !presentation.hasItems){NSLog(@"FAIL out-of-coverage move skipped refresh or cleared POIs");failures++;}
  [coordinator applyResponse:@{@"requestId":widerId,@"error":@"unavailable"}];
  if(!presentation.hasItems){NSLog(@"FAIL refresh failure cleared still-valid POIs");failures++;}
  [coordinator setValue:nil forKey:@"retryAfter"];[coordinator setValue:[NSDate dateWithTimeIntervalSinceNow:-3] forKey:@"requestedAt"];
  [coordinator performSelector:NSSelectorFromString(@"poll")];
  widerId=coordinator.context[@"requestId"]?:@"missing";
  if(![coordinator applyResponse:@{@"requestId":widerId,@"pois":@[place],@"expiresAt":@(expiry)}] ||
    [[presentation valueForKey:@"entries"][@"place:fixture"] valueForKey:@"marker"]!=keptMarker){NSLog(@"FAIL refreshed snapshot rebuilt unchanged marker");failures++;}
  map.zoom=1;
  active=NO;[coordinator performSelector:NSSelectorFromString(@"poll")];
  if(coordinator.context || !map.poiProperties.isVisible){NSLog(@"FAIL inactive viewport was retained");failures++;}
  [coordinator invalidate];
  window.hidden=YES;
  method_setImplementation(method,original);imp_removeBlock(replacement);
  [KNSDKBridge setLocationUseAllowed:YES];
  return failures;
}
