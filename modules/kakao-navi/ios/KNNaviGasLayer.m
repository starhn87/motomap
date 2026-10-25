#import "KNNaviGasLayer.h"
#import <KNSDK/KNSDK.h>
#import <math.h>
#import <float.h>

@class KNNaviGasLayer;
@interface KNNaviGasSheet : UIViewController <UITableViewDataSource, UITableViewDelegate>
@property(nonatomic, weak) KNNaviGasLayer *owner;
@property(nonatomic, strong) UIView *sheet;
@property(nonatomic, strong) UIControl *backdrop;
@property(nonatomic, strong) UITableView *table;
@property(nonatomic, strong) UILabel *status;
@property(nonatomic, strong) UIStackView *fuel;
@property(nonatomic, strong) UISegmentedControl *sort;
@property(nonatomic, strong) UIStackView *actions;
@property(nonatomic, strong) UIButton *backButton;
@property(nonatomic, strong) UIButton *refreshButton;
@property(nonatomic, strong) UIActivityIndicatorView *spinner;
@property(nonatomic, strong) NSDictionary *station;
@property(nonatomic) BOOL appeared;
@property(nonatomic) BOOL closing;
- (void)reload;
- (void)closeWithCompletion:(void (^)(void))completion;
@end
@interface KNNaviGasLayer ()
@property(nonatomic, weak) UIViewController *host;
@property(nonatomic, strong) NSArray<NSDictionary *> *stations;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSDictionary *> *cache;
@property(nonatomic, strong) KNNaviGasSheet *sheet;
@property(nonatomic, strong) NSDictionary *context;
@property(nonatomic, strong) NSDictionary *selection;
@property(nonatomic, copy) NSString *prod;
@property(nonatomic, copy) NSString *errorMessage;
@property(nonatomic, strong) NSDate *gpsAt;
@property(nonatomic, strong) NSDate *requestedAt;
@property(nonatomic, strong) NSDate *receivedAt;
@property(nonatomic, strong) NSTimer *timer;
@property(nonatomic) DoublePoint position;
@property(nonatomic) DoublePoint requestedPosition;
@property(nonatomic) BOOL loading;
@property(nonatomic) BOOL priceSort;
@property(nonatomic) NSInteger radius;
@property(nonatomic) NSInteger progressRadius;
@property(nonatomic) NSInteger foundCount;
@property(nonatomic) BOOL partial;
@property(nonatomic, copy) NSString *positionSource;
@property(nonatomic) BOOL canAddVia;
@property(nonatomic) BOOL courseMode;
@property(nonatomic) BOOL invalidated;
- (void)requestForced:(BOOL)force;
- (NSDictionary *)currentCache;
- (void)useCache:(NSDictionary *)entry;
- (void)choose:(NSDictionary *)station;
- (void)route:(BOOL)via;
@end

@implementation KNNaviGasSheet
- (instancetype)init {
  if ((self=[super init])) self.modalPresentationStyle=UIModalPresentationOverFullScreen;
  return self;
}
- (UIColor *)surface:(CGFloat)light dark:(CGFloat)dark {
  return [UIColor colorWithDynamicProvider:^UIColor *(UITraitCollection *trait) {
    return [UIColor colorWithWhite:trait.userInterfaceStyle==UIUserInterfaceStyleDark ? dark : light alpha:1];
  }];
}
- (UIButton *)button:(NSString *)title action:(SEL)action {
  UIButton *button=[UIButton buttonWithType:UIButtonTypeCustom];
  [button setTitle:title forState:UIControlStateNormal]; [button setTitleColor:UIColor.labelColor forState:UIControlStateNormal];
  button.titleLabel.font=[UIFont preferredFontForTextStyle:UIFontTextStyleHeadline];
  button.titleLabel.adjustsFontForContentSizeCategory=YES;
  button.backgroundColor=[self surface:0.94 dark:0.10]; button.layer.cornerRadius=12;
  [button.heightAnchor constraintGreaterThanOrEqualToConstant:48].active=YES;
  [button addTarget:self action:action forControlEvents:UIControlEventTouchUpInside];
  return button;
}
- (void)viewDidLoad {
  [super viewDidLoad];
  self.backdrop=[UIControl new]; self.backdrop.backgroundColor=[UIColor colorWithWhite:0 alpha:0.3];
  self.backdrop.accessibilityElementsHidden=YES;
  [self.backdrop addTarget:self action:@selector(close) forControlEvents:UIControlEventTouchUpInside];
  self.backdrop.translatesAutoresizingMaskIntoConstraints=NO; [self.view addSubview:self.backdrop];
  self.sheet=[UIView new]; self.sheet.backgroundColor=[self surface:1 dark:0.04];
  self.sheet.layer.cornerRadius=20; self.sheet.layer.maskedCorners=kCALayerMinXMinYCorner|kCALayerMaxXMinYCorner;
  self.sheet.accessibilityViewIsModal=YES;
  self.sheet.translatesAutoresizingMaskIntoConstraints=NO; [self.view addSubview:self.sheet];
  UIView *header=[UIView new]; header.translatesAutoresizingMaskIntoConstraints=NO; [self.sheet addSubview:header];
  [header addGestureRecognizer:[[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(dragged:)]];
  UIView *handle=[UIView new]; handle.backgroundColor=UIColor.systemGray3Color; handle.layer.cornerRadius=2;
  handle.translatesAutoresizingMaskIntoConstraints=NO; [header addSubview:handle];
  UILabel *title=[UILabel new]; title.text=@"주유소"; title.font=[UIFont preferredFontForTextStyle:UIFontTextStyleHeadline];
  title.adjustsFontForContentSizeCategory=YES; title.accessibilityTraits=UIAccessibilityTraitHeader;
  self.backButton=[self button:@"닫기" action:@selector(back)];
  self.refreshButton=[self button:@"새로고침" action:@selector(refresh)];
  self.refreshButton.accessibilityIdentifier=@"gas-refresh"; self.refreshButton.accessibilityLabel=@"주유소 새로고침";
  [self.refreshButton setTitle:@"" forState:UIControlStateNormal];
  [self.refreshButton setImage:[UIImage systemImageNamed:@"arrow.clockwise"] forState:UIControlStateNormal];
  self.refreshButton.tintColor=UIColor.labelColor; title.textAlignment=NSTextAlignmentCenter;
  self.spinner=[[UIActivityIndicatorView alloc] initWithActivityIndicatorStyle:UIActivityIndicatorViewStyleMedium];
  self.spinner.translatesAutoresizingMaskIntoConstraints=NO; [self.refreshButton addSubview:self.spinner];
  UIStackView *heading=[[UIStackView alloc] initWithArrangedSubviews:@[self.backButton,title,self.refreshButton]];
  heading.alignment=UIStackViewAlignmentCenter; heading.spacing=12;
  heading.translatesAutoresizingMaskIntoConstraints=NO; [header addSubview:heading];
  [self.backButton.widthAnchor constraintEqualToConstant:64].active=YES;
  [self.refreshButton.widthAnchor constraintEqualToConstant:64].active=YES;
  self.fuel=[UIStackView new]; self.fuel.spacing=8; self.fuel.distribution=UIStackViewDistributionFillEqually;
  for (NSUInteger i=0;i<2;i++) {
    UIButton *button=[self button:i ? @"고급휘발유" : @"휘발유" action:@selector(changeFuel:)]; button.tag=i;
    button.accessibilityIdentifier=i ? @"gas-premium" : @"gas-regular"; [self.fuel addArrangedSubview:button];
  }
  self.sort=[[UISegmentedControl alloc] initWithItems:@[@"거리순",@"가격 낮은 순"]];
  self.sort.accessibilityIdentifier=@"gas-sort"; self.sort.selectedSegmentIndex=0;
  [self.sort addTarget:self action:@selector(changeSort:) forControlEvents:UIControlEventValueChanged];
  self.status=[UILabel new]; self.status.font=[UIFont preferredFontForTextStyle:UIFontTextStyleFootnote];
  self.status.adjustsFontForContentSizeCategory=YES; self.status.textColor=UIColor.secondaryLabelColor; self.status.numberOfLines=0;
  self.table=[[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
  self.table.backgroundColor=UIColor.clearColor; self.table.separatorStyle=UITableViewCellSeparatorStyleNone;
  self.table.dataSource=self; self.table.delegate=self; self.table.rowHeight=UITableViewAutomaticDimension; self.table.estimatedRowHeight=86;
  self.actions=[UIStackView new]; self.actions.axis=UILayoutConstraintAxisVertical; self.actions.spacing=8;
  for (NSUInteger i=0;i<2;i++) {
    UIButton *button=[self button:i ? @"경유지로 추가" : @"목적지 변경" action:@selector(route:)]; button.tag=i;
    button.backgroundColor=UIColor.labelColor;
    [button setTitleColor:[self surface:1 dark:0] forState:UIControlStateNormal];
    [self.actions addArrangedSubview:button];
  }
  UIStackView *content=[[UIStackView alloc] initWithArrangedSubviews:@[self.fuel,self.sort,self.status,self.table,self.actions]];
  content.axis=UILayoutConstraintAxisVertical; content.spacing=12;
  content.translatesAutoresizingMaskIntoConstraints=NO; [self.sheet addSubview:content];
  [NSLayoutConstraint activateConstraints:@[
    [self.backdrop.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor], [self.backdrop.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
    [self.backdrop.topAnchor constraintEqualToAnchor:self.view.topAnchor], [self.backdrop.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor],
    [self.sheet.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor], [self.sheet.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
    [self.sheet.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor],
    [self.sheet.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor constant:80],
    [header.leadingAnchor constraintEqualToAnchor:self.sheet.leadingAnchor constant:20], [header.trailingAnchor constraintEqualToAnchor:self.sheet.trailingAnchor constant:-20],
    [header.topAnchor constraintEqualToAnchor:self.sheet.topAnchor],
    [handle.topAnchor constraintEqualToAnchor:header.topAnchor constant:9], [handle.centerXAnchor constraintEqualToAnchor:header.centerXAnchor],
    [handle.widthAnchor constraintEqualToConstant:32], [handle.heightAnchor constraintEqualToConstant:4],
    [heading.topAnchor constraintEqualToAnchor:header.topAnchor constant:26], [heading.leadingAnchor constraintEqualToAnchor:header.leadingAnchor],
    [heading.trailingAnchor constraintEqualToAnchor:header.trailingAnchor], [heading.bottomAnchor constraintEqualToAnchor:header.bottomAnchor constant:-12],
    [self.spinner.centerXAnchor constraintEqualToAnchor:self.refreshButton.centerXAnchor], [self.spinner.centerYAnchor constraintEqualToAnchor:self.refreshButton.centerYAnchor],
    [content.topAnchor constraintEqualToAnchor:header.bottomAnchor], [content.leadingAnchor constraintEqualToAnchor:header.leadingAnchor],
    [content.trailingAnchor constraintEqualToAnchor:header.trailingAnchor], [content.bottomAnchor constraintEqualToAnchor:self.sheet.safeAreaLayoutGuide.bottomAnchor constant:-12],
  ]];
  [self reload];
}
- (void)viewDidAppear:(BOOL)animated {
  [super viewDidAppear:animated]; if (self.appeared) return; self.appeared=YES;
  [self.view layoutIfNeeded]; self.sheet.transform=CGAffineTransformMakeTranslation(0,self.sheet.bounds.size.height); self.backdrop.alpha=0;
  [UIView animateWithDuration:UIAccessibilityIsReduceMotionEnabled() ? 0 : 0.25 animations:^{ self.sheet.transform=CGAffineTransformIdentity; self.backdrop.alpha=1; }
    completion:^(BOOL finished){ if (!self.closing) UIAccessibilityPostNotification(UIAccessibilityScreenChangedNotification,self.sheet); }];
}
- (void)reload {
  if (!self.isViewLoaded) return;
  self.sort.hidden=self.station!=nil; self.sort.selectedSegmentIndex=self.owner.priceSort ? 1 : 0;
  self.fuel.hidden=self.station!=nil; self.actions.hidden=self.station==nil;
  self.refreshButton.hidden=self.station!=nil; self.refreshButton.enabled=!self.owner.loading;
  self.refreshButton.tintColor=self.owner.loading ? UIColor.clearColor : UIColor.labelColor;
  if (self.owner.loading) [self.spinner startAnimating]; else [self.spinner stopAnimating];
  [self.backButton setTitle:self.station ? @"이전" : @"닫기" forState:UIControlStateNormal];
  for (UIButton *button in self.fuel.arrangedSubviews) {
    BOOL selected=button.tag==([self.owner.prod isEqual:@"B034"] ? 1 : 0);
    button.backgroundColor=selected ? UIColor.labelColor : [self surface:0.94 dark:0.10];
    [button setTitleColor:selected ? [self surface:1 dark:0] : UIColor.labelColor forState:UIControlStateNormal];
    button.accessibilityTraits=UIAccessibilityTraitButton|(selected ? UIAccessibilityTraitSelected : 0);
  }
  self.actions.arrangedSubviews.lastObject.hidden=!self.owner.canAddVia;
  [(UIButton *)self.actions.arrangedSubviews.firstObject setTitle:self.owner.courseMode ? @"코스를 종료하고 목적지 변경" : @"목적지 변경" forState:UIControlStateNormal];
  NSString *fuel=[self.owner.prod isEqual:@"B034"] ? @"고급휘발유" : @"휘발유";
  NSString *basis=[self.owner.positionSource isEqual:@"start"] ? @"출발지 기준" : [self.owner.positionSource isEqual:@"recent"] ? @"최근 위치 기준" : @"현재 위치 기준";
  self.status.text=self.station ? [NSString stringWithFormat:@"%@ · 오피넷 제공 가격\n선택하면 경로 미리보기로 이동합니다.",fuel] : self.owner.errorMessage;
  if (!self.station && !self.owner.errorMessage) {
    if (self.owner.loading) self.status.text=self.owner.progressRadius>5000 ?
      [NSString stringWithFormat:@"주변 주유소가 5곳 미만이라 반경 %ldkm까지 넓혀 다시 검색 중이에요.\n%@ · %@ · 확인된 주유소 %ld곳",(long)self.owner.progressRadius/1000,basis,fuel,(long)self.owner.foundCount] :
      [NSString stringWithFormat:@"%@ 반경 5km에서 %@ 주유소를 찾고 있어요…",basis,fuel];
    else if (self.owner.partial) self.status.text=[NSString stringWithFormat:@"반경 %ldkm 검색 중 일부 가격을 불러오지 못했어요. %@\n%@ · %@ · 새로고침해 다시 확인해 주세요.",(long)self.owner.radius/1000,self.owner.stations.count ? @"확인된 주유소만 표시해요." : @"주유소가 없는 것으로 확인된 것은 아니에요.",basis,fuel];
    else if (!self.owner.stations.count) self.status.text=[NSString stringWithFormat:@"%@ 반경 %ldkm까지 검색했지만 가격이 확인되는 %@ 주유소가 없어요.\n다른 유종을 선택하거나 위치를 옮긴 뒤 새로고침해 주세요.",basis,(long)self.owner.radius/1000,fuel];
    else self.status.text=[NSString stringWithFormat:@"%@ 반경 %ldkm · %@ · %lu곳 · 직선거리%@\n오피넷 제공 가격으로 현장 가격과 다를 수 있어요.",basis,(long)self.owner.radius/1000,fuel,(unsigned long)self.owner.stations.count,self.owner.stations.count<5 && self.owner.radius==30000 ? @" · 30km까지 검색했어요" : @""];
  }
  [self.table reloadData];
}
- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section { return self.station ? 1 : self.owner.stations.count; }
- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
  UITableViewCell *cell=[[UITableViewCell alloc] initWithStyle:UITableViewCellStyleSubtitle reuseIdentifier:nil];
  NSDictionary *station=self.station ?: self.owner.stations[indexPath.row];
  cell.backgroundColor=UIColor.clearColor; cell.selectionStyle=UITableViewCellSelectionStyleNone;
  UIListContentConfiguration *config=[UIListContentConfiguration subtitleCellConfiguration];
  config.text=station[@"name"]; config.textProperties.font=[UIFont preferredFontForTextStyle:UIFontTextStyleHeadline]; config.textProperties.numberOfLines=2;
  config.secondaryText=[NSString stringWithFormat:@"%@  ·  %@원/L  ·  %.1fkm",station[@"brand"],
    [NSNumberFormatter localizedStringFromNumber:station[@"price"] numberStyle:NSNumberFormatterDecimalStyle],[station[@"distance"] doubleValue]/1000];
  config.secondaryTextProperties.numberOfLines=0; config.directionalLayoutMargins=NSDirectionalEdgeInsetsMake(16,12,16,12); cell.contentConfiguration=config;
  UIView *background=[UIView new]; background.backgroundColor=[self surface:0.96 dark:0.095]; background.layer.cornerRadius=12; cell.backgroundView=background;
  cell.accessoryType=self.station ? UITableViewCellAccessoryNone : UITableViewCellAccessoryDisclosureIndicator;
  return cell;
}
- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath { if (!self.station) [self.owner choose:self.owner.stations[indexPath.row]]; }
- (void)close { [self closeWithCompletion:nil]; }
- (void)back { if (self.station) { self.station=nil; [self reload]; } else [self close]; }
- (void)refresh { [self.owner requestForced:YES]; }
- (void)changeSort:(UISegmentedControl *)control {
  self.owner.priceSort=control.selectedSegmentIndex==1;
  [self.owner useCache:[self.owner currentCache]]; [self reload];
}
- (void)changeFuel:(UIButton *)button {
  NSString *prod=button.tag ? @"B034" : @"B027"; if ([self.owner.prod isEqual:prod]) return;
  self.owner.prod=prod; self.owner.context=nil; self.owner.loading=NO; self.owner.requestedAt=nil; self.owner.errorMessage=nil;
  self.owner.stations=@[]; self.owner.receivedAt=nil; self.station=nil;
  [self.owner requestForced:NO];
}
- (void)route:(UIButton *)button { [self.owner route:button.tag==1]; }
- (void)dragged:(UIPanGestureRecognizer *)gesture { if (gesture.state==UIGestureRecognizerStateEnded && [gesture translationInView:self.sheet].y>28) [self close]; }
- (BOOL)accessibilityPerformEscape { [self close]; return YES; }
- (void)closeWithCompletion:(void (^)(void))completion {
  if (self.closing) return; self.closing=YES; self.sheet.userInteractionEnabled=NO;
  [UIView animateWithDuration:UIAccessibilityIsReduceMotionEnabled() ? 0 : 0.2 animations:^{ self.sheet.transform=CGAffineTransformMakeTranslation(0,self.sheet.bounds.size.height); self.backdrop.alpha=0; }
    completion:^(BOOL finished){ [self dismissViewControllerAnimated:NO completion:completion]; }];
}
@end

@implementation KNNaviGasLayer
+ (BOOL)isUsableSearchGPS:(KNGPSData *)gps {
  // 주변 조회는 GPS 유효성·신선도를 검사한다. 경로 매칭 posTrust는 재안내 전용이다.
  return gps && gps.valid && isfinite(gps.pos.x) && isfinite(gps.pos.y) && gps.timestamp && fabs(gps.timestamp.timeIntervalSinceNow)<=10;
}
- (void)readGPS:(KNGPSData *)gps {
  if (![KNNaviGasLayer isUsableSearchGPS:gps]) return;
  self.gpsAt=gps.timestamp;
  self.position=[[KNSDK sharedInstance] convertKATECToWGS84WithX:lround(gps.pos.x) y:lround(gps.pos.y)];
}
- (double)distanceTo:(DoublePoint)point from:(DoublePoint)origin {
  double lat=(point.y-origin.y)*M_PI/180, lng=(point.x-origin.x)*M_PI/180;
  double value=pow(sin(lat/2),2)+cos(point.y*M_PI/180)*cos(origin.y*M_PI/180)*pow(sin(lng/2),2);
  return 6371000*2*asin(sqrt(MIN(1,MAX(0,value))));
}
- (NSDictionary *)currentCache {
  NSDictionary *entry=self.cache[self.prod];
  NSDate *at=entry[@"at"];
  DoublePoint point=DoublePointMake([entry[@"longitude"] doubleValue],[entry[@"latitude"] doubleValue]);
  if (!at || -at.timeIntervalSinceNow>=180 || [self distanceTo:point from:self.position]>=1000) {
    [self.cache removeObjectForKey:self.prod]; return nil;
  }
  // 이동 후 5곳 미만이 되면 캐시 만료를 기다리지 않고 다시 확장한다.
  if ([entry[@"stations"] count]>=5 && [entry[@"radius"] integerValue]<30000) {
    NSInteger nearby=0;
    for (NSDictionary *station in entry[@"stations"]) if ([self distanceTo:DoublePointMake([station[@"longitude"] doubleValue],[station[@"latitude"] doubleValue]) from:self.position]<=[entry[@"radius"] doubleValue]) nearby++;
    if (nearby<5) { [self.cache removeObjectForKey:self.prod]; self.requestedAt=nil; return nil; }
  }
  return entry;
}
- (void)useCache:(NSDictionary *)entry {
  if (!entry) return;
  self.radius=[entry[@"radius"] integerValue]; self.partial=[entry[@"partial"] boolValue];
  NSMutableArray *nearby=[NSMutableArray new];
  for (NSDictionary *station in entry[@"stations"]) {
    double distance=[self distanceTo:DoublePointMake([station[@"longitude"] doubleValue],[station[@"latitude"] doubleValue]) from:self.position];
    if (distance>[entry[@"radius"] doubleValue]) continue;
    NSMutableDictionary *item=[station mutableCopy]; item[@"distance"]=@(distance); [nearby addObject:item];
  }
  [nearby sortUsingComparator:^NSComparisonResult(NSDictionary *a,NSDictionary *b){
    NSComparisonResult price=self.priceSort ? [a[@"price"] compare:b[@"price"]] : NSOrderedSame;
    return price==NSOrderedSame ? [a[@"distance"] compare:b[@"distance"]] : price;
  }];
  self.stations=[nearby subarrayWithRange:NSMakeRange(0,MIN(40,nearby.count))]; self.receivedAt=entry[@"at"];
  self.canAddVia=[entry[@"canAddVia"] boolValue]; self.courseMode=[entry[@"courseMode"] boolValue];
}
- (BOOL)refreshPosition {
  if (self.getGPS) [self readGPS:self.getGPS()];
  if (self.gpsAt && fabs(self.gpsAt.timeIntervalSinceNow)<=300) {
    self.positionSource=fabs(self.gpsAt.timeIntervalSinceNow)<=10 ? @"gps" : @"recent"; return YES;
  }
  NSDictionary *fallback=self.getFallbackCenter ? self.getFallbackCenter() : nil;
  if (![fallback[@"latitude"] isKindOfClass:NSNumber.class] || ![fallback[@"longitude"] isKindOfClass:NSNumber.class]) return NO;
  double lat=[fallback[@"latitude"] doubleValue],lng=[fallback[@"longitude"] doubleValue];
  if (!isfinite(lat) || !isfinite(lng) || fabs(lat)>90 || fabs(lng)>180) return NO;
  self.position=DoublePointMake(lng,lat); self.positionSource=@"start"; return YES;
}
- (void)resetSearch {
  [self.cache removeAllObjects]; self.stations=@[]; self.receivedAt=nil; self.requestedAt=nil;
  self.context=nil; self.loading=NO; self.sheet.station=nil; self.errorMessage=nil; [self.sheet reload];
}
- (instancetype)initWithHost:(UIViewController *)host {
  if ((self=[super init])) {
    _host=host; _prod=@"B027"; _radius=5000; _progressRadius=5000; _stations=@[]; _cache=[NSMutableDictionary new];
    __weak KNNaviGasLayer *weakSelf=self;
    _timer=[NSTimer scheduledTimerWithTimeInterval:5 repeats:YES block:^(NSTimer *timer){
      KNNaviGasLayer *self=weakSelf; if (!self || self.invalidated) return;
      if (!self.isActive || !self.isActive() || ![self refreshPosition]) {
        [self resetSearch]; self.errorMessage=@"현재 위치와 출발지를 확인하지 못했어요. 위치 권한과 출발지를 확인한 뒤 다시 검색해 주세요."; [self.sheet reload]; return;
      }
      if (self.receivedAt && ![self currentCache]) { self.stations=@[]; self.receivedAt=nil; self.sheet.station=nil; [self.sheet reload]; }
      if (self.loading && -self.requestedAt.timeIntervalSinceNow>100) {
        self.context=nil; self.loading=NO; self.errorMessage=@"가격을 불러오지 못했어요. 새로고침해 주세요."; [self.sheet reload];
      }
      // 지도 표시를 위한 자동 조회는 없다. 검색 시트를 보고 있을 때만 갱신한다.
      if (self.sheet.presentingViewController && !self.sheet.closing) [self requestForced:NO];
    }];
  }
  return self;
}
- (void)updateGPS:(KNGPSData *)gps {
  if (self.invalidated) return;
  [self readGPS:gps];
  if (self.sheet.presentingViewController && !self.sheet.closing) [self requestForced:NO];
}
- (void)requestForced:(BOOL)force {
  if (self.invalidated || !self.isActive || !self.isActive()) return;
  if (![self refreshPosition]) {
    [self resetSearch]; self.errorMessage=@"현재 위치와 출발지를 확인하지 못했어요. 위치 권한과 출발지를 확인한 뒤 다시 검색해 주세요."; [self.sheet reload]; return;
  }
  if (self.loading && !force) return;
  NSDictionary *entry=[self currentCache];
  if (!force && entry) { [self useCache:entry]; [self.sheet reload]; return; }
  if (entry) [self useCache:entry];
  else { self.stations=@[]; self.receivedAt=nil; self.sheet.station=nil; }
  // 실패한 자동 재시도가 GPS 프레임마다 발생하지 않게 한다. 새 검색 영역과 직접 새로고침은 허용한다.
  if (!force && self.requestedAt && -self.requestedAt.timeIntervalSinceNow<30 &&
      [self distanceTo:self.requestedPosition from:self.position]<1000) { [self.sheet reload]; return; }
  self.requestedAt=NSDate.date; self.requestedPosition=self.position;
  self.loading=YES; self.errorMessage=nil; self.progressRadius=5000; self.foundCount=0;
  self.context=@{@"requestId":NSUUID.UUID.UUIDString,@"latitude":@(self.position.y),@"longitude":@(self.position.x),@"prod":self.prod};
  [self.sheet reload]; if (self.onFetch) self.onFetch();
}
- (void)applyResponse:(NSDictionary *)response {
  if (self.invalidated || !self.isActive || !self.isActive() || !self.context || ![response[@"requestId"] isEqual:self.context[@"requestId"]]) return;
  if (![self refreshPosition] || [self distanceTo:self.requestedPosition from:self.position]>1000) {
    [self resetSearch]; return;
  }
  if ([response[@"progressRadius"] isKindOfClass:NSNumber.class]) {
    self.progressRadius=MIN(30000,MAX(5000,[response[@"progressRadius"] integerValue]));
    self.foundCount=MAX(0,[response[@"foundCount"] integerValue]); [self.sheet reload]; return;
  }
  self.loading=NO; self.context=nil;
  if ([response[@"error"] isKindOfClass:NSString.class]) {
    NSDictionary *entry=[self currentCache];
    if (entry) [self useCache:entry];
    else { self.stations=@[]; self.receivedAt=nil; self.sheet.station=nil; }
    self.errorMessage=entry ? @"새 가격을 불러오지 못했어요. 이전 조회 결과예요." : @"가격을 불러오지 못했어요. 새로고침해 주세요.";
    [self.sheet reload]; return;
  }
  NSMutableArray *valid=[NSMutableArray new];
  if ([response[@"stations"] isKindOfClass:NSArray.class]) for (NSDictionary *station in response[@"stations"]) {
    if (![station isKindOfClass:NSDictionary.class] || ![station[@"id"] isKindOfClass:NSString.class] ||
        ![station[@"name"] isKindOfClass:NSString.class] || ![station[@"brand"] isKindOfClass:NSString.class]) continue;
    BOOL numbers=YES;
    for (NSString *key in @[@"price",@"distance",@"latitude",@"longitude"])
      if (![station[key] isKindOfClass:NSNumber.class] || !isfinite([station[key] doubleValue])) numbers=NO;
    if (!numbers || [station[@"price"] doubleValue]<=0 || fabs([station[@"latitude"] doubleValue])>90 ||
        fabs([station[@"longitude"] doubleValue])>180 || [station[@"distance"] doubleValue]<0) continue;
    [valid addObject:station];
  }
  self.cache[self.prod]=@{@"stations":valid,@"at":NSDate.date,@"latitude":@(self.requestedPosition.y),@"longitude":@(self.requestedPosition.x),
    @"radius":@(MIN(30000,MAX(5000,[response[@"radius"] integerValue]))),@"partial":@([response[@"partial"] boolValue]),
    @"canAddVia":@([response[@"canAddVia"] boolValue]),@"courseMode":@([response[@"courseMode"] boolValue])};
  [self useCache:self.cache[self.prod]]; self.errorMessage=nil;
  if (self.sheet.station) {
    NSString *selected=self.sheet.station[@"id"]; self.sheet.station=nil;
    for (NSDictionary *station in self.stations) if ([station[@"id"] isEqual:selected]) { self.sheet.station=station; break; }
  }
  [self.sheet reload];
}
- (void)presentSheetForStation:(NSDictionary *)station {
  if (self.invalidated || !self.isActive || !self.isActive()) return;
  if (self.sheet.presentingViewController) { if (!self.sheet.closing) { self.sheet.station=station; [self.sheet reload]; } return; }
  if (self.host.presentedViewController) return;
  KNNaviGasSheet *sheet=[KNNaviGasSheet new]; sheet.owner=self; sheet.station=station; self.sheet=sheet;
  [self.host presentViewController:sheet animated:NO completion:nil];
}
- (void)showSearch { [self requestForced:NO]; [self presentSheetForStation:nil]; }
- (void)choose:(NSDictionary *)station { [self presentSheetForStation:station]; }
- (void)route:(BOOL)via {
  if (!self.sheet.station || (via && !self.canAddVia) || !self.isActive || !self.isActive() || self.sheet.closing) return;
  self.selection=@{@"station":self.sheet.station,@"via":@(via)};
  [self.sheet closeWithCompletion:^{ if (!self.invalidated && self.onRoute) self.onRoute(); }];
}
- (NSDictionary *)takeSelection {
  NSDictionary *selection=self.selection; self.selection=nil;
  return !self.invalidated && self.isActive && self.isActive() ? selection : nil;
}
- (void)invalidate {
  self.invalidated=YES; [self.timer invalidate]; self.timer=nil; [self resetSearch]; self.selection=nil;
  self.onFetch=nil; self.onRoute=nil; self.isActive=nil; self.getGPS=nil; self.getFallbackCenter=nil;
}
- (void)dealloc { [self.timer invalidate]; }
@end
