#import "KNNaviTheme.h"

#import <KNSDK/KNMapRouteThemeDef.h>

// 모토맵 경로선과 같은 초록(constants/Colors.ts 의 semantic.success).
static UIColor *MotoGreen(void) {
  return [UIColor colorWithRed:0x22 / 255.0 green:0xC5 / 255.0 blue:0x5E / 255.0 alpha:1];
}

// 신호가 끊겼을 때 쓰는 회색(지나간 경로와 같은 톤).
static UIColor *MotoGray(void) {
  return [UIColor colorWithRed:0xA1 / 255.0 green:0xA1 / 255.0 blue:0xAA / 255.0 alpha:1];
}

static const CGFloat kSize = 56;    // 네이버 지도 자차 수준 — 헬멧 쓴 시야에서도 잘 보이게(실주행 피드백, 60은 과했음)
static const CGFloat kRingWidth = 4;

// KNRouteColors 가 색을 assign(unsafe_unretained) 으로 받는다. 매번 새 객체를
// 만들어 넘기면 오토릴리즈 풀이 비워진 뒤 지도가 그릴 때 이미 해제된 색을
// 건드려 죽는다 — 색을 캐시해 프로세스 수명 동안 살려 둔다.
static UIColor *Hex(uint32_t rgb) {
  static NSMutableDictionary<NSNumber *, UIColor *> *cache;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ cache = [NSMutableDictionary dictionary]; });

  NSNumber *key = @(rgb);
  UIColor *cached = cache[key];
  if (cached) return cached;

  UIColor *color = [UIColor colorWithRed:((rgb >> 16) & 0xFF) / 255.0
                                   green:((rgb >> 8) & 0xFF) / 255.0
                                    blue:(rgb & 0xFF) / 255.0
                                   alpha:1];
  cache[key] = color;
  return color;
}

// 경로선을 모토맵 색으로 갈아끼운다. 안쪽은 혼잡도 단계별 색, 테두리는 상단
// 배너와 같은 짙은 색 — 밝은 선을 짙은 테두리가 감싸면 경로가 지도에서 떠오르고
// 화면 위아래가 한 톤으로 묶인다.
//
// 반드시 SDK 기본 테마를 받아서 고쳐야 한다. 통째로 만들면 nonnull 인
// alterRoute 가 비어 그리는 순간 죽는다(실증). 굵기와 대안 경로는 기본값을
// 그대로 물려받는다.
static KNRouteColors *Colors(UIColor *normal, UIColor *moderate, UIColor *heavy,
                             UIColor *veryHeavy, UIColor *unknown, UIColor *blocked) {
  KNRouteColors *colors = [KNRouteColors routeColors];
  colors.normal = normal;
  colors.trafficJamModerate = moderate;
  colors.trafficJamHeavy = heavy;
  colors.trafficJamVeryHeavy = veryHeavy;
  colors.unknown = unknown;
  colors.blocked = blocked;

  // KNMapRouteTheme 이 assign 으로 담는다 — 프로세스 수명 동안 붙잡아 둔다
  static NSMutableArray *keepAlive;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ keepAlive = [NSMutableArray array]; });
  [keepAlive addObject:colors];
  return colors;
}

static KNMapRouteTheme *RouteTheme(KNMapRouteTheme *base, UIColor *stroke, BOOL traffic) {
  base.lineColors = traffic
      ? Colors(Hex(0x22C55E),  // 원활 — 미리보기 경로선과 같은 초록
               Hex(0xF59E0B),  // 서행
               Hex(0xEF4444),  // 정체
               Hex(0xB91C1C),  // 심각
               Hex(0xA1A1AA),  // 정보 없음
               Hex(0x6B7280))  // 통제
      // 혼잡도를 끈 모드는 단색이라 여섯 단계를 같은 색으로 채운다
      : Colors(Hex(0x22C55E), Hex(0x22C55E), Hex(0x22C55E),
               Hex(0x22C55E), Hex(0x22C55E), Hex(0x22C55E));
  base.strokeColors = Colors(stroke, stroke, stroke, stroke, stroke, stroke);
  return base;
}

@implementation KNNaviTheme

+ (KNMapRouteTheme *)routeThemeDay {
  static KNMapRouteTheme *theme;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ theme = RouteTheme([KNMapRouteTheme trafficDay], Hex(0x18181B), YES); });
  return theme;
}

+ (KNMapRouteTheme *)routeThemeNight {
  static KNMapRouteTheme *theme;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ theme = RouteTheme([KNMapRouteTheme trafficNight], Hex(0x0A0A0A), YES); });
  return theme;
}

+ (KNMapRouteTheme *)driveThemeDay {
  static KNMapRouteTheme *theme;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ theme = RouteTheme([KNMapRouteTheme driveDay], Hex(0x18181B), NO); });
  return theme;
}

+ (KNMapRouteTheme *)driveThemeNight {
  static KNMapRouteTheme *theme;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ theme = RouteTheme([KNMapRouteTheme driveNight], Hex(0x0A0A0A), NO); });
  return theme;
}

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
