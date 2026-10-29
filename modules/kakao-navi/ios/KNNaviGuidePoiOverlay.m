#import "KNNaviGuidePoiOverlay.h"
#import "KNSDKBridge.h"
#import <KNSDK/KNMapMarker.h>
#import <KNSDK/KNMapMarkerEventListener.h>
#import <objc/runtime.h>
#import <limits.h>
#import <math.h>

// 한 장소가 가진 SDK 마커와 이미지. icon 은 SDK 의 assign 속성이라 제거할 때까지 이미지를 직접 보관한다.
@interface KNNaviPoiEntry : NSObject
@property(nonatomic, copy) NSString *key;
@property(nonatomic, strong) UIImage *image;
@property(nonatomic, strong) UIImage *compactImage;
@property(nonatomic, strong) UIImage *selectedImage;
@property(nonatomic, strong) KNMapMarker *marker;
@property(nonatomic, strong) KNMapMarker *compactMarker;
@property(nonatomic) double x;
@property(nonatomic) double y;
@property(nonatomic) BOOL price;
@property(nonatomic) BOOL far;
@property(nonatomic) CGPoint anchor;
@property(nonatomic) NSInteger priority;
@end
@implementation KNNaviPoiEntry @end

@class KNNaviGuidePoiOverlay;
@interface KNNaviGuidePoiOverlay ()
@property(nonatomic, weak) KNMapView *map;
@property(nonatomic, strong) NSMutableDictionary<NSString *, KNNaviPoiEntry *> *entries;
@property(nonatomic, strong) NSDate *expiresAt;
@property(nonatomic, strong) NSTimer *watchdog;
@property(nonatomic) BOOL invalidated;
- (BOOL)handleTap:(KNMapMarker *)marker;
- (BOOL)ownsMarker:(KNMapMarker *)marker;
@end

// 지도 하나의 markerEventListener 를 여러 표시 계층이 나눠 쓰도록 중계한다.
// 소유하지 않은 마커 이벤트는 원래 리스너로 그대로 넘기고, 마지막 계층이 떠나면 원래 리스너를 복원한다.
@interface KNNaviPoiMarkerRouter : NSObject <KNMapMarkerEventListener>
@property(nonatomic, weak) KNMapView *map;
@property(nonatomic, weak) id<KNMapMarkerEventListener> previous;
@property(nonatomic, strong) NSHashTable<KNNaviGuidePoiOverlay *> *overlays;
@end
@implementation KNNaviPoiMarkerRouter
+ (instancetype)routerForMap:(KNMapView *)map {
  static const void *kKey=&kKey;
  KNNaviPoiMarkerRouter *router=objc_getAssociatedObject(map,kKey);
  if (!router) {
    router=[KNNaviPoiMarkerRouter new];router.map=map;router.overlays=[NSHashTable weakObjectsHashTable];
    objc_setAssociatedObject(map,kKey,router,OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  return router;
}
- (void)claim {
  if (self.map.markerEventListener!=self) { self.previous=self.map.markerEventListener;self.map.markerEventListener=self; }
}
- (void)addOverlay:(KNNaviGuidePoiOverlay *)overlay {
  [self.overlays addObject:overlay];[self claim];
}
- (void)removeOverlay:(KNNaviGuidePoiOverlay *)overlay {
  [self.overlays removeObject:overlay];
  if (!self.overlays.count && self.map.markerEventListener==self) self.map.markerEventListener=self.previous;
}
- (BOOL)anyOverlayOwns:(KNMapMarker *)marker {
  for (KNNaviGuidePoiOverlay *overlay in self.overlays.allObjects) if ([overlay ownsMarker:marker]) return YES;
  return NO;
}
- (void)mapView:(KNMapView *)map onSingleTappedWithMarker:(KNMapMarker *)marker {
  for (KNNaviGuidePoiOverlay *overlay in self.overlays.allObjects) if ([overlay handleTap:marker]) return;
  if ([self.previous respondsToSelector:_cmd]) [self.previous mapView:map onSingleTappedWithMarker:marker];
}
- (void)mapView:(KNMapView *)map onDoubleTappedWithMarker:(KNMapMarker *)marker { if (![self anyOverlayOwns:marker] && [self.previous respondsToSelector:_cmd]) [self.previous mapView:map onDoubleTappedWithMarker:marker]; }
- (void)mapView:(KNMapView *)map onLongPressedWithMarker:(KNMapMarker *)marker { if (![self anyOverlayOwns:marker] && [self.previous respondsToSelector:_cmd]) [self.previous mapView:map onLongPressedWithMarker:marker]; }
- (void)mapView:(KNMapView *)map onMarkerAnimationEnded:(KNMapMarker *)marker { if (![self anyOverlayOwns:marker] && [self.previous respondsToSelector:_cmd]) [self.previous mapView:map onMarkerAnimationEnded:marker]; }
- (void)mapView:(KNMapView *)map onCalloutBubbleSelected:(KNMapMarker *)marker { if (![self anyOverlayOwns:marker] && [self.previous respondsToSelector:_cmd]) [self.previous mapView:map onCalloutBubbleSelected:marker]; }
@end

static UIImage *ScaledImage(UIImage *image, CGFloat factor) {
  CGSize size=CGSizeMake(image.size.width*factor,image.size.height*factor);
  UIGraphicsImageRendererFormat *format=[UIGraphicsImageRendererFormat preferredFormat];format.scale=image.scale;
  return [[[UIGraphicsImageRenderer alloc] initWithSize:size format:format] imageWithActions:^(UIGraphicsImageRendererContext *context) {
    [image drawInRect:(CGRect){CGPointZero,size}];
  }];
}
// SDK 마커의 원점은 이미지 하단 중앙이다. 이미지 안의 anchor 가 좌표에 놓이도록 보정한다(픽셀 단위, 이미지 scale 기준).
static IntPoint MarkerOffset(UIImage *image, CGPoint anchor) {
  CGFloat scale=image.scale;
  return (IntPoint){(SInt32)lround((0.5-anchor.x)*image.size.width*scale),(SInt32)lround((1-anchor.y)*image.size.height*scale)};
}
// SDK 는 양 끝값을 제외하므로 정상 구간 max 를 한 float 늘려 zoom4 의 공백/이중 표시를 막는다.
static float NearMaxZoom(void) { return nextafterf(4,INFINITY); }

@implementation KNNaviGuidePoiOverlay
- (instancetype)initWithMap:(KNMapView *)map {
  if ((self=[super init])) { _map=map;_entries=[NSMutableDictionary new]; }
  return self;
}
- (void)dealloc { [self clear]; }
- (BOOL)hasItems { return self.entries.count>0; }
- (BOOL)ownsMarker:(KNMapMarker *)marker {
  for (KNNaviPoiEntry *entry in self.entries.allValues) if (entry.marker==marker || entry.compactMarker==marker) return YES;
  return NO;
}
- (BOOL)usable {
  return !self.invalidated && self.map && self.map.window && [KNSDKBridge isLocationUseAllowed] &&
    (!self.isActive || self.isActive()) && self.expiresAt.timeIntervalSinceNow>0;
}
- (void)setSelectedKey:(NSString *)selectedKey {
  _selectedKey=[selectedKey copy];[self applySelection];
}
// 줌·위치 갱신 때 투영을 다시 계산하지 않으므로 선택 항목의 이미지·우선순위만 바꾼다.
- (void)applySelection {
  for (KNNaviPoiEntry *entry in self.entries.allValues) {
    BOOL selected=[entry.key isEqual:self.selectedKey];
    UIImage *icon=selected?(entry.selectedImage?:(entry.selectedImage=ScaledImage(entry.image,1.12))):entry.image;
    if (entry.marker.icon!=icon) { entry.marker.icon=icon;entry.marker.pixelOffset=MarkerOffset(icon,entry.anchor); }
    entry.marker.priority=selected?60000:entry.priority;
  }
}
- (void)setExclusionRects:(NSArray<NSValue *> *)exclusionRects {
  // SDK 마커는 지도 안에서 그려져 UIKit 패널 아래에 놓이므로 화면 제외 영역을 따로 적용하지 않는다.
  _exclusionRects=[exclusionRects copy];
}
- (void)removeEntry:(KNNaviPoiEntry *)entry {
  if (entry.marker) [self.map removeMarker:entry.marker];
  if (entry.compactMarker) [self.map removeMarker:entry.compactMarker];
}
- (void)clear {
  [self.watchdog invalidate];self.watchdog=nil;
  for (KNNaviPoiEntry *entry in self.entries.allValues) [self removeEntry:entry];
  [self.entries removeAllObjects];self.expiresAt=nil;
  if (self.map) [[KNNaviPoiMarkerRouter routerForMap:self.map] removeOverlay:self];
  _selectedKey=nil;
}
- (void)invalidate { [self clear];self.invalidated=YES;self.onSelect=nil;self.isActive=nil;self.map=nil; }
- (KNMapMarker *)markerForEntry:(KNNaviPoiEntry *)entry icon:(UIImage *)icon minZoom:(float)minZoom maxZoom:(float)maxZoom {
  KNMapMarker *marker=[KNMapMarker marker];
  marker.coordinate=(FloatPoint){(float)entry.x,(float)entry.y};
  marker.icon=icon;marker.pixelOffset=MarkerOffset(icon,entry.anchor);marker.priority=entry.priority;
  [marker setVisibleRangeWithMinZoom:minZoom maxZoom:maxZoom];
  return marker;
}
- (void)buildMarkersForEntry:(KNNaviPoiEntry *)entry {
  if (entry.price) {
    // 가격은 정상 크기(zoom 0.1~4)와 축소 크기(4~32)를 정적 마커 두 개로 전환하고 32 이상 지역 개요에서는 숨긴다.
    entry.marker=[self markerForEntry:entry icon:entry.image minZoom:0.1 maxZoom:NearMaxZoom()];
    [self.map addMarker:entry.marker];
    if (entry.far) {
      entry.compactImage=entry.compactImage?:ScaledImage(entry.image,90.0/116.0);
      entry.compactMarker=[self markerForEntry:entry icon:entry.compactImage minZoom:4 maxZoom:32];
      [self.map addMarker:entry.compactMarker];
    }
  } else {
    entry.marker=[self markerForEntry:entry icon:entry.image minZoom:0.1 maxZoom:entry.far?1000:NearMaxZoom()];
    [self.map addMarker:entry.marker];
  }
}
- (void)showItems:(NSArray<NSDictionary *> *)items expiresAt:(NSDate *)expiresAt {
  if (self.invalidated || !self.map || ![KNSDKBridge isLocationUseAllowed] || (self.isActive && !self.isActive()) || expiresAt.timeIntervalSinceNow<=0) { [self clear];return; }
  NSArray *ordered=[items sortedArrayWithOptions:NSSortStable usingComparator:^NSComparisonResult(NSDictionary *a,NSDictionary *b) {
    return [@([a[@"priority"] integerValue]) compare:@([b[@"priority"] integerValue])];
  }];
  NSMutableDictionary<NSString *, KNNaviPoiEntry *> *next=[NSMutableDictionary new];
  NSMutableArray<KNNaviPoiEntry *> *rows=[NSMutableArray new];
  for (NSDictionary *item in ordered) {
    NSString *key=item[@"key"];UIImage *image=item[@"image"];
    double x=[item[@"x"] doubleValue],y=[item[@"y"] doubleValue];
    if (![key isKindOfClass:NSString.class] || !key.length || next[key] ||
        ![image isKindOfClass:UIImage.class] || image.size.width<=0 || image.size.height<=0 ||
        ![item[@"x"] isKindOfClass:NSNumber.class] || ![item[@"y"] isKindOfClass:NSNumber.class] ||
        !isfinite(x) || !isfinite(y) || fabs(x)>INT_MAX || fabs(y)>INT_MAX) continue;
    KNNaviPoiEntry *entry=[KNNaviPoiEntry new];
    entry.key=key;entry.image=image;entry.x=x;entry.y=y;entry.price=item[@"price"]?[item[@"price"] boolValue]:YES;
    entry.anchor=item[@"anchor"]?[item[@"anchor"] CGPointValue]:CGPointMake(0.5,1);
    next[key]=entry;[rows addObject:entry];
    if (rows.count>=60) break;
  }
  if (!rows.count) { [self clear];return; }
  // 줌아웃(zoom>4)에서는 가격 8개·전체 30개까지만 우선순위 순으로 남긴다.
  NSUInteger far=0,farPrices=0;
  for (NSUInteger rank=0;rank<rows.count;rank++) {
    KNNaviPoiEntry *entry=rows[rank];
    entry.priority=1000+(NSInteger)(rows.count-rank);
    if (far<30 && (!entry.price || farPrices<8)) { entry.far=YES;far++;if (entry.price) farPrices++; }
  }
  // 이미지·좌표·표시 구간이 같은 항목은 마커를 그대로 둬 후속 응답(가격·일반 장소)에서 깜빡이지 않게 한다.
  for (KNNaviPoiEntry *entry in rows) {
    KNNaviPoiEntry *old=self.entries[entry.key];
    if (old && old.image==entry.image && old.x==entry.x && old.y==entry.y && old.price==entry.price &&
        old.far==entry.far && CGPointEqualToPoint(old.anchor,entry.anchor)) {
      // 순위만 밀린 경우는 마커를 다시 만들지 않고 우선순위 값만 갱신한다.
      old.priority=entry.priority;old.compactMarker.priority=entry.priority;
      next[entry.key]=old;continue;
    }
  }
  for (NSString *key in self.entries.allKeys) if (next[key]!=self.entries[key]) [self removeEntry:self.entries[key]];
  for (KNNaviPoiEntry *entry in next.allValues) if (!entry.marker) [self buildMarkersForEntry:entry];
  self.entries=next;self.expiresAt=expiresAt;
  if (self.selectedKey && !next[self.selectedKey]) _selectedKey=nil;
  [self applySelection];
  [[KNNaviPoiMarkerRouter routerForMap:self.map] addOverlay:self];
  if (!self.watchdog) {
    // SDK 마커는 앱이 프레임마다 확인하지 않으므로 만료·동의 철회·비활성은 낮은 빈도로 점검한다.
    __weak KNNaviGuidePoiOverlay *weakSelf=self;
    self.watchdog=[NSTimer timerWithTimeInterval:1 repeats:YES block:^(NSTimer *timer) { [weakSelf revalidate]; }];
    [NSRunLoop.mainRunLoop addTimer:self.watchdog forMode:NSRunLoopCommonModes];
  }
}
- (void)revalidate {
  if (!self.entries.count) return;
  if (![self usable]) [self clear];
}
- (BOOL)handleTap:(KNMapMarker *)marker {
  for (KNNaviPoiEntry *entry in self.entries.allValues) {
    if (entry.marker!=marker && entry.compactMarker!=marker) continue;
    if ([self usable] && self.onSelect) self.onSelect(entry.key);
    return YES;
  }
  return NO;
}
@end
