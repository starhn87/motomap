#import "KNNaviGasPriceLayer.h"
#import "KNSDKBridge.h"
#import <limits.h>
#import <math.h>

@class KNNaviGasPriceLayer;
// 가격 버튼 밖의 터치는 지도 제스처로 전달한다.
@interface KNNaviPriceOverlay : UIView @end
@implementation KNNaviPriceOverlay
- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event {
  UIView *hit=[super hitTest:point withEvent:event];
  return hit==self ? nil : hit;
}
@end
@interface KNNaviPriceButton : UIButton @end
@implementation KNNaviPriceButton
- (void)setHighlighted:(BOOL)highlighted { [super setHighlighted:highlighted]; self.alpha=highlighted?0.55:1; }
@end
@interface KNNaviPriceFrameTarget : NSObject
@property(nonatomic, weak) KNNaviGasPriceLayer *owner;
- (void)tick:(CADisplayLink *)link;
@end
@interface KNNaviGasPriceLayer ()
@property(nonatomic, weak) KNMapView *map;
@property(nonatomic, strong) KNNaviPriceOverlay *overlay;
@property(nonatomic, strong) CADisplayLink *displayLink;
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
@property(nonatomic) BOOL cameraKnown;
@property(nonatomic) FloatPoint lastCoordinate;
@property(nonatomic) FloatPoint lastAnchor;
@property(nonatomic) float lastZoom;
@property(nonatomic) float lastBearing;
@property(nonatomic) float lastTilt;
@property(nonatomic) CGRect lastMapFrame;
- (void)updateScreenPositions;
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
  [self clearPrices];
  self.map=map;
  if (self.stations.count && self.expiresAt.timeIntervalSinceNow>0) [self renderPrices];
}
- (void)dealloc {
  [self.expiryTimer invalidate]; [self clearPrices];
}
- (BOOL)hasFreshPosition {
  return !self.invalidated && self.active && [KNSDKBridge isLocationUseAllowed] && self.positionAt &&
    fabs(self.positionAt.timeIntervalSinceNow) <= 10;
}
- (void)clearPrices {
  [self.displayLink invalidate]; self.displayLink=nil;
  [self.overlay removeFromSuperview]; self.overlay=nil;
  [self.owned removeAllObjects]; self.cameraKnown=NO;
}
- (void)pause {
  self.active = NO; self.context = nil;
  [self clearPrices];
}
- (void)invalidate {
  [self pause]; self.invalidated = YES;
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
  BOOL cached = self.expiresAt.timeIntervalSinceNow > 0 &&
      hypot(position.x-self.cachePosition.x,position.y-self.cachePosition.y)<1000;
  if (cached) { if (!self.owned.count && self.stations.count) [self renderPrices]; return; }
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
  if (![self hasFreshPosition] || self.expiresAt.timeIntervalSinceNow<=0 || self.owned.count || !self.stations.count || !self.map) return;
  self.overlay=[[KNNaviPriceOverlay alloc] initWithFrame:self.map.bounds];
  self.overlay.autoresizingMask=UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;
  self.overlay.clipsToBounds=YES;
  // 지도 제스처 인식기의 자손으로 두어 가격 위에서 시작한 이동·핀치도 지도에 전달한다.
  [self.map addSubview:self.overlay];
  KNSDK *sdk=[KNSDK sharedInstance];
  for (NSDictionary *station in self.stations) {
    IntPoint point=[sdk convertWGS84ToKATECWithLongitude:[station[@"longitude"] doubleValue] latitude:[station[@"latitude"] doubleValue]];
    UIButton *button=[KNNaviPriceButton buttonWithType:UIButtonTypeCustom];button.bounds=CGRectMake(0,0,116,44);
    UIImage *image=[self imageForStation:station];
    UIImageView *content=[[UIImageView alloc] initWithImage:image];content.bounds=CGRectMake(0,0,116,34);
    content.contentMode=UIViewContentModeCenter;[button addSubview:content];
    button.accessibilityLabel=[NSString stringWithFormat:@"%@, 일반휘발유 %@원",station[@"name"],station[@"price"]];
    button.accessibilityIdentifier=[@"guide-gas-price-" stringByAppendingString:station[@"id"]];
    [button addTarget:self action:@selector(priceTapped:) forControlEvents:UIControlEventTouchUpInside];
    [self.overlay addSubview:button];
    [self.owned addObject:@{@"button":button,@"content":content,@"image":image,@"station":station,@"x":@(point.x),@"y":@(point.y)}];
  }
  [self updateScreenPositions];
  if (!self.owned.count || !self.overlay) return;
  KNNaviPriceFrameTarget *target=[KNNaviPriceFrameTarget new];target.owner=self;
  self.displayLink=[CADisplayLink displayLinkWithTarget:target selector:@selector(tick:)];
  self.displayLink.preferredFramesPerSecond=30;
  [self.displayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
}
- (void)updateScreenPositions {
  if (![self hasFreshPosition] || self.expiresAt.timeIntervalSinceNow<=0) { [self clearPrices]; return; }
  if (!self.map.superview) { [self pause]; return; }
  if (self.overlay.superview!=self.map) {
    [self.map addSubview:self.overlay]; self.cameraKnown=NO;
  }
  CGRect frame=self.map.bounds;
  FloatPoint coordinate=self.map.coordinate, anchor=self.map.anchor;
  float zoomValue=self.map.zoom, bearing=self.map.bearing, tilt=self.map.tilt;
  if (self.cameraKnown && CGRectEqualToRect(frame,self.lastMapFrame) &&
      coordinate.x==self.lastCoordinate.x && coordinate.y==self.lastCoordinate.y &&
      anchor.x==self.lastAnchor.x && anchor.y==self.lastAnchor.y && zoomValue==self.lastZoom &&
      bearing==self.lastBearing && tilt==self.lastTilt) return;
  self.cameraKnown=YES;self.lastMapFrame=frame;self.lastCoordinate=coordinate;self.lastAnchor=anchor;
  self.lastZoom=zoomValue;self.lastBearing=bearing;self.lastTilt=tilt;
  self.overlay.frame=frame;
  // 실제 SDK는 큰 zoom 값이 넓은 영역이다. 지도 이미지 재생성 없이 연속 축소한다.
  CGFloat zoom=zoomValue;
  if (!isfinite(zoom) || zoom<=0) { self.overlay.hidden=YES; return; }
  self.overlay.hidden=zoom>=32;
  if (self.overlay.hidden) return;
  CGFloat scale=MIN(1,MAX(0.5,pow(1.3/zoom,0.25)));
  NSMutableArray<NSValue *> *visible=[NSMutableArray new];
  for (NSDictionary *item in self.owned) {
    UIButton *button=item[@"button"];
    CGPoint point=[self.map katecToScreen:(FloatPoint){[item[@"x"] floatValue],[item[@"y"] floatValue]}];
    point=[self.map convertPoint:point toView:self.overlay];
    CGRect visual=CGRectMake(point.x-58*scale,point.y-34*scale,116*scale,34*scale);
    CGRect touch=CGRectMake(point.x-58*scale,point.y-17*scale-22,116*scale,44);
    BOOL hidden=!isfinite(point.x) || !isfinite(point.y) ||
      !CGRectIntersectsRect(self.overlay.bounds,visual) || (zoom>4 && visible.count>=8);
    for (NSValue *other in visible) if (CGRectIntersectsRect(CGRectInset(touch,-3,-3),other.CGRectValue)) { hidden=YES; break; }
    button.hidden=hidden;
    if (hidden) continue;
    // 터치 영역은 높이44pt를 유지하고 이미지에만 변환을 적용한다.
    button.center=CGPointMake(point.x,point.y-17*scale);button.bounds=CGRectMake(0,0,116*scale,44);
    UIImageView *content=item[@"content"];content.center=CGPointMake(button.bounds.size.width/2,22);
    content.transform=CGAffineTransformMakeScale(scale,scale);
    [visible addObject:[NSValue valueWithCGRect:touch]];
  }
}
- (void)priceTapped:(UIButton *)sender {
  if (![self hasFreshPosition] || self.expiresAt.timeIntervalSinceNow<=0 || self.overlay.hidden || sender.hidden || !sender.window) return;
  for (NSDictionary *item in self.owned) if (item[@"button"]==sender) {
    if (self.onSelect) self.onSelect(item[@"station"]); return;
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
    [weakSelf clearPrices]; weakSelf.stations=nil; weakSelf.expiresAt=nil;
  }];
  [NSRunLoop.mainRunLoop addTimer:self.expiryTimer forMode:NSRunLoopCommonModes];
  [self clearPrices];[self renderPrices];
}
@end

@implementation KNNaviPriceFrameTarget
- (void)tick:(CADisplayLink *)link {
  KNNaviGasPriceLayer *owner=self.owner;
  if (!owner) { [link invalidate]; return; }
  if (!owner.map.window) { [owner pause]; return; }
  [owner updateScreenPositions];
}
@end
