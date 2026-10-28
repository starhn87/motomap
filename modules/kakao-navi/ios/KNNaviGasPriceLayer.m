#import "KNNaviGasPriceLayer.h"
#import "KNSDKBridge.h"
#import "KNNaviGuidePoiOverlay.h"
#import <limits.h>
#import <math.h>

@interface KNNaviGasPriceLayer ()
@property(nonatomic, weak) KNMapView *map;
@property(nonatomic, strong) KNNaviGuidePoiOverlay *renderer;
@property(nonatomic, copy) NSDictionary *context;
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
    [self attachToMap:map];
  }
  return self;
}
- (void)attachToMap:(KNMapView *)map {
  if (self.invalidated || self.map == map) return;
  [self clearPrices];
  [self.renderer invalidate];
  self.map=map;
  self.renderer=[[KNNaviGuidePoiOverlay alloc] initWithMap:map];
  __weak KNNaviGasPriceLayer *weakSelf=self;
  self.renderer.isActive=^BOOL { return [weakSelf hasFreshPosition]; };
  self.renderer.onSelect=^(NSString *key) {
    KNNaviGasPriceLayer *owner=weakSelf;
    if (![owner hasFreshPosition] || owner.expiresAt.timeIntervalSinceNow<=0) return;
    for (NSDictionary *station in owner.stations) if ([station[@"id"] isEqual:key]) {
      if (owner.onSelect) owner.onSelect(station);return;
    }
  };
  if (self.stations.count && self.expiresAt.timeIntervalSinceNow>0) [self renderPrices];
}
- (void)dealloc {
  [self.expiryTimer invalidate]; [self clearPrices];
}
- (BOOL)hasFreshPosition {
  return !self.invalidated && self.active && [KNSDKBridge isLocationUseAllowed] && self.positionAt &&
    fabs(self.positionAt.timeIntervalSinceNow) <= 10;
}
- (void)clearPrices { [self.renderer clear]; }
- (void)pause {
  self.active = NO; self.context = nil;
  [self clearPrices];
}
- (void)invalidate {
  [self pause]; self.invalidated = YES;
  [self.expiryTimer invalidate]; self.expiryTimer=nil;
  self.stations = nil; self.expiresAt = nil; self.positionAt = nil;
  [self.renderer invalidate];self.renderer=nil;
  self.onFetch = nil; self.onSelect = nil; self.map = nil;
}
- (void)updatePosition:(DoublePoint)position timestamp:(NSDate *)timestamp active:(BOOL)active {
  if (self.invalidated) return;
  if (!active || ![KNSDKBridge isLocationUseAllowed] || !timestamp || fabs(timestamp.timeIntervalSinceNow)>10 ||
      !isfinite(position.x) || !isfinite(position.y) || fabs(position.x)>INT_MAX || fabs(position.y)>INT_MAX) {
    [self pause]; return;
  }
  self.active = YES; self.position = position; self.positionAt = timestamp;
  BOOL cached = self.expiresAt.timeIntervalSinceNow > 0 &&
      hypot(position.x-self.cachePosition.x,position.y-self.cachePosition.y)<1000;
  if (cached) { if (self.stations.count && !self.renderer.hasItems) [self renderPrices]; return; }
  [self clearPrices];
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
- (UIImage *)imageForStation:(NSDictionary *)station {
  CGSize size = CGSizeMake(116,34);
  // 비트맵은 최초 한 번만 만들고 UIView 변환으로 축척을 연속 반영한다.
  UIGraphicsImageRendererFormat *format=[UIGraphicsImageRendererFormat defaultFormat];
  UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:size format:format];
  return [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
    UIColor *ink=[UIColor colorWithWhite:0.095 alpha:1];
    UIBezierPath *shape=[UIBezierPath bezierPathWithRoundedRect:CGRectInset((CGRect){CGPointZero,size},1,1) cornerRadius:11];
    [UIColor.whiteColor setFill];[shape fill]; [[UIColor colorWithWhite:0.55 alpha:1] setStroke];shape.lineWidth=1;[shape stroke];
    CGRect logoRect=CGRectMake(7,7,36,20);
    UIImage *logo=[self brandImage:station[@"brand"]];
    if (logo && logo.size.width>0 && logo.size.height>0) {
      CGFloat scale=MIN(logoRect.size.width/logo.size.width,logoRect.size.height/logo.size.height);
      CGSize fitted=CGSizeMake(logo.size.width*scale,logo.size.height*scale);
      [logo drawInRect:CGRectMake(CGRectGetMidX(logoRect)-fitted.width/2,CGRectGetMidY(logoRect)-fitted.height/2,fitted.width,fitted.height)];
    } else {
      NSString *brand=[station[@"brand"] containsString:@"알뜰"]?@"알뜰":@"주유";
      [brand drawInRect:logoRect withAttributes:@{NSFontAttributeName:[UIFont systemFontOfSize:12 weight:UIFontWeightSemibold],NSForegroundColorAttributeName:ink}];
    }
    NSNumberFormatter *formatter=[NSNumberFormatter new];formatter.numberStyle=NSNumberFormatterDecimalStyle;
    NSString *price=[formatter stringFromNumber:station[@"price"]];
    CGRect priceRect=CGRectMake(47,7,64,23);
    UIFont *font=[UIFont monospacedDigitSystemFontOfSize:17 weight:UIFontWeightBold];
    CGFloat width=[price sizeWithAttributes:@{NSFontAttributeName:font}].width;
    if (width>priceRect.size.width) font=[font fontWithSize:font.pointSize*priceRect.size.width/width];
    [price drawInRect:priceRect withAttributes:@{NSFontAttributeName:font,NSForegroundColorAttributeName:ink}];
  }];
}
- (void)renderPrices {
  if (![self hasFreshPosition] || self.expiresAt.timeIntervalSinceNow<=0 || !self.stations.count || !self.map) return;
  NSMutableArray *items=[NSMutableArray new];
  KNSDK *sdk=[KNSDK sharedInstance];
  for (NSDictionary *station in self.stations) {
    IntPoint point=[sdk convertWGS84ToKATECWithLongitude:[station[@"longitude"] doubleValue] latitude:[station[@"latitude"] doubleValue]];
    [items addObject:@{@"key":station[@"id"],@"x":@(point.x),@"y":@(point.y),@"image":[self imageForStation:station],
      @"label":[NSString stringWithFormat:@"%@, 일반휘발유 %@원",station[@"name"],station[@"price"]]}];
  }
  [self.renderer showItems:items expiresAt:self.expiresAt];
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
    [weakSelf clearPrices]; weakSelf.stations=nil; weakSelf.expiresAt=nil;
  }];
  [NSRunLoop.mainRunLoop addTimer:self.expiryTimer forMode:NSRunLoopCommonModes];
  [self clearPrices];[self renderPrices];
}
@end
