#import "KNNaviTrafficBar.h"

NSArray<NSNumber *> *KNNaviTrafficStates(KNLocation *location, SInt32 remainingDistance) {
  if (!location || remainingDistance <= 0) return @[];
  NSUInteger count = MIN(48, remainingDistance);
  NSMutableArray<NSNumber *> *states = [NSMutableArray arrayWithCapacity:count];
  KNLocation *from = location;
  for (NSUInteger i = 0; i < count; i++) {
    SInt32 start = (SInt32)((int64_t)remainingDistance * i / count);
    SInt32 end = (SInt32)((int64_t)remainingDistance * (i + 1) / count);
    // 직전 끝점에서 전진해 긴 경로를 표본 수만큼 처음부터 다시 순회하지 않는다.
    KNLocation *to = from ? [from locationAfterDist:end - start] : [location locationAfterDist:end];
    KNTrafficState state = KNTrafficState_Unknown;
    // SDK가 끝점을 찾지 못하거나 목적지에서 잘라낸 구간을 원활로 추정하지 않는다.
    if (from && to && llabs((int64_t)[from distToLocation:to] - (end - start)) <= MAX(3, (end - start) / 10)) {
      SInt32 encoded = [from avrSpeedAndTrafStToLocation:to];
      SInt32 value = encoded >= 0 ? encoded % 10 : -1;
      if (value >= KNTrafficState_Unknown && value <= KNTrafficState_Blocked) state = value;
    }
    [states addObject:@(state)];
    from = to;
  }
  return states;
}

CGRect KNNaviTrafficBarFrame(CGRect safeBounds, CGFloat top, CGFloat bottom) {
  if (CGRectIsEmpty(safeBounds) || !isfinite(top) || !isfinite(bottom)) return CGRectZero;
  top = MAX(CGRectGetMinY(safeBounds), top) + 16;
  bottom = MIN(CGRectGetMaxY(safeBounds), bottom) - 16;
  CGFloat available = bottom - top;
  if (available < 112 || safeBounds.size.width < 56) return CGRectZero;
  CGFloat height = MIN(240, available);
  return CGRectMake(CGRectGetMaxX(safeBounds) - 44, top + (available - height) / 2, 32, height);
}

@interface KNNaviTrafficBar ()
@property(nonatomic, copy, readwrite) NSArray<NSNumber *> *states;
@property(nonatomic) NSTimeInterval sampledAt;
@property(nonatomic) SInt32 remainingDistance;
@property(nonatomic, strong) UIImageView *goalIcon;
@property(nonatomic, strong) UIImageView *positionIcon;
@end

@implementation KNNaviTrafficBar
- (instancetype)initWithFrame:(CGRect)frame {
  if ((self = [super initWithFrame:frame])) {
    self.states = @[];
    self.backgroundColor = UIColor.clearColor;
    self.opaque = NO;
    self.hidden = YES;
    self.userInteractionEnabled = NO;
    self.isAccessibilityElement = YES;
    self.accessibilityTraits = UIAccessibilityTraitStaticText;
    self.accessibilityLabel = @"남은 경로 교통 흐름";
    self.accessibilityHint = @"아래가 현재 위치, 위가 목적지입니다. 구간별 평균 교통 상황입니다.";
    self.accessibilityIdentifier = @"guide-route-traffic-bar";
    self.goalIcon = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"flag.checkered"]];
    self.goalIcon.tintColor = UIColor.labelColor;
    self.positionIcon = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"location.north.fill"]];
    self.positionIcon.tintColor = [UIColor colorWithRed:0.12 green:0.75 blue:0.35 alpha:1];
    for (UIImageView *icon in @[self.goalIcon, self.positionIcon]) {
      icon.contentMode = UIViewContentModeScaleAspectFit;
      icon.isAccessibilityElement = NO;
      [self addSubview:icon];
    }
  }
  return self;
}
- (void)layoutSubviews {
  [super layoutSubviews];
  self.goalIcon.frame = CGRectMake(6, 6, 20, 20);
  self.positionIcon.frame = CGRectMake(6, self.bounds.size.height - 26, 20, 20);
  [self setNeedsDisplay];
}
- (void)traitCollectionDidChange:(UITraitCollection *)previous {
  [super traitCollectionDidChange:previous];
  [self setNeedsDisplay];
}
- (void)reset {
  self.states = @[];
  self.sampledAt = 0;
  self.remainingDistance = 0;
  self.accessibilityValue = nil;
  self.hidden = YES;
  [self setNeedsDisplay];
}
- (void)updateFromLocation:(KNLocation *)location remainingDistance:(SInt32)distance time:(NSTimeInterval)time {
  if (!location || distance <= 0 || !isfinite(time)) { [self reset]; return; }
  // GPS마다 전체 경로를 읽지 않는다. 최대48개 표본,10초 또는 한 칸 이상 이동할 때 갱신한다.
  if (self.states.count && time >= self.sampledAt && time - self.sampledAt < 10 &&
      llabs((int64_t)distance - self.remainingDistance) < MAX(100, self.remainingDistance / 48)) return;
  self.states = KNNaviTrafficStates(location, distance);
  self.remainingDistance = distance;
  self.sampledAt = time;
  self.accessibilityValue = distance >= 1000 ? [NSString stringWithFormat:@"목적지까지 %.1f킬로미터", distance / 1000.0] :
      [NSString stringWithFormat:@"목적지까지 %d미터", (int)distance];
  NSArray<NSString *> *names = @[@"교통정보 없음", @"정체", @"지체", @"서행", @"원활", @"통행 불가"];
  NSMutableArray<NSString *> *summary = [NSMutableArray arrayWithObject:self.accessibilityValue];
  for (NSUInteger state = 0; state < names.count; state++) {
    NSUInteger count = 0;
    for (NSNumber *value in self.states) if (value.unsignedIntegerValue == state) count++;
    if (count) [summary addObject:[NSString stringWithFormat:@"%@ 약 %.0f퍼센트", names[state], 100.0 * count / self.states.count]];
  }
  self.accessibilityValue = [summary componentsJoinedByString:@", "];
  [self setNeedsDisplay];
}
- (UIColor *)colorForState:(KNTrafficState)state {
  switch (state) {
    case KNTrafficState_Red: return [UIColor colorWithRed:0.94 green:0.22 blue:0.20 alpha:1];
    case KNTrafficState_Yellow: return [UIColor colorWithRed:1 green:0.60 blue:0.05 alpha:1];
    case KNTrafficState_Green: return [UIColor colorWithRed:0.98 green:0.80 blue:0.12 alpha:1];
    case KNTrafficState_Blue: return [UIColor colorWithRed:0.17 green:0.52 blue:0.95 alpha:1];
    case KNTrafficState_Blocked: return [UIColor colorWithRed:0.52 green:0.12 blue:0.16 alpha:1];
    default: return UIColor.systemGray3Color;
  }
}
- (void)drawRect:(CGRect)rect {
  [UIColor.secondarySystemBackgroundColor setFill];
  [[UIBezierPath bezierPathWithRoundedRect:self.bounds cornerRadius:16] fill];
  [UIColor.separatorColor setStroke];
  UIBezierPath *outline = [UIBezierPath bezierPathWithRoundedRect:CGRectInset(self.bounds, 0.5, 0.5) cornerRadius:15.5];
  outline.lineWidth = 1;
  [outline stroke];
  CGRect track = CGRectMake(10, 32, 12, MAX(0, self.bounds.size.height - 64));
  CGContextRef context = UIGraphicsGetCurrentContext();
  CGContextSaveGState(context);
  [[UIBezierPath bezierPathWithRoundedRect:track cornerRadius:6] addClip];
  NSUInteger count = self.states.count;
  for (NSUInteger i = 0; i < count; i++) {
    CGRect segment = CGRectMake(track.origin.x, CGRectGetMaxY(track) - track.size.height * (i + 1) / count,
                                track.size.width, track.size.height / count + 0.5);
    [[self colorForState:self.states[i].intValue] setFill];
    UIRectFill(segment);
    if (self.states[i].intValue == KNTrafficState_Blocked) {
      CGContextSaveGState(context);
      CGContextClipToRect(context, segment);
      [UIColor.whiteColor setStroke];
      for (CGFloat y = CGRectGetMinY(segment); y < CGRectGetMaxY(segment); y += 6) {
        UIBezierPath *line = [UIBezierPath bezierPath];
        [line moveToPoint:CGPointMake(CGRectGetMinX(segment), y + 4)];
        [line addLineToPoint:CGPointMake(CGRectGetMaxX(segment), y)];
        [line stroke];
      }
      CGContextRestoreGState(context);
    }
  }
  CGContextRestoreGState(context);
}
@end
