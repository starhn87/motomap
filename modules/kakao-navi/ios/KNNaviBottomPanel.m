#import "KNNaviBottomPanel.h"
#import <math.h>

const CGFloat KNNaviBottomCollapsedHeight = 68;
const CGFloat KNNaviBottomRecenterHeight = 54;

static KNNaviGuideSurfaceFactory surfaceFactory;
static KNNaviGuideSurfaceEvent surfaceEvent;
static NSMapTable<NSString *, KNNaviBottomPanel *> *panels;

@interface KNNaviBottomPanel ()
@property(nonatomic, strong, nullable) UIView *footer;
@property(nonatomic, strong) UIView *menuView;
@property(nonatomic, strong, nullable) UIView *menu;
@property(nonatomic, copy) NSString *token;
@property(nonatomic, copy) NSDictionary *state;
@property(nonatomic, copy, nullable) NSDictionary *lastFooterSnapshot;
@property(nonatomic, copy, nullable) NSDictionary *lastMenuSnapshot;
@property(nonatomic) BOOL ready;
@property(nonatomic) BOOL footerReady;
@property(nonatomic) BOOL menuReady;
@property(nonatomic) BOOL failed;
@property(nonatomic) BOOL invalidated;
@property(nonatomic) BOOL expanded;
@property(nonatomic) CGFloat bottomInset;
@property(nonatomic) CGFloat menuBottomInset;
@end

@implementation KNNaviBottomPanel
+ (void)setSurfaceFactory:(KNNaviGuideSurfaceFactory)factory event:(KNNaviGuideSurfaceEvent)event {
  surfaceFactory = [factory copy];
  surfaceEvent = [event copy];
}
+ (NSDictionary *)connectSurface:(NSString *)token menu:(BOOL)menu {
  KNNaviBottomPanel *panel = [panels objectForKey:token];
  if (!panel || panel.failed) return nil;
  return [panel snapshotForMenu:menu];
}
+ (void)surfaceRendered:(NSString *)token menu:(BOOL)menu {
  KNNaviBottomPanel *panel = [panels objectForKey:token];
  if (!panel || panel.failed || panel.ready) return;
  if (menu) panel.menuReady = YES; else panel.footerReady = YES;
  if (!panel.footerReady || !panel.menuReady) return;
  panel.ready = YES;
  [panel publishHeight];
  [panel publish];
  if (panel.onAction) panel.onAction(@"ready", @{});
}
+ (void)surfaceAction:(NSString *)token action:(NSString *)action value:(NSNumber *)value {
  KNNaviBottomPanel *panel = [panels objectForKey:token];
  if (!panel.ready || panel.failed) return;
  if ([action isEqualToString:@"menu"]) { [panel setMenuOpen:!panel.expanded]; return; }
  if ([action isEqualToString:@"volume"]) {
    if (!panel.expanded || !value || !isfinite(value.doubleValue)) return;
    if (panel.onAction) panel.onAction(action, @{@"value":@(MAX(0, MIN(1, value.doubleValue)))});
    return;
  }
  if ([action isEqualToString:@"routeEdit"]) {
    if (!panel.expanded || ![panel.state[@"canRouteEdit"] boolValue] || [panel.state[@"busy"] boolValue]) return;
  } else if ([action isEqualToString:@"end"]) {
    if (!panel.expanded) return;
  } else if ([action isEqualToString:@"recenter"]) {
    if (panel.expanded || ![panel.state[@"showRecenter"] boolValue]) return;
  } else if ([action isEqualToString:@"refresh"]) {
    if (panel.expanded || [panel.state[@"busy"] boolValue]) return;
  } else return;
  [panel collapse];
  if (panel.onAction) panel.onAction(action, @{});
}
- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (!self) return nil;
  _state = @{};
  _token = NSUUID.UUID.UUIDString;
  if (!panels) panels = [NSMapTable strongToWeakObjectsMapTable];
  [panels setObject:self forKey:_token];

  _menuView = [UIView new];
  _menuView.hidden = YES;
  _footer = surfaceFactory ? surfaceFactory(@{@"token":_token, @"menu":@NO}) : nil;
  _menu = surfaceFactory ? surfaceFactory(@{@"token":_token, @"menu":@YES}) : nil;
  if (_footer) [self mount:_footer inView:self];
  if (_menu) [self mount:_menu inView:_menuView];

  __weak KNNaviBottomPanel *weakSelf = self;
  NSTimeInterval timeout = _footer && _menu ? 10 : 0;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(timeout * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    if (!weakSelf.ready) [weakSelf fail];
  });
  return self;
}
- (void)mount:(UIView *)surface inView:(UIView *)parent {
  surface.backgroundColor = UIColor.clearColor;
  surface.frame = parent.bounds;
  surface.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  [parent addSubview:surface];
}
- (void)fail {
  if (self.invalidated || self.failed) return;
  [self collapse];
  self.failed = YES; self.ready = NO;
  [self detachSurfaces];
  if (self.onFailure) self.onFailure();
}
- (void)detachSurfaces {
  [panels removeObjectForKey:self.token];
  [self.footer removeFromSuperview]; self.footer = nil;
  [self.menu removeFromSuperview]; self.menu = nil;
}
- (void)setBottomInset:(CGFloat)inset {
  if (_bottomInset == MAX(0, inset)) return;
  _bottomInset = MAX(0, inset);
  [self publish]; [self publishHeight];
}
- (void)setMenuBottomInset:(CGFloat)inset {
  if (_menuBottomInset == MAX(0, inset)) return;
  _menuBottomInset = MAX(0, inset);
  [self publish];
}
- (void)publishHeight {
  self.accessibilityElementsHidden = self.expanded;
  self.menuView.accessibilityViewIsModal = self.expanded && self.ready;
  if (self.onHeight) self.onHeight(KNNaviBottomCollapsedHeight + KNNaviBottomRecenterHeight + self.bottomInset);
}
- (void)updateState:(NSDictionary *)state {
  if ([self.state isEqualToDictionary:state]) return;
  self.state = state;
  [self publish];
}
- (BOOL)pointInside:(CGPoint)point withEvent:(UIEvent *)event {
  CGFloat barTop = MAX(0, self.bounds.size.height - KNNaviBottomCollapsedHeight - self.bottomInset);
  if (point.y < barTop && (![self.state[@"showRecenter"] boolValue] ||
      point.y >= 44 || fabs(point.x - self.bounds.size.width / 2) > 66)) return NO;
  return [super pointInside:point withEvent:event];
}
- (NSDictionary *)snapshotForMenu:(BOOL)menu {
  // GPS·시간 변경은 숨겨진 메뉴를 다시 그리지 않고 음량 변경은 하단 바에 보내지 않는다.
  NSMutableDictionary *state = [self.state mutableCopy];
  if (menu) {
    state = [@{@"volume":self.state[@"volume"] ?: @1,
               @"canRouteEdit":self.state[@"canRouteEdit"] ?: @NO,
               @"busy":self.state[@"busy"] ?: @NO} mutableCopy];
  } else {
    [state removeObjectsForKeys:@[@"volume", @"canRouteEdit"]];
  }
  return @{@"token":self.token, @"menu":@(menu), @"expanded":@(self.expanded),
           @"bottomInset":@(menu ? self.menuBottomInset : self.bottomInset), @"state":state};
}
- (void)publish {
  if (self.invalidated || self.failed || !surfaceEvent) return;
  if (self.footerReady) {
    NSDictionary *footer = [self snapshotForMenu:NO];
    if (![self.lastFooterSnapshot isEqual:footer]) {
      self.lastFooterSnapshot = footer;
      surfaceEvent(footer);
    }
  }
  if (self.menuReady) {
    NSDictionary *menu = [self snapshotForMenu:YES];
    if (![self.lastMenuSnapshot isEqual:menu]) {
      self.lastMenuSnapshot = menu;
      surfaceEvent(menu);
    }
  }
}
- (BOOL)accessibilityPerformEscape {
  if (!self.expanded) return NO;
  [self collapse]; return YES;
}
- (void)setMenuOpen:(BOOL)open {
  if (self.expanded == open) return;
  self.expanded = open;
  [self publishHeight]; [self publish];
  if (self.onMenuVisibility) self.onMenuVisibility(open);
}
- (void)showToast:(NSString *)message {
  if (!self.ready || self.invalidated || self.failed || !surfaceEvent) return;
  surfaceEvent(@{@"token":self.token, @"menu":@(self.expanded), @"toast":message});
}
- (void)collapse { [self setMenuOpen:NO]; }
- (void)invalidate {
  if (self.invalidated) return;
  self.invalidated = YES;
  self.ready = NO;
  [self detachSurfaces];
  self.onAction = nil; self.onHeight = nil; self.onFailure = nil; self.onMenuVisibility = nil;
}
@end
