#import "KNNaviTypography.h"
#import "KNNaviArrivalPrompt.h"
#import <math.h>

@interface KNNaviArrivalPrompt ()
@property(nonatomic, copy) void (^onChoice)(BOOL);
@property(nonatomic, strong) NSTimer *timer;
@property(nonatomic, strong) UIButton *continueButton;
@property(nonatomic) NSTimeInterval deadline;
@property(nonatomic) BOOL resolved;
@end

@implementation KNNaviArrivalPrompt
- (instancetype)initWithCompletion:(void (^)(BOOL))completion {
  if ((self = [super initWithNibName:nil bundle:nil])) {
    _onChoice = [completion copy];
    self.modalPresentationStyle = UIModalPresentationOverFullScreen;
    self.modalTransitionStyle = UIModalTransitionStyleCrossDissolve;
  }
  return self;
}
- (UIButton *)buttonWithTitle:(NSString *)title action:(SEL)action {
  UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
  [button setTitle:title forState:UIControlStateNormal];
  button.titleLabel.font = MMPreferredAppFont(UIFontTextStyleHeadline);
  button.titleLabel.adjustsFontForContentSizeCategory = YES;
  button.titleLabel.numberOfLines = 0;
  button.titleLabel.textAlignment = NSTextAlignmentCenter;
  button.backgroundColor = UIColor.tertiarySystemFillColor;
  button.layer.cornerRadius = 12;
  [button addTarget:self action:action forControlEvents:UIControlEventTouchUpInside];
  [button.heightAnchor constraintGreaterThanOrEqualToConstant:52].active = YES;
  return button;
}
- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = [UIColor colorWithWhite:0 alpha:0.35];
  UIView *card = [UIView new];
  card.backgroundColor = UIColor.secondarySystemBackgroundColor;
  card.layer.cornerRadius = 20;
  card.accessibilityViewIsModal = YES;
  card.translatesAutoresizingMaskIntoConstraints = NO;
  [self.view addSubview:card];
  UILabel *title = [UILabel new];
  title.text = @"길안내를 종료할까요?";
  title.font = MMPreferredAppFont(UIFontTextStyleTitle3);
  title.adjustsFontForContentSizeCategory = YES;
  title.textColor = UIColor.labelColor;
  title.textAlignment = NSTextAlignmentCenter;
  title.numberOfLines = 0;
  title.accessibilityTraits = UIAccessibilityTraitHeader;
  UILabel *detail = [UILabel new];
  detail.text = @"선택하지 않으면 길안내를 유지해요.";
  detail.font = MMPreferredAppFont(UIFontTextStyleSubheadline);
  detail.adjustsFontForContentSizeCategory = YES;
  detail.textColor = UIColor.secondaryLabelColor;
  detail.textAlignment = NSTextAlignmentCenter;
  detail.numberOfLines = 0;
  UIButton *yes = [self buttonWithTitle:@"예" action:@selector(endTapped)];
  yes.accessibilityIdentifier = @"arrival-end";
  self.continueButton = [self buttonWithTitle:@"아니오 (10초)" action:@selector(continueTapped)];
  self.continueButton.accessibilityIdentifier = @"arrival-continue";
  UIStackView *buttons = [[UIStackView alloc] initWithArrangedSubviews:@[yes, self.continueButton]];
  buttons.spacing = 10;
  buttons.distribution = UIStackViewDistributionFillEqually;
  UIStackView *content = [[UIStackView alloc] initWithArrangedSubviews:@[title, detail, buttons]];
  content.axis = UILayoutConstraintAxisVertical;
  content.spacing = 16;
  content.translatesAutoresizingMaskIntoConstraints = NO;
  [card addSubview:content];
  [NSLayoutConstraint activateConstraints:@[
    [card.centerXAnchor constraintEqualToAnchor:self.view.centerXAnchor],
    [card.centerYAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.centerYAnchor],
    [card.widthAnchor constraintLessThanOrEqualToConstant:360],
    [card.leadingAnchor constraintGreaterThanOrEqualToAnchor:self.view.safeAreaLayoutGuide.leadingAnchor constant:24],
    [card.trailingAnchor constraintLessThanOrEqualToAnchor:self.view.safeAreaLayoutGuide.trailingAnchor constant:-24],
    [content.leadingAnchor constraintEqualToAnchor:card.leadingAnchor constant:24],
    [content.trailingAnchor constraintEqualToAnchor:card.trailingAnchor constant:-24],
    [content.topAnchor constraintEqualToAnchor:card.topAnchor constant:24],
    [content.bottomAnchor constraintEqualToAnchor:card.bottomAnchor constant:-24],
  ]];
  NSLayoutConstraint *width = [card.widthAnchor constraintEqualToConstant:360];
  width.priority = UILayoutPriorityDefaultHigh;
  width.active = YES;
}
- (void)viewDidAppear:(BOOL)animated {
  [super viewDidAppear:animated];
  if (self.resolved || self.timer) return;
  self.deadline = NSProcessInfo.processInfo.systemUptime + 10;
  __weak typeof(self) weakSelf = self;
  self.timer = [NSTimer timerWithTimeInterval:0.2 repeats:YES block:^(NSTimer *timer) {
    [weakSelf advanceToUptime:NSProcessInfo.processInfo.systemUptime];
  }];
  [NSRunLoop.mainRunLoop addTimer:self.timer forMode:NSRunLoopCommonModes];
}
- (void)advanceToUptime:(NSTimeInterval)uptime {
  if (self.resolved || self.deadline == 0) return;
  NSInteger remaining = (NSInteger)ceil(fmax(0, self.deadline - uptime));
  if (remaining == 0) { [self resolve:NO]; return; }
  [self.continueButton setTitle:[NSString stringWithFormat:@"아니오 (%ld초)", (long)remaining] forState:UIControlStateNormal];
}
- (void)endTapped {
  [self resolve:self.deadline > 0 && NSProcessInfo.processInfo.systemUptime < self.deadline];
}
- (void)continueTapped { [self resolve:NO]; }
- (void)resolve:(BOOL)endGuide {
  if (self.resolved) return;
  self.resolved = YES;
  [self.timer invalidate]; self.timer = nil;
  void (^choice)(BOOL) = self.onChoice; self.onChoice = nil;
  [self dismissViewControllerAnimated:YES completion:^{ if (choice) choice(endGuide); }];
}
- (void)cancel {
  [self invalidate];
  if (!self.isBeingDismissed && self.presentingViewController) {
    [self dismissViewControllerAnimated:YES completion:nil];
  }
}
- (void)invalidate {
  self.onChoice = nil; self.resolved = YES;
  [self.timer invalidate]; self.timer = nil;
}
- (void)viewDidDisappear:(BOOL)animated {
  [super viewDidDisappear:animated];
  // 외부 종료·부모 해제에서도 타이머와 콜백을 남기지 않는다.
  [self invalidate];
}
- (void)dealloc { [self.timer invalidate]; }
@end
