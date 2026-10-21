#import <KNSDK/KNNaviView.h>

NS_ASSUME_NONNULL_BEGIN

// 모토맵의 내비 인스턴스만 경로 안내·미리보기 화면으로 제한한다.
@interface KNNaviRouteView : KNNaviView
@property(nonatomic, copy, nullable) void (^onSafetyModeBlocked)(void);
@property(nonatomic, readonly) BOOL didBlockSafetyMode;
+ (BOOL)isSDKModeBoundaryCompatible;
- (void)resumeRouteModeForPreview:(BOOL)preview;
@end

NS_ASSUME_NONNULL_END
