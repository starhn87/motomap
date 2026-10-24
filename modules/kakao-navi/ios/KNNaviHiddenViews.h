#import <UIKit/UIKit.h>

// SDK가 show:를 반복해도 지정한 인스턴스만 숨긴다. 해제 시 원래 상태로 돌린다.
@interface KNNaviHiddenViews : NSObject
- (void)hideView:(UIView *)view;
- (void)hideAuxiliaryViewsIn:(UIView *)root;
- (void)restore;
@end
