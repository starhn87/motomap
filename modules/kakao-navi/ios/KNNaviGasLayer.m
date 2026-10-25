#import "KNNaviGasLayer.h"
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNMapMarker.h>
#import <KNSDK/KNMapMarkerEventListener.h>
#import <math.h>
#import <float.h>

@class KNNaviGasLayer;
@interface KNNaviGasSheet : UIViewController <UITableViewDataSource, UITableViewDelegate>
@property(nonatomic, weak) KNNaviGasLayer *owner;
@property(nonatomic, strong) UITableView *table;
@property(nonatomic, strong) UILabel *status;
@property(nonatomic, strong) UISegmentedControl *fuel;
@property(nonatomic, strong) UIStackView *actions;
@property(nonatomic, strong) NSDictionary *station;
- (void)reload;
@end
@interface KNNaviGasLayer () <KNMapMarkerEventListener>
@property(nonatomic, weak) UIViewController *host;
@property(nonatomic, weak) KNMapView *map;
@property(nonatomic, weak) id<KNMapMarkerEventListener> previousListener;
@property(nonatomic, strong) NSMutableArray<KNMapMarker *> *markers;
@property(nonatomic, strong) NSMutableArray<UIImage *> *images;
@property(nonatomic, strong) NSArray<NSDictionary *> *stations;
@property(nonatomic, strong) KNNaviGasSheet *sheet;
@property(nonatomic, strong) NSDictionary *context;
@property(nonatomic, strong) NSDictionary *selection;
@property(nonatomic, copy) NSString *prod;
@property(nonatomic, copy) NSString *errorMessage;
@property(nonatomic, copy) NSString *selectedID;
@property(nonatomic, strong) NSDate *gpsAt;
@property(nonatomic, strong) NSDate *requestedAt;
@property(nonatomic, strong) NSDate *receivedAt;
@property(nonatomic, strong) NSTimer *timer;
@property(nonatomic) DoublePoint position;
@property(nonatomic) DoublePoint requestedPosition;
@property(nonatomic) BOOL loading;
@property(nonatomic) BOOL canAddVia;
@property(nonatomic) BOOL courseMode;
@property(nonatomic) BOOL invalidated;
- (void)requestForced:(BOOL)force;
- (void)choose:(NSDictionary *)station;
- (void)route:(BOOL)via;
@end

@implementation KNNaviGasSheet
- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = UIColor.systemBackgroundColor;
  self.title = @"주유소";
  self.navigationItem.leftBarButtonItem = [[UIBarButtonItem alloc] initWithTitle:@"닫기" style:UIBarButtonItemStylePlain target:self action:@selector(close)];
  self.navigationItem.rightBarButtonItem = [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemRefresh target:self action:@selector(refresh)];
  UIStackView *content = [UIStackView new]; content.axis = UILayoutConstraintAxisVertical; content.spacing = 12;
  content.translatesAutoresizingMaskIntoConstraints = NO; [self.view addSubview:content];
  self.fuel = [[UISegmentedControl alloc] initWithItems:@[@"휘발유",@"고급휘발유"]];
  self.fuel.selectedSegmentIndex = [self.owner.prod isEqual:@"B034"] ? 1 : 0;
  [self.fuel addTarget:self action:@selector(changeFuel) forControlEvents:UIControlEventValueChanged];
  [content addArrangedSubview:self.fuel];
  self.status = [UILabel new]; self.status.font = [UIFont preferredFontForTextStyle:UIFontTextStyleFootnote];
  self.status.adjustsFontForContentSizeCategory = YES; self.status.textColor = UIColor.secondaryLabelColor;
  self.status.numberOfLines = 0; [content addArrangedSubview:self.status];
  self.table = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
  self.table.dataSource = self; self.table.delegate = self; self.table.rowHeight = UITableViewAutomaticDimension;
  self.table.estimatedRowHeight = 76; self.table.backgroundColor = UIColor.clearColor;
  [content addArrangedSubview:self.table];
  self.actions = [UIStackView new]; self.actions.axis = UILayoutConstraintAxisVertical; self.actions.spacing = 8;
  for (NSUInteger i=0;i<2;i++) {
    UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem]; button.tag = i;
    UIButtonConfiguration *config = [UIButtonConfiguration filledButtonConfiguration];
    config.baseBackgroundColor = UIColor.labelColor;
    config.baseForegroundColor = [UIColor colorWithDynamicProvider:^UIColor *(UITraitCollection *trait) {
      return trait.userInterfaceStyle == UIUserInterfaceStyleDark ? UIColor.blackColor : UIColor.whiteColor;
    }];
    config.title = i ? @"경유지로 추가" : @"목적지 변경"; config.contentInsets = NSDirectionalEdgeInsetsMake(14,12,14,12);
    button.configuration = config;
    [button addTarget:self action:@selector(route:) forControlEvents:UIControlEventTouchUpInside];
    [self.actions addArrangedSubview:button];
  }
  [content addArrangedSubview:self.actions];
  [NSLayoutConstraint activateConstraints:@[
    [content.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor constant:12],
    [content.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor constant:20],
    [content.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor constant:-20],
    [content.bottomAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.bottomAnchor constant:-12],
    [self.fuel.heightAnchor constraintGreaterThanOrEqualToConstant:44],
  ]];
  [self reload];
}
- (void)reload {
  if (!self.isViewLoaded) return;
  self.fuel.hidden = self.station != nil;
  self.actions.hidden = self.station == nil;
  self.navigationItem.rightBarButtonItem.enabled = !self.owner.loading && !self.station;
  self.actions.arrangedSubviews.lastObject.hidden = !self.owner.canAddVia;
  UIButton *destination = (UIButton *)self.actions.arrangedSubviews.firstObject;
  UIButtonConfiguration *configuration = destination.configuration;
  configuration.title = self.owner.courseMode ? @"코스를 종료하고 목적지 변경" : @"목적지 변경";
  configuration.attributedTitle = [[NSAttributedString alloc] initWithString:configuration.title attributes:@{
    NSForegroundColorAttributeName:configuration.baseForegroundColor, NSFontAttributeName:[UIFont preferredFontForTextStyle:UIFontTextStyleHeadline]}];
  destination.configuration = configuration;
  UIButton *viaButton = (UIButton *)self.actions.arrangedSubviews.lastObject;
  UIButtonConfiguration *viaConfiguration = viaButton.configuration;
  viaConfiguration.attributedTitle = [[NSAttributedString alloc] initWithString:@"경유지로 추가" attributes:@{
    NSForegroundColorAttributeName:viaConfiguration.baseForegroundColor, NSFontAttributeName:[UIFont preferredFontForTextStyle:UIFontTextStyleHeadline]}];
  viaButton.configuration = viaConfiguration;
  NSString *fuel = [self.owner.prod isEqual:@"B034"] ? @"고급휘발유" : @"휘발유";
  self.status.text = self.station ? [NSString stringWithFormat:@"%@ · 오피넷 제공 가격\n확인 후 경로 미리보기로 이동합니다.",fuel] :
    self.owner.loading ? @"주변 주유소를 찾고 있어요…" : self.owner.errorMessage ?:
    [NSString stringWithFormat:@"현재 위치 주변 5km · %@ · 직선거리\n오피넷 제공 가격으로 현장 가격과 다를 수 있어요.",fuel];
  if (!self.station && !self.owner.loading && !self.owner.errorMessage && !self.owner.stations.count)
    self.status.text = @"주변 5km에 가격을 제공하는 주유소가 없어요.";
  [self.table reloadData];
}
- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section { return self.station ? 1 : self.owner.stations.count; }
- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
  UITableViewCell *cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleSubtitle reuseIdentifier:nil];
  NSDictionary *station = self.station ?: self.owner.stations[indexPath.row];
  UIListContentConfiguration *config = [UIListContentConfiguration subtitleCellConfiguration];
  config.text = station[@"name"]; config.textProperties.numberOfLines = 2;
  config.secondaryText = [NSString stringWithFormat:@"%@  ·  %@원/L  ·  %.1fkm",station[@"brand"],
    [NSNumberFormatter localizedStringFromNumber:station[@"price"] numberStyle:NSNumberFormatterDecimalStyle], [station[@"distance"] doubleValue]/1000];
  config.secondaryTextProperties.numberOfLines = 0; cell.contentConfiguration = config;
  cell.accessoryType = self.station ? UITableViewCellAccessoryNone : UITableViewCellAccessoryDisclosureIndicator;
  return cell;
}
- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
  if (!self.station) [self.owner choose:self.owner.stations[indexPath.row]];
}
- (void)close { [self dismissViewControllerAnimated:YES completion:nil]; }
- (void)refresh { [self.owner requestForced:YES]; }
- (void)changeFuel {
  self.owner.prod = self.fuel.selectedSegmentIndex ? @"B034" : @"B027";
  self.owner.stations = @[]; self.owner.selectedID = nil;
  [self.owner requestForced:YES];
}
- (void)route:(UIButton *)button { [self.owner route:button.tag == 1]; }
- (BOOL)accessibilityPerformEscape { [self close]; return YES; }
@end

@implementation KNNaviGasLayer
+ (BOOL)isUsableSearchGPS:(KNGPSData *)gps {
  // 주변 조회는 GPS 유효성·신선도를 검사한다. 경로 매칭 posTrust는 재안내 전용이다.
  return gps && gps.valid && isfinite(gps.pos.x) && isfinite(gps.pos.y) && gps.timestamp &&
    fabs(gps.timestamp.timeIntervalSinceNow) <= 10;
}
- (void)readGPS:(KNGPSData *)gps {
  if (![KNNaviGasLayer isUsableSearchGPS:gps]) return;
  self.gpsAt = gps.timestamp;
  self.position = [[KNSDK sharedInstance] convertKATECToWGS84WithX:lround(gps.pos.x) y:lround(gps.pos.y)];
}
- (instancetype)initWithHost:(UIViewController *)host {
  if ((self = [super init])) {
    _host = host; _prod = @"B027"; _stations = @[]; _markers = [NSMutableArray new]; _images = [NSMutableArray new];
    __weak KNNaviGasLayer *weakSelf = self;
    _timer = [NSTimer scheduledTimerWithTimeInterval:5 repeats:YES block:^(NSTimer *timer) {
      KNNaviGasLayer *self = weakSelf; if (!self || self.invalidated) return;
      if (self.getGPS && self.isActive && self.isActive()) [self updateGPS:self.getGPS()];
      if (!self.gpsAt || -self.gpsAt.timeIntervalSinceNow > 10 || !self.isActive || !self.isActive()) {
        [self clearMarkers]; self.stations = @[]; self.sheet.station = nil; self.context = nil; self.loading = NO; self.requestedAt = nil;
        self.errorMessage = @"GPS 수신 후 새로고침해 주세요."; [self.sheet reload]; return;
      }
      if (self.receivedAt && -self.receivedAt.timeIntervalSinceNow > 180) { self.stations = @[]; self.sheet.station = nil; [self clearMarkers]; [self.sheet reload]; }
      if (self.loading && -self.requestedAt.timeIntervalSinceNow > 25) {
        self.context = nil; self.loading = NO; self.errorMessage = @"가격을 불러오지 못했어요. 새로고침해 주세요."; [self.sheet reload];
      }
    }];
  }
  return self;
}
- (void)attachMap:(KNMapView *)map {
  if (self.invalidated || (self.map == map && map.markerEventListener == self)) return;
  [self clearMarkers];
  if (self.map.markerEventListener == self) self.map.markerEventListener = self.previousListener;
  self.map = map; self.previousListener = map.markerEventListener; map.markerEventListener = self;
  [self renderMarkers];
}
- (void)clearMarkers {
  for (KNMapMarker *marker in self.markers) [self.map removeMarker:marker];
  [self.markers removeAllObjects]; [self.images removeAllObjects];
}
- (void)updateGPS:(KNGPSData *)gps {
  if (self.invalidated) return;
  [self readGPS:gps];
  [self requestForced:NO];
}
- (void)requestForced:(BOOL)force {
  if (self.invalidated || !self.isActive || !self.isActive()) return;
  if (self.getGPS) [self readGPS:self.getGPS()];
  if (!self.gpsAt || -self.gpsAt.timeIntervalSinceNow > 10) {
    self.stations = @[]; self.sheet.station = nil; [self clearMarkers];
    self.errorMessage = @"GPS 수신 후 새로고침해 주세요."; [self.sheet reload]; return;
  }
  double meters = hypot((self.position.x-self.requestedPosition.x)*88000,(self.position.y-self.requestedPosition.y)*111000);
  NSTimeInterval age = self.requestedAt ? -self.requestedAt.timeIntervalSinceNow : DBL_MAX;
  if (!force && (self.loading || age < 30 || (age < 180 && meters < 1000))) return;
  self.requestedAt = [NSDate date]; self.requestedPosition = self.position;
  self.loading = YES; self.errorMessage = nil;
  self.context = @{@"requestId":NSUUID.UUID.UUIDString,@"latitude":@(self.position.y),@"longitude":@(self.position.x),@"prod":self.prod};
  self.stations = @[]; self.sheet.station = nil; [self clearMarkers]; [self.sheet reload];
  if (self.onFetch) self.onFetch();
}
- (void)applyResponse:(NSDictionary *)response {
  if (self.invalidated || !self.isActive || !self.isActive() || !self.context ||
      ![response[@"requestId"] isEqual:self.context[@"requestId"]]) return;
  if (!self.gpsAt || -self.gpsAt.timeIntervalSinceNow > 10 ||
      hypot((self.position.x-self.requestedPosition.x)*88000,(self.position.y-self.requestedPosition.y)*111000)>1000) {
    self.context = nil; self.loading = NO; self.requestedAt = nil; self.stations = @[];
    [self clearMarkers]; [self.sheet reload]; return;
  }
  self.loading = NO; self.context = nil;
  self.canAddVia = [response[@"canAddVia"] boolValue]; self.courseMode = [response[@"courseMode"] boolValue];
  NSArray *stations = response[@"stations"];
  NSMutableArray *valid = [NSMutableArray new];
  if ([stations isKindOfClass:NSArray.class]) for (NSDictionary *station in stations) {
    if (![station isKindOfClass:NSDictionary.class] || ![station[@"id"] isKindOfClass:NSString.class] ||
        ![station[@"name"] isKindOfClass:NSString.class] || ![station[@"brand"] isKindOfClass:NSString.class]) continue;
    BOOL numbers = YES;
    for (NSString *key in @[@"price",@"distance",@"latitude",@"longitude"])
      if (![station[key] isKindOfClass:NSNumber.class] || !isfinite([station[key] doubleValue])) numbers = NO;
    if (!numbers || [station[@"price"] doubleValue] <= 0 || fabs([station[@"latitude"] doubleValue])>90 ||
        fabs([station[@"longitude"] doubleValue])>180 || [station[@"distance"] doubleValue]<0) continue;
    [valid addObject:station]; if (valid.count == 40) break;
  }
  self.stations = valid; self.receivedAt = [NSDate date];
  self.errorMessage = [response[@"error"] isKindOfClass:NSString.class] ? @"가격을 불러오지 못했어요. 새로고침해 주세요." : nil;
  if (self.sheet.station) {
    NSString *selected = self.sheet.station[@"id"];
    self.sheet.station = nil;
    for (NSDictionary *station in self.stations) if ([station[@"id"] isEqual:selected]) { self.sheet.station = station; break; }
  }
  [self renderMarkers]; [self.sheet reload];
}
- (UIImage *)imageForStation:(NSDictionary *)station selected:(BOOL)selected {
  CGSize size = CGSizeMake(selected ? 108 : 96, selected ? 48 : 40);
  UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:size];
  return [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
    UIColor *ink = selected ? UIColor.whiteColor : UIColor.blackColor;
    [(selected ? UIColor.blackColor : UIColor.whiteColor) setFill];
    UIBezierPath *path = [UIBezierPath bezierPathWithRoundedRect:CGRectInset((CGRect){CGPointZero,size},1,1) cornerRadius:9];
    [path fill]; [(selected ? UIColor.whiteColor : UIColor.darkGrayColor) setStroke]; path.lineWidth=1.5; [path stroke];
    NSString *brand = station[@"brand"];
    NSDictionary *shortNames = @{@"SK에너지":@"SK",@"GS칼텍스":@"GS",@"HD현대오일뱅크":@"HD",@"S-OIL":@"S-OIL",@"자영알뜰":@"알뜰",@"NH알뜰":@"알뜰"};
    brand = [NSString stringWithFormat:@"%@ · %@",shortNames[brand] ?: @"주유소",[self.prod isEqual:@"B034"] ? @"고급" : @"휘발유"];
    NSDictionary *brandAttrs = @{NSFontAttributeName:[UIFont systemFontOfSize:10 weight:UIFontWeightMedium],NSForegroundColorAttributeName:ink};
    CGSize brandSize = [brand sizeWithAttributes:brandAttrs];
    [brand drawAtPoint:CGPointMake((size.width-brandSize.width)/2,4) withAttributes:brandAttrs];
    NSString *price = [NSString stringWithFormat:@"%@원",[NSNumberFormatter localizedStringFromNumber:station[@"price"] numberStyle:NSNumberFormatterDecimalStyle]];
    NSDictionary *attrs = @{NSFontAttributeName:[UIFont boldSystemFontOfSize:selected ? 17 : 15],NSForegroundColorAttributeName:ink};
    CGSize text = [price sizeWithAttributes:attrs]; [price drawAtPoint:CGPointMake((size.width-text.width)/2,size.height-text.height-4) withAttributes:attrs];
  }];
}
- (void)renderMarkers {
  [self clearMarkers];
  if (!self.map || self.invalidated || !self.isActive || !self.isActive()) return;
  for (NSUInteger i=0;i<self.stations.count;i++) {
    NSDictionary *station = self.stations[i]; BOOL selected = [station[@"id"] isEqual:self.selectedID];
    IntPoint pos = [[KNSDK sharedInstance] convertWGS84ToKATECWithLongitude:[station[@"longitude"] doubleValue] latitude:[station[@"latitude"] doubleValue]];
    KNMapMarker *marker = [KNMapMarker markerWithCoordinate:FloatPointMake(pos.x,pos.y)];
    UIImage *image = [self imageForStation:station selected:selected]; [self.images addObject:image]; marker.icon = image;
    marker.tag = i; marker.priority = selected ? 1000 : 100;
    marker.useSingleTapped = YES; marker.useDoubleTapped = NO; marker.useLongPressed = NO;
    // KNSDK는 단계형 줌이 아닌 배율을 쓴다. 안내 기본 배율 1에서도 표시한다.
    [marker setVisibleRangeWithMinZoom:0.1 maxZoom:9999];
    [self.markers addObject:marker]; [self.map addMarker:marker];
  }
}
- (void)presentSheetForStation:(NSDictionary *)station {
  if (self.invalidated || !self.isActive || !self.isActive()) return;
  if (self.sheet.presentingViewController) { self.sheet.station = station; [self.sheet reload]; return; }
  if (self.host.presentedViewController) return;
  KNNaviGasSheet *sheet = [KNNaviGasSheet new]; sheet.owner = self; sheet.station = station; self.sheet = sheet;
  UINavigationController *nav = [[UINavigationController alloc] initWithRootViewController:sheet];
  nav.view.tintColor = UIColor.labelColor; nav.modalPresentationStyle = UIModalPresentationPageSheet;
  nav.sheetPresentationController.detents = @[UISheetPresentationControllerDetent.mediumDetent, UISheetPresentationControllerDetent.largeDetent];
  nav.sheetPresentationController.prefersGrabberVisible = YES;
  [self.host presentViewController:nav animated:YES completion:nil];
}
- (void)showSearch { [self presentSheetForStation:nil]; [self requestForced:YES]; }
- (void)choose:(NSDictionary *)station {
  self.selectedID = station[@"id"]; [self renderMarkers]; [self presentSheetForStation:station];
}
- (void)route:(BOOL)via {
  if (!self.sheet.station || (via && !self.canAddVia) || !self.isActive || !self.isActive()) return;
  self.selection = @{ @"station":self.sheet.station, @"via":@(via) };
  self.sheet.view.userInteractionEnabled = NO;
  [self.host dismissViewControllerAnimated:YES completion:^{ if (!self.invalidated && self.onRoute) self.onRoute(); }];
}
- (void)mapView:(KNMapView *)map onSingleTappedWithMarker:(KNMapMarker *)marker {
  NSUInteger index = [self.markers indexOfObjectIdenticalTo:marker];
  if (index != NSNotFound && index < self.stations.count) { [self choose:self.stations[index]]; return; }
  if ([self.previousListener respondsToSelector:_cmd]) [self.previousListener mapView:map onSingleTappedWithMarker:marker];
}
- (void)mapView:(KNMapView *)map onDoubleTappedWithMarker:(KNMapMarker *)marker {
  if ([self.previousListener respondsToSelector:_cmd]) [self.previousListener mapView:map onDoubleTappedWithMarker:marker];
}
- (void)mapView:(KNMapView *)map onLongPressedWithMarker:(KNMapMarker *)marker {
  if ([self.previousListener respondsToSelector:_cmd]) [self.previousListener mapView:map onLongPressedWithMarker:marker];
}
- (void)mapView:(KNMapView *)map onMarkerAnimationEnded:(KNMapMarker *)marker {
  if ([self.previousListener respondsToSelector:_cmd]) [self.previousListener mapView:map onMarkerAnimationEnded:marker];
}
- (void)mapView:(KNMapView *)map onCalloutBubbleSelected:(KNMapMarker *)marker {
  if ([self.previousListener respondsToSelector:_cmd]) [self.previousListener mapView:map onCalloutBubbleSelected:marker];
}
- (NSDictionary *)takeSelection {
  NSDictionary *selection = self.selection; self.selection = nil;
  return !self.invalidated && self.isActive && self.isActive() ? selection : nil;
}
- (void)invalidate {
  self.invalidated = YES; [self.timer invalidate]; self.timer = nil; self.context = nil; self.selection = nil;
  [self clearMarkers];
  if (self.map.markerEventListener == self) self.map.markerEventListener = self.previousListener;
  self.onFetch = nil; self.onRoute = nil; self.isActive = nil; self.getGPS = nil; self.stations = @[];
}
- (void)dealloc { [self.timer invalidate]; }
@end
