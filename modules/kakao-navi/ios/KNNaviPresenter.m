#import "KNNaviPresenter.h"
#import "KNNaviTheme.h"
#import "KNSDKBridge.h"
#import "KNNaviAudioFocus.h"
#import "KNNaviArrivalRecovery.h"
#import "KNNaviRouteView.h"
#import "KNNaviBottomPanel.h"
#import "KNNaviHiddenViews.h"
#import "KNNaviHazardSheet.h"
#import "KNNaviGasLayer.h"
#import "KNNaviGasPriceLayer.h"
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNNaviView.h>
#import <KNSDK/KNMapView.h>
#import <objc/runtime.h>
#import <float.h>
#import <limits.h>
#import <stdlib.h>
#import <string.h>

// NAV-039: 1.2.10은 안내 음량·종료만 제공한다. SDK 재안내 성공 검증 후 재검토한다.
static const BOOL KNNaviGuideMenuActionsEnabled = NO;
static const BOOL KNNaviRouteEditingEnabled = YES;

// 원문·좌표를 오류 코드에 넣지 않는다. 실패 단계와 알려진 SDK 코드만 브리지로 보낸다.
static NSError *ManualRerouteError(NSString *stage, KNError *vendor, NSString *message) {
  NSString *domain = [@"E_KNSDK_RESUME_" stringByAppendingString:stage];
  if ([stage isEqualToString:@"TRIP"] || [stage isEqualToString:@"APPLY"]) {
    NSString *code = [KNSDKBridge errorCodeOf:vendor];
    BOOL known = code && [code rangeOfString:@"^([CG][0-9]{3}|[0-9]{5})$" options:NSRegularExpressionSearch].location != NSNotFound;
    domain = [domain stringByAppendingFormat:@"_%@", known ? code : @"UNKNOWN"];
  }
  return [NSError errorWithDomain:domain code:1 userInfo:@{NSLocalizedDescriptionKey:message}];
}

// SDK 위치가 없을 때 수동 재안내·전경 주소 표시가 공유하는 단발 위치 수신기다. 권한 요청은 하지 않는다.
@interface KNNaviManualPositionRequest : NSObject <CLLocationManagerDelegate>
@property(nonatomic, strong) CLLocationManager *manager;
@property(nonatomic, copy) void (^completion)(CLLocation *);
+ (BOOL)isUsableLocation:(CLLocation *)location;
- (void)start:(void (^)(CLLocation *))completion;
- (void)cancel;
@end
@implementation KNNaviManualPositionRequest
+ (BOOL)isUsableLocation:(CLLocation *)location {
  return location && CLLocationCoordinate2DIsValid(location.coordinate) &&
      isfinite(location.coordinate.latitude) && isfinite(location.coordinate.longitude) &&
      isfinite(location.horizontalAccuracy) && location.horizontalAccuracy >= 0 && location.horizontalAccuracy <= 100 &&
      location.timestamp && fabs(location.timestamp.timeIntervalSinceNow) <= 10;
}
- (void)cancel {
  [self.manager stopUpdatingLocation]; self.manager.delegate = nil; self.manager = nil; self.completion = nil;
}
- (void)resolve:(CLLocation *)location {
  void (^done)(CLLocation *) = self.completion;
  [self cancel]; if (done) done(location);
}
- (void)start:(void (^)(CLLocation *))completion {
  self.completion = completion;
  self.manager = [CLLocationManager new];
  CLAuthorizationStatus status = self.manager.authorizationStatus;
  if (![KNSDKBridge isLocationUseAllowed] ||
      (status != kCLAuthorizationStatusAuthorizedAlways && status != kCLAuthorizationStatusAuthorizedWhenInUse)) {
    [self resolve:nil]; return;
  }
  self.manager.delegate = self; self.manager.desiredAccuracy = kCLLocationAccuracyBest;
  [self.manager startUpdatingLocation];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,8*NSEC_PER_SEC),dispatch_get_main_queue(),^{
    if (self.completion) [self resolve:nil];
  });
}
- (void)locationManager:(CLLocationManager *)manager didUpdateLocations:(NSArray<CLLocation *> *)locations {
  if (![KNSDKBridge isLocationUseAllowed]) { [self resolve:nil]; return; }
  for (CLLocation *location in locations.reverseObjectEnumerator) {
    if ([KNNaviManualPositionRequest isUsableLocation:location]) { [self resolve:location]; return; }
  }
}
- (void)locationManager:(CLLocationManager *)manager didFailWithError:(NSError *)error {
  if (error.code == kCLErrorDenied) [self resolve:nil];
}
@end

// KNSDK 1.12.14 는 이륜차 경로를 시작하거나 안전운행 화면으로 바꿀 때마다
// 비공개 carImageType: 에 2를 넘겨 bike_on/off 기본 캐릭터를 다시 선택한다.
// 알려진 상태 콜백 뒤에서 되돌리는 것만으로는 새 내부 전환이 생길 때마다 같은
// 회귀가 나고, 잠깐이라도 기본 캐릭터가 그려질 수 있다. 우리 지도 인스턴스만
// 커스텀 타입(0)으로 고정해 SDK 의 모든 선택 경로를 입구에서 막는다.
static char kMotoMapCustomCarLockKey;
static IMP gOriginalCarImageTypeImplementation = NULL;

static void MotoMapCarImageType(id mapView, SEL selector, NSUInteger imageType) {
  BOOL customCarLocked = [objc_getAssociatedObject(mapView, &kMotoMapCustomCarLockKey) boolValue];
  NSUInteger effectiveType = customCarLocked ? 0 : imageType;
  if (gOriginalCarImageTypeImplementation != NULL) {
    ((void (*)(id, SEL, NSUInteger))gOriginalCarImageTypeImplementation)(mapView,
                                                                          selector,
                                                                          effectiveType);
  }
}

static BOOL InstallMotoMapCarImageGuard(void) {
  static dispatch_once_t once;
  static BOOL installed = NO;
  dispatch_once(&once, ^{
    Class mapViewClass = NSClassFromString(@"KNNaviMapView");
    SEL selector = NSSelectorFromString(@"carImageType:");
    Method method = class_getInstanceMethod(mapViewClass, selector);
    if (method == NULL) return;

    // 비공개 메서드의 ABI 가 바뀐 SDK 에 잘못된 함수 포인터를 연결하지 않는다.
    char returnType[8] = { 0 };
    char argumentType[8] = { 0 };
    method_getReturnType(method, returnType, sizeof(returnType));
    method_getArgumentType(method, 2, argumentType, sizeof(argumentType));
    if (method_getNumberOfArguments(method) != 3 ||
        strcmp(returnType, @encode(void)) != 0 ||
        strcmp(argumentType, @encode(NSUInteger)) != 0) {
      return;
    }

    IMP originalImplementation = method_getImplementation(method);
    if (originalImplementation == NULL) return;
    // hook 이 보이는 순간부터 원 구현을 호출할 수 있도록 포인터를 먼저 저장한다.
    gOriginalCarImageTypeImplementation = originalImplementation;
    method_setImplementation(method, (IMP)MotoMapCarImageType);
    installed = YES;
  });
  return installed;
}

static BOOL LockMotoMapCustomCarImage(KNNaviMapView *mapView) {
  if (mapView == nil || !InstallMotoMapCarImageGuard()) return NO;
  objc_setAssociatedObject(mapView,
                           &kMotoMapCustomCarLockKey,
                           @YES,
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  return YES;
}

// KNSDK 1.12.14의 accessibilityWithType:view:는 화면 상태별 UIView 배열을
// 만들면서 일부 뷰의 nil 여부를 확인하지 않는다. 전체 경로 모드·메뉴 자동 닫힘
// 타이머가 뷰 전환과 겹치면 NSArray 생성에서 NSInvalidArgumentException 으로
// 앱이 종료된다(Sentry RIDEMAP-E/G). SDK 내부의 이 예외만 막고 UIKit 기본
// 접근성 탐색으로 돌린다. 다른 예외는 원인을 가리지 않도록 그대로 다시 던진다.
static IMP gOriginalAccessibilityImplementation = NULL;

static void MotoMapAccessibility(id naviView,
                                 SEL selector,
                                 NSInteger type,
                                 UIView *_Nullable view) {
  @try {
    if (gOriginalAccessibilityImplementation != NULL) {
      ((void (*)(id, SEL, NSInteger, UIView *_Nullable))gOriginalAccessibilityImplementation)(
          naviView, selector, type, view);
    }
  } @catch (NSException *exception) {
    BOOL isNilArrayElement =
        [exception.name isEqualToString:NSInvalidArgumentException] &&
        [exception.reason containsString:@"attempt to insert nil object"];
    if (!isNilArrayElement) @throw exception;

    [(UIView *)naviView setAccessibilityElements:nil];
    NSLog(@"[KNSDK] 비어 있는 접근성 요소를 UIKit 기본 탐색으로 대체");
  }
}

static void InstallMotoMapAccessibilityGuard(void) {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    SEL selector = NSSelectorFromString(@"accessibilityWithType:view:");
    Method method = class_getInstanceMethod(KNNaviView.class, selector);
    if (method == NULL) return;

    char returnType[8] = { 0 };
    char typeArgument[8] = { 0 };
    char viewArgument[8] = { 0 };
    method_getReturnType(method, returnType, sizeof(returnType));
    method_getArgumentType(method, 2, typeArgument, sizeof(typeArgument));
    method_getArgumentType(method, 3, viewArgument, sizeof(viewArgument));
    if (method_getNumberOfArguments(method) != 4 ||
        strcmp(returnType, @encode(void)) != 0 ||
        strcmp(typeArgument, @encode(NSInteger)) != 0 ||
        strcmp(viewArgument, @encode(id)) != 0) {
      return;
    }

    gOriginalAccessibilityImplementation = method_getImplementation(method);
    if (gOriginalAccessibilityImplementation == NULL) return;
    method_setImplementation(method, (IMP)MotoMapAccessibility);
  });
}

// KNSDK 1.12.14는 주행 중 하단 안내 바의 InfoTitleLabel에 chr_*.png
// 카카오프렌즈 이미지를 붙인다. 공개 KNNaviView API에는 이 장식 이미지만 끄는
// 설정이 없다. 내부 레이아웃이 끝난 직후 이미지만 숨기고, 비워진 가로 공간을
// 안내 문구에 돌려준다. 클래스나 ivar 구조가 바뀐 SDK에서는 설치를 건너뛴다.
static IMP gOriginalInfoTitleLayoutImplementation = NULL;
static Ivar gInfoTitleImageIvar = NULL;
static Ivar gInfoTitleLabelIvar = NULL;

static void MotoMapInfoTitleLayout(id infoTitle, SEL selector) {
  if (gOriginalInfoTitleLayoutImplementation != NULL) {
    ((void (*)(id, SEL))gOriginalInfoTitleLayoutImplementation)(infoTitle, selector);
  }

  if (gInfoTitleImageIvar == NULL || gInfoTitleLabelIvar == NULL) return;
  id imageValue = object_getIvar(infoTitle, gInfoTitleImageIvar);
  id labelValue = object_getIvar(infoTitle, gInfoTitleLabelIvar);
  if (![imageValue isKindOfClass:UIImageView.class] ||
      ![labelValue isKindOfClass:UILabel.class]) {
    return;
  }

  UIImageView *characterView = (UIImageView *)imageValue;
  UILabel *titleLabel = (UILabel *)labelValue;
  characterView.hidden = YES;
  characterView.isAccessibilityElement = NO;

  // 기존 문구의 오른쪽 끝과 닫기 버튼 간격은 그대로 두고, 캐릭터가 차지하던
  // 왼쪽 공간만 문구에 돌린다. 세로 배치로 바뀐 SDK에서는 프레임을 건드리지 않는다.
  CGRect characterFrame = characterView.frame;
  CGRect labelFrame = titleLabel.frame;
  CGFloat reclaimedLeading = CGRectGetMinX(characterFrame);
  if (!CGRectIsEmpty(characterFrame) &&
      reclaimedLeading < CGRectGetMinX(labelFrame) &&
      CGRectGetMaxX(characterFrame) <= CGRectGetMinX(labelFrame) + 8) {
    CGFloat labelMaxX = CGRectGetMaxX(labelFrame);
    labelFrame.origin.x = reclaimedLeading;
    labelFrame.size.width = MAX(0, labelMaxX - reclaimedLeading);
    titleLabel.frame = CGRectIntegral(labelFrame);
  }
}

static void InstallMotoMapInfoCharacterGuard(void) {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    Class infoTitleClass = NSClassFromString(@"InfoTitleLabel");
    SEL selector = @selector(layoutSubviews);
    // class_getInstanceMethod는 상속 메서드도 돌려준다. SDK가 자체 구현을 없앤
    // 버전에서 UIView.layoutSubviews 전체를 바꾸지 않도록 이 클래스가 직접 가진
    // 메서드 목록에서만 찾는다.
    Method method = NULL;
    unsigned int methodCount = 0;
    Method *methods = class_copyMethodList(infoTitleClass, &methodCount);
    for (unsigned int index = 0; index < methodCount; index++) {
      if (method_getName(methods[index]) == selector) {
        method = methods[index];
        break;
      }
    }
    free(methods);

    Ivar imageIvar = class_getInstanceVariable(infoTitleClass, "titleImgView");
    Ivar labelIvar = class_getInstanceVariable(infoTitleClass, "titleLabel");
    if (method == NULL || imageIvar == NULL || labelIvar == NULL) return;

    // object_getIvar를 쓰는 두 필드가 객체 ivar인지 확인한다. SDK 구조가 바뀌어
    // 숫자나 구조체가 되면 잘못 읽지 않고 우회를 비활성화한다.
    const char *imageType = ivar_getTypeEncoding(imageIvar);
    const char *labelType = ivar_getTypeEncoding(labelIvar);
    char returnType[8] = { 0 };
    method_getReturnType(method, returnType, sizeof(returnType));
    if (method_getNumberOfArguments(method) != 2 ||
        strcmp(returnType, @encode(void)) != 0 ||
        imageType == NULL || imageType[0] != '@' ||
        labelType == NULL || labelType[0] != '@') {
      return;
    }

    IMP originalImplementation = method_getImplementation(method);
    if (originalImplementation == NULL) return;
    gInfoTitleImageIvar = imageIvar;
    gInfoTitleLabelIvar = labelIvar;
    gOriginalInfoTitleLayoutImplementation = originalImplementation;
    method_setImplementation(method, (IMP)MotoMapInfoTitleLayout);
  });
}

static char kMotoMapBottomVisibilityContext;

static NSData *MotoMapStartVoiceData(void) {
  static NSData *data;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    NSURL *bundleURL = [NSBundle.mainBundle URLForResource:@"MotoMapNavigationVoice" withExtension:@"bundle"];
    NSBundle *bundle = bundleURL ? [NSBundle bundleWithURL:bundleURL] : nil;
    NSURL *voiceURL = [bundle URLForResource:@"navigation-start" withExtension:@"mp3"];
    if (voiceURL) data = [NSData dataWithContentsOfURL:voiceURL];
  });
  return data;
}

static BOOL MotoMapSamePoint(double lng, double lat, NSDictionary *point) {
  double dx = (lng - [point[@"longitude"] doubleValue]) * cos(lat * M_PI / 180) * 111320;
  double dy = (lat - [point[@"latitude"] doubleValue]) * 111320;
  return hypot(dx,dy) < 5;
}

NSArray<NSDictionary *> *KNNaviNewPassedVias(NSArray<NSDictionary *> *before, NSArray<NSDictionary *> *after) {
  NSMutableArray *unconsumed = [before mutableCopy], *result = [NSMutableArray new];
  for (NSDictionary *point in after) {
    NSUInteger index = [unconsumed indexOfObjectPassingTest:^BOOL(NSDictionary *old, NSUInteger idx, BOOL *stop) {
      return MotoMapSamePoint([point[@"longitude"] doubleValue],[point[@"latitude"] doubleValue],old);
    }];
    if (index == NSNotFound) [result addObject:point];
    else [unconsumed removeObjectAtIndex:index];
  }
  return result;
}

NSArray<NSNumber *> *KNNaviRemainingVias(NSArray<NSNumber *> *flat, NSArray<NSDictionary *> *originalRemaining, NSArray<NSDictionary *> *newPassed) {
  NSMutableArray *unconsumed = [newPassed mutableCopy], *result = [NSMutableArray new];
  for (NSUInteger i=0;i+1<flat.count;i+=2) {
    double lng = flat[i].doubleValue, lat = flat[i+1].doubleValue;
    BOOL wasRemaining = NO;
    for (NSDictionary *point in originalRemaining) if (MotoMapSamePoint(lng,lat,point)) { wasRemaining = YES; break; }
    NSUInteger index = wasRemaining ? [unconsumed indexOfObjectPassingTest:^BOOL(NSDictionary *point, NSUInteger idx, BOOL *stop) {
      return MotoMapSamePoint(lng,lat,point);
    }] : NSNotFound;
    if (index == NSNotFound) [result addObjectsFromArray:@[flat[i],flat[i+1]]];
    else [unconsumed removeObjectAtIndex:index];
  }
  return result;
}

// 안내 화면을 담는 뷰 컨트롤러. 델리게이트를 받아야 해서 별도 클래스로 둔다.
// KNNaviView 는 KNGuidance 를 스스로 구독하지 않는다. 가이드 델리게이트를 여기서
// 전부 받아 naviView 로 넘겨야 화면이 갱신된다. 게다가 델리게이트를 걸지 않으면
// guidance 의 locationGuide/routeGuide 자체가 갱신되지 않는다(헤더 주석).
@interface KNNaviViewController : UIViewController <KNNaviView_GuideStateDelegate,
                                                    KNNaviView_StateDelegate,
                                                    KNGuidance_GuideStateDelegate,
                                                    KNGuidance_LocationGuideDelegate,
                                                    KNGuidance_RouteGuideDelegate,
                                                    KNGuidance_SafetyGuideDelegate,
                                                    KNGuidance_VoiceGuideDelegate,
                                                    KNGuidance_CitsGuideDelegate,
                                                    KNMapPOIEventListener>
@property(nonatomic, strong, nullable) KNNaviView *naviView;
@property(nonatomic, strong) KNNaviBottomPanel *bottomPanel;
@property(nonatomic, strong) KNNaviHazardSheet *hazardSheet;
@property(nonatomic, strong) KNNaviGasLayer *gasLayer;
@property(nonatomic, copy) void (^onArrival)(NSDictionary *);
@property(nonatomic) BOOL arrivalEmitted;
@property(nonatomic, strong) UIControl *menuBackdrop;
@property(nonatomic, strong) KNNaviHiddenViews *webHiddenViews;
@property(nonatomic, strong) KNNaviHiddenViews *mapHiddenViews;
@property(nonatomic) BOOL mapControlsHidden;
@property(nonatomic) BOOL mapDetached;
@property(nonatomic, strong) KNNaviHiddenViews *auxiliaryHiddenViews;
@property(nonatomic) CGFloat panelHeight;
@property(nonatomic) float volume;
@property(nonatomic, copy) NSString *currentLocationName;
@property(nonatomic, strong) NSDate *currentLocationAt;
@property(nonatomic, strong) NSDate *currentLocationGPSAt;
@property(nonatomic, strong) NSTimer *currentLocationExpiryTimer;
@property(nonatomic, strong) NSTimer *footerPositionTimer;
@property(nonatomic, strong) KNNaviManualPositionRequest *footerPositionRequest;
@property(nonatomic, strong) KNNaviGasPriceLayer *gasPriceLayer;
@property(nonatomic, strong) NSDate *footerPositionRequestAt;
@property(nonatomic) NSUInteger footerPositionGeneration;
@property(nonatomic) DoublePoint currentLocationPosition;
@property(nonatomic) BOOL currentRoadAvailable;
@property(nonatomic, copy) NSString *currentRegionName;
@property(nonatomic) IntPoint currentRegionPosition;
@property(nonatomic, strong) NSDate *currentRegionAt;
@property(nonatomic, strong) NSDate *regionRequestAt;
@property(nonatomic) BOOL regionRequestInFlight;
@property(nonatomic) NSUInteger regionRequestGeneration;
@property(nonatomic, copy) NSString *arrivalMessage;
@property(nonatomic) BOOL suspended;
@property(nonatomic) NSInteger previewToken;
@property(nonatomic) BOOL resumeCommitting;
@property(nonatomic, copy) NSArray<NSDictionary *> *previewRemainingVias;
@property(nonatomic, copy) NSArray<NSDictionary *> *previewPassedVias;
@property(nonatomic, copy) NSArray<NSDictionary *> *completedViaPoints;
@property(nonatomic, copy) void (^onResumeError)(NSError *);
@property(nonatomic, strong) KNNaviManualPositionRequest *manualPositionRequest;

@property(nonatomic, strong, nullable) UIView *observedBottomView;
@property(nonatomic, strong, nullable) KNNaviAudioFocus *audioFocus;
@property(nonatomic, strong, nullable) UIButton *endButton;
@property(nonatomic, strong, nullable) UIButton *hazardButton;
@property(nonatomic, assign) KNNaviViewState naviScreenState;
@property(nonatomic, assign) BOOL hasNaviScreenState;
// 실주행(KNDriveGuidance)과 미리보기(KNSimulGuidance)의 공통 상위 타입
@property(nonatomic, strong, nullable) KNGuidance *guidance;
@property(nonatomic, strong, nullable) KNTrip *trip;
@property(nonatomic, copy, nullable) void (^onDismiss)(void);
@property(nonatomic, copy, nullable) void (^onMenu)(NSInteger);
@property(nonatomic, copy, nullable) void (^onPoiTap)(NSString *, double, double);
@property(nonatomic, copy, nullable) void (^onStarted)(void);
@property(nonatomic, assign) BOOL carThemeApplied;
@property(nonatomic, assign) BOOL applyingCarTheme;
@property(nonatomic, assign) KNRoutePriority priority;
// 경로 미리보기 — 실제 GPS 대신 경로를 따라 스스로 진행한다
@property(nonatomic, assign) BOOL preview;
@property(nonatomic, assign) BOOL previewNoticed;
@property(nonatomic, assign) BOOL finished;
@property(nonatomic, strong) KNNaviArrivalRecovery *arrivalRecovery;
@property(nonatomic, strong) UIStackView *arrivalBanner;
@property(nonatomic, strong) UILabel *arrivalLabel;
@property(nonatomic, strong) UIButton *arrivalRetryButton;
@property(nonatomic) BOOL arrivalCurWasHidden;
@property(nonatomic) BOOL arrivalNextWasHidden;
@property(nonatomic) BOOL arrivalBottomWasHidden;
@property(nonatomic) NSUInteger routeRequestGeneration;
@property(nonatomic) BOOL didPlayStartVoice;
@property(nonatomic) BOOL changingDestination;
@property(nonatomic) BOOL safetyScreenQuarantined;
@property(nonatomic, strong) KNTrip *pendingDestinationTrip;
@property(nonatomic) KNRoutePriority pendingDestinationPriority;
@end

// 안내 화면 위 상호작용(액션시트·알림·목적지 변경)을 모듈 함수가 쓸 수 있도록
// 살아 있는 컨트롤러를 하나 기억한다.
static __weak KNNaviViewController *gActiveNavi = nil;
static KNNaviViewController *gSuspendedNavi = nil;
static NSInteger gPreviewToken = 0;
static NSUInteger gLocationGeneration = 0;

static BOOL IsLocationGenerationCurrent(NSUInteger generation) {
  @synchronized(KNNaviPresenter.class) { return generation == gLocationGeneration && [KNSDKBridge isLocationUseAllowed]; }
}

@implementation KNNaviViewController

- (void)viewDidLoad {
  [super viewDidLoad];
  if (![KNSDKBridge isLocationUseAllowed]) { [self finish]; return; }
  [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(pauseFooterPosition)
      name:UIApplicationWillResignActiveNotification object:nil];
  [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(refreshFooterPosition)
      name:UIApplicationDidBecomeActiveNotification object:nil];
  self.view.backgroundColor = UIColor.blackColor;
  // SDK 경계가 바뀌면 원래 SDK 화면으로 폴백하지 않고 안내 화면을 열지 않는다.
  if (![KNNaviRouteView isSDKModeBoundaryCompatible]) { [self finish]; return; }
  InstallMotoMapAccessibilityGuard();
  InstallMotoMapInfoCharacterGuard();
  self.audioFocus = [[KNNaviAudioFocus alloc] initWithSession:AVAudioSession.sharedInstance];

  // 미리보기는 시뮬레이션 안내로 — 실주행 안내는 차량 위치를 항상 실제 GPS 에
  // 매칭하므로 정한 출발지에서 시작할 방법이 없다(카메라·위치 주입 API 없음).
  KNGuidance *guidance = self.preview ? (KNGuidance *)[[KNSDK sharedInstance] sharedSimulGuidance]
                                      : (KNGuidance *)[[KNSDK sharedInstance] sharedGuidance];
  guidance.guideStateDelegate = self;
  guidance.locationGuideDelegate = self;
  guidance.routeGuideDelegate = self;
  guidance.safetyGuideDelegate = self;
  guidance.voiceGuideDelegate = self;
  guidance.citsGuideDelegate = self;

  [KNNaviRouteView isSDKMapStateBoundaryCompatible];
  KNNaviRouteView *naviView = [[KNNaviRouteView alloc] initWithGuidance:guidance
                                                         trip:self.trip
                                                  routeOption:self.priority
                                                  avoidOption:KNRouteAvoidOption_None];
  [naviView sndVolume:1.0f];
  // 경로선을 혼잡도 색으로 — 줌을 빼도 교통 상황이 보인다(실주행 피드백)
  [naviView trafficMode:YES];
  naviView.guideStateDelegate = self;
  naviView.stateDelegate = self;
  // 주의: [naviView carType:KNCarType_Bike] 를 부르면 자차 마커가 SDK 내장
  // 바이크 캐릭터(bike_on/off.png)로 바뀌는데, 그 분기는 setCustomCarImages 를
  // 무시한다. 경로 계산 차종은 trip.routeConfig 가 들고 있으므로 뷰 쪽은
  // 건드리지 않는다 — 그래야 커스텀 마커가 적용된다.
  naviView.frame = self.view.bounds;
  naviView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;

  self.naviView = naviView;
  __weak KNNaviViewController *weakController = self;
  naviView.onSafetyModeBlocked = ^{ [weakController handleBlockedSafetyMode]; };
  self.mapDetached = naviView.mapDetached;
  naviView.onMapTrackingChanged = ^(BOOL detached) {
    weakController.mapDetached = detached;
    [weakController updateBottomPanel];
  };
  // 탭은 부모 레이아웃도 상태 콜백도 생략할 수 있다. 공개 안내 바의 실제
  // hidden 변경을 이 인스턴스에서만 관찰한다. 전역 hook·제스처 가로채기는 없다.
  [self startObservingBottomView];
  self.guidance = guidance;

  // startWithTrip 안에서도 이륜차 기본 캐릭터를 선택하므로 안내 시작보다 먼저
  // 커스텀 타입을 잠근 뒤 화면에 붙인다. 첫 프레임부터 기본 bike_on/off 가
  // 노출되지 않아야 한다.
  [self applyCarTheme];
  [self.view addSubview:naviView];

  // 안내가 떠 있는 동안만 백그라운드 위치를 허용한다 — 화면이 꺼지거나 다른
  // 앱으로 전환해도 안내가 이어지는 기능. 평상시엔 꺼 둔다(KNSDKBridge 초기화
  // 직후). finish 에서 다시 내린다. 미리보기는 GPS 를 쓰지 않으니 그대로 둔다.
  if (!self.preview) [KNSDKBridge setBackgroundLocationAllowed:YES];

  [guidance startWithTrip:self.trip
                 priority:self.priority
             avoidOptions:KNRouteAvoidOption_None];

  // 주행 중 화면이 꺼지면 안내가 무용지물이다 — 안내가 떠 있는 동안 잠금 방지
  [UIApplication sharedApplication].idleTimerDisabled = YES;

  // 제거한 메뉴가 SDK의 기본 메뉴로 다시 드러나지 않게 한다.
  [naviView.menuView setCustomMenu:@[]];
  [naviView.menuView useGuideCancel:NO];

  // 회전 정보와 SDK 배치는 유지하고 앱의 모노크롬 브랜드 팔레트를 적용한다.
  // SDK의 흰 안내 글자가 묻히지 않도록 주·야간 모두 어두운 바탕을 쓴다.
  [naviView.curDirView
      setBackgroundColor:[UIColor colorWithRed:0x18 / 255.0
                                         green:0x18 / 255.0
                                          blue:0x1B / 255.0
                                         alpha:1.0]
              nightColor:[UIColor colorWithRed:0x0A / 255.0
                                         green:0x0A / 255.0
                                          blue:0x0A / 255.0
                                         alpha:1.0]];

  [naviView.nextDirView
      setBackgroundColor:[UIColor colorWithRed:0x2A / 255.0
                                         green:0x2A / 255.0
                                          blue:0x2E / 255.0
                                         alpha:1.0]
              nightColor:[UIColor colorWithRed:0x1A / 255.0
                                         green:0x1A / 255.0
                                          blue:0x1A / 255.0
                                         alpha:1.0]];

  // 안내를 끝내려면 메뉴를 열어야 했다 — 주행 중에 두 단계는 많다. SDK 는 하단
  // 바에 버튼을 얹는 API 를 주지 않지만(메뉴 항목과 경로 취소 토글뿐), 이 화면은
  // 우리 뷰 컨트롤러라 그 위에 직접 그릴 수 있다.
  //
  // 자리는 우상단 — 회전 안내 배너 아래, 속도·과속 카메라가 뜨는 좌측을 피한다.
  // 확인 팝업은 두지 않는다: 주행 중에 팝업을 띄우는 쪽이 더 위험하고, 실수로
  // 눌러도 다시 시작하면 그만이다. 대신 손이 잘 안 가는 자리에 작게 둔다.
  //
  // 미리보기(시뮬레이션)에는 SDK 가 자체 종료 버튼을 이미 그려서 겹치지 않게 뺀다.
  if (!self.preview) {
    UIButton *endButton = [UIButton buttonWithType:UIButtonTypeSystem];
    endButton.translatesAutoresizingMaskIntoConstraints = NO;
    [endButton setTitle:@"종료" forState:UIControlStateNormal];
    [endButton setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];
    endButton.titleLabel.font = [UIFont systemFontOfSize:15 weight:UIFontWeightSemibold];
    endButton.backgroundColor = [UIColor colorWithWhite:0 alpha:0.55];
    endButton.layer.cornerRadius = 18;
    [endButton addTarget:self action:@selector(finish) forControlEvents:UIControlEventTouchUpInside];
    [self.view addSubview:endButton];
    self.endButton = endButton;
    [NSLayoutConstraint activateConstraints:@[
      [endButton.trailingAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.trailingAnchor
                                               constant:-12],
      // 배너 바닥에 직접 매단다 — 고정 여백은 배너 높이가 상태에 따라 달라지면
      // 어긋난다. curDirView 는 SDK 가 frame 으로 배치하지만 그 프레임에서
      // 자동 제약이 생성되므로, 배너가 다시 그려져도 따라 내려온다.
      [endButton.topAnchor constraintEqualToAnchor:naviView.curDirView.bottomAnchor
                                          constant:8],
      [endButton.widthAnchor constraintEqualToConstant:64],
      [endButton.heightAnchor constraintEqualToConstant:36],
    ]];

    // 위험 제보 — 메뉴(1차 시트)를 거치지 않는 지름길. 라이딩 중 제보는 탭이
    // 곧 비용이라 "버튼 → 타입 시트" 두 번으로 끝낸다. 종료 옆에 두면 오터치
    // 한 번에 안내가 끝나므로 좌측 하단으로 뗀다 — 급하게 누르는 버튼이라
    // 엄지가 닿는 하단이 맞고, 속도·과속 카메라 UI(좌측 상단)와도 안 겹친다.
    // 탭 처리(위치 캡처·시트)는 JS(guideEvents)가 메뉴 이벤트 채널(id 101)로 받는다.
    UIButton *hazardButton = [UIButton buttonWithType:UIButtonTypeSystem];
    hazardButton.translatesAutoresizingMaskIntoConstraints = NO;
    [hazardButton setTitle:@"위험 제보" forState:UIControlStateNormal];
    [hazardButton setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];
    hazardButton.titleLabel.font = [UIFont systemFontOfSize:15 weight:UIFontWeightSemibold];
    hazardButton.backgroundColor = [UIColor colorWithWhite:0 alpha:0.55];
    hazardButton.layer.cornerRadius = 18;
    [hazardButton addTarget:self
                     action:@selector(hazardTapped)
           forControlEvents:UIControlEventTouchUpInside];
    [self.view addSubview:hazardButton];
    self.hazardButton = hazardButton;
    [NSLayoutConstraint activateConstraints:@[
      [hazardButton.leadingAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.leadingAnchor
                                                 constant:12],
      // 하단 정보 바(bottomView) 위에 매단다 — 바 높이가 상태에 따라 달라져도 따라온다
      [hazardButton.bottomAnchor constraintEqualToAnchor:naviView.bottomView.topAnchor
                                                constant:-12],
      [hazardButton.widthAnchor constraintEqualToConstant:84],
      [hazardButton.heightAnchor constraintEqualToConstant:36],
    ]];
    // startWithTrip 중 버튼 생성보다 먼저 온 화면 상태도 반영한다.
    [self updateCustomControlsVisibility];
  }

  gActiveNavi = self;
  if (!self.preview) [self installBottomPanel];
  // SDK 생성자 안에서 발생해 아직 handler가 없었던 전환도 놓치지 않는다.
  if (naviView.didBlockSafetyMode) [self handleBlockedSafetyMode];
}

- (void)installBottomPanel {
  self.gasLayer = [[KNNaviGasLayer alloc] initWithHost:self];
  __weak KNNaviViewController *gasOwner = self;
  self.gasLayer.isActive = ^BOOL {
    KNNaviViewController *vc = gasOwner;
    return vc && !vc.finished && !vc.suspended && !vc.changingDestination && [KNSDKBridge isLocationUseAllowed];
  };
  self.gasLayer.getGPS = ^KNGPSData *{
    KNNaviViewController *vc = gasOwner;
    if (!vc || vc.finished || vc.suspended || ![KNSDKBridge isLocationUseAllowed]) return nil;
    KNGPSManager *manager = [KNSDK sharedInstance].sharedGpsManager;
    KNGPSData *newest = nil;
    for (id candidate in @[vc.guidance.locationGuide.gpsOrigin ?: NSNull.null,
                            manager.recentGpsData ?: NSNull.null, manager.lastValidGpsData ?: NSNull.null]) {
      if (candidate == NSNull.null || ![KNNaviGasLayer isUsableSearchGPS:candidate]) continue;
      KNGPSData *gps = candidate;
      if (!newest || [gps.timestamp compare:newest.timestamp] == NSOrderedDescending) newest = gps;
    }
    return newest;
  };
  self.gasLayer.getFallbackCenter = ^NSDictionary *{
    KNNaviViewController *vc=gasOwner;
    if (!vc || vc.finished || vc.suspended || ![KNSDKBridge isLocationUseAllowed] || !vc.trip.start) return nil;
    DoublePoint start=[[KNSDK sharedInstance] convertKATECToWGS84WithX:lround(vc.trip.start.pos.x) y:lround(vc.trip.start.pos.y)];
    return @{@"latitude":@(start.y),@"longitude":@(start.x)};
  };
  self.gasLayer.onFetch = ^{ if (gasOwner.onMenu) gasOwner.onMenu(106); };
  self.gasLayer.onRoute = ^{ if (gasOwner.onMenu) gasOwner.onMenu(108); };
  self.volume = 1;
  self.auxiliaryHiddenViews = [KNNaviHiddenViews new];
  self.webHiddenViews = [KNNaviHiddenViews new];
  self.mapHiddenViews = [KNNaviHiddenViews new];
  self.menuBackdrop = [UIControl new];
  self.menuBackdrop.backgroundColor = [UIColor colorWithWhite:0 alpha:0.28];
  self.menuBackdrop.hidden = YES;
  self.menuBackdrop.alpha = 0;
  self.menuBackdrop.isAccessibilityElement = NO;
  [self.menuBackdrop addTarget:self action:@selector(closeBottomMenu) forControlEvents:UIControlEventTouchUpInside];
  [self.view addSubview:self.menuBackdrop];
  self.bottomPanel = [[KNNaviBottomPanel alloc] initWithFrame:CGRectZero];
  __weak KNNaviViewController *weakSelf = self;
  self.bottomPanel.onHeight = ^(CGFloat height) {
    weakSelf.panelHeight = height;
    [weakSelf.view setNeedsLayout];
  };
  self.bottomPanel.onMenuVisibility = ^(BOOL visible) { [weakSelf setBottomMenuVisible:visible]; };
  self.bottomPanel.onFailure = ^{
    KNNaviViewController *vc = weakSelf;
    [vc.webHiddenViews restore];
    [vc.mapHiddenViews restore]; vc.mapControlsHidden = NO;
    vc.bottomPanel.hidden = YES;
    [vc.bottomPanel.menuView.layer removeAllAnimations];
    vc.bottomPanel.menuView.hidden = YES;
    [vc.menuBackdrop.layer removeAllAnimations];
    vc.menuBackdrop.hidden = YES;
    [vc updateCustomControlsVisibility];
    if (vc.arrivalMessage) [vc showArrivalUIWithMessage:vc.arrivalMessage];
    [vc.view setNeedsLayout];
  };
  self.bottomPanel.onAction = ^(NSString *action, NSDictionary *payload) {
    KNNaviViewController *vc = weakSelf;
    if (!vc || vc.finished) return;
    if ([action isEqualToString:@"ready"]) {
      [vc.arrivalBanner removeFromSuperview]; vc.arrivalBanner = nil;
      [vc refreshHiddenViews]; [vc updateCustomControlsVisibility];
      [vc.view setNeedsLayout];
    } else if ([action isEqualToString:@"volume"]) {
      vc.volume = [payload[@"value"] floatValue]; [vc.naviView sndVolume:vc.volume];
    } else if ([action isEqualToString:@"recenter"]) {
      if (![KNNaviHiddenViews recenterMap:vc.naviView.mapView]) {
        [vc.mapHiddenViews restore]; vc.mapControlsHidden = NO;
      }
    } else if ([action isEqualToString:@"refresh"]) {
      [vc refreshCurrentRoute];
    } else if (KNNaviRouteEditingEnabled && ([action isEqualToString:@"routePreview"] || [action isEqualToString:@"routeEdit"])) {
      if (vc.onMenu) vc.onMenu([action isEqualToString:@"routeEdit"] ? 107 : 103);
    } else if ([action isEqualToString:@"end"]) [vc finish];
    [vc updateBottomPanel];
  };
  [self.view addSubview:self.bottomPanel];
  [self.view addSubview:self.bottomPanel.menuView];
  [self refreshHiddenViews];
  [self updateBottomPanel];
}

- (void)refreshCurrentRoute {
  if (self.finished || self.changingDestination) return;
  [self.bottomPanel showToast:@"경로 새로고침을 요청했어요"];
  if (self.arrivalRecovery.waiting) [self retryArrivalRoute];
  else [(KNDriveGuidance *)self.guidance reRoute];
}

- (void)closeBottomMenu {
  [self.bottomPanel collapse];
}

- (void)setBottomMenuVisible:(BOOL)visible {
  [self.view layoutIfNeeded];
  UIView *sheet = self.bottomPanel.menuView;
  CGFloat offset = self.view.bounds.size.height - sheet.center.y + sheet.bounds.size.height / 2;
  if (visible) {
    if (sheet.hidden) sheet.transform = CGAffineTransformMakeTranslation(0, offset);
    sheet.hidden = NO; self.menuBackdrop.hidden = NO;
    [self.view bringSubviewToFront:self.menuBackdrop];
    [self.view bringSubviewToFront:sheet];
  }
  [UIView animateWithDuration:0.25 delay:0
                     options:UIViewAnimationOptionBeginFromCurrentState | UIViewAnimationOptionCurveEaseOut
                  animations:^{
    sheet.transform = visible ? CGAffineTransformIdentity : CGAffineTransformMakeTranslation(0, offset);
    self.menuBackdrop.alpha = visible ? 1 : 0;
  } completion:^(BOOL finished) {
    if (self.bottomPanel.expanded != visible) return;
    if (!visible || !self.bottomPanel.ready) {
      sheet.hidden = YES; self.menuBackdrop.hidden = YES;
    } else if (visible && finished) UIAccessibilityPostNotification(UIAccessibilityScreenChangedNotification, sheet);
  }];
}

- (BOOL)accessibilityPerformEscape {
  if (!self.bottomPanel.expanded) return [super accessibilityPerformEscape];
  [self closeBottomMenu]; return YES;
}

- (void)refreshHiddenViews {
  if (self.finished) return;
  [self.auxiliaryHiddenViews hideAuxiliaryViewsIn:self.naviView];
  if (self.bottomPanel.ready) {
    [self.webHiddenViews hideView:self.naviView.bottomView];
    [self.webHiddenViews hideView:self.naviView.menuView];
    BOOL hidden = [KNNaviRouteView isSDKMapStateBoundaryCompatible] && [self.mapHiddenViews hideMapControlsIn:self.naviView.mapView];
    if (!hidden) [self.mapHiddenViews restore];
    if (self.mapControlsHidden != hidden) {
      self.mapControlsHidden = hidden;
      [self updateBottomPanel];
    }
  }
}

- (void)viewDidLayoutSubviews {
  [super viewDidLayoutSubviews];
  BOOL web = self.bottomPanel.ready;
  CGFloat gap = MAX(self.view.safeAreaInsets.bottom, 12) + 8;
  // 지도는 바닥까지 채우고 앱 카드를 홈 인디케이터 위에 띄운다.
  self.naviView.frame = self.view.bounds;
  if (self.bottomPanel) {
    [self.bottomPanel setBottomInset:0];
    CGFloat height = MIN(self.panelHeight ?: KNNaviBottomCollapsedHeight, self.view.bounds.size.height - self.view.safeAreaInsets.top - gap);
    self.bottomPanel.frame = CGRectMake(12, self.view.bounds.size.height - gap - height, MAX(0, self.view.bounds.size.width - 24), height);
    self.bottomPanel.hidden = !web;
  }
  self.menuBackdrop.frame = self.view.bounds;
  UIView *sheet = self.bottomPanel.menuView;
  // 메뉴 배경은 화면 하단까지, 조작부는 홈 인디케이터 위에 둔다.
  CGFloat menuInset = self.view.safeAreaInsets.bottom;
  [self.bottomPanel setMenuBottomInset:menuInset];
  CGFloat sheetHeight = MIN(254 + menuInset, self.view.bounds.size.height - self.view.safeAreaInsets.top);
  sheet.bounds = CGRectMake(0, 0, self.view.bounds.size.width, MAX(0, sheetHeight));
  sheet.center = CGPointMake(self.view.bounds.size.width / 2, self.view.bounds.size.height - sheetHeight / 2);
  if (!web) { sheet.hidden = YES; self.menuBackdrop.hidden = YES; }
  [self refreshHiddenViews];
}

- (void)updateBottomPanel {
  [self.currentLocationExpiryTimer invalidate];
  self.currentLocationExpiryTimer = nil;
  if (self.finished) return;
  [self.gasPriceLayer updatePosition:self.currentLocationPosition timestamp:self.currentLocationGPSAt active:[self canRefreshFooterPosition]];
  KNTrip *trip = self.guidance.trip;
  NSMutableDictionary *state = [@{@"volume":@(self.volume), @"busy":@(self.changingDestination || self.arrivalRecovery.requesting)} mutableCopy];
  if (self.arrivalRecovery.waiting || self.arrivalMessage) {
    state[@"status"] = self.arrivalRecovery.requesting ? @"복귀 경로를 찾고 있어요" : @"목적지를 유지하고 있어요";
    state[@"detail"] = @"왼쪽 새로고침으로 다시 안내";
  } else if (trip) {
    state[@"remainingDistance"] = @(trip.remainDist);
    state[@"remainingTime"] = @(trip.remainTime);
  }
  state[@"goalName"] = self.trip.goal.name ?: @"";
  BOOL freshGPS = self.currentLocationGPSAt && fabs(self.currentLocationGPSAt.timeIntervalSinceNow) <= 10;
  BOOL freshName = self.currentLocationAt && fabs(self.currentLocationAt.timeIntervalSinceNow) <= 10;
  NSString *name = freshName ? self.currentLocationName : nil;
  if ((!self.currentRoadAvailable || !freshName) && [self hasCurrentRegion]) name = self.currentRegionName;
  state[@"currentLocationName"] = freshGPS ? (name ?: @"") : @"";
  state[@"currentLocationStatus"] = freshGPS ? (self.regionRequestInFlight ? @"주소 확인 중" : @"주소 정보 없음") : @"GPS 수신 대기";
  state[@"showRecenter"] = @(self.mapControlsHidden && self.mapDetached);
  state[@"canRouteEdit"] = @(KNNaviRouteEditingEnabled && self.trip.vias.count <= 3);
  [self.bottomPanel updateState:state];
  // SDK 콜백이 끊겨도 마지막 위치 문자열이 화면에 무기한 남지 않게 한다.
  NSTimeInterval expiry = DBL_MAX;
  for (NSDate *timestamp in @[self.currentLocationGPSAt ?: NSDate.distantPast,
                              self.currentLocationAt ?: NSDate.distantPast]) {
    NSTimeInterval remaining = 10 + timestamp.timeIntervalSinceNow;
    if (remaining > 0) expiry = MIN(expiry, remaining);
  }
  if ((!self.currentRoadAvailable || !freshName) && [self hasCurrentRegion]) {
    expiry = MIN(expiry, 120 + self.currentRegionAt.timeIntervalSinceNow);
  }
  if (expiry != DBL_MAX) {
    __weak KNNaviViewController *weakSelf = self;
    self.currentLocationExpiryTimer = [NSTimer timerWithTimeInterval:MAX(0.02, expiry) repeats:NO block:^(NSTimer *timer) {
      [weakSelf updateBottomPanel];
    }];
    [NSRunLoop.mainRunLoop addTimer:self.currentLocationExpiryTimer forMode:NSRunLoopCommonModes];
  }
}

- (void)hazardTapped {
  if (KNNaviGuideMenuActionsEnabled && self.onMenu != nil) self.onMenu(101);
}

- (void)updateCustomControlsVisibility {
  // 지도 이동·전체 경로·구간 정보에서는 SDK 안내 UI와 함께 숨긴다.
  // hidden은 터치와 접근성 탐색도 막으므로 투명한 버튼이 지도 위에 남지 않는다.
  // SDK가 초기 상태 콜백을 생략해도 기존 종료 수단은 유지한다.
  BOOL visible = !self.bottomPanel.ready && !self.preview && (!self.hasNaviScreenState ||
      self.naviScreenState == DriveNormal || self.naviScreenState == SafetyNormal);
  // 정상 모드 enum이 그대로인 패닝에서도 하단 안내 바와 함께 숨긴다.
  // 초기 구성 중 아직 없는 뷰는 숨김 신호로 간주하지 않는다.
  if (!self.arrivalRecovery.waiting && self.naviView.bottomView.hidden) visible = NO;
  if (self.safetyScreenQuarantined && !self.preview && !self.finished && !self.bottomPanel.ready) visible = YES;
  self.endButton.hidden = !visible;
  self.hazardButton.hidden = YES;
}

- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object
                       change:(NSDictionary<NSKeyValueChangeKey,id> *)change context:(void *)context {
  if (context == &kMotoMapBottomVisibilityContext) {
    [self updateCustomControlsVisibility];
    return;
  }
  [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
}

- (void)startObservingBottomView {
  [self stopObservingBottomView];
  self.observedBottomView = self.naviView.bottomView;
  [self.observedBottomView addObserver:self forKeyPath:@"hidden"
                              options:NSKeyValueObservingOptionInitial
                              context:&kMotoMapBottomVisibilityContext];
}

- (void)stopObservingBottomView {
  [self.observedBottomView removeObserver:self forKeyPath:@"hidden"
                                 context:&kMotoMapBottomVisibilityContext];
  self.observedBottomView = nil;
}

- (void)dealloc {
  [NSNotificationCenter.defaultCenter removeObserver:self];
  [self.footerPositionTimer invalidate];
  [self.footerPositionRequest cancel];
  [self.gasPriceLayer invalidate];
  [self stopObservingBottomView];
  [self.bottomPanel invalidate];
}

// KNNaviMapView 는 내부 KNMapView 를 노출하지 않는다 — 서브뷰 트리에서 찾는다.
// 문서화되지 않은 접근이라 SDK 업데이트로 못 찾게 될 수 있지만, 그 경우
// POI 탭 기능만 조용히 빠질 뿐 다른 동작에는 영향이 없다.
- (KNMapView *)findInnerMapViewIn:(UIView *)view depth:(int)depth {
  if (depth > 6) return nil;
  for (UIView *sub in view.subviews) {
    if ([sub isKindOfClass:[KNMapView class]]) return (KNMapView *)sub;
    KNMapView *found = [self findInnerMapViewIn:sub depth:depth + 1];
    if (found != nil) return found;
  }
  return nil;
}

- (void)attachPoiListener {
  KNMapView *inner = [self findInnerMapViewIn:self.naviView.mapView depth:0];
  // eventListener 는 weak — self(화면과 수명 동일)를 그대로 걸어도 안전하다
  inner.poiProperties.eventListener = self;
  if (inner && !self.preview && !self.gasPriceLayer) {
    self.gasPriceLayer = [[KNNaviGasPriceLayer alloc] initWithMap:inner];
    __weak KNNaviViewController *weakSelf=self;
    self.gasPriceLayer.onFetch=^{ if (weakSelf.onMenu) weakSelf.onMenu(109); };
    self.gasPriceLayer.onSelect=^(NSDictionary *station) {
      [weakSelf emitPoiName:station[@"name"] longitude:[station[@"longitude"] doubleValue] latitude:[station[@"latitude"] doubleValue]];
    };
  } else if (inner) [self.gasPriceLayer attachToMap:inner];
  [self updateBottomPanel];
}

// 지도 POI(상호·건물) 탭 — 이름·KATEC 좌표가 온다. WGS84 로 바꿔 JS 로 넘긴다.
- (void)mapView:(KNMapView *)aMapView
 onSingleTapped:(SInt64)aPOIId
        poiName:(NSArray *)aPOIName
     coordinate:(FloatPoint)aCoordinate {
  if (!KNNaviRouteEditingEnabled || ![self canRefreshFooterPosition] || self.changingDestination ||
      self.presentedViewController || self.onPoiTap == nil ||
      !isfinite(aCoordinate.x) || !isfinite(aCoordinate.y) || fabs(aCoordinate.x)>INT_MAX || fabs(aCoordinate.y)>INT_MAX) return;
  KNSDK *sdk = [KNSDK sharedInstance];
  if (sdk == nil) return;
  DoublePoint wgs = [sdk convertKATECToWGS84WithX:(SInt32)lround(aCoordinate.x)
                                                y:(SInt32)lround(aCoordinate.y)];
  NSString *name = [aPOIName componentsJoinedByString:@" "] ?: @"";
  [self emitPoiName:name longitude:wgs.x latitude:wgs.y];
}

- (void)emitPoiName:(NSString *)name longitude:(double)lng latitude:(double)lat {
  if (![self canRefreshFooterPosition] || self.changingDestination || self.presentedViewController ||
      !self.onPoiTap || !isfinite(lng) || !isfinite(lat) || fabs(lng)>180 || fabs(lat)>90) return;
  self.onPoiTap(name ?: @"",lng,lat);
}

- (void)mapView:(KNMapView *)aMapView
 onDoubleTapped:(SInt64)aPOIId
        poiName:(NSArray *)aPOIName
     coordinate:(FloatPoint)aCoordinate {
}

- (void)mapView:(KNMapView *)aMapView
  onLongPressed:(SInt64)aPOIId
        poiName:(NSArray *)aPOIName
     coordinate:(FloatPoint)aCoordinate {
}

- (void)viewDidAppear:(BOOL)animated {
  [super viewDidAppear:animated];
  [self refreshFooterPosition];
  if (!self.footerPositionTimer && !self.preview) {
    __weak KNNaviViewController *weakSelf = self;
    self.footerPositionTimer = [NSTimer scheduledTimerWithTimeInterval:5 repeats:YES block:^(NSTimer *timer) {
      [weakSelf refreshFooterPosition];
    }];
  }
  [self attachPoiListener];
  [self.naviView resumeView];

  [self applyCarTheme];

  // 스스로 달리는 화면을 실주행으로 오해하지 않게 한 번 알린다
  if (self.preview && !self.previewNoticed) {
    self.previewNoticed = YES;
    [KNNaviPresenter showNotice:@"정한 출발지에서 경로를 미리 보여드려요. 실제 주행 안내가 아니에요."];
  }
}

- (void)viewWillDisappear:(BOOL)animated {
  [super viewWillDisappear:animated];
  [self pauseFooterPosition];
  [self.footerPositionTimer invalidate]; self.footerPositionTimer = nil;
}

// 안내가 시작되거나 위치가 처음 잡히면 SDK 가 자차를 다시 그리면서
// 기본 아이콘으로 되돌린다. 그 시점마다 다시 씌운다.
- (void)applyCarTheme {
  KNNaviMapView *mapView = self.naviView.mapView;
  if (mapView == nil || self.applyingCarTheme) return;
  self.applyingCarTheme = YES;

  BOOL carImageGuardInstalled = LockMotoMapCustomCarImage(mapView);
  [mapView setCustomCarImages:[KNNaviTheme carImages] anchor:[KNNaviTheme carAnchor]];
  // trafficMode 가 켜져 있어 실제로 그려지는 건 Traffic 쪽이지만, 꺼졌을 때를
  // 위해 Drive 쪽도 같은 외곽선으로 맞춰 둔다
  [mapView setRouteThemeDriveDay:[KNNaviTheme driveThemeDay]
            routeThemeDriveNight:[KNNaviTheme driveThemeNight]
            routeThemeTrafficDay:[KNNaviTheme routeThemeDay]
          routeThemeTrafficNight:[KNNaviTheme routeThemeNight]];

  // setCustomCarImages 는 내부에서 trip.routeConfig.carType 을 읽어 이륜차(6)면
  // carImageType 을 2(내장 바이크 아이콘)로 강제한다 — 1.12.14 디스어셈블로 확인.
  // 위 guard 가 모든 후속 호출도 0으로 바꾼다. 아래 직접 적용과 renew 는 현재
  // 선택 이미지까지 즉시 맞추는 알려진 전환점의 폴백이다. 비공개 메서드의 ABI 가
  // 바뀐 SDK 에서는 둘 다 건너뛰고 setCustomCarImages 의 공개 동작만 남긴다.
  SEL typeSel = NSSelectorFromString(@"carImageType:");
  SEL renewSel = NSSelectorFromString(@"renewTheme");
  if (carImageGuardInstalled &&
      [mapView respondsToSelector:typeSel] &&
      [mapView respondsToSelector:renewSel]) {
    void (*setType)(id, SEL, NSUInteger) =
        (void (*)(id, SEL, NSUInteger))[mapView methodForSelector:typeSel];
    setType(mapView, typeSel, 0);
    void (*renew)(id, SEL) = (void (*)(id, SEL))[mapView methodForSelector:renewSel];
    renew(mapView, renewSel);
  }
  self.applyingCarTheme = NO;
}

- (void)naviViewGuideEnded:(KNNaviView *)aNaviView {
  [self finish];
}

- (void)naviViewGuideState:(KNGuideState)aGuideState {
  if (aGuideState == KNGuideState_OnSafetyGuide) [self handleBlockedSafetyMode];
}

- (void)handleBlockedSafetyMode {
  if (self.finished) return;
  // 유효 경로 안내가 진행 중인 늦은 UI 전환은 거부만 하고 안내를 유지한다.
  if (self.guidance.guideState == KNGuideState_OnRouteGuide && !self.safetyScreenQuarantined) return;
  [self holdDestinationAfterSafetyTransition];
}

- (void)holdDestinationAfterSafetyTransition {
  if (self.finished) return;
  if (self.preview) { [self finish]; return; }
  if (!self.arrivalRecovery.waiting) [self guidanceGuideEnded:nil];
  if (!self.arrivalRecovery.requesting) {
    [self showArrivalUIWithMessage:@"목적지를 유지하고 있어요.\n목적지까지 다시 안내할 수 있어요."];
  }
}

#pragma mark - KNNaviView_StateDelegate

- (void)naviViewDidMenuItemWithId:(int)aId toggle:(BOOL)aToggle {
  if (KNNaviGuideMenuActionsEnabled && self.onMenu != nil) self.onMenu(aId);
}

- (void)naviViewDidUpdateSndVolume:(float)aVolume {
  self.volume = aVolume;
  [self updateBottomPanel];
}

- (void)naviViewDidUpdateUseDarkMode:(BOOL)aDarkMode {
}

- (void)naviViewDidUpdateMapCameraMode:(MapViewCameraMode)aMapViewCameraMode {
}

- (void)naviViewScreenState:(KNNaviViewState)aKNNaviViewState {
  if (self.finished) return;
  self.naviScreenState = aKNNaviViewState;
  self.hasNaviScreenState = YES;
  [self updateCustomControlsVisibility];
  [self refreshHiddenViews];
  [self updateBottomPanel];
  if (aKNNaviViewState == SafetyNormal || aKNNaviViewState == SafetyTouch) {
    // 고정 SDK의 모드 입구 외 경로가 생겨도 해당 화면을 그리지 않는다.
    self.safetyScreenQuarantined = YES;
    self.naviView.hidden = YES;
    [self holdDestinationAfterSafetyTransition];
  }
}

- (void)naviViewPopupOpenCheck:(BOOL)aOpen {
}

- (void)naviViewIsArrival:(BOOL)aIsArrival {
}

#pragma mark - KNGuidance 델리게이트 → naviView 중계

- (void)guidanceGuideStarted:(KNGuidance *)aGuidance {
  if (self.finished) return;
  // 경로 계산 중 기존 엔진의 자동 재탐색 완료는 편집 승인으로 취급하지 않는다.
  if (self.suspended && self.changingDestination && !self.resumeCommitting) {
    [self.naviView guidanceGuideStarted:aGuidance]; return;
  }
  self.resumeCommitting = NO;
  if (self.changingDestination && self.pendingDestinationTrip) {
    [self.gasLayer resetSearch];
    self.arrivalEmitted = NO;
    self.trip = self.pendingDestinationTrip;
    self.priority = self.pendingDestinationPriority;
  }
  self.changingDestination = NO;
  self.pendingDestinationTrip = nil;
  self.onResumeError = nil;
  [self restoreArrivalUI];
  [self.arrivalRecovery guideStarted];
  [self.naviView guidanceGuideStarted:aGuidance];
  [(KNNaviRouteView *)self.naviView resumeRouteModeForPreview:self.preview];
  self.safetyScreenQuarantined = NO;
  self.naviView.hidden = NO;
  [self updateCustomControlsVisibility];
  [self applyCarTheme];
  [self refreshHiddenViews];
  [self attachPoiListener];
  [self updateBottomPanel];
  // JS 가 이 신호를 받아 밑 화면을 지도로 바꿔 둔다 — 안내가 어떤 경로로
  // 걷히든(도착·취소·SDK 자체 닫힘) 드러나는 건 항상 지도다.
  if (self.onStarted != nil) {
    void (^started)(void) = self.onStarted;
    self.onStarted = nil;
    started();
  }
}

- (void)guidanceCheckingRouteChange:(KNGuidance *)aGuidance {
  [self.naviView guidanceCheckingRouteChange:aGuidance];
}

- (void)guidanceOutOfRoute:(KNGuidance *)aGuidance {
  [self.naviView guidanceOutOfRoute:aGuidance];
  // 경로 이탈 시 SDK 가 자차를 매칭 해제(off) 상태로 다시 그리면서 커스텀
  // 이미지를 기본 아이콘으로 되돌린다 — 실기기에서 "기본 위치 아이콘"이
  // 오솔길(이탈) 주행 중 두 차례 목격된 바로 그 지점. 되돌릴 때마다 재적용한다.
  [self applyCarTheme];
}

- (void)guidanceRouteUnchanged:(KNGuidance *)aGuidance {
  [self.naviView guidanceRouteUnchanged:aGuidance];
  [self applyCarTheme]; // 이탈 판정이 "경로 유지"로 끝나도 자차는 다시 그려졌다
}

- (void)guidance:(KNGuidance *)aGuidance routeUnchangedWithError:(KNError *)aError {
  // 현재 엔진의 자동 재탐색 실패는 수동 위치/경로 준비 요청의 실패가 아니다.
  if (self.suspended && self.changingDestination && !self.resumeCommitting) {
    [self.naviView guidance:aGuidance routeUnchangedWithError:aError];
    [self applyCarTheme]; return;
  }
  self.changingDestination = NO;
  self.resumeCommitting = NO;
  self.pendingDestinationTrip = nil;
  if (self.onResumeError) {
    void (^failure)(NSError *) = self.onResumeError;
    self.onResumeError = nil; self.onStarted = nil;
    failure(ManualRerouteError(@"APPLY", aError, @"안내를 변경하지 못했어요."));
  }
  if (self.arrivalRecovery.requesting) {
    [self arrivalReturnFailedForGeneration:self.routeRequestGeneration];
    return;
  }
  if (self.arrivalRecovery.waiting) {
    [self showArrivalUIWithMessage:@"경로를 바꾸지 못했어요.\n기존 목적지를 유지하고 있어요. 다시 시도해 주세요."];
    return;
  }
  [self.naviView guidance:aGuidance routeUnchangedWithError:aError];
  [self applyCarTheme]; // 재탐색 실패(예: 오솔길이라 경로 없음)로 끝난 뒤에도 동일
}

- (void)guidanceRouteChanged:(KNGuidance *)aGuidance
                   fromRoute:(KNRoute *)aFromRoute
                fromLocation:(KNLocation *)aFromLocation
                     toRoute:(KNRoute *)aToRoute
                  toLocation:(KNLocation *)aToLocation
                      reason:(KNGuideRouteChangeReason)aChangeReason {
  [self.naviView guidanceRouteChanged:aGuidance];
  [self applyCarTheme]; // 재탐색으로 새 경로가 깔릴 때도 자차·경로 테마가 리셋된다
}

- (void)emitArrivalIfNear:(KNGPSData *)gps {
  if (self.finished || self.preview || self.suspended || self.changingDestination || self.arrivalEmitted ||
      !self.onArrival || !self.trip.goal || ![KNSDKBridge isLocationUseAllowed] || ![KNNaviGasLayer isUsableSearchGPS:gps]) return;
  IntPoint target=self.trip.goal.pos;
  double distance=hypot(gps.pos.x-target.x,gps.pos.y-target.y);
  if (!isfinite(distance) || distance>300) return;
  self.arrivalEmitted=YES;
  DoublePoint goal=[[KNSDK sharedInstance] convertKATECToWGS84WithX:target.x y:target.y];
  // 좌표는 앱 내부 저장 맥락 확인용이다. 분석·오류 이벤트로 보내지 않는다.
  self.onArrival(@{@"latitude":@(goal.y),@"longitude":@(goal.x),@"name":self.trip.goal.name ?: @"",@"distance":@(distance)});
}

- (void)guidanceGuideEnded:(KNGuidance *)aGuidance {
  if (self.finished) return;
  // 이전 종료 콜백이 새 경로 시작 뒤 늦게 도착한 경우 현재 안내를 덮지 않는다.
  if (aGuidance.guideState == KNGuideState_OnRouteGuide) return;
  // 미리보기는 실제 이동·복귀 경로가 없으므로 완료 시 닫고 안전운행 화면은 열지 않는다.
  if (self.preview) { [self finish]; return; }
  // SDK는 이 콜백 전에 경로를 지운다. 안전운행 UI로 전달하거나 옛 회전 안내를
  // 그대로 표시하지 않고, 목적지를 보존한 채 벗어났을 때 새 경로를 요청한다.
  if (!self.changingDestination) self.routeRequestGeneration++;
  if (!self.arrivalRecovery) self.arrivalRecovery = [KNNaviArrivalRecovery new];
  KNGPSData *gps = (aGuidance ?: self.guidance).locationGuide.gpsOrigin;
  [self.arrivalRecovery guideEndedAtDistance:[self distanceToDestinationWithGPS:gps]];
  [self emitArrivalIfNear:gps];
  [self showArrivalUIWithMessage:@"목적지 주변입니다.\n지나치면 복귀 경로를 안내합니다."];
  [self applyCarTheme];
}

- (BOOL)usableRecoveryGPS:(KNGPSData *)gps {
  return gps && gps.valid && gps.posTrust && isfinite(gps.pos.x) && isfinite(gps.pos.y) &&
      gps.timestamp && fabs(gps.timestamp.timeIntervalSinceNow) <= 10;
}

// SDK 위치 원본별 갱신 시점이 다를 수 있어 안내용 신뢰 조건을 통과한 최신 값을 고른다.
- (KNGPSData *)latestRecoveryGPS {
  KNGPSManager *manager = [KNSDK sharedInstance].sharedGpsManager;
  KNGPSData *newest = nil;
  for (id candidate in @[self.guidance.locationGuide.gpsOrigin ?: NSNull.null,
                          manager.recentGpsData ?: NSNull.null, manager.lastValidGpsData ?: NSNull.null]) {
    if (candidate == NSNull.null || ![self usableRecoveryGPS:candidate]) continue;
    KNGPSData *gps = candidate;
    if (!newest || [gps.timestamp compare:newest.timestamp] == NSOrderedDescending) newest = gps;
  }
  return newest;
}

// 수동 편집의 출발점은 SDK가 수신한 유효한 최근 위치로 정한다.
// 도착/자동 복귀용 posTrust 조건은 위의 별도 정책에 남긴다.
- (BOOL)usableManualRerouteGPS:(KNGPSData *)gps {
  return gps && gps.valid && isfinite(gps.pos.x) && isfinite(gps.pos.y) &&
      gps.timestamp && fabs(gps.timestamp.timeIntervalSinceNow) <= 10;
}

- (void)requestManualPosition:(void (^)(CLLocation *))completion {
  self.manualPositionRequest = [KNNaviManualPositionRequest new];
  [self.manualPositionRequest start:completion];
}

- (KNGPSData *)latestManualRerouteGPS {
  KNGPSManager *manager = [KNSDK sharedInstance].sharedGpsManager;
  KNGPSData *newest = nil;
  for (id candidate in @[self.guidance.locationGuide.gpsOrigin ?: NSNull.null,
                          manager.recentGpsData ?: NSNull.null, manager.lastValidGpsData ?: NSNull.null]) {
    if (candidate == NSNull.null || ![self usableManualRerouteGPS:candidate]) continue;
    KNGPSData *gps = candidate;
    if (!newest || [gps.timestamp compare:newest.timestamp] == NSOrderedDescending) newest = gps;
  }
  return newest;
}

- (double)distanceToDestinationWithGPS:(KNGPSData *)gps {
  if (!self.trip.goal || ![self usableRecoveryGPS:gps]) return NAN;
  IntPoint goal = self.trip.goal.pos;
  return hypot(gps.pos.x - goal.x, gps.pos.y - goal.y);
}

- (void)showArrivalUIWithMessage:(NSString *)message {
  self.arrivalMessage = message;
  if (self.bottomPanel.ready) {
    self.naviView.curDirView.hidden = YES;
    self.naviView.nextDirView.hidden = YES;
    [self updateBottomPanel];
    return;
  }
  if (!self.arrivalBanner) {
    self.arrivalCurWasHidden = self.naviView.curDirView.hidden;
    self.arrivalNextWasHidden = self.naviView.nextDirView.hidden;
    self.arrivalBottomWasHidden = self.naviView.bottomView.hidden;
    self.arrivalLabel = [UILabel new];
    self.arrivalLabel.numberOfLines = 0;
    self.arrivalLabel.textAlignment = NSTextAlignmentCenter;
    self.arrivalLabel.font = [UIFont preferredFontForTextStyle:UIFontTextStyleSubheadline];
    self.arrivalLabel.adjustsFontForContentSizeCategory = YES;
    self.arrivalLabel.textColor = UIColor.labelColor;
    self.arrivalRetryButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.arrivalRetryButton setTitle:@"목적지까지 다시 안내" forState:UIControlStateNormal];
    [self.arrivalRetryButton addTarget:self action:@selector(retryArrivalRoute) forControlEvents:UIControlEventTouchUpInside];
    [self.arrivalRetryButton.heightAnchor constraintGreaterThanOrEqualToConstant:44].active = YES;
    self.arrivalBanner = [[UIStackView alloc] initWithArrangedSubviews:@[self.arrivalLabel, self.arrivalRetryButton]];
    self.arrivalBanner.axis = UILayoutConstraintAxisVertical;
    self.arrivalBanner.spacing = 4;
    self.arrivalBanner.layoutMarginsRelativeArrangement = YES;
    self.arrivalBanner.layoutMargins = UIEdgeInsetsMake(12, 16, 8, 16);
    self.arrivalBanner.backgroundColor = UIColor.secondarySystemBackgroundColor;
    self.arrivalBanner.layer.cornerRadius = 12;
    self.arrivalBanner.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:self.arrivalBanner];
    [NSLayoutConstraint activateConstraints:@[
      [self.arrivalBanner.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor constant:70],
      [self.arrivalBanner.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor constant:16],
      [self.arrivalBanner.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor constant:-16],
    ]];
  }
  self.arrivalLabel.text = message;
  self.arrivalRetryButton.enabled = !self.arrivalRecovery.requesting && !self.preview;
  self.naviView.curDirView.hidden = YES;
  self.naviView.nextDirView.hidden = YES;
  self.naviView.bottomView.hidden = YES;
  [self.naviView trafficMode:NO];
  [self updateCustomControlsVisibility];
}

- (void)restoreArrivalUI {
  self.arrivalMessage = nil;
  [self updateBottomPanel];
  if (!self.arrivalBanner) return;
  [self.arrivalBanner removeFromSuperview];
  self.arrivalBanner = nil;
  self.naviView.curDirView.hidden = self.arrivalCurWasHidden;
  self.naviView.nextDirView.hidden = self.arrivalNextWasHidden;
  self.naviView.bottomView.hidden = self.arrivalBottomWasHidden;
  [self.naviView trafficMode:YES];
}

- (void)retryArrivalRoute {
  if (self.preview || self.finished || self.changingDestination || ![KNSDKBridge isLocationUseAllowed]) return;
  KNGPSData *gps = self.guidance.locationGuide.gpsOrigin;
  if (![self usableRecoveryGPS:gps]) {
    [self showArrivalUIWithMessage:@"현재 위치를 확인할 수 없어요.\nGPS 수신 후 다시 시도해 주세요."];
    return;
  }
  if ([self.arrivalRecovery beginManualRecoveryAtTime:NSDate.timeIntervalSinceReferenceDate]) {
    [self requestArrivalReturnWithGPS:gps];
  }
}

- (void)arrivalReturnFailedForGeneration:(NSUInteger)generation {
  if (self.finished || generation != self.routeRequestGeneration || !self.arrivalRecovery.requesting) return;
  self.routeRequestGeneration++; // 시간 초과 뒤의 늦은 응답은 안내를 재시작하지 않는다.
  [self.arrivalRecovery requestFailed];
  [self showArrivalUIWithMessage:@"돌아가는 경로를 찾지 못했어요.\n목적지를 유지하고 있어요. 다시 시도해 주세요."];
}

- (void)requestArrivalReturnWithGPS:(KNGPSData *)gps {
  if (self.finished || self.changingDestination || !self.arrivalRecovery.requesting || ![KNSDKBridge isLocationUseAllowed] ||
      ![self usableRecoveryGPS:gps] || !self.trip.goal) {
    [self.arrivalRecovery requestFailed];
    return;
  }
  NSUInteger generation = ++self.routeRequestGeneration;
  KNPOI *goal = self.trip.goal;
  IntPoint start = IntPointMakeWithDoublePoint(gps.pos);
  KNPOI *origin = [[KNPOI alloc] initWithName:@"현재 위치" pos:start];
  [self showArrivalUIWithMessage:@"목적지까지 돌아가는 경로를 찾고 있어요."];
  __weak KNNaviViewController *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 20 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    [weakSelf arrivalReturnFailedForGeneration:generation];
  });
  [[KNSDK sharedInstance] makeTripWithStart:origin goal:goal vias:nil completion:^(KNError *error, KNTrip *trip) {
    dispatch_async(dispatch_get_main_queue(), ^{
      KNNaviViewController *controller = weakSelf;
      if (!controller || controller.finished || generation != controller.routeRequestGeneration ||
          ![KNSDKBridge isLocationUseAllowed]) return;
      if (error || !trip) { [controller arrivalReturnFailedForGeneration:generation]; return; }
      trip.routeConfig = [[KNRouteConfiguration alloc] initWithCarType:KNCarType_Bike];
      [trip routeWithPriority:controller.priority avoidOptions:KNRouteAvoidOption_None
                  completion:^(KNError *routeError, NSArray<KNRoute *> *routes) {
        dispatch_async(dispatch_get_main_queue(), ^{
          KNNaviViewController *current = weakSelf;
          if (!current || current.finished || generation != current.routeRequestGeneration ||
              ![KNSDKBridge isLocationUseAllowed]) return;
          if (routeError || routes.count == 0) { [current arrivalReturnFailedForGeneration:generation]; return; }
          current.trip = trip;
          // 공개 API로 새 목적지 안내를 시작한다. reRoute는 도착 후 지워진 경로를 복구하지 못한다.
          [current.naviView guideNewDestinations:trip priority:current.priority avoidOptions:KNRouteAvoidOption_None];
        });
      }];
    });
  }];
}

- (void)guidance:(KNGuidance *)aGuidance
    didUpdateRoutes:(NSArray<KNRoute *> *)aRoutes
     multiRouteInfo:(KNMultiRouteInfo *)aMultiRouteInfo {
  [self.naviView guidance:aGuidance didUpdateRoutes:aRoutes multiRouteInfo:aMultiRouteInfo];
}

- (void)guidance:(KNGuidance *)aGuidance didUpdateIndoorRoute:(KNRoute *)aRoute {
  [self.naviView guidance:aGuidance didUpdateIndoorRoute:aRoute];
}

- (BOOL)hasCurrentRegion {
  return self.currentRegionName.length && self.currentRegionAt &&
      fabs(self.currentRegionAt.timeIntervalSinceNow) < 120 &&
      hypot(self.currentLocationPosition.x - self.currentRegionPosition.x,
            self.currentLocationPosition.y - self.currentRegionPosition.y) <= 150;
}

- (void)lookupRegionAt:(IntPoint)point completion:(void (^)(NSString *))completion {
  [[KNSDK sharedInstance] reverseGeocodeWithPos:point completion:^(KNError *error, NSString *code, NSString *province, NSString *city, NSString *dong) {
    NSCharacterSet *space = NSCharacterSet.whitespaceAndNewlineCharacterSet;
    NSString *district = [dong stringByTrimmingCharactersInSet:space];
    NSString *area = [city stringByTrimmingCharactersInSet:space];
    NSString *name = !error && district.length ? (area.length ? [NSString stringWithFormat:@"%@ %@", area, district] : district) : nil;
    completion(name);
  }];
}

- (void)requestCurrentRegionIfNeeded {
  if (![self canRefreshFooterPosition] ||
      fabs(self.currentLocationPosition.x) > INT_MAX || fabs(self.currentLocationPosition.y) > INT_MAX ||
      !self.currentLocationGPSAt || fabs(self.currentLocationGPSAt.timeIntervalSinceNow) > 10 ||
      (self.currentRoadAvailable && self.currentLocationAt && fabs(self.currentLocationAt.timeIntervalSinceNow) <= 10) || [self hasCurrentRegion] || self.regionRequestInFlight ||
      (self.regionRequestAt && -self.regionRequestAt.timeIntervalSinceNow < 10)) return;
  self.regionRequestAt = NSDate.date;
  self.regionRequestInFlight = YES;
  NSUInteger generation = ++self.regionRequestGeneration;
  IntPoint point = {(SInt32)llround(self.currentLocationPosition.x), (SInt32)llround(self.currentLocationPosition.y)};
  __weak KNNaviViewController *weakSelf = self;
  [self lookupRegionAt:point completion:^(NSString *name) {
    void (^apply)(void) = ^{
      KNNaviViewController *vc = weakSelf;
      if (!vc || generation != vc.regionRequestGeneration || vc.finished || vc.suspended) return;
      vc.regionRequestInFlight = NO;
      if (![vc canRefreshFooterPosition]) return;
      if (!vc.currentLocationGPSAt || fabs(vc.currentLocationGPSAt.timeIntervalSinceNow) > 10 ||
          hypot(vc.currentLocationPosition.x - point.x, vc.currentLocationPosition.y - point.y) > 150) {
        [vc updateBottomPanel];
        return;
      }
      if (name.length) {
        vc.currentRegionName = name;
        vc.currentRegionAt = NSDate.date;
        vc.currentRegionPosition = point;
      }
      [vc updateBottomPanel];
    };
    if (NSThread.isMainThread) apply(); else dispatch_async(dispatch_get_main_queue(), apply);
  }];
  // 중단된 요청은 폐기하되 조회 실패를 GPS 콜백마다 다시 호출하지 않는다.
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 8 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    KNNaviViewController *vc = weakSelf;
    if (!vc || generation != vc.regionRequestGeneration || !vc.regionRequestInFlight) return;
    vc.regionRequestGeneration++;
    vc.regionRequestInFlight = NO;
    if (!vc.finished) [vc updateBottomPanel];
  });
}

// 표시에 쓰는 위치는 도로 매칭 신뢰도(posTrust)와 분리한다. 자동 복귀·도착 조건은 그대로다.
- (BOOL)usableFooterGPS:(KNGPSData *)gps {
  return gps && gps.valid && isfinite(gps.pos.x) && isfinite(gps.pos.y) &&
      fabs(gps.pos.x) <= INT_MAX && fabs(gps.pos.y) <= INT_MAX &&
      gps.timestamp && fabs(gps.timestamp.timeIntervalSinceNow) <= 10;
}

- (BOOL)canRefreshFooterPosition {
  return !self.finished && !self.preview && !self.suspended && self.viewIfLoaded.window &&
      UIApplication.sharedApplication.applicationState == UIApplicationStateActive && [KNSDKBridge isLocationUseAllowed];
}

- (void)pauseFooterPosition {
  self.footerPositionGeneration++;
  [self.gasPriceLayer pause];
  [self.footerPositionRequest cancel]; self.footerPositionRequest = nil;
  self.regionRequestGeneration++; self.regionRequestInFlight = NO;
}

- (void)requestFooterPosition:(void (^)(CLLocation *))completion {
  self.footerPositionRequest = [KNNaviManualPositionRequest new];
  [self.footerPositionRequest start:completion];
}

- (void)refreshFooterPosition {
  if (![self canRefreshFooterPosition]) { [self pauseFooterPosition]; return; }
  if (!self.gasPriceLayer) [self attachPoiListener];
  if (self.currentLocationGPSAt && fabs(self.currentLocationGPSAt.timeIntervalSinceNow) <= 5) {
    [self requestCurrentRegionIfNeeded]; [self updateBottomPanel]; return;
  }
  if (self.footerPositionRequest || (self.footerPositionRequestAt && -self.footerPositionRequestAt.timeIntervalSinceNow < 5)) return;
  self.footerPositionRequestAt = NSDate.date;
  NSUInteger generation = ++self.footerPositionGeneration;
  __weak KNNaviViewController *weakSelf = self;
  [self requestFooterPosition:^(CLLocation *location) {
    KNNaviViewController *vc = weakSelf;
    if (!vc || generation != vc.footerPositionGeneration) return;
    vc.footerPositionRequest = nil;
    if (![vc canRefreshFooterPosition]) return;
    if ([KNNaviManualPositionRequest isUsableLocation:location] &&
        (!vc.currentLocationGPSAt || [location.timestamp compare:vc.currentLocationGPSAt] == NSOrderedDescending)) {
      IntPoint point = [[KNSDK sharedInstance] convertWGS84ToKATECWithLongitude:location.coordinate.longitude latitude:location.coordinate.latitude];
      vc.currentLocationPosition = (DoublePoint){point.x, point.y};
      vc.currentLocationGPSAt = location.timestamp;
      // 시스템 위치에는 도로명이 없다. 동 주소가 현재 위치에 맞는지 다시 확인한다.
      vc.currentRoadAvailable = NO;
      vc.currentLocationName = nil; vc.currentLocationAt = nil;
      [vc requestCurrentRegionIfNeeded];
    }
    [vc updateBottomPanel];
  }];
}

- (void)updateCurrentLocationWithGuide:(KNGuide_Location *)guide {
  KNGPSData *gps = guide.gpsOrigin;
  if (![self usableFooterGPS:gps]) {
    // SDK가 잠시 빈 콜백을 줘도 방금 수신한 시스템 위치/동 주소를 지우지 않는다.
    if (!self.currentLocationGPSAt || fabs(self.currentLocationGPSAt.timeIntervalSinceNow) > 10) {
      self.currentLocationGPSAt = nil;
      self.currentLocationName = nil; self.currentLocationAt = nil;
      self.currentRegionName = nil; self.currentRegionAt = nil;
      self.currentRoadAvailable = NO;
      self.regionRequestGeneration++; self.regionRequestInFlight = NO;
    }
    [self refreshFooterPosition];
    return;
  }
  BOOL older = self.currentLocationGPSAt && [gps.timestamp compare:self.currentLocationGPSAt] == NSOrderedAscending;
  double moved = hypot(self.currentLocationPosition.x - gps.pos.x, self.currentLocationPosition.y - gps.pos.y);
  if (older && moved > 150) return;
  if (!older) {
    if (moved > 150) { self.currentLocationName = nil; self.currentLocationAt = nil; }
    self.currentLocationGPSAt = gps.timestamp;
    self.currentLocationPosition = gps.pos;
  }
  NSCharacterSet *space = NSCharacterSet.whitespaceAndNewlineCharacterSet;
  NSString *name = [guide.location.roadName stringByTrimmingCharactersInSet:space];
  self.currentRoadAvailable = name.length > 0;
  if (name.length) {
    self.currentLocationName = name;
    self.currentLocationAt = gps.timestamp;
  }
  [self requestCurrentRegionIfNeeded];
}

- (void)guidance:(KNGuidance *)aGuidance didUpdateLocation:(KNGuide_Location *)aLocationGuide {
  if (self.finished || ![KNSDKBridge isLocationUseAllowed]) return;
  [self.naviView guidance:aGuidance didUpdateLocation:aLocationGuide];
  [self updateCurrentLocationWithGuide:aLocationGuide];
  if (!self.preview) [self.gasLayer updateGPS:aLocationGuide.gpsOrigin];
  [self updateBottomPanel];
  if (self.arrivalRecovery.waiting) [self emitArrivalIfNear:aLocationGuide.gpsOrigin];
  if (self.arrivalRecovery.waiting && !self.preview && !self.suspended && !self.changingDestination && [self usableRecoveryGPS:aLocationGuide.gpsOrigin]) {
    double distance = [self distanceToDestinationWithGPS:aLocationGuide.gpsOrigin];
    if ([self.arrivalRecovery shouldRecoverAtDistance:distance time:NSDate.timeIntervalSinceReferenceDate]) {
      [self requestArrivalReturnWithGPS:aLocationGuide.gpsOrigin];
    }
  }

  // SDK 가 위치를 처음 잡을 때 자차를 기본 아이콘으로 되돌린다 — 한 번 다시 씌운다.
  // (원래 도착 안내 함수 안에 묻혀 있어서 목적지 300m 안에 들어와야 실행됐다.)
  if (!self.carThemeApplied) {
    self.carThemeApplied = YES;
    [self applyCarTheme];
  }
}

- (void)guidance:(KNGuidance *)aGuidance didUpdateRouteGuide:(KNGuide_Route *)aRouteGuide {
  [self.naviView guidance:aGuidance didUpdateRouteGuide:aRouteGuide];
  [self updateBottomPanel];
  [self refreshHiddenViews];
}

- (void)guidance:(KNGuidance *)aGuidance didUpdateSafetyGuide:(KNGuide_Safety *)aSafetyGuide {
  [self.naviView guidance:aGuidance didUpdateSafetyGuide:aSafetyGuide];
}

- (void)guidance:(KNGuidance *)aGuidance
    didUpdateAroundSafeties:(NSArray<__kindof KNSafety *> *)aSafeties {
  [self.naviView guidance:aGuidance didUpdateAroundSafeties:aSafeties];
}

- (void)guidance:(KNGuidance *)aGuidance didUpdateCitsGuide:(KNGuide_Cits *)aCitsGuide {
}

- (BOOL)guidance:(KNGuidance *)aGuidance
    shouldPlayVoiceGuide:(KNGuide_Voice *)aVoiceGuide
          replaceSndData:(NSData **)aNewData {
  if (self.finished) return NO;
  if (aVoiceGuide.voiceCode == KNVoiceCode_StartGuide) {
    // 도착 뒤 경로 복구 때 같은 시작 멘트를 반복하지 않는다.
    if (self.didPlayStartVoice) return NO;
    self.didPlayStartVoice = YES;
    NSData *data = MotoMapStartVoiceData();
    if (data.length && aNewData) *aNewData = data;
  }
  // 라이더가 종료하지 않았으므로 SDK의 자동 종료 멘트도 재생하지 않는다.
  if (!self.preview && aVoiceGuide.voiceCode == KNVoiceCode_EndGuide) return NO;
  return YES;
}

- (void)guidance:(KNGuidance *)aGuidance willPlayVoiceGuide:(KNGuide_Voice *)aVoiceGuide {
  if (!self.finished) [self.audioFocus beginVoice:aVoiceGuide];
}

- (void)guidance:(KNGuidance *)aGuidance didFinishPlayVoiceGuide:(KNGuide_Voice *)aVoiceGuide {
  [self.audioFocus endVoice:aVoiceGuide];
}

- (void)finish {
  if (self.finished) return;
  self.finished = YES;
  [self pauseFooterPosition];
  [self.footerPositionTimer invalidate]; self.footerPositionTimer = nil;
  [self.manualPositionRequest cancel]; self.manualPositionRequest = nil;
  [self.gasPriceLayer invalidate];
  [self.gasLayer invalidate];
  self.regionRequestGeneration++; self.regionRequestInFlight = NO;
  [self.currentLocationExpiryTimer invalidate];
  self.currentLocationExpiryTimer = nil;
  self.currentRegionName = nil; self.currentRegionAt = nil;
  self.routeRequestGeneration++;
  self.onStarted = nil;
  if (self.onResumeError) self.onResumeError(ManualRerouteError(@"STATE", nil, @"길안내가 종료됐어요."));
  self.onResumeError = nil;
  if (gSuspendedNavi == self) gSuspendedNavi = nil;
  [self.bottomPanel invalidate];
  [self.webHiddenViews restore];
  [self.auxiliaryHiddenViews restore];
  [self stopObservingBottomView];
  [self.guidance stop];
  [self.audioFocus stop];
  // 안내가 끝나면 백그라운드 위치를 다시 차단한다 — 종료 후에도 GPS 구독이
  // 남아 밤새 배터리를 먹었다(locationd 실측). 도착 자동 종료도 이 경로다.
  [KNSDKBridge setBackgroundLocationAllowed:NO];
  [self.naviView releaseView];
  self.naviView = nil;
  self.guidance = nil;

  if (gActiveNavi == self) gActiveNavi = nil;
  void (^done)(void) = self.onDismiss;
  self.onDismiss = nil;
  if (done != nil) done();
  KNNaviHazardSheet *sheet = self.hazardSheet; self.hazardSheet = nil;
  if (sheet) [sheet cancelForNavigationEnd:^{ [self dismissViewControllerAnimated:YES completion:nil]; }];
  else if (self.presentedViewController) [self dismissViewControllerAnimated:NO completion:^{
    [self dismissViewControllerAnimated:YES completion:nil];
  }];
  else [self dismissViewControllerAnimated:YES completion:nil];
}

@end

@implementation KNNaviPresenter

+ (void)stopLocationUseWithCompletion:(void (^)(void))completion {
  @synchronized(self) { gLocationGeneration += 1; }
  [KNSDKBridge setLocationUseAllowed:NO];
  [gActiveNavi finish];
  completion();
}

// 앱의 키 윈도우. UIApplication.keyWindow 는 iOS 13 에서 폐기됐다 — 연결된
// 모든 씬을 가로질러 하나를 돌려주기 때문. 씬 하나짜리 앱이라 결과는 같지만
// 경고를 남기지 않도록 전경 씬에서 직접 찾는다.
+ (UIWindow *_Nullable)keyWindow {
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) continue;
    if (scene.activationState != UISceneActivationStateForegroundActive) continue;
    for (UIWindow *window in ((UIWindowScene *)scene).windows) {
      if (window.isKeyWindow) return window;
    }
  }
  return nil;
}

+ (void)presentFromLng:(double)startLng
                   lat:(double)startLat
                 toLng:(double)goalLng
                   lat:(double)goalLat
                  name:(NSString *)goalName
                  vias:(NSArray<NSNumber *> *_Nullable)flatVias
              priority:(NSInteger)priority
    // 정한 출발지에서 경로를 훑어보는 미리보기면 YES
               preview:(BOOL)preview
             onStarted:(void (^_Nullable)(void))onStarted
                onMenu:(void (^_Nullable)(NSInteger))onMenu
              onPoiTap:(void (^_Nullable)(NSString *, double, double))onPoiTap
             onArrival:(void (^_Nullable)(NSDictionary *))onArrival
             onDismiss:(void (^)(void))onDismiss
               onError:(void (^)(NSString *_Nullable, NSString *))onError {
  if (![KNSDKBridge isLocationUseAllowed]) { onError(nil,@"위치 이용이 중지됐다"); return; }
  if (gActiveNavi && !gActiveNavi.finished) { onError(@"ACTIVE_GUIDE",@"진행 중인 길안내로 돌아가 종료한 뒤 새 안내를 시작해 주세요."); return; }
  __block NSUInteger generation;
  @synchronized(self) { generation = ++gLocationGeneration; }
  KNSDK *sdk = [KNSDK sharedInstance];
  if (sdk == nil) {
    onError(nil, @"KNSDK 인스턴스를 가져오지 못했다");
    return;
  }

  IntPoint start = [sdk convertWGS84ToKATECWithLongitude:startLng latitude:startLat];
  IntPoint goal = [sdk convertWGS84ToKATECWithLongitude:goalLng latitude:goalLat];

  KNPOI *startPOI = [[KNPOI alloc] initWithName:@"출발" x:start.x y:start.y];
  KNPOI *goalPOI = [[KNPOI alloc] initWithName:goalName x:goal.x y:goal.y];

  [sdk makeTripWithStart:startPOI
                    goal:goalPOI
                    vias:[KNSDKBridge viasFromFlat:flatVias]
              completion:^(KNError *_Nullable tripError, KNTrip *_Nullable trip) {
                dispatch_async(dispatch_get_main_queue(), ^{
                if (!IsLocationGenerationCurrent(generation)) { onError(nil,@"위치 이용이 중지됐다"); return; }
                if (tripError != nil || trip == nil) {
                  onError([KNSDKBridge errorCodeOf:tripError],
                          tripError ? (tripError.msg ?: @"경로 생성 실패") : @"경로를 만들지 못했다");
                  return;
                }

                trip.routeConfig = [[KNRouteConfiguration alloc] initWithCarType:KNCarType_Bike];
                [trip routeWithPriority:(KNRoutePriority)priority
                           avoidOptions:KNRouteAvoidOption_None
                             completion:^(KNError *_Nullable routeError,
                                          NSArray<KNRoute *> *_Nullable routes) {
                               dispatch_async(dispatch_get_main_queue(), ^{
                               if (!IsLocationGenerationCurrent(generation)) { onError(nil,@"위치 이용이 중지됐다"); return; }
                               if (routeError != nil || routes.count == 0) {
                                 onError([KNSDKBridge errorCodeOf:routeError],
                                         routeError ? (routeError.msg ?: @"경로 탐색 실패")
                                                    : @"경로를 찾지 못했다");
                                 return;
                               }
                               [self presentWithTrip:trip
                                          generation:generation
                                            priority:(KNRoutePriority)priority
                                             preview:preview
                                           onStarted:onStarted
                                              onMenu:onMenu
                                            onPoiTap:onPoiTap
                                           onArrival:onArrival
                                           onDismiss:onDismiss
                                             onError:onError];
                               });
                             }];
                });
              }];
}

+ (void)presentWithTrip:(KNTrip *)trip
             generation:(NSUInteger)generation
               priority:(KNRoutePriority)priority
                preview:(BOOL)preview
              onStarted:(void (^_Nullable)(void))onStarted
                 onMenu:(void (^_Nullable)(NSInteger))onMenu
               onPoiTap:(void (^_Nullable)(NSString *, double, double))onPoiTap
              onArrival:(void (^_Nullable)(NSDictionary *))onArrival
             onDismiss:(void (^)(void))onDismiss
                onError:(void (^)(NSString *_Nullable, NSString *))onError {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (gActiveNavi && !gActiveNavi.finished) { onError(@"ACTIVE_GUIDE",@"진행 중인 길안내가 있어요. 먼저 종료해 주세요."); return; }
    if (!IsLocationGenerationCurrent(generation)) { onError(nil,@"위치 이용이 중지됐다"); return; }
    if (![KNNaviRouteView isSDKModeBoundaryCompatible]) {
      onError(nil, @"길안내 화면을 준비할 수 없어요. 앱 업데이트 후 다시 시도해 주세요.");
      return;
    }
    UIViewController *top = [self keyWindow].rootViewController;
    while (top.presentedViewController != nil) top = top.presentedViewController;
    if (top == nil) {
      onError(nil, @"화면을 띄울 뷰 컨트롤러를 찾지 못했다");
      return;
    }

    KNNaviViewController *vc = [[KNNaviViewController alloc] init];
    vc.trip = trip;
    vc.priority = priority;
    vc.preview = preview;
    vc.onStarted = onStarted;
    vc.onMenu = onMenu;
    vc.onPoiTap = onPoiTap;
    vc.onArrival = onArrival;
    vc.onDismiss = onDismiss;
    // FullScreen 은 밑 화면을 뷰 계층에서 떼어내 네비게이션 전환(지도로 미리
    // 이동)이 걷힐 때까지 보류된다 — 그래서 닫힐 때 이전 화면이 비쳤다(실측).
    // OverFullScreen 은 밑을 계층에 유지해 덮인 동안 전환이 실제로 실행된다.
    vc.modalPresentationStyle = UIModalPresentationOverFullScreen;
    [top presentViewController:vc animated:YES completion:nil];
  });
}

+ (NSDictionary *)pointSnapshot:(KNPOI *)poi {
  DoublePoint point = [[KNSDK sharedInstance] convertKATECToWGS84WithX:poi.pos.x y:poi.pos.y];
  return @{@"longitude":@(point.x), @"latitude":@(point.y), @"name":poi.name ?: @"경유지"};
}

+ (void)openGuidePreview:(void (^)(NSDictionary *, NSString *))completion {
  if (!KNNaviRouteEditingEnabled) { completion(nil, @"이번 버전에서는 안내 중 경로 변경을 지원하지 않아요."); return; }
  [self openGuidePreviewForController:gActiveNavi
                                 gps:[gActiveNavi latestManualRerouteGPS]
                          completion:completion];
}

+ (void)openGuidePreviewForController:(KNNaviViewController *)vc gps:(KNGPSData *)gps
                          completion:(void (^)(NSDictionary *, NSString *))completion {
  if (!vc || vc.preview || vc.finished || vc.suspended || vc.changingDestination || ![KNSDKBridge isLocationUseAllowed]) {
    completion(nil, @"현재 길안내에서 미리보기를 열 수 없어요."); return;
  }
  if (!vc.trip.goal) { completion(nil, @"안내 목적지를 확인할 수 없어요."); return; }
  // 편집 진입과 실제 안내 적용을 분리한다. resumeGuide의 최신 GPS 검사는 유지한다.
  id startPoint = NSNull.null;
  if ([vc usableManualRerouteGPS:gps]) {
    DoublePoint start = [[KNSDK sharedInstance] convertKATECToWGS84WithX:(SInt32)gps.pos.x y:(SInt32)gps.pos.y];
    startPoint = @{@"longitude":@(start.x), @"latitude":@(start.y)};
  }
  NSArray *passed = (vc.guidance.trip ?: vc.trip).passedVias ?: @[];
  NSMutableArray *remainingPoints = [NSMutableArray new];
  NSArray *passedPoints = [self passedPointsFor:vc];
  NSMutableArray *unconsumed = [passed mutableCopy];
  for (KNPOI *poi in vc.trip.vias) {
    NSUInteger found = [unconsumed indexOfObjectPassingTest:^BOOL(KNPOI *done, NSUInteger index, BOOL *stop) {
      return poi == done || (poi.pos.x == done.pos.x && poi.pos.y == done.pos.y);
    }];
    if (found != NSNotFound) [unconsumed removeObjectAtIndex:found];
    else [remainingPoints addObject:[self pointSnapshot:poi]];
  }
  vc.previewRemainingVias = [remainingPoints copy];
  vc.previewPassedVias = passedPoints;
  [vc pauseFooterPosition];
  vc.suspended = YES; vc.previewToken = ++gPreviewToken;
  vc.routeRequestGeneration++; [vc.arrivalRecovery requestFailed];
  gSuspendedNavi = vc;
  NSDictionary *snapshot = @{@"token":@(vc.previewToken), @"start":startPoint,
      @"goal":[self pointSnapshot:vc.trip.goal], @"vias":remainingPoints, @"passedVias":passedPoints, @"priority":@(vc.priority)};
  [vc dismissViewControllerAnimated:YES completion:^{ completion(snapshot,nil); }];
}

+ (void)returnToGuide:(NSInteger)token completion:(void (^)(BOOL))completion {
  KNNaviViewController *vc = gSuspendedNavi;
  if (!vc || vc.previewToken != token || vc.finished || vc.resumeCommitting || ![KNSDKBridge isLocationUseAllowed]) { completion(NO); return; }
  if (!vc.suspended) { completion(vc.presentingViewController != nil); return; }
  UIViewController *top = [self keyWindow].rootViewController;
  while (top.presentedViewController) top = top.presentedViewController;
  if (!top.viewIfLoaded.window || top.isBeingDismissed || top.isBeingPresented) { completion(NO); return; }
  vc.routeRequestGeneration++;
  [vc.manualPositionRequest cancel]; vc.manualPositionRequest = nil;
  if (vc.onResumeError) vc.onResumeError(ManualRerouteError(@"CANCELLED", nil, @"경로 선택을 취소했어요."));
  vc.onResumeError = nil; vc.onStarted = nil; vc.changingDestination = NO; vc.pendingDestinationTrip = nil;
  vc.suspended = NO;
  [top presentViewController:vc animated:YES completion:^{
    if (gSuspendedNavi == vc) gSuspendedNavi = nil;
    completion(YES);
  }];
}

+ (NSArray<NSDictionary *> *)passedPointsFor:(KNNaviViewController *)vc {
  NSMutableArray *points = [NSMutableArray arrayWithArray:vc.completedViaPoints ?: @[]];
  for (KNPOI *poi in (vc.guidance.trip ?: vc.trip).passedVias) [points addObject:[self pointSnapshot:poi]];
  return points;
}

+ (void)prepareResumeTripFor:(KNNaviViewController *)vc generation:(NSUInteger)generation
                    origin:(KNPOI *)origin goal:(KNPOI *)goal vias:(NSArray<NSNumber *> *)vias
                completion:(void (^)(KNTrip *, NSArray<NSNumber *> *, NSError *))completion {
  NSArray *filtered = KNNaviRemainingVias(vias, vc.previewRemainingVias, KNNaviNewPassedVias(vc.previewPassedVias,[self passedPointsFor:vc]));
  [[KNSDK sharedInstance] makeTripWithStart:origin goal:goal vias:[KNSDKBridge viasFromFlat:filtered] completion:^(KNError *error, KNTrip *trip) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (vc.finished || !vc.suspended || generation != vc.routeRequestGeneration || ![KNSDKBridge isLocationUseAllowed]) return;
      if (error || !trip) { completion(nil,filtered,ManualRerouteError(@"TRIP", error, @"경로를 만들지 못했어요.")); return; }
      NSArray *latest = KNNaviRemainingVias(vias, vc.previewRemainingVias, KNNaviNewPassedVias(vc.previewPassedVias,[self passedPointsFor:vc]));
      if (![latest isEqual:filtered]) {
        // 경로 계산 중 통과한 경유지까지 제외한다. 배열이 줄어드는 경우만 재시도한다.
        [self prepareResumeTripFor:vc generation:generation origin:origin goal:goal vias:vias completion:completion]; return;
      }
      completion(trip,filtered,nil);
    });
  }];
}

+ (void)resumeGuide:(NSInteger)token toLng:(double)lng lat:(double)lat name:(NSString *)name
              vias:(NSArray<NSNumber *> *)vias priority:(NSInteger)priority completion:(void (^)(NSDictionary *, NSError *))completion {
  if (!KNNaviRouteEditingEnabled) { completion(nil, ManualRerouteError(@"UNAVAILABLE", nil, @"이번 버전에서는 안내 중 경로 변경을 지원하지 않아요.")); return; }
  KNNaviViewController *vc = gSuspendedNavi;
  if (!vc || vc.previewToken != token || !vc.suspended || vc.finished || vc.changingDestination || ![KNSDKBridge isLocationUseAllowed]) {
    completion(nil, ManualRerouteError(@"STATE", nil, @"길안내 상태가 변경됐어요.")); return;
  }
  KNSDK *sdk = [KNSDK sharedInstance];
  NSUInteger generation = ++vc.routeRequestGeneration;
  vc.changingDestination = YES;
  __block BOOL completed = NO;
  void (^done)(NSDictionary *, NSError *) = ^(NSDictionary *result, NSError *error) {
    if (completed) return; completed = YES;
    [vc.manualPositionRequest cancel]; vc.manualPositionRequest = nil;
    completion(result, error);
  };
  vc.onResumeError = ^(NSError *error) { done(nil,error); };
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 25 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    if (!completed && !vc.finished && !vc.resumeCommitting && generation == vc.routeRequestGeneration) {
      vc.routeRequestGeneration++; vc.changingDestination = NO; vc.pendingDestinationTrip = nil;
      vc.onStarted = nil; vc.onResumeError = nil; done(nil,ManualRerouteError(@"TIMEOUT", nil, @"경로 변경 시간이 초과됐어요. 다시 시도해 주세요."));
    }
  });
  void (^applyFromPosition)(IntPoint) = ^(IntPoint start) {
    if (completed || vc.finished || !vc.suspended || generation != vc.routeRequestGeneration || ![KNSDKBridge isLocationUseAllowed]) return;
    KNPOI *origin = [[KNPOI alloc] initWithName:@"현재 위치" pos:start];
    IntPoint pos = [sdk convertWGS84ToKATECWithLongitude:lng latitude:lat];
    KNPOI *goal = [[KNPOI alloc] initWithName:name pos:pos];
    [self prepareResumeTripFor:vc generation:generation origin:origin goal:goal vias:vias completion:^(KNTrip *trip, NSArray<NSNumber *> *appliedVias, NSError *error) {
      if (vc.finished || !vc.suspended || generation != vc.routeRequestGeneration || ![KNSDKBridge isLocationUseAllowed]) return;
      if (error || !trip) { vc.changingDestination = NO; vc.onResumeError = nil; done(nil,error ?: ManualRerouteError(@"TRIP", nil, @"경로를 만들지 못했어요.")); return; }
      trip.routeConfig = [[KNRouteConfiguration alloc] initWithCarType:KNCarType_Bike];
      NSArray *passedPoints = [self passedPointsFor:vc];
      vc.resumeCommitting = YES;
      vc.pendingDestinationTrip = trip; vc.pendingDestinationPriority = (KNRoutePriority)priority;
      vc.onStarted = ^{
        if (vc.finished || generation != vc.routeRequestGeneration || !vc.suspended) return;
        vc.completedViaPoints = passedPoints;
        done(@{@"vias":appliedVias, @"passedVias":passedPoints},nil);
      };
      [vc.naviView guideNewDestinations:trip priority:(KNRoutePriority)priority avoidOptions:KNRouteAvoidOption_None];
    }];
  };
  // SDK 위치는 그대로 사용한다. 없으면 기존 동의/권한 안에서 정확한 최근 시스템 위치를 확보한다.
  KNGPSData *gps = [vc latestManualRerouteGPS];
  if ([vc usableManualRerouteGPS:gps]) {
    applyFromPosition(IntPointMakeWithDoublePoint(gps.pos)); return;
  }
  [vc requestManualPosition:^(CLLocation *location) {
    if (completed || vc.finished || !vc.suspended || generation != vc.routeRequestGeneration || ![KNSDKBridge isLocationUseAllowed]) return;
    if (!location) {
      vc.changingDestination = NO; vc.onResumeError = nil;
      done(nil,ManualRerouteError(@"GPS", nil, @"현재 위치를 확인한 뒤 다시 시도해 주세요.")); return;
    }
    applyFromPosition([sdk convertWGS84ToKATECWithLongitude:location.coordinate.longitude latitude:location.coordinate.latitude]);
  }];
}

+ (void)showOptionsWithTitle:(NSString *)title
                      labels:(NSArray<NSString *> *)labels
                  completion:(void (^)(NSInteger))completion {
  dispatch_async(dispatch_get_main_queue(), ^{
    KNNaviViewController *navi = gActiveNavi;
    if (navi == nil) {
      completion(-1);
      return;
    }
    UIAlertController *sheet =
        [UIAlertController alertControllerWithTitle:title
                                            message:nil
                                     preferredStyle:UIAlertControllerStyleActionSheet];
    [labels enumerateObjectsUsingBlock:^(NSString *label, NSUInteger idx, BOOL *stop) {
      [sheet addAction:[UIAlertAction actionWithTitle:label
                                                style:UIAlertActionStyleDefault
                                              handler:^(UIAlertAction *action) {
                                                completion((NSInteger)idx);
                                              }]];
    }];
    [sheet addAction:[UIAlertAction actionWithTitle:@"취소"
                                              style:UIAlertActionStyleCancel
                                            handler:^(UIAlertAction *action) {
                                              completion(-1);
                                            }]];
    [navi presentViewController:sheet animated:YES completion:nil];
  });
}

+ (void)showHazardOptions:(NSArray<NSDictionary<NSString *,NSString *> *> *)options completion:(void (^)(NSInteger))completion {
  if (!KNNaviGuideMenuActionsEnabled) { completion(-1); return; }
  KNNaviViewController *navi = gActiveNavi;
  if (!navi || navi.finished || navi.suspended || ![KNSDKBridge isLocationUseAllowed] ||
      navi.presentedViewController || navi.hazardSheet || !navi.view.window || options.count == 0 || options.count > 12) {
    completion(-1); return;
  }
  for (NSDictionary *option in options) {
    if (![option isKindOfClass:NSDictionary.class] || ![option[@"key"] isKindOfClass:NSString.class] ||
        ![option[@"label"] isKindOfClass:NSString.class] || ![option[@"label"] length]) { completion(-1); return; }
  }
  __weak KNNaviViewController *weakNavi = navi;
  KNNaviHazardSheet *sheet = [[KNNaviHazardSheet alloc] initWithOptions:options completion:^(NSInteger picked) {
    weakNavi.hazardSheet = nil;
    completion(picked);
  }];
  navi.hazardSheet = sheet;
  [navi presentViewController:sheet animated:NO completion:nil];
}

// 위험 제보의 기능 플래그와 분리해 POI 선택만 연다.
+ (void)showPoiOptionsWithTitle:(NSString *)title canAddVia:(BOOL)canAddVia completion:(void (^)(NSInteger))completion {
  KNNaviViewController *navi = gActiveNavi;
  if (!KNNaviRouteEditingEnabled || ![navi canRefreshFooterPosition] || navi.changingDestination ||
      navi.presentedViewController || navi.hazardSheet) { completion(-1); return; }
  NSMutableArray *options = [NSMutableArray arrayWithObject:@{@"key":@"goal", @"label":@"목적지로 설정", @"symbol":@"mappin"}];
  KNTrip *trip = navi.guidance.trip ?: navi.trip;
  BOOL viaAvailable = canAddVia && trip.vias.count <= 3 && MAX(0,(NSInteger)trip.vias.count-(NSInteger)trip.passedVias.count) < 3;
  if (viaAvailable) [options addObject:@{@"key":@"via", @"label":@"경유지로 추가", @"symbol":@"plus.circle"}];
  NSString *name = title.length ? [title substringToIndex:MIN(title.length,200)] : @"선택한 장소";
  __weak KNNaviViewController *weakNavi = navi;
  KNNaviHazardSheet *sheet = [[KNNaviHazardSheet alloc] initWithTitle:name detail:@"미리보기에서 확인 후 안내를 변경해요" options:options completion:^(NSInteger picked) {
    weakNavi.hazardSheet = nil; completion(picked);
  }];
  navi.hazardSheet = sheet;
  [navi presentViewController:sheet animated:NO completion:nil];
}

+ (NSDictionary *)guideGasPriceContext {
  KNNaviViewController *vc=gActiveNavi;
  return [vc canRefreshFooterPosition] ? vc.gasPriceLayer.context : nil;
}
+ (void)updateGuideGasPriceMarkers:(NSString *)json {
  NSData *data=[json dataUsingEncoding:NSUTF8StringEncoding];
  if (!data || data.length>100000) return;
  NSDictionary *response=[NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  if ([response isKindOfClass:NSDictionary.class]) [gActiveNavi.gasPriceLayer applyResponse:response];
}

+ (NSDictionary *)guideGasContext {
  if (!KNNaviGuideMenuActionsEnabled) return nil;
  KNNaviViewController *vc = gActiveNavi;
  if (!vc.gasLayer.context || vc.finished || vc.suspended || ![KNSDKBridge isLocationUseAllowed]) return nil;
  NSMutableDictionary *context = [vc.gasLayer.context mutableCopy];
  KNTrip *trip = vc.guidance.trip ?: vc.trip;
  context[@"viaCount"] = @(MAX(0,(NSInteger)trip.vias.count - (NSInteger)trip.passedVias.count));
  return context;
}
+ (NSDictionary *)takeGuideGasSelection {
  if (!KNNaviGuideMenuActionsEnabled) return nil;
  return [gActiveNavi.gasLayer takeSelection];
}
+ (void)updateGuideGasStations:(NSString *)json {
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  if (!data || data.length > 100000) return;
  NSDictionary *response = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  if ([response isKindOfClass:NSDictionary.class]) [gActiveNavi.gasLayer applyResponse:response];
}

+ (void)showToast:(NSString *)message {
  KNNaviViewController *navi = gActiveNavi;
  if (!navi || navi.finished) return;
  if (navi.bottomPanel.ready) [navi.bottomPanel showToast:message];
  else [self showNotice:message];
}

+ (void)showNotice:(NSString *)message {
  dispatch_async(dispatch_get_main_queue(), ^{
    KNNaviViewController *navi = gActiveNavi;
    if (navi == nil) return;
    UIAlertController *alert = [UIAlertController alertControllerWithTitle:nil
                                                                   message:message
                                                            preferredStyle:UIAlertControllerStyleAlert];
    [navi presentViewController:alert animated:YES completion:nil];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.8 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
                     [alert dismissViewControllerAnimated:YES completion:nil];
                   });
  });
}

+ (void)changeDestinationToLng:(double)lng
                           lat:(double)lat
                          name:(NSString *)name
                      priority:(NSInteger)priority
                    completion:(void (^)(NSString *_Nullable, NSString *_Nullable))completion {
  if (!KNNaviGuideMenuActionsEnabled) { completion(@"UNAVAILABLE", @"이번 버전에서는 안내 중 경로 변경을 지원하지 않아요."); return; }
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![KNSDKBridge isLocationUseAllowed]) { completion(nil,@"위치 이용이 중지됐다"); return; }
    KNNaviViewController *navi = gActiveNavi;
    KNSDK *sdk = [KNSDK sharedInstance];
    if (navi == nil || navi.naviView == nil || sdk == nil) {
      completion(nil, @"안내 화면이 없다");
      return;
    }

    NSUInteger generation = ++navi.routeRequestGeneration;
    [navi.arrivalRecovery requestFailed];

    // 출발점은 현 위치 — SDK 가 KATEC 으로 들고 있어 변환이 필요 없다
    KNGPSData *gps = [sdk sharedGpsManager].lastValidGpsData ?: [sdk sharedGpsManager].recentGpsData;
    if (gps == nil) {
      completion(nil, @"현재 위치를 아직 못 잡았다");
      return;
    }
    navi.changingDestination = YES;
    navi.arrivalRetryButton.enabled = NO;
    IntPoint startPos = IntPointMakeWithDoublePoint(gps.pos);
    KNPOI *startPOI = [[KNPOI alloc] initWithName:@"출발" x:startPos.x y:startPos.y];

    IntPoint goalPos = [sdk convertWGS84ToKATECWithLongitude:lng latitude:lat];
    KNPOI *goalPOI = [[KNPOI alloc] initWithName:name x:goalPos.x y:goalPos.y];

    [sdk makeTripWithStart:startPOI
                      goal:goalPOI
                      vias:nil
                completion:^(KNError *_Nullable error, KNTrip *_Nullable trip) {
                  dispatch_async(dispatch_get_main_queue(), ^{
                    if (![KNSDKBridge isLocationUseAllowed] || navi != gActiveNavi || navi.finished ||
                        generation != navi.routeRequestGeneration) {
                      if (generation == navi.routeRequestGeneration) navi.changingDestination = NO;
                      completion(nil,@"길안내 상태가 변경됐어요"); return;
                    }
                    if (error != nil || trip == nil) {
                      navi.changingDestination = NO;
                      if (navi.arrivalRecovery.waiting) {
                        [navi showArrivalUIWithMessage:@"목적지를 바꾸지 못했어요.\n기존 목적지를 유지하고 있어요."];
                      }
                      completion([KNSDKBridge errorCodeOf:error],
                                 error ? (error.msg ?: @"경로 생성 실패") : @"경로를 만들지 못했다");
                      return;
                    }
                    trip.routeConfig = [[KNRouteConfiguration alloc] initWithCarType:KNCarType_Bike];
                    navi.pendingDestinationTrip = trip;
                    navi.pendingDestinationPriority = (KNRoutePriority)priority;
                    [navi.naviView guideNewDestinations:trip
                                               priority:(KNRoutePriority)priority
                                           avoidOptions:KNRouteAvoidOption_None];
                    completion(nil, nil);
                  });
                }];
  });
}

@end
