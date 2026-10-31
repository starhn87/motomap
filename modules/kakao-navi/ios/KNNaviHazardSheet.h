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
// 열린 시트의 설명 줄을 바꾼다(주유소 가격처럼 늦게 오는 정보).
- (void)updateDetail:(NSString *)detail;
@end
NS_ASSUME_NONNULL_END
