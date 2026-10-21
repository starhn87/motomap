#import "KNNaviArrivalRecovery.h"
#import <math.h>

@interface KNNaviArrivalRecovery ()
@property(nonatomic) BOOL waiting;
@property(nonatomic) BOOL requesting;
@property(nonatomic) double closestDistance;
@property(nonatomic) NSUInteger departureSamples;
@property(nonatomic) NSUInteger attempts;
@property(nonatomic) NSTimeInterval lastAttempt;
@end

@implementation KNNaviArrivalRecovery
- (void)guideEndedAtDistance:(double)distance {
  self.waiting = YES;
  self.requesting = NO;
  self.closestDistance = isfinite(distance) && distance >= 0 ? distance : INFINITY;
  self.departureSamples = 0;
}
- (BOOL)shouldRecoverAtDistance:(double)distance time:(NSTimeInterval)time {
  if (!self.waiting || self.requesting || !isfinite(distance) || distance < 0) return NO;
  self.closestDistance = fmin(self.closestDistance, distance);
  // 목적지에서 60m 이상 떨어지고 최근접 지점보다 30m 이상 멀어진 유효 위치 3개.
  // 한 번의 GPS 튐이나 도착지에 머무르는 동안의 반복 안내를 피한다.
  if (distance < 60 || distance < self.closestDistance + 30) {
    self.departureSamples = 0;
    return NO;
  }
  self.departureSamples++;
  if (self.departureSamples < 3 || self.attempts >= 3 ||
      (self.attempts > 0 && time - self.lastAttempt < 15)) return NO;
  return [self beginManualRecoveryAtTime:time];
}
- (BOOL)beginManualRecoveryAtTime:(NSTimeInterval)time {
  if (!self.waiting || self.requesting) return NO;
  self.requesting = YES;
  self.lastAttempt = time;
  self.attempts++;
  self.departureSamples = 0;
  return YES;
}
- (void)requestFailed { self.requesting = NO; }
- (void)guideStarted {
  self.waiting = NO;
  self.requesting = NO;
  self.attempts = 0;
  self.departureSamples = 0;
}
@end
