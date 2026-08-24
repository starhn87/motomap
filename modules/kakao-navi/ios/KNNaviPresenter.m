#import "KNNaviPresenter.h"
#import "KNNaviTheme.h"
#import "KNSDKBridge.h"
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNNaviView.h>
#import <KNSDK/KNMapView.h>
#import <objc/runtime.h>
#import <stdlib.h>
#import <string.h>

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
@end

// 안내 화면 위 상호작용(액션시트·알림·목적지 변경)을 모듈 함수가 쓸 수 있도록
// 살아 있는 컨트롤러를 하나 기억한다.
static __weak KNNaviViewController *gActiveNavi = nil;

@implementation KNNaviViewController

- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = UIColor.blackColor;
  InstallMotoMapAccessibilityGuard();
  InstallMotoMapInfoCharacterGuard();

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

  KNNaviView *naviView = [[KNNaviView alloc] initWithGuidance:guidance
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

  // 모토맵 메뉴 버튼 — 커스텀 슬롯이 하나뿐이라(실측) 버튼 하나로 합치고,
  // 위험 제보/근처 장소 분기는 JS 가 1차 액션시트로 가른다.
  UIImage *menuIcon = [UIImage systemImageNamed:@"mappin.and.ellipse"];
  KNCustomBottomMenuItem *motoItem =
      [[KNCustomBottomMenuItem alloc] initWithId:100
                                            name:@"모토맵"
                                            icon:menuIcon
                                       nightIcon:menuIcon
                                           style:MENU_BUTTON_TOUCH
                                        toggleOn:NO];
  [naviView.menuView setCustomMenu:@[ motoItem ]];
  [naviView.menuView useGuideCancel:NO];

  // 상단 안내 배너 색 — SDK 가 정식으로 여는 커스터마이즈 지점이다(1차·2차 RG).
  // 기본 파랑은 흰 글자와의 명도 대비가 5:1 남짓이라 햇빛 아래에서 흐려진다.
  // 앱의 텍스트 색(#18181B)이면 17:1 가까이 올라가고, 안내 화면만 카카오 파랑으로
  // 튀지 않아 앱을 거쳐 들어온 화면처럼 이어진다.
  // 야간은 더 어둡게(#0A0A0A) — 주간 색 그대로면 어두운 지도와 경계가 뭉개진다.
  [naviView.curDirView
      setBackgroundColor:[UIColor colorWithRed:0x18 / 255.0
                                         green:0x18 / 255.0
                                          blue:0x1B / 255.0
                                         alpha:1.0]
              nightColor:[UIColor colorWithRed:0x0A / 255.0
                                         green:0x0A / 255.0
                                          blue:0x0A / 255.0
                                         alpha:1.0]];

  // 2차 안내(다음 회전)도 같은 계열로. 다만 1차와 똑같이 칠하면 두 바가 한
  // 덩어리로 뭉개져 "지금 할 것"과 "그다음"이 안 갈린다 — 한 단계 밝은 회색으로
  // 층을 남긴다(앱의 surfaceMuted 다크값 #2A2A2A 계열).
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
    [NSLayoutConstraint activateConstraints:@[
      [hazardButton.leadingAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.leadingAnchor
                                                 constant:12],
      // 하단 정보 바(bottomView) 위에 매단다 — 바 높이가 상태에 따라 달라져도 따라온다
      [hazardButton.bottomAnchor constraintEqualToAnchor:naviView.bottomView.topAnchor
                                                constant:-12],
      [hazardButton.widthAnchor constraintEqualToConstant:84],
      [hazardButton.heightAnchor constraintEqualToConstant:36],
    ]];
  }

  gActiveNavi = self;
}

- (void)hazardTapped {
  if (self.onMenu != nil) self.onMenu(101);
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
}

// 지도 POI(상호·건물) 탭 — 이름·KATEC 좌표가 온다. WGS84 로 바꿔 JS 로 넘긴다.
- (void)mapView:(KNMapView *)aMapView
 onSingleTapped:(SInt64)aPOIId
        poiName:(NSArray *)aPOIName
     coordinate:(FloatPoint)aCoordinate {
  if (self.onPoiTap == nil) return;
  KNSDK *sdk = [KNSDK sharedInstance];
  if (sdk == nil) return;
  DoublePoint wgs = [sdk convertKATECToWGS84WithX:(SInt32)lround(aCoordinate.x)
                                                y:(SInt32)lround(aCoordinate.y)];
  NSString *name = [aPOIName componentsJoinedByString:@" "] ?: @"";
  self.onPoiTap(name, wgs.x, wgs.y);  // (경도, 위도)
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
  [self attachPoiListener];
  [self.naviView resumeView];

  [self applyCarTheme];

  // 스스로 달리는 화면을 실주행으로 오해하지 않게 한 번 알린다
  if (self.preview && !self.previewNoticed) {
    self.previewNoticed = YES;
    [KNNaviPresenter showNotice:@"정한 출발지에서 경로를 미리 보여드려요. 실제 주행 안내가 아니에요."];
  }
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
}

#pragma mark - KNNaviView_StateDelegate (메뉴 탭 외에는 관심 없음)

- (void)naviViewDidMenuItemWithId:(int)aId toggle:(BOOL)aToggle {
  if (self.onMenu != nil) self.onMenu(aId);
}

- (void)naviViewDidUpdateSndVolume:(float)aVolume {
}

- (void)naviViewDidUpdateUseDarkMode:(BOOL)aDarkMode {
}

- (void)naviViewDidUpdateMapCameraMode:(MapViewCameraMode)aMapViewCameraMode {
}

- (void)naviViewScreenState:(KNNaviViewState)aKNNaviViewState {
  // 도착 뒤 안전운행 화면과 그 지도 이동 상태만 보조 복구한다. 모든 화면 상태에서
  // renewTheme 를 호출하면 안내 중 팬·전체경로 전환까지 불필요하게 다시 그린다.
  if (aKNNaviViewState == SafetyNormal || aKNNaviViewState == SafetyTouch) {
    [self applyCarTheme];
  }
}

- (void)naviViewPopupOpenCheck:(BOOL)aOpen {
}

- (void)naviViewIsArrival:(BOOL)aIsArrival {
}

#pragma mark - KNGuidance 델리게이트 → naviView 중계

- (void)guidanceGuideStarted:(KNGuidance *)aGuidance {
  [self.naviView guidanceGuideStarted:aGuidance];
  [self applyCarTheme];
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

// 목적지에 닿아 안내 엔진이 끝나도 화면은 그대로 둔다 — 주행 중에 앱이 스스로
// 화면을 걷어버리는 게 위험하다는 판단(사용자). 끝내는 건 라이더가 SDK 메뉴의
// 안내 종료로 직접 한다(그건 naviViewGuideEnded 로 들어온다).
- (void)guidanceGuideEnded:(KNGuidance *)aGuidance {
  [self.naviView guidanceGuideEnded:aGuidance isShowDriveResultDialog:NO];
  // 종료 뒤 화면은 닫히지 않고 안전운행으로 전환된다. 그 전환이 자차 타입을
  // 다시 고르는 핵심 회귀 지점이라 guard 와 별개로 한 번 더 복구한다.
  [self applyCarTheme];
}

- (void)guidance:(KNGuidance *)aGuidance
    didUpdateRoutes:(NSArray<KNRoute *> *)aRoutes
     multiRouteInfo:(KNMultiRouteInfo *)aMultiRouteInfo {
  [self.naviView guidance:aGuidance didUpdateRoutes:aRoutes multiRouteInfo:aMultiRouteInfo];
}

- (void)guidance:(KNGuidance *)aGuidance didUpdateIndoorRoute:(KNRoute *)aRoute {
  [self.naviView guidance:aGuidance didUpdateIndoorRoute:aRoute];
}

- (void)guidance:(KNGuidance *)aGuidance didUpdateLocation:(KNGuide_Location *)aLocationGuide {
  [self.naviView guidance:aGuidance didUpdateLocation:aLocationGuide];

  // SDK 가 위치를 처음 잡을 때 자차를 기본 아이콘으로 되돌린다 — 한 번 다시 씌운다.
  // (원래 도착 안내 함수 안에 묻혀 있어서 목적지 300m 안에 들어와야 실행됐다.)
  if (!self.carThemeApplied) {
    self.carThemeApplied = YES;
    [self applyCarTheme];
  }
}

- (void)guidance:(KNGuidance *)aGuidance didUpdateRouteGuide:(KNGuide_Route *)aRouteGuide {
  [self.naviView guidance:aGuidance didUpdateRouteGuide:aRouteGuide];
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
  // 안내 시작 멘트는 생략한다(사용자 결정) — 나머지 음성은 그대로 재생.
  if (aVoiceGuide.voiceCode == KNVoiceCode_StartGuide) return NO;
  return YES;
}

- (void)guidance:(KNGuidance *)aGuidance willPlayVoiceGuide:(KNGuide_Voice *)aVoiceGuide {
}

- (void)guidance:(KNGuidance *)aGuidance didFinishPlayVoiceGuide:(KNGuide_Voice *)aVoiceGuide {
}

- (void)finish {
  [self.guidance stop];
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
  [self dismissViewControllerAnimated:YES completion:nil];
}

@end

@implementation KNNaviPresenter

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
             onDismiss:(void (^)(void))onDismiss
               onError:(void (^)(NSString *_Nullable, NSString *))onError {
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
                               if (routeError != nil || routes.count == 0) {
                                 onError([KNSDKBridge errorCodeOf:routeError],
                                         routeError ? (routeError.msg ?: @"경로 탐색 실패")
                                                    : @"경로를 찾지 못했다");
                                 return;
                               }
                               [self presentWithTrip:trip
                                            priority:(KNRoutePriority)priority
                                             preview:preview
                                           onStarted:onStarted
                                              onMenu:onMenu
                                            onPoiTap:onPoiTap
                                           onDismiss:onDismiss
                                             onError:onError];
                             }];
              }];
}

+ (void)presentWithTrip:(KNTrip *)trip
               priority:(KNRoutePriority)priority
                preview:(BOOL)preview
              onStarted:(void (^_Nullable)(void))onStarted
                 onMenu:(void (^_Nullable)(NSInteger))onMenu
               onPoiTap:(void (^_Nullable)(NSString *, double, double))onPoiTap
              onDismiss:(void (^)(void))onDismiss
                onError:(void (^)(NSString *_Nullable, NSString *))onError {
  dispatch_async(dispatch_get_main_queue(), ^{
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
    vc.onDismiss = onDismiss;
    // FullScreen 은 밑 화면을 뷰 계층에서 떼어내 네비게이션 전환(지도로 미리
    // 이동)이 걷힐 때까지 보류된다 — 그래서 닫힐 때 이전 화면이 비쳤다(실측).
    // OverFullScreen 은 밑을 계층에 유지해 덮인 동안 전환이 실제로 실행된다.
    vc.modalPresentationStyle = UIModalPresentationOverFullScreen;
    [top presentViewController:vc animated:YES completion:nil];
  });
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
  dispatch_async(dispatch_get_main_queue(), ^{
    KNNaviViewController *navi = gActiveNavi;
    KNSDK *sdk = [KNSDK sharedInstance];
    if (navi == nil || navi.naviView == nil || sdk == nil) {
      completion(nil, @"안내 화면이 없다");
      return;
    }

    // 출발점은 현 위치 — SDK 가 KATEC 으로 들고 있어 변환이 필요 없다
    KNGPSData *gps = [sdk sharedGpsManager].lastValidGpsData ?: [sdk sharedGpsManager].recentGpsData;
    if (gps == nil) {
      completion(nil, @"현재 위치를 아직 못 잡았다");
      return;
    }
    IntPoint startPos = IntPointMakeWithDoublePoint(gps.pos);
    KNPOI *startPOI = [[KNPOI alloc] initWithName:@"출발" x:startPos.x y:startPos.y];

    IntPoint goalPos = [sdk convertWGS84ToKATECWithLongitude:lng latitude:lat];
    KNPOI *goalPOI = [[KNPOI alloc] initWithName:name x:goalPos.x y:goalPos.y];

    [sdk makeTripWithStart:startPOI
                      goal:goalPOI
                      vias:nil
                completion:^(KNError *_Nullable error, KNTrip *_Nullable trip) {
                  dispatch_async(dispatch_get_main_queue(), ^{
                    if (error != nil || trip == nil) {
                      completion([KNSDKBridge errorCodeOf:error],
                                 error ? (error.msg ?: @"경로 생성 실패") : @"경로를 만들지 못했다");
                      return;
                    }
                    trip.routeConfig = [[KNRouteConfiguration alloc] initWithCarType:KNCarType_Bike];
                    [navi.naviView guideNewDestinations:trip
                                               priority:(KNRoutePriority)priority
                                           avoidOptions:KNRouteAvoidOption_None];
                    completion(nil, nil);
                  });
                }];
  });
}

@end
