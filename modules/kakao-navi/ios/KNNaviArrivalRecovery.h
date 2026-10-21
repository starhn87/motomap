#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// SDK 도착 판정 뒤에는 원 목적지를 유지한다. 가까이 머무를 때 재탐색을 반복하지 않는다.
@interface KNNaviArrivalRecovery : NSObject
@property(nonatomic, readonly) BOOL waiting;
@property(nonatomic, readonly) BOOL requesting;
- (void)guideEndedAtDistance:(double)distance;
- (BOOL)shouldRecoverAtDistance:(double)distance time:(NSTimeInterval)time;
- (BOOL)beginManualRecoveryAtTime:(NSTimeInterval)time;
- (void)requestFailed;
- (void)guideStarted;
@end

NS_ASSUME_NONNULL_END
