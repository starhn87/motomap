#import "KNNaviHiddenViews.h"
#import <objc/runtime.h>

static char kHiddenContext;
@interface KNNaviHiddenViews ()
@property(nonatomic, strong) NSMapTable<UIView *, NSNumber *> *views;
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
  view.hidden = YES;
}
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
  if (context == &kHiddenContext) {
    if (![(UIView *)object isHidden]) [(UIView *)object setHidden:YES];
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
