#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

// 길안내 화면을 모토맵 톤으로 맞춘다. SDK 기본 자차 아이콘 대신 원형 화살표를 쓴다.
//
// 이륜차 여정에서는 setCustomCarImages 만으로 적용되지 않는다 — 적용 경로는
// KNNaviPresenter 의 applyCarTheme 참고 (carImageType 우회).
@interface KNNaviTheme : NSObject

// [자차 on 주간, on 야간, off 주간, off 야간] — SDK 가 요구하는 순서.
+ (NSArray<UIImage *> *)carImages;

// 자차 이미지의 기준점(중앙).
+ (CGPoint)carAnchor;

@end

NS_ASSUME_NONNULL_END
