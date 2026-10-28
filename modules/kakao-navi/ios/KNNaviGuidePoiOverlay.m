#import "KNNaviGuidePoiOverlay.h"
#import "KNSDKBridge.h"
#import <limits.h>
#import <math.h>

@interface KNNaviPoiPassthroughView : UIView @end
@implementation KNNaviPoiPassthroughView
- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event {
  UIView *hit=[super hitTest:point withEvent:event];
  return hit==self ? nil : hit;
}
@end
@interface KNNaviPoiButton : UIButton @end
@implementation KNNaviPoiButton
- (void)setHighlighted:(BOOL)highlighted { [super setHighlighted:highlighted]; self.alpha=highlighted?0.55:1; }
@end
@class KNNaviGuidePoiOverlay;
@interface KNNaviPoiFrameTarget : NSObject
@property(nonatomic, weak) KNNaviGuidePoiOverlay *owner;
- (void)tick:(CADisplayLink *)link;
@end
@interface KNNaviGuidePoiOverlay ()
@property(nonatomic, weak) KNMapView *map;
@property(nonatomic, strong) KNNaviPoiPassthroughView *overlay;
@property(nonatomic, strong) CADisplayLink *displayLink;
@property(nonatomic, strong) NSMutableArray<NSDictionary *> *owned;
@property(nonatomic, strong) NSDate *expiresAt;
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

@implementation KNNaviGuidePoiOverlay
- (instancetype)initWithMap:(KNMapView *)map {
  if ((self=[super init])) { _map=map;_owned=[NSMutableArray new]; }
  return self;
}
- (void)dealloc { [self clear]; }
- (BOOL)hasItems { return self.owned.count>0; }
- (void)clear {
  [self.displayLink invalidate];self.displayLink=nil;
  [self.overlay removeFromSuperview];self.overlay=nil;
  [self.owned removeAllObjects];self.expiresAt=nil;self.cameraKnown=NO;
}
- (void)invalidate { [self clear];self.invalidated=YES;self.onSelect=nil;self.isActive=nil;self.map=nil; }
- (void)showItems:(NSArray<NSDictionary *> *)items expiresAt:(NSDate *)expiresAt {
  [self clear];
  if (self.invalidated || !self.map || ![KNSDKBridge isLocationUseAllowed] || (self.isActive && !self.isActive()) || expiresAt.timeIntervalSinceNow<=0) return;
  self.expiresAt=expiresAt;
  self.overlay=[[KNNaviPoiPassthroughView alloc] initWithFrame:self.map.bounds];
  self.overlay.autoresizingMask=UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;
  self.overlay.clipsToBounds=YES;
  // SDK 제스처 인식기의 자손으로 두어 POI 위에서 시작한 이동·핀치도 지도에 전달한다.
  [self.map addSubview:self.overlay];
  NSArray *ordered=[items sortedArrayWithOptions:NSSortStable usingComparator:^NSComparisonResult(NSDictionary *a,NSDictionary *b) {
    return [@([a[@"priority"] integerValue]) compare:@([b[@"priority"] integerValue])];
  }];
  NSMutableSet *keys=[NSMutableSet new];
  for (NSDictionary *item in ordered) {
    NSString *key=item[@"key"];UIImage *image=item[@"image"];
    double x=[item[@"x"] doubleValue],y=[item[@"y"] doubleValue];
    if (![key isKindOfClass:NSString.class] || !key.length || [keys containsObject:key] ||
        ![image isKindOfClass:UIImage.class] || image.size.width<=0 || image.size.height<=0 ||
        ![item[@"x"] isKindOfClass:NSNumber.class] || ![item[@"y"] isKindOfClass:NSNumber.class] ||
        !isfinite(x) || !isfinite(y) || fabs(x)>INT_MAX || fabs(y)>INT_MAX) continue;
    UIButton *button=[KNNaviPoiButton buttonWithType:UIButtonTypeCustom];
    UIImageView *content=[[UIImageView alloc] initWithImage:image];
    content.bounds=(CGRect){CGPointZero,image.size};content.contentMode=UIViewContentModeCenter;
    [button addSubview:content];
    button.accessibilityLabel=item[@"label"];
    button.accessibilityIdentifier=[@"guide-poi-" stringByAppendingString:key];
    [button addTarget:self action:@selector(poiTapped:) forControlEvents:UIControlEventTouchUpInside];
    [self.overlay addSubview:button];
    [self.owned addObject:@{@"button":button,@"content":content,@"image":image,@"key":key,@"x":@(x),@"y":@(y)}];
    [keys addObject:key];if (self.owned.count>=60) break;
  }
  if (!self.owned.count) { [self clear];return; }
  [self updateScreenPositions];
  if (!self.overlay) return;
  KNNaviPoiFrameTarget *target=[KNNaviPoiFrameTarget new];target.owner=self;
  self.displayLink=[CADisplayLink displayLinkWithTarget:target selector:@selector(tick:)];
  self.displayLink.preferredFramesPerSecond=30;
  [self.displayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
}
- (void)updateScreenPositions {
  if (self.invalidated || ![KNSDKBridge isLocationUseAllowed] || (self.isActive && !self.isActive()) || self.expiresAt.timeIntervalSinceNow<=0 || !self.map.window) { [self clear];return; }
  if (!self.overlay) return;
  if (self.overlay.superview!=self.map) { [self.map addSubview:self.overlay];self.cameraKnown=NO; }
  CGRect frame=self.map.bounds;FloatPoint coordinate=self.map.coordinate,anchor=self.map.anchor;
  float zoomValue=self.map.zoom,bearing=self.map.bearing,tilt=self.map.tilt;
  if (self.cameraKnown && CGRectEqualToRect(frame,self.lastMapFrame) &&
      coordinate.x==self.lastCoordinate.x && coordinate.y==self.lastCoordinate.y &&
      anchor.x==self.lastAnchor.x && anchor.y==self.lastAnchor.y && zoomValue==self.lastZoom &&
      bearing==self.lastBearing && tilt==self.lastTilt) return;
  self.cameraKnown=YES;self.lastMapFrame=frame;self.lastCoordinate=coordinate;self.lastAnchor=anchor;
  self.lastZoom=zoomValue;self.lastBearing=bearing;self.lastTilt=tilt;
  self.overlay.frame=frame;
  CGFloat zoom=zoomValue;
  self.overlay.hidden=!isfinite(zoom) || zoom<=0 || zoom>=32;
  if (self.overlay.hidden) return;
  CGFloat scale=MIN(1,MAX(0.5,pow(1.3/zoom,0.25)));
  NSMutableArray<NSValue *> *visible=[NSMutableArray new];
  for (NSDictionary *item in self.owned) {
    UIButton *button=item[@"button"];UIImage *image=item[@"image"];
    CGFloat width=image.size.width*scale,height=image.size.height*scale;
    CGPoint point=[self.map katecToScreen:(FloatPoint){[item[@"x"] floatValue],[item[@"y"] floatValue]}];
    point=[self.map convertPoint:point toView:self.overlay];
    CGRect visual=CGRectMake(point.x-width/2,point.y-height,width,height);
    CGRect touch=CGRectMake(point.x-MAX(44,width)/2,point.y-height/2-MAX(44,height)/2,MAX(44,width),MAX(44,height));
    BOOL hidden=!isfinite(point.x) || !isfinite(point.y) || !CGRectIntersectsRect(self.overlay.bounds,visual) || (zoom>4 && visible.count>=8);
    for (NSValue *other in visible) if (CGRectIntersectsRect(CGRectInset(touch,-3,-3),other.CGRectValue)) { hidden=YES;break; }
    button.hidden=hidden;if (hidden) continue;
    button.center=CGPointMake(point.x,point.y-height/2);button.bounds=(CGRect){CGPointZero,touch.size};
    UIImageView *content=item[@"content"];content.center=CGPointMake(touch.size.width/2,touch.size.height/2);
    content.transform=CGAffineTransformMakeScale(scale,scale);
    [visible addObject:[NSValue valueWithCGRect:touch]];
  }
}
- (void)poiTapped:(UIButton *)sender {
  if (self.invalidated || ![KNSDKBridge isLocationUseAllowed] || (self.isActive && !self.isActive()) || self.expiresAt.timeIntervalSinceNow<=0 ||
      self.overlay.hidden || sender.hidden || !sender.window) return;
  for (NSDictionary *item in self.owned) if (item[@"button"]==sender) { if (self.onSelect) self.onSelect(item[@"key"]);return; }
}
@end
@implementation KNNaviPoiFrameTarget
- (void)tick:(CADisplayLink *)link {
  KNNaviGuidePoiOverlay *owner=self.owner;
  if (!owner) { [link invalidate];return; }
  [owner updateScreenPositions];
}
@end
