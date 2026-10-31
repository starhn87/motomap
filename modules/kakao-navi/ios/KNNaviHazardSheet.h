#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN
// 안내 controller 위에서 엔진을 유지한 채 표시하는 앱 소유 제보 유형 선택기.
@interface KNNaviHazardSheet : UIViewController
- (instancetype)initWithOptions:(NSArray<NSDictionary<NSString *, NSString *> *> *)options
                     completion:(void (^)(NSInteger index))completion;
- (instancetype)initWithTitle:(NSString *)title detail:(NSString *)detail
                      options:(NSArray<NSDictionary<NSString *, NSString *> *> *)options
                   completion:(void (^)(NSInteger index))completion;
- (void)cancelForNavigationEnd:(void (^)(void))completion;
// 열린 시트의 제목·설명 줄을 바꾼다(늦게 확인되는 주유소 이름·가격). nil 인 항목은 그대로 둔다.
- (void)updateTitle:(nullable NSString *)title detail:(nullable NSString *)detail;
@end
NS_ASSUME_NONNULL_END
