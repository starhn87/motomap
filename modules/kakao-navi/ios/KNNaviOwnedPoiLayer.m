#import "KNNaviOwnedPoiLayer.h"
#import "KNNaviGuidePoiOverlay.h"
#import "KNNaviGuidePoiArtwork.h"
#import "KNSDKBridge.h"
#import <limits.h>
#import <math.h>

@interface KNNaviOwnedPoiLayer ()
@property(nonatomic, weak) KNMapView *map;
@property(nonatomic, strong) KNNaviGuidePoiOverlay *renderer;
@property(nonatomic, strong) NSTimer *timer;
@property(nonatomic, copy) NSDictionary *context;
@property(nonatomic, copy) NSArray *pose;
@property(nonatomic, strong) NSDate *settledAt;
@property(nonatomic, strong) NSDate *dirtySince;
@property(nonatomic, strong) NSDate *retryAfter;
@property(nonatomic, copy) NSDictionary *snapshotBounds;
@property(nonatomic, strong) NSDate *requestedAt;
@property(nonatomic, strong) NSDate *expiresAt;
@property(nonatomic, copy) NSString *snapshotId;
@property(nonatomic, copy) NSSet<NSString *> *keys;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSDictionary *> *artwork;
@property(nonatomic) BOOL ownsPoiVisibility;
@property(nonatomic) BOOL previousVisibility;
@property(nonatomic) BOOL needsRequest;
@property(nonatomic) BOOL invalidated;
@end

static BOOL ContainsBounds(NSDictionary *outer,NSDictionary *inner) {
  return outer && inner && [outer[@"south"] doubleValue]<=[inner[@"south"] doubleValue] &&
    [outer[@"north"] doubleValue]>=[inner[@"north"] doubleValue] &&
    [outer[@"west"] doubleValue]<=[inner[@"west"] doubleValue] && [outer[@"east"] doubleValue]>=[inner[@"east"] doubleValue];
}
@implementation KNNaviOwnedPoiLayer
- (instancetype)initWithMap:(KNMapView *)map {
  if ((self=[super init])) {
    _map=map;_renderer=[[KNNaviGuidePoiOverlay alloc] initWithMap:map];_artwork=[NSMutableDictionary new];
    __weak KNNaviOwnedPoiLayer *weakSelf=self;
    _renderer.isActive=^BOOL { return [weakSelf active]; };
    _renderer.onSelect=^(NSString *key) {
      KNNaviOwnedPoiLayer *owner=weakSelf;
      if ([owner active] && owner.ownsPoiVisibility && owner.expiresAt.timeIntervalSinceNow>0 && [owner.keys containsObject:key] && owner.onSelect) {
        owner.renderer.selectedKey=key;owner.onSelect(key,owner.snapshotId);
      }
    };
    _timer=[NSTimer timerWithTimeInterval:0.2 repeats:YES block:^(NSTimer *timer) { [weakSelf poll]; }];
    [NSRunLoop.mainRunLoop addTimer:_timer forMode:NSRunLoopCommonModes];
  }
  return self;
}
- (BOOL)active {
  return !self.invalidated && self.map.window && [KNSDKBridge isLocationUseAllowed] &&
    UIApplication.sharedApplication.applicationState==UIApplicationStateActive && self.isActive && self.isActive();
}
- (void)fallback {
  [self.renderer clear];self.snapshotId=nil;self.keys=nil;self.expiresAt=nil;self.snapshotBounds=nil;
}
- (void)restoreSdkVisibility {
  if (self.ownsPoiVisibility) {
    // 이 계층이 바꾼 상태가 남아 있을 때만 원래 SDK 표시 설정을 돌려준다.
    if (!self.map.poiProperties.isVisible) self.map.poiProperties.isVisible=self.previousVisibility;
    self.ownsPoiVisibility=NO;if(self.onModeChanged)self.onModeChanged(NO);
  }
}
- (void)refresh {
  [self fallback];self.context=nil;self.pose=nil;self.requestedAt=nil;self.retryAfter=nil;self.dirtySince=nil;
  if(![self active])[self restoreSdkVisibility];
  [self.artwork removeAllObjects];
}
- (void)invalidate {
  if(self.invalidated)return;
  self.invalidated=YES;[self refresh];[self.timer invalidate];self.timer=nil;
  [self.renderer invalidate];self.isActive=nil;self.onRequest=nil;self.onSelect=nil;self.onModeChanged=nil;self.exclusions=nil;
}
- (void)dealloc { [self.timer invalidate];[self.renderer invalidate];if(self.ownsPoiVisibility && !self.map.poiProperties.isVisible)self.map.poiProperties.isVisible=self.previousVisibility; }
- (NSDictionary *)viewport {
  KNMapView *map=self.map;CGRect b=map.bounds;
  if(b.size.width<1 || b.size.height<1 || !isfinite(map.zoom) || map.zoom<=0)return nil;
  FloatPoint center=[map screenToKatec:CGPointMake(CGRectGetMidX(b),CGRectGetMidY(b))];
  if(!isfinite(center.x)||!isfinite(center.y)||fabs(center.x)>INT_MAX||fabs(center.y)>INT_MAX)return nil;
  KNSDK *sdk=[KNSDK sharedInstance];
  DoublePoint c=[sdk convertKATECToWGS84WithX:(SInt32)center.x y:(SInt32)center.y];
  if(!isfinite(c.x)||!isfinite(c.y)||fabs(c.x)>180||fabs(c.y)>90||(c.x==0&&c.y==0))return nil;
  double south=90,north=-90,west=180,east=-180;BOOL cornersValid=YES;
  for(NSValue *value in @[[NSValue valueWithCGPoint:b.origin],[NSValue valueWithCGPoint:CGPointMake(CGRectGetMaxX(b),CGRectGetMinY(b))],
    [NSValue valueWithCGPoint:CGPointMake(CGRectGetMinX(b),CGRectGetMaxY(b))],[NSValue valueWithCGPoint:CGPointMake(CGRectGetMaxX(b),CGRectGetMaxY(b))]]) {
    FloatPoint p=[map screenToKatec:value.CGPointValue];
    if(!isfinite(p.x)||!isfinite(p.y)||fabs(p.x)>INT_MAX||fabs(p.y)>INT_MAX){cornersValid=NO;break;}
    DoublePoint w=[sdk convertKATECToWGS84WithX:(SInt32)p.x y:(SInt32)p.y];
    if(!isfinite(w.x)||!isfinite(w.y)||fabs(w.x-c.x)>1||fabs(w.y-c.y)>1){cornersValid=NO;break;}
    south=MIN(south,w.y);north=MAX(north,w.y);west=MIN(west,w.x);east=MAX(east,w.x);
  }
  if(!cornersValid || south>=north || west>=east) {
    // 3D 원근의 하늘 영역은 좌표가 없을 수 있다. 실측 축척에 보수적 여유를 둔다.
    double radius=MIN(20000,MAX(200,hypot(b.size.width,b.size.height)*map.zoom/4*(map.tilt>0?3:1)));
    double lat=radius/111320,lng=lat/MAX(0.1,cos(c.y*M_PI/180));
    south=c.y-lat;north=c.y+lat;west=c.x-lng;east=c.x+lng;
  }
  if(south < -90 || north>90 || west < -180 || east>180 || north-south>2 || east-west>2)return nil;
  return @{@"south":@(south),@"north":@(north),@"west":@(west),@"east":@(east)};
}
- (void)poll {
  if(![self active]) { [self refresh];return; }
  // 안내 중에는 조회/만료/축척과 관계없이 표시 주체를 바꾸지 않는다.
  if(!self.ownsPoiVisibility){
    self.previousVisibility=self.map.poiProperties.isVisible;self.ownsPoiVisibility=YES;
    self.map.poiProperties.isVisible=NO;if(self.onModeChanged)self.onModeChanged(YES);
  } else if(self.map.poiProperties.isVisible)self.map.poiProperties.isVisible=NO;
  // 자동 따라가기 중에도 만료·실패 복원은 카메라 변경보다 먼저 처리한다.
  if(self.ownsPoiVisibility && self.expiresAt.timeIntervalSinceNow<=0) { [self fallback];self.needsRequest=YES; }
  if(self.context && -self.requestedAt.timeIntervalSinceNow>20) { self.context=nil;[self fallback];self.needsRequest=YES; }
  if(self.exclusions)self.renderer.exclusionRects=self.exclusions();
  KNMapView *map=self.map;
  NSArray *pose=@[@(map.coordinate.x),@(map.coordinate.y),@(map.zoom),@(map.bearing),@(map.tilt),
    @(map.anchor.x),@(map.anchor.y),@(map.bounds.size.width),@(map.bounds.size.height),@(map.traitCollection.userInterfaceStyle)];
  NSDictionary *bounds=[self viewport];
  if(!bounds) { [self fallback];self.context=nil;self.pose=pose;self.needsRequest=YES;return; }
  if(![self.pose isEqual:pose]) {
    self.pose=pose;self.settledAt=NSDate.date;
    if(self.ownsPoiVisibility && !ContainsBounds(self.snapshotBounds,bounds))[self fallback];
    if(self.context && !ContainsBounds(self.context[@"bounds"],bounds))self.context=nil;
    self.needsRequest=!self.snapshotId;
  }
  if(self.snapshotId && ContainsBounds(self.snapshotBounds,bounds))self.needsRequest=NO;
  if(self.needsRequest && !self.dirtySince)self.dirtySince=NSDate.date;
  if(!self.needsRequest || self.context || self.retryAfter.timeIntervalSinceNow>0)return;
  // 손 이동은600ms 정지 후, 자동 이동은 최대2초 대기 뒤 조회한다.
  if(-self.settledAt.timeIntervalSinceNow<0.6 && -self.dirtySince.timeIntervalSinceNow<2)return;
  if(self.requestedAt && -self.requestedAt.timeIntervalSinceNow<2)return;
  double lat=([bounds[@"north"] doubleValue]-[bounds[@"south"] doubleValue])*0.25;
  double lng=([bounds[@"east"] doubleValue]-[bounds[@"west"] doubleValue])*0.25;
  NSDictionary *coverage=@{@"south":@([bounds[@"south"] doubleValue]-lat),@"north":@([bounds[@"north"] doubleValue]+lat),
    @"west":@([bounds[@"west"] doubleValue]-lng),@"east":@([bounds[@"east"] doubleValue]+lng)};
  self.requestedAt=NSDate.date;
  self.context=@{@"requestId":NSUUID.UUID.UUIDString,@"bounds":coverage};
  if(self.onRequest)self.onRequest();
}
- (BOOL)applyResponse:(NSDictionary *)response {
  if(![self active])return NO;
  NSString *requestId=response[@"requestId"];
  BOOL pending=self.context && [requestId isEqual:self.context[@"requestId"]];
  BOOL followup=!self.context && self.ownsPoiVisibility && [requestId isEqual:self.snapshotId];
  if(!pending && !followup)return NO;
  NSDictionary *coverage=pending?self.context[@"bounds"]:self.snapshotBounds;
  if(pending)self.context=nil;
  if(!ContainsBounds(coverage,[self viewport])) { [self fallback];self.needsRequest=YES;return NO; }
  self.needsRequest=NO;self.dirtySince=nil;
  if(response[@"error"]) { [self fallback];self.needsRequest=YES;self.retryAfter=[NSDate dateWithTimeIntervalSinceNow:30];return NO; }
  if(![response[@"expiresAt"] isKindOfClass:NSNumber.class]) { [self fallback];return NO; }
  double expires=[response[@"expiresAt"] doubleValue]/1000,now=NSDate.date.timeIntervalSince1970;
  NSArray *pois=response[@"pois"];
  if(![response[@"expiresAt"] isKindOfClass:NSNumber.class] || !isfinite(expires)||expires<=now||expires>now+301 ||
    ![pois isKindOfClass:NSArray.class] || pois.count>60) { [self fallback];return NO; }
  NSMutableArray *items=[NSMutableArray new];NSMutableSet *keys=[NSMutableSet new];NSMutableDictionary *artwork=[NSMutableDictionary new];
  for(id value in pois) {
    if(![value isKindOfClass:NSDictionary.class]){[self fallback];return NO;}
    NSDictionary *row=value;NSString *key=row[@"key"],*name=row[@"name"];
    if(![key isKindOfClass:NSString.class]||!key.length||key.length>250||[keys containsObject:key]||
      ![name isKindOfClass:NSString.class]||!name.length||name.length>200||
      ![row[@"latitude"] isKindOfClass:NSNumber.class]||![row[@"longitude"] isKindOfClass:NSNumber.class]){[self fallback];return NO;}
    double lat=[row[@"latitude"] doubleValue],lng=[row[@"longitude"] doubleValue];
    if(!isfinite(lat)||!isfinite(lng)||fabs(lat)>90||fabs(lng)>180){[self fallback];return NO;}
    NSMutableDictionary *style=[@{@"name":name} mutableCopy];
    for(NSString *field in @[@"category",@"personal",@"brand"])if([row[field] isKindOfClass:NSString.class])style[field]=row[field];
    if([row[@"favorite"] isKindOfClass:NSNumber.class])style[@"favorite"]=row[@"favorite"];
    if([row[@"price"] isKindOfClass:NSNumber.class]&&isfinite([row[@"price"] doubleValue])&&[row[@"price"] doubleValue]>0&&[row[@"price"] doubleValue]<=100000)style[@"price"]=row[@"price"];
    NSDictionary *old=self.artwork[key];UIImage *image=[old[@"style"] isEqual:style]?old[@"image"]:[KNNaviGuidePoiArtwork imageForPoi:style];
    artwork[key]=@{@"style":style,@"image":image};
    IntPoint p=[[KNSDK sharedInstance] convertWGS84ToKATECWithLongitude:lng latitude:lat];
    NSInteger priority=style[@"personal"]?0:[style[@"favorite"] boolValue]?1:row[@"gasId"]?2:3;
    BOOL price=[style[@"price"] doubleValue]>0;
    [items addObject:@{@"key":key,@"x":@(p.x),@"y":@(p.y),@"image":image,@"label":name,@"priority":@(priority),@"price":@(price),
      @"anchor":[NSValue valueWithCGPoint:CGPointMake(0.5,price?1:15/image.size.height)]}];
    [keys addObject:key];
  }
  self.artwork=artwork;self.keys=keys;self.snapshotId=requestId;self.snapshotBounds=coverage;self.expiresAt=[NSDate dateWithTimeIntervalSince1970:expires];
  if(!self.ownsPoiVisibility)self.previousVisibility=self.map.poiProperties.isVisible;
  self.map.poiProperties.isVisible=NO;self.ownsPoiVisibility=YES;
  if(self.onModeChanged)self.onModeChanged(YES);
  [self.renderer showItems:items expiresAt:self.expiresAt];
  return YES;
}
@end
