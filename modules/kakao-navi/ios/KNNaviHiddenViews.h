#import <UIKit/UIKit.h>

// SDK가 show:를 반복해도 지정한 인스턴스만 숨긴다. 해제 시 SDK가 마지막으로 요청한 표시 상태로 돌린다.
@interface KNNaviHiddenViews : NSObject
- (void)hideView:(UIView *)view;
- (void)hideAuxiliaryViewsIn:(UIView *)root;
// SDK 현재 위치 버튼의 실제 target/action을 재사용할 수 있을 때만 컨트롤을 숨긴다.
- (BOOL)hideMapControlsIn:(UIView *)map;
+ (BOOL)recenterMap:(UIView *)map;
- (void)restore;
@end
