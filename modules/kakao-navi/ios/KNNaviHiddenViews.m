#import "KNNaviHiddenViews.h"
#import <objc/runtime.h>

static char kHiddenContext;
@interface KNNaviHiddenViews ()
@property(nonatomic, strong) NSMapTable<UIView *, NSNumber *> *views;
@property(nonatomic) BOOL settingHidden;
@end
@implementation KNNaviHiddenViews
- (instancetype)init {
  if ((self = [super init])) _views = [NSMapTable strongToStrongObjectsMapTable];
  return self;
}
- (void)hideView:(UIView *)view {
  if (!view || [self.views objectForKey:view]) return;
  [self.views setObject:@(view.hidden) forKey:view];
  [view addObserver:self forKeyPath:@"hidden" options:0 context:&kHiddenContext];
  self.settingHidden = YES;
  view.hidden = YES;
  self.settingHidden = NO;
}
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
  if (context == &kHiddenContext) {
    if (self.settingHidden) return;
    UIView *view = object;
    [self.views setObject:@(view.hidden) forKey:view];
    if (!view.hidden) {
      self.settingHidden = YES;
      view.hidden = YES;
      self.settingHidden = NO;
    }
    return;
  }
  [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
}
- (void)hideAuxiliaryViewsIn:(UIView *)root {
  // 트리에 아직 붙지 않은 SDK 뷰도 검증된 객체 ivar일 때만 읽는다.
  for (NSString *name in @[@"recommandOilView", @"aroundButtonView"]) {
    Ivar ivar = class_getInstanceVariable(root.class, name.UTF8String);
    const char *type = ivar ? ivar_getTypeEncoding(ivar) : NULL;
    id value = type && type[0] == '@' ? object_getIvar(root, ivar) : nil;
    NSString *expected = [name isEqualToString:@"recommandOilView"] ? @"KNRecommandOilView" : @"KNAroundButtonView";
    if ([value isKindOfClass:UIView.class] && [NSStringFromClass([value class]) isEqualToString:expected]) [self hideView:value];
  }
  for (UIView *view in root.subviews) {
    NSString *name = NSStringFromClass(view.class);
    if ([name isEqualToString:@"KNRecommandOilView"] || [name isEqualToString:@"KNAroundButtonView"]) [self hideView:view];
    else [self hideAuxiliaryViewsIn:view];
  }
}
// 고정 SDK의 개별 컨트롤만 읽는다. 루트 지도나 상태/위험 안내 뷰는 건드리지 않는다.
static UIView *MapControl(UIView *map, NSString *key, Class expected) {
  Class sdkMap = NSClassFromString(@"KNNaviMapView");
  if (!sdkMap || ![map isKindOfClass:sdkMap] || !expected) return nil;
  Ivar ivar = class_getInstanceVariable(map.class, key.UTF8String);
  const char *type = ivar ? ivar_getTypeEncoding(ivar) : NULL;
  id value = type && type[0] == '@' ? object_getIvar(map, ivar) : nil;
  return [value isKindOfClass:expected] ? value : nil;
}
static UIButton *CurrentPositionButton(UIView *map) {
  UIButton *button = (id)MapControl(map, @"curPosBtn", UIButton.class);
  for (id target in button.allTargets) {
    if ([button actionsForTarget:target forControlEvent:UIControlEventTouchUpInside].count) return button;
  }
  return nil;
}
- (BOOL)hideMapControlsIn:(UIView *)map {
  UIButton *current = CurrentPositionButton(map);
  UIView *zoom = MapControl(map, @"zoomBtn", NSClassFromString(@"UIMapButton"));
  UIView *style = MapControl(map, @"mapStyleBtn", NSClassFromString(@"UIMapButton"));
  if (!current || !zoom || !style) return NO;
  [self hideView:current]; [self hideView:zoom]; [self hideView:style];
  return YES;
}
+ (BOOL)recenterMap:(UIView *)map {
  UIButton *button = CurrentPositionButton(map);
  if (!button) return NO;
  // SDK가 원래 버튼에 연결한 이벤트를 보내 카메라 추적과 화면 상태를 함께 복원한다.
  [button sendActionsForControlEvents:UIControlEventTouchUpInside];
  return YES;
}
- (void)restore {
  for (UIView *view in self.views.keyEnumerator.allObjects) {
    BOOL hidden = [[self.views objectForKey:view] boolValue];
    [view removeObserver:self forKeyPath:@"hidden" context:&kHiddenContext];
    view.hidden = hidden;
  }
  [self.views removeAllObjects];
}
- (void)dealloc { [self restore]; }
@end
