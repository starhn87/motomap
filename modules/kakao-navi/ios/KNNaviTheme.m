#import "KNNaviTheme.h"

// 모토맵 경로선과 같은 초록(constants/Colors.ts 의 semantic.success).
static UIColor *MotoGreen(void) {
  return [UIColor colorWithRed:0x22 / 255.0 green:0xC5 / 255.0 blue:0x5E / 255.0 alpha:1];
}

// 신호가 끊겼을 때 쓰는 회색(지나간 경로와 같은 톤).
static UIColor *MotoGray(void) {
  return [UIColor colorWithRed:0xA1 / 255.0 green:0xA1 / 255.0 blue:0xAA / 255.0 alpha:1];
}

static const CGFloat kSize = 48;    // 지도 위에서 과하지 않은 크기
static const CGFloat kRingWidth = 4;

@implementation KNNaviTheme

// 원 안에 위쪽을 향한 화살촉. 방향 회전은 SDK 가 처리한다.
+ (UIImage *)carImageWithAccent:(UIColor *)accent fill:(UIColor *)fill {
  CGRect bounds = CGRectMake(0, 0, kSize, kSize);
  UIGraphicsImageRenderer *renderer =
      [[UIGraphicsImageRenderer alloc] initWithSize:bounds.size];

  return [renderer imageWithActions:^(UIGraphicsImageRendererContext *_Nonnull ctx) {
    CGRect ring = CGRectInset(bounds, kRingWidth / 2 + 1, kRingWidth / 2 + 1);
    UIBezierPath *circle = [UIBezierPath bezierPathWithOvalInRect:ring];

    [fill setFill];
    [circle fill];
    [accent setStroke];
    circle.lineWidth = kRingWidth;
    [circle stroke];

    // 화살촉 — 원 지름의 절반 정도로 잡아 여백을 남긴다.
    CGFloat cx = CGRectGetMidX(bounds);
    CGFloat cy = CGRectGetMidY(bounds);
    CGFloat h = kSize * 0.30;
    CGFloat w = kSize * 0.26;

    UIBezierPath *arrow = [UIBezierPath bezierPath];
    [arrow moveToPoint:CGPointMake(cx, cy - h * 0.75)];
    [arrow addLineToPoint:CGPointMake(cx + w, cy + h * 0.65)];
    [arrow addLineToPoint:CGPointMake(cx, cy + h * 0.25)];
    [arrow addLineToPoint:CGPointMake(cx - w, cy + h * 0.65)];
    [arrow closePath];
    arrow.lineJoinStyle = kCGLineJoinRound;

    [accent setFill];
    [arrow fill];
  }];
}

+ (NSArray<UIImage *> *)carImages {
  UIColor *day = UIColor.whiteColor;
  UIColor *night = [UIColor colorWithRed:0x18 / 255.0 green:0x18 / 255.0 blue:0x1B / 255.0 alpha:1];

  return @[
    [self carImageWithAccent:MotoGreen() fill:day],
    [self carImageWithAccent:MotoGreen() fill:night],
    [self carImageWithAccent:MotoGray() fill:day],
    [self carImageWithAccent:MotoGray() fill:night],
  ];
}

+ (CGPoint)carAnchor {
  return CGPointMake(0.5, 0.5);
}

@end
