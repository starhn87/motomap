#import <UIKit/UIKit.h>
#import <KNSDK/KNSDK.h>

NS_ASSUME_NONNULL_BEGIN

// 현재 위치부터 목적지까지를 최대48개 구간으로 나눠 SDK의 구간 평균 상태를 읽는다.
NSArray<NSNumber *> *KNNaviTrafficStates(KNLocation *location, SInt32 remainingDistance);
CGRect KNNaviTrafficBarFrame(CGRect safeBounds, CGFloat top, CGFloat bottom);

@interface KNNaviTrafficBar : UIView
@property(nonatomic, copy, readonly) NSArray<NSNumber *> *states;
@property(nonatomic) BOOL positionAvailable;
- (void)updateFromLocation:(KNLocation *)location remainingDistance:(SInt32)distance time:(NSTimeInterval)time;
- (void)reset;
@end

NS_ASSUME_NONNULL_END
