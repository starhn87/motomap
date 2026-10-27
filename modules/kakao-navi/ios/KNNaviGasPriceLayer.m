#import "KNNaviGasPriceLayer.h"
#import "KNSDKBridge.h"
#import <KNSDK/KNMapMarker.h>
#import <KNSDK/KNMapMarkerEventListener.h>
#import <limits.h>
#import <math.h>

@interface KNNaviGasPriceLayer () <KNMapMarkerEventListener>
@property(nonatomic, weak) KNMapView *map;
@property(nonatomic, weak) id<KNMapMarkerEventListener> previousListener;
@property(nonatomic, copy) NSDictionary *context;
@property(nonatomic, strong) NSMutableArray<NSDictionary *> *owned;
@property(nonatomic, copy) NSArray<NSDictionary *> *stations;
@property(nonatomic) DoublePoint position;
@property(nonatomic) DoublePoint cachePosition;
@property(nonatomic) DoublePoint requestPosition;
@property(nonatomic, strong) NSDate *positionAt;
@property(nonatomic, strong) NSDate *requestedAt;
@property(nonatomic, strong) NSDate *expiresAt;
@property(nonatomic, strong) NSTimer *expiryTimer;
@property(nonatomic) BOOL active;
@property(nonatomic) BOOL invalidated;
@end

@implementation KNNaviGasPriceLayer
- (instancetype)initWithMap:(KNMapView *)map {
  if ((self = [super init])) {
    _owned = [NSMutableArray new];
    [self attachToMap:map];
  }
  return self;
}
- (void)attachToMap:(KNMapView *)map {
  if (self.invalidated || self.map == map) return;
  [self clearMarkers];
  if (self.map.markerEventListener == self) self.map.markerEventListener=self.previousListener;
  self.map=map; self.previousListener=map.markerEventListener; map.markerEventListener=self;
  if (self.stations.count && self.expiresAt.timeIntervalSinceNow>0) [self renderMarkers];
}
- (void)dealloc {
  [self.expiryTimer invalidate]; [self clearMarkers];
  if (self.map.markerEventListener == self) self.map.markerEventListener = self.previousListener;
}
- (BOOL)hasFreshPosition {
  return !self.invalidated && self.active && [KNSDKBridge isLocationUseAllowed] && self.positionAt &&
    fabs(self.positionAt.timeIntervalSinceNow) <= 10;
}
- (void)clearMarkers {
  for (NSDictionary *item in self.owned) [self.map removeMarker:item[@"marker"]];
  [self.owned removeAllObjects];
}
- (void)pause {
  self.active = NO; self.context = nil;
  [self clearMarkers];
}
- (void)invalidate {
  [self pause]; self.invalidated = YES;
  if (self.map.markerEventListener == self) self.map.markerEventListener = self.previousListener;
  [self.expiryTimer invalidate]; self.expiryTimer=nil;
  self.stations = nil; self.expiresAt = nil; self.positionAt = nil;
  self.onFetch = nil; self.onSelect = nil; self.map = nil;
}
- (void)updatePosition:(DoublePoint)position timestamp:(NSDate *)timestamp active:(BOOL)active {
  if (self.invalidated) return;
  if (!active || ![KNSDKBridge isLocationUseAllowed] || !timestamp || fabs(timestamp.timeIntervalSinceNow)>10 ||
      !isfinite(position.x) || !isfinite(position.y) || fabs(position.x)>INT_MAX || fabs(position.y)>INT_MAX) {
    [self pause]; return;
  }
  self.active = YES; self.position = position; self.positionAt = timestamp;
  if (self.map.markerEventListener != self) {
    self.previousListener = self.map.markerEventListener; self.map.markerEventListener = self;
  }
  BOOL cached = self.expiresAt.timeIntervalSinceNow > 0 &&
      hypot(position.x-self.cachePosition.x,position.y-self.cachePosition.y)<1000;
  if (cached) { if (!self.owned.count && self.stations.count) [self renderMarkers]; return; }
  [self clearMarkers];
  // 요청 중 이동한 결과는 응답에서 버리고, 위치 콜백마다 외부 조회를 만들지 않는다.
  if (self.context || (self.requestedAt && -self.requestedAt.timeIntervalSinceNow<30)) return;
  DoublePoint wgs = [[KNSDK sharedInstance] convertKATECToWGS84WithX:(SInt32)llround(position.x) y:(SInt32)llround(position.y)];
  if (!isfinite(wgs.x) || !isfinite(wgs.y) || fabs(wgs.x)>180 || fabs(wgs.y)>90) return;
  self.requestPosition = position; self.requestedAt = NSDate.date;
  self.context = @{@"requestId":NSUUID.UUID.UUIDString,@"latitude":@(wgs.y),@"longitude":@(wgs.x),@"prod":@"B027",@"radius":@5000};
  NSString *requestId = self.context[@"requestId"];
  if (self.onFetch) self.onFetch();
  __weak KNNaviGasPriceLayer *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,20*NSEC_PER_SEC),dispatch_get_main_queue(),^{
    if ([weakSelf.context[@"requestId"] isEqual:requestId]) weakSelf.context=nil;
  });
}
- (UIImage *)brandImage:(NSString *)brand {
  NSDictionary *files = @{@"SK에너지":@"sk.png",@"GS칼텍스":@"gs.png",@"S-OIL":@"soil.png",@"HD현대오일뱅크":@"hd.png",@"자영알뜰":@"altteul.png",@"NH알뜰":@"altteul.png"};
  NSString *file = files[brand]; if (!file) return nil;
  NSURL *url = [NSBundle.mainBundle URLForResource:@"MotoMapNavigationUI" withExtension:@"bundle"];
  NSBundle *bundle = url ? [NSBundle bundleWithURL:url] : nil;
  NSString *path = [bundle pathForResource:file.stringByDeletingPathExtension ofType:file.pathExtension];
  return path ? [UIImage imageWithContentsOfFile:path] : nil;
}
- (UIImage *)imageForStation:(NSDictionary *)station compact:(BOOL)compact {
  CGSize size = compact ? CGSizeMake(90,28) : CGSizeMake(116,34);
  // 두 크기를 한 번씩만 만들고 줌 노출 범위로 전환한다. 제스처마다 비트맵을 만들지 않는다.
  UIGraphicsImageRendererFormat *format=[UIGraphicsImageRendererFormat defaultFormat];format.scale=1;
  UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:size format:format];
  return [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
    UIColor *ink=[UIColor colorWithWhite:0.095 alpha:1];
    UIBezierPath *shape=[UIBezierPath bezierPathWithRoundedRect:CGRectInset((CGRect){CGPointZero,size},1,1) cornerRadius:compact?9:11];
    [UIColor.whiteColor setFill];[shape fill]; [[UIColor colorWithWhite:0.55 alpha:1] setStroke];shape.lineWidth=1;[shape stroke];
    CGRect logoRect=compact?CGRectMake(5,6,26,16):CGRectMake(7,7,36,20);
    UIImage *logo=[self brandImage:station[@"brand"]];
    if (logo && logo.size.width>0 && logo.size.height>0) {
      CGFloat scale=MIN(logoRect.size.width/logo.size.width,logoRect.size.height/logo.size.height);
      CGSize fitted=CGSizeMake(logo.size.width*scale,logo.size.height*scale);
      [logo drawInRect:CGRectMake(CGRectGetMidX(logoRect)-fitted.width/2,CGRectGetMidY(logoRect)-fitted.height/2,fitted.width,fitted.height)];
    } else {
      NSString *brand=[station[@"brand"] containsString:@"알뜰"]?@"알뜰":@"주유";
      [brand drawInRect:logoRect withAttributes:@{NSFontAttributeName:[UIFont systemFontOfSize:compact?10:12 weight:UIFontWeightSemibold],NSForegroundColorAttributeName:ink}];
    }
    NSNumberFormatter *formatter=[NSNumberFormatter new];formatter.numberStyle=NSNumberFormatterDecimalStyle;
    NSString *price=[formatter stringFromNumber:station[@"price"]];
    CGRect priceRect=compact?CGRectMake(35,6,51,20):CGRectMake(47,7,64,23);
    UIFont *font=[UIFont monospacedDigitSystemFontOfSize:compact?14:17 weight:UIFontWeightBold];
    CGFloat width=[price sizeWithAttributes:@{NSFontAttributeName:font}].width;
    if (width>priceRect.size.width) font=[font fontWithSize:font.pointSize*priceRect.size.width/width];
    [price drawInRect:priceRect withAttributes:@{NSFontAttributeName:font,NSForegroundColorAttributeName:ink}];
  }];
}
- (void)renderMarkers {
  if (![self hasFreshPosition] || self.expiresAt.timeIntervalSinceNow<=0 || self.owned.count) return;
  KNSDK *sdk=[KNSDK sharedInstance];
  NSUInteger index=0;
  for (NSDictionary *station in self.stations) {
    IntPoint point=[sdk convertWGS84ToKATECWithLongitude:[station[@"longitude"] doubleValue] latitude:[station[@"latitude"] doubleValue]];
    // 실제 SDK 투영에서 zoom 값이 클수록 넓은 지역이 보인다(100m: zoom1=200pt, zoom8=25pt).
    // 서로 겹치지 않는 구간에 정적 마커를 두어 확대·축소 중 이미지 갱신을 없앤다.
    for (NSNumber *tier in @[@NO,@YES]) {
      BOOL compact=tier.boolValue;
      if (compact && index>=8) continue;
      KNMapMarker *marker=[KNMapMarker marker];marker.coordinate=(FloatPoint){point.x,point.y};
      UIImage *image=[self imageForStation:station compact:compact];marker.icon=image;
      marker.priority=500+(NSInteger)self.stations.count-(NSInteger)index;
      // SDK는 양 끝값을 제외하므로 정상 max를 한 float만 늘려 zoom4의 공백/이중 표시를 막는다.
      [marker setVisibleRangeWithMinZoom:compact?4:0.1 maxZoom:compact?32:nextafterf(4,INFINITY)];
      // icon은 SDK의 assign 속성이므로 removeMarker까지 이미지를 강하게 보관한다.
      [self.owned addObject:@{@"marker":marker,@"image":image,@"station":station,@"compact":@(compact)}];
      [self.map addMarker:marker];
    }
    index++;
  }
}
- (void)applyResponse:(NSDictionary *)response {
  if (![self hasFreshPosition] || !self.context || ![response[@"requestId"] isEqual:self.context[@"requestId"]]) return;
  self.context=nil;
  if (hypot(self.position.x-self.requestPosition.x,self.position.y-self.requestPosition.y)>=1000 || response[@"error"]) return;
  if (![response[@"stations"] isKindOfClass:NSArray.class] || ![response[@"fetchedAt"] isKindOfClass:NSNumber.class] ||
      ![response[@"expiresAt"] isKindOfClass:NSNumber.class]) return;
  double fetched=[response[@"fetchedAt"] doubleValue]/1000, expires=[response[@"expiresAt"] doubleValue]/1000, now=NSDate.date.timeIntervalSince1970;
  if (!isfinite(fetched) || !isfinite(expires) || fetched>now+5 || expires<=now || expires<fetched) return;
  NSMutableArray *stations=[NSMutableArray new];NSMutableSet *ids=[NSMutableSet new];
  for (id value in response[@"stations"]) {
    if (![value isKindOfClass:NSDictionary.class]) continue;
    NSDictionary *station=value;
    if (![station[@"id"] isKindOfClass:NSString.class] || ![station[@"name"] isKindOfClass:NSString.class] ||
        ![station[@"brand"] isKindOfClass:NSString.class] || ![station[@"price"] isKindOfClass:NSNumber.class] ||
        ![station[@"latitude"] isKindOfClass:NSNumber.class] || ![station[@"longitude"] isKindOfClass:NSNumber.class]) continue;
    double price=[station[@"price"] doubleValue], lat=[station[@"latitude"] doubleValue], lng=[station[@"longitude"] doubleValue];
    if (!station[@"id"] || [ids containsObject:station[@"id"]] || !isfinite(price) || price<=0 || price>100000 ||
        !isfinite(lat)||!isfinite(lng)||fabs(lat)>90||fabs(lng)>180||[station[@"brand"] isEqual:@"ex알뜰"]||[station[@"name"] containsString:@"휴게소"]) continue;
    IntPoint point=[[KNSDK sharedInstance] convertWGS84ToKATECWithLongitude:lng latitude:lat];
    if (hypot(point.x-self.requestPosition.x,point.y-self.requestPosition.y)>5000) continue;
    [ids addObject:station[@"id"]];[stations addObject:station]; if (stations.count>=24) break;
  }
  self.stations=stations;self.cachePosition=self.requestPosition;
  self.expiresAt=[NSDate dateWithTimeIntervalSince1970:MIN(expires,MIN(fetched+3600,now+(stations.count?3600:300)))];
  [self.expiryTimer invalidate];
  __weak KNNaviGasPriceLayer *weakSelf=self;
  self.expiryTimer=[NSTimer timerWithTimeInterval:MAX(0.02,self.expiresAt.timeIntervalSinceNow) repeats:NO block:^(NSTimer *timer){
    [weakSelf clearMarkers]; weakSelf.stations=nil; weakSelf.expiresAt=nil;
  }];
  [NSRunLoop.mainRunLoop addTimer:self.expiryTimer forMode:NSRunLoopCommonModes];
  [self clearMarkers];[self renderMarkers];
}
- (NSDictionary *)ownedStation:(KNMapMarker *)marker {
  for (NSDictionary *item in self.owned) if (item[@"marker"]==marker) return item[@"station"];
  return nil;
}
- (void)mapView:(KNMapView *)map onSingleTappedWithMarker:(KNMapMarker *)marker {
  NSDictionary *station=[self ownedStation:marker];
  if (station) { if ([self hasFreshPosition] && self.expiresAt.timeIntervalSinceNow>0 && self.onSelect) self.onSelect(station); return; }
  if ([self.previousListener respondsToSelector:_cmd]) [self.previousListener mapView:map onSingleTappedWithMarker:marker];
}
- (void)mapView:(KNMapView *)map onDoubleTappedWithMarker:(KNMapMarker *)marker { if (![self ownedStation:marker] && [self.previousListener respondsToSelector:_cmd]) [self.previousListener mapView:map onDoubleTappedWithMarker:marker]; }
- (void)mapView:(KNMapView *)map onLongPressedWithMarker:(KNMapMarker *)marker { if (![self ownedStation:marker] && [self.previousListener respondsToSelector:_cmd]) [self.previousListener mapView:map onLongPressedWithMarker:marker]; }
- (void)mapView:(KNMapView *)map onMarkerAnimationEnded:(KNMapMarker *)marker { if (![self ownedStation:marker] && [self.previousListener respondsToSelector:_cmd]) [self.previousListener mapView:map onMarkerAnimationEnded:marker]; }
- (void)mapView:(KNMapView *)map onCalloutBubbleSelected:(KNMapMarker *)marker { if (![self ownedStation:marker] && [self.previousListener respondsToSelector:_cmd]) [self.previousListener mapView:map onCalloutBubbleSelected:marker]; }
@end
