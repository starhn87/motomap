#import "KNNaviHazardSheet.h"
#import <math.h>

@interface KNNaviHazardSheet ()
@property(nonatomic, copy) NSString *headingTitle;
@property(nonatomic, copy) NSString *headingDetail;
@property(nonatomic, copy) NSArray<NSDictionary<NSString *, NSString *> *> *options;
@property(nonatomic, copy) void (^onChoice)(NSInteger);
@property(nonatomic, strong) UIView *sheet;
@property(nonatomic, strong) UIControl *backdrop;
@property(nonatomic, strong) NSLayoutConstraint *heightConstraint;
@property(nonatomic, strong) UIStackView *grid;
@property(nonatomic, strong) UIView *header;
@property(nonatomic, strong) UIButton *cancelButton;
@property(nonatomic, copy) void (^afterClose)(void);
@property(nonatomic) NSInteger selectedIndex;
@property(nonatomic) BOOL closed;
@property(nonatomic) BOOL closing;
@property(nonatomic) BOOL appeared;
@end

@implementation KNNaviHazardSheet
- (instancetype)initWithOptions:(NSArray<NSDictionary<NSString *,NSString *> *> *)options completion:(void (^)(NSInteger))completion {
  return [self initWithTitle:@"위험 제보" detail:@"유형을 선택하면 바로 제보돼요" options:options completion:completion];
}
- (instancetype)initWithTitle:(NSString *)title detail:(NSString *)detail options:(NSArray<NSDictionary<NSString *,NSString *> *> *)options completion:(void (^)(NSInteger))completion {
  if ((self = [super initWithNibName:nil bundle:nil])) {
    _headingTitle = [title copy]; _headingDetail = [detail copy];
    _options = [options copy]; _onChoice = [completion copy];
    self.modalPresentationStyle = UIModalPresentationOverFullScreen;
  }
  return self;
}
- (UIColor *)colorWithLight:(CGFloat)light dark:(CGFloat)dark {
  return [UIColor colorWithDynamicProvider:^UIColor *(UITraitCollection *trait) {
    return [UIColor colorWithWhite:trait.userInterfaceStyle == UIUserInterfaceStyleDark ? dark : light alpha:1];
  }];
}
// navigation-bottom.html의 goalIcon과 같은24단위 경로·선2·중심점2.5를 사용한다.
- (UIImage *)footerDestinationIcon {
  UIGraphicsImageRenderer *renderer=[[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(21,21)];
  UIImage *image=[renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
    CGContextScaleCTM(context.CGContext,21.0/24,21.0/24);
    [UIColor.blackColor setStroke];[UIColor.blackColor setFill];
    UIBezierPath *pin=[UIBezierPath bezierPath];[pin moveToPoint:CGPointMake(19,10)];
    [pin addCurveToPoint:CGPointMake(12,21) controlPoint1:CGPointMake(19,15) controlPoint2:CGPointMake(12,21)];
    [pin addCurveToPoint:CGPointMake(5,10) controlPoint1:CGPointMake(12,21) controlPoint2:CGPointMake(5,15)];
    [pin addArcWithCenter:CGPointMake(12,10) radius:7 startAngle:M_PI endAngle:0 clockwise:YES];
    [pin closePath];pin.lineWidth=2;pin.lineJoinStyle=kCGLineJoinRound;pin.lineCapStyle=kCGLineCapRound;[pin stroke];
    [[UIBezierPath bezierPathWithOvalInRect:CGRectMake(9.5,7.5,5,5)] fill];
  }];
  return [image imageWithRenderingMode:UIImageRenderingModeAlwaysTemplate];
}
- (void)viewDidLoad {
  [super viewDidLoad];
  UIColor *ink = [self colorWithLight:0.095 dark:0.98];
  self.backdrop = [UIControl new]; self.backdrop.backgroundColor = [UIColor colorWithWhite:0 alpha:0.3];
  self.backdrop.alpha = 0; self.backdrop.accessibilityElementsHidden = YES;
  [self.backdrop addTarget:self action:@selector(cancelTapped) forControlEvents:UIControlEventTouchUpInside];
  self.backdrop.translatesAutoresizingMaskIntoConstraints = NO; [self.view addSubview:self.backdrop];
  self.sheet = [UIView new]; self.sheet.backgroundColor = [self colorWithLight:1 dark:0.04];
  self.sheet.layer.cornerRadius = 20;
  self.sheet.layer.maskedCorners = kCALayerMinXMinYCorner | kCALayerMaxXMinYCorner;
  self.sheet.accessibilityViewIsModal = YES;
  self.sheet.translatesAutoresizingMaskIntoConstraints = NO; [self.view addSubview:self.sheet];
  self.heightConstraint = [self.sheet.heightAnchor constraintEqualToConstant:480];
  [NSLayoutConstraint activateConstraints:@[
    [self.backdrop.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
    [self.backdrop.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
    [self.backdrop.topAnchor constraintEqualToAnchor:self.view.topAnchor],
    [self.backdrop.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor],
    [self.sheet.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
    [self.sheet.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
    [self.sheet.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor], self.heightConstraint,
  ]];
  UIView *header = [UIView new]; self.header = header; header.translatesAutoresizingMaskIntoConstraints = NO; [self.sheet addSubview:header];
  UIView *handle = [UIView new]; handle.backgroundColor = UIColor.systemGray3Color;
  handle.layer.cornerRadius = 2; handle.translatesAutoresizingMaskIntoConstraints = NO; [header addSubview:handle];
  UILabel *title = [UILabel new]; title.text = self.headingTitle; title.textColor = ink;
  title.font = [UIFont preferredFontForTextStyle:UIFontTextStyleHeadline]; title.adjustsFontForContentSizeCategory = YES;
  title.accessibilityTraits = UIAccessibilityTraitHeader; title.numberOfLines = 2;
  UILabel *detail = [UILabel new]; detail.text = self.headingDetail; detail.textColor = UIColor.secondaryLabelColor;
  detail.font = [UIFont preferredFontForTextStyle:UIFontTextStyleSubheadline]; detail.adjustsFontForContentSizeCategory = YES;
  detail.numberOfLines = 0;
  UIStackView *heading = [[UIStackView alloc] initWithArrangedSubviews:@[title,detail]];
  heading.axis = UILayoutConstraintAxisVertical; heading.spacing = 5;
  heading.translatesAutoresizingMaskIntoConstraints = NO; [header addSubview:heading];
  [header addGestureRecognizer:[[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(dragged:)]];
  UIScrollView *scroll = [UIScrollView new]; scroll.translatesAutoresizingMaskIntoConstraints = NO;
  [self.sheet addSubview:scroll];
  self.grid = [UIStackView new]; self.grid.axis = UILayoutConstraintAxisVertical; self.grid.spacing = 8;
  self.grid.translatesAutoresizingMaskIntoConstraints = NO; [scroll addSubview:self.grid];
  NSDictionary *symbols = @{@"sand":@"circle.grid.3x3.fill", @"oil":@"drop", @"pothole":@"road.lanes",
    @"rockfall":@"mountain.2", @"ice":@"snowflake", @"construction":@"cone", @"etc":@"exclamationmark.triangle"};
  for (NSUInteger i = 0; i < self.options.count; i += 2) {
    UIStackView *row = [UIStackView new]; row.spacing = 8; row.distribution = UIStackViewDistributionFillEqually;
    for (NSUInteger j = i; j < MIN(i+2,self.options.count); j++) {
      NSDictionary *option = self.options[j];
      UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem]; button.tag = j;
      UIButtonConfiguration *config = [UIButtonConfiguration filledButtonConfiguration];
      config.baseBackgroundColor = [self colorWithLight:0.94 dark:0.095]; config.baseForegroundColor = ink;
      config.background.cornerRadius = 12;
      config.background.strokeColor = [self colorWithLight:0.89 dark:0.16]; config.background.strokeWidth = 1;
      config.attributedTitle = [[NSAttributedString alloc] initWithString:option[@"label"] attributes:@{NSFontAttributeName:[UIFont preferredFontForTextStyle:UIFontTextStyleSubheadline]}];
      config.image = [option[@"symbol"] isEqual:@"motomap.destination"] ? [self footerDestinationIcon] : [UIImage systemImageNamed:option[@"symbol"] ?: symbols[option[@"key"]] ?: @"exclamationmark.triangle"] ?: [UIImage systemImageNamed:@"exclamationmark.triangle"];
      config.preferredSymbolConfigurationForImage = [UIImageSymbolConfiguration configurationWithPointSize:21 weight:UIImageSymbolWeightRegular];
      config.imagePlacement = NSDirectionalRectEdgeTop; config.imagePadding = 7;
      config.contentInsets = NSDirectionalEdgeInsetsMake(12,8,12,8); button.configuration = config;
      button.titleLabel.adjustsFontForContentSizeCategory = YES; button.titleLabel.numberOfLines = 0;
      button.accessibilityIdentifier = [@"hazard-type-" stringByAppendingString:option[@"key"]];
      [button.heightAnchor constraintGreaterThanOrEqualToConstant:72].active = YES;
      [button addTarget:self action:@selector(typeTapped:) forControlEvents:UIControlEventTouchUpInside];
      [row addArrangedSubview:button];
    }
    if (row.arrangedSubviews.count == 1 && self.options.count > 1) [row addArrangedSubview:[UIView new]];
    [self.grid addArrangedSubview:row];
  }
  UIButton *cancel = [UIButton buttonWithType:UIButtonTypeSystem]; self.cancelButton = cancel;
  [cancel setTitle:@"취소" forState:UIControlStateNormal]; [cancel setTitleColor:ink forState:UIControlStateNormal];
  cancel.titleLabel.font = [UIFont preferredFontForTextStyle:UIFontTextStyleHeadline];
  cancel.titleLabel.adjustsFontForContentSizeCategory = YES; cancel.accessibilityIdentifier = @"hazard-cancel";
  cancel.backgroundColor = [self colorWithLight:0.96 dark:0.095]; cancel.layer.cornerRadius = 12;
  [cancel addTarget:self action:@selector(cancelTapped) forControlEvents:UIControlEventTouchUpInside];
  cancel.translatesAutoresizingMaskIntoConstraints = NO; [self.sheet addSubview:cancel];
  [NSLayoutConstraint activateConstraints:@[
    [header.topAnchor constraintEqualToAnchor:self.sheet.topAnchor], [header.leadingAnchor constraintEqualToAnchor:self.sheet.leadingAnchor constant:20],
    [header.trailingAnchor constraintEqualToAnchor:self.sheet.trailingAnchor constant:-20],
    [handle.topAnchor constraintEqualToAnchor:header.topAnchor constant:9], [handle.centerXAnchor constraintEqualToAnchor:header.centerXAnchor],
    [handle.widthAnchor constraintEqualToConstant:32], [handle.heightAnchor constraintEqualToConstant:4],
    [heading.topAnchor constraintEqualToAnchor:header.topAnchor constant:30], [heading.leadingAnchor constraintEqualToAnchor:header.leadingAnchor],
    [heading.trailingAnchor constraintEqualToAnchor:header.trailingAnchor], [heading.bottomAnchor constraintEqualToAnchor:header.bottomAnchor constant:-16],
    [scroll.topAnchor constraintEqualToAnchor:header.bottomAnchor], [scroll.leadingAnchor constraintEqualToAnchor:header.leadingAnchor],
    [scroll.trailingAnchor constraintEqualToAnchor:header.trailingAnchor], [scroll.bottomAnchor constraintEqualToAnchor:cancel.topAnchor constant:-12],
    [self.grid.topAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.topAnchor], [self.grid.bottomAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.bottomAnchor],
    [self.grid.leadingAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.leadingAnchor], [self.grid.trailingAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.trailingAnchor],
    [self.grid.widthAnchor constraintEqualToAnchor:scroll.frameLayoutGuide.widthAnchor],
    [cancel.leadingAnchor constraintEqualToAnchor:header.leadingAnchor], [cancel.trailingAnchor constraintEqualToAnchor:header.trailingAnchor],
    [cancel.heightAnchor constraintGreaterThanOrEqualToConstant:48],
    [cancel.bottomAnchor constraintEqualToAnchor:self.sheet.safeAreaLayoutGuide.bottomAnchor constant:-12],
  ]];
}
- (void)viewDidLayoutSubviews {
  [super viewDidLayoutSubviews];
  CGFloat gridHeight = [self.grid systemLayoutSizeFittingSize:CGSizeMake(MAX(0,self.view.bounds.size.width-40), UILayoutFittingCompressedSize.height)
       withHorizontalFittingPriority:UILayoutPriorityRequired verticalFittingPriority:UILayoutPriorityFittingSizeLevel].height;
  CGFloat headerHeight = [self.header systemLayoutSizeFittingSize:CGSizeMake(MAX(0,self.view.bounds.size.width-40), UILayoutFittingCompressedSize.height)
       withHorizontalFittingPriority:UILayoutPriorityRequired verticalFittingPriority:UILayoutPriorityFittingSizeLevel].height;
  CGFloat desired = gridHeight + headerHeight + 24 + MAX(48,self.cancelButton.intrinsicContentSize.height) + self.view.safeAreaInsets.bottom;
  CGFloat available = MAX(0,self.view.bounds.size.height - self.view.safeAreaInsets.top - 12);
  CGFloat height = MIN(desired,available);
  if (fabs(self.heightConstraint.constant-height)>0.5) self.heightConstraint.constant = height;
}
- (void)viewDidAppear:(BOOL)animated {
  [super viewDidAppear:animated];
  if (self.appeared) return; self.appeared = YES;
  [self.view layoutIfNeeded]; self.sheet.transform = CGAffineTransformMakeTranslation(0,self.sheet.bounds.size.height);
  [UIView animateWithDuration:UIAccessibilityIsReduceMotionEnabled() ? 0 : 0.25 animations:^{ self.sheet.transform = CGAffineTransformIdentity; self.backdrop.alpha = 1; }
                   completion:^(BOOL finished) { if (!self.closing) UIAccessibilityPostNotification(UIAccessibilityScreenChangedNotification,self.sheet); }];
}
- (void)typeTapped:(UIButton *)sender { [self closeWithIndex:sender.tag animated:YES after:nil]; }
- (void)cancelTapped { [self closeWithIndex:-1 animated:YES after:nil]; }
- (void)dragged:(UIPanGestureRecognizer *)gesture {
  if (gesture.state == UIGestureRecognizerStateEnded && [gesture translationInView:self.sheet].y > 28) [self cancelTapped];
}
- (BOOL)accessibilityPerformEscape { [self cancelTapped]; return YES; }
- (void)closeWithIndex:(NSInteger)index animated:(BOOL)animated after:(void (^)(void))after {
  if (self.closing) {
    if (after) {
      self.selectedIndex = -1;
      if (self.closed) after(); else self.afterClose = after;
    }
    return;
  }
  self.selectedIndex = index; self.afterClose = after;
  self.closing = YES; self.sheet.userInteractionEnabled = NO;
  void (^done)(void) = ^{
    if (self.closed) return;
    self.closed = YES;
    void (^choice)(NSInteger) = self.onChoice; self.onChoice = nil;
    void (^afterClose)(void) = self.afterClose; self.afterClose = nil;
    if (choice) choice(self.selectedIndex);
    if (afterClose) afterClose();
  };
  void (^dismiss)(void) = ^{
    if (self.presentingViewController) [self dismissViewControllerAnimated:NO completion:done]; else done();
  };
  if (!animated) { dismiss(); return; }
  [UIView animateWithDuration:0.2 animations:^{ self.sheet.transform = CGAffineTransformMakeTranslation(0,self.sheet.bounds.size.height); self.backdrop.alpha = 0; }
                   completion:^(BOOL finished) { dismiss(); }];
}
- (void)cancelForNavigationEnd:(void (^)(void))completion { [self closeWithIndex:-1 animated:NO after:completion]; }
- (void)viewDidDisappear:(BOOL)animated {
  [super viewDidDisappear:animated];
  if (!self.closing && self.onChoice) { void (^choice)(NSInteger) = self.onChoice; self.onChoice = nil; choice(-1); }
}
@end
