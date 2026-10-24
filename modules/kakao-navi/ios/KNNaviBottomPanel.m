#import "KNNaviBottomPanel.h"
#import <WebKit/WebKit.h>
#import <math.h>

const CGFloat KNNaviBottomCollapsedHeight = 68;
const CGFloat KNNaviBottomRecenterHeight = 48;

@class KNNaviBottomPanel;
@interface KNNaviBottomMessage : NSObject <WKScriptMessageHandler>
@property(nonatomic, weak) KNNaviBottomPanel *owner;
@end
@interface KNNaviBottomPanel () <WKNavigationDelegate>
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) WKWebView *menuWebView;
@property(nonatomic, strong) NSURL *documentURL;
@property(nonatomic, strong) NSDictionary *state;
@property(nonatomic) BOOL ready;
@property(nonatomic) BOOL footerReady;
@property(nonatomic) BOOL menuReady;
@property(nonatomic) BOOL failed;
@property(nonatomic) BOOL invalidated;
@property(nonatomic) BOOL expanded;
@property(nonatomic) CGFloat bottomInset;
@property(nonatomic) CGFloat menuBottomInset;
- (void)receiveMessage:(WKScriptMessage *)message;
@end
@implementation KNNaviBottomMessage
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
  [self.owner receiveMessage:message];
}
@end
@implementation KNNaviBottomPanel
- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (!self) return nil;
  _state = @{};
  NSURL *url = [NSBundle.mainBundle URLForResource:@"MotoMapNavigationUI" withExtension:@"bundle"];
  NSBundle *bundle = url ? [NSBundle bundleWithURL:url] : nil;
  _documentURL = [bundle URLForResource:@"navigation-bottom" withExtension:@"html"];
  _webView = [self makeWebView];
  _webView.frame = self.bounds;
  [self addSubview:_webView];
  // 메뉴는 미리 로드한 별도 뷰다. footer 크기/문서를 바꾸지 않고 native 시트로 올린다.
  _menuWebView = [self makeWebView];
  _menuWebView.hidden = YES;
  if (!_documentURL) dispatch_async(dispatch_get_main_queue(), ^{ [self fail]; });
  __weak KNNaviBottomPanel *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    if (!weakSelf.ready) [weakSelf fail];
  });
  return self;
}
- (WKWebView *)makeWebView {
  WKWebViewConfiguration *config = [WKWebViewConfiguration new];
  KNNaviBottomMessage *handler = [KNNaviBottomMessage new]; handler.owner = self;
  [config.userContentController addScriptMessageHandler:handler name:@"motomapBottom"];
  WKWebView *web = [[WKWebView alloc] initWithFrame:CGRectZero configuration:config];
  web.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  web.navigationDelegate = self;
  web.opaque = NO;
  web.backgroundColor = UIColor.clearColor;
  web.scrollView.backgroundColor = UIColor.clearColor;
  web.scrollView.bounces = NO;
  web.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
  if (self.documentURL) [web loadFileURL:self.documentURL allowingReadAccessToURL:self.documentURL.URLByDeletingLastPathComponent];
  return web;
}
- (UIView *)menuView { return self.menuWebView; }
- (void)fail {
  if (self.invalidated || self.failed) return;
  [self collapse];
  self.failed = YES; self.ready = NO;
  if (self.onFailure) self.onFailure();
}
- (void)setBottomInset:(CGFloat)inset {
  if (_bottomInset == MAX(0, inset)) return;
  _bottomInset = MAX(0, inset);
  [self publish]; [self publishHeight];
}
- (void)setMenuBottomInset:(CGFloat)inset {
  if (_menuBottomInset == MAX(0, inset)) return;
  _menuBottomInset = MAX(0, inset);
  [self publish];
}
- (void)publishHeight {
  self.accessibilityElementsHidden = self.expanded;
  self.menuWebView.accessibilityViewIsModal = self.expanded && self.ready;
  if (self.onHeight) self.onHeight(KNNaviBottomCollapsedHeight + ([self.state[@"showRecenter"] boolValue] ? KNNaviBottomRecenterHeight : 0) + self.bottomInset);
}
- (void)updateState:(NSDictionary *)state {
  BOOL heightChanged = [self.state[@"showRecenter"] boolValue] != [state[@"showRecenter"] boolValue];
  self.state = [state copy];
  if (heightChanged) [self publishHeight];
  [self publish];
}
- (BOOL)pointInside:(CGPoint)point withEvent:(UIEvent *)event {
  if ([self.state[@"showRecenter"] boolValue] && point.y < KNNaviBottomRecenterHeight &&
      fabs(point.x - self.bounds.size.width / 2) > 80) return NO;
  return [super pointInside:point withEvent:event];
}
- (void)publishTo:(WKWebView *)web menu:(BOOL)menu {
  NSMutableDictionary *payload = [self.state mutableCopy];
  payload[@"expanded"] = @(menu); payload[@"menuOpen"] = @(self.expanded);
  payload[@"bottomInset"] = @(menu ? self.menuBottomInset : self.bottomInset);
  NSData *json = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
  if (!json) return;
  NSString *text = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
  [web evaluateJavaScript:[NSString stringWithFormat:@"window.MotoMapBottom.render(%@)",text] completionHandler:nil];
}
- (void)publish {
  if (!self.ready || self.invalidated || self.failed) return;
  [self publishTo:self.webView menu:NO];
  [self publishTo:self.menuWebView menu:YES];
}
- (BOOL)accessibilityPerformEscape {
  if (!self.expanded) return NO;
  [self collapse]; return YES;
}
- (void)setMenuOpen:(BOOL)open {
  if (self.expanded == open) return;
  self.expanded = open;
  [self publishHeight]; [self publish];
  if (self.onMenuVisibility) self.onMenuVisibility(open);
}
- (void)collapse { [self setMenuOpen:NO]; }
- (void)receiveMessage:(WKScriptMessage *)message {
  if (self.invalidated || self.failed || !message.frameInfo.mainFrame ||
      (message.webView != self.webView && message.webView != self.menuWebView) ||
      ![message.frameInfo.request.URL.path isEqualToString:self.documentURL.path] ||
      ![message.body isKindOfClass:NSDictionary.class]) return;
  NSDictionary *body = message.body;
  NSString *action = body[@"action"];
  if (![action isKindOfClass:NSString.class]) return;
  if ([action isEqualToString:@"ready"]) {
    if (message.webView == self.webView) self.footerReady = YES; else self.menuReady = YES;
    if (self.ready || !self.footerReady || !self.menuReady) return;
    self.ready = YES; [self publishHeight]; [self publish];
    if (self.onAction) self.onAction(@"ready",@{});
    return;
  }
  if (!self.ready) return;
  if ([action isEqualToString:@"menu"]) { [self setMenuOpen:!self.expanded]; return; }
  if ([action isEqualToString:@"volume"]) {
    NSNumber *value = body[@"value"];
    if (![value isKindOfClass:NSNumber.class] || !isfinite(value.doubleValue)) return;
    if (self.onAction) self.onAction(action,@{@"value":@(MAX(0,MIN(1,value.doubleValue)))});
    return;
  }
  NSSet *allowed = [NSSet setWithArray:@[@"refresh",@"recenter",@"hazard",@"routePreview",@"destination",@"vias",@"end"]];
  if (![allowed containsObject:action]) return;
  [self collapse];
  if (self.onAction) self.onAction(action,@{});
}
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
  BOOL local = [action.request.URL.path isEqualToString:self.documentURL.path] && action.request.URL.isFileURL;
  decisionHandler(local ? WKNavigationActionPolicyAllow : WKNavigationActionPolicyCancel);
}
- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error { [self fail]; }
- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error { [self fail]; }
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView { [self fail]; }
- (void)invalidate {
  if (self.invalidated) return;
  self.invalidated = YES;
  for (WKWebView *web in @[self.webView,self.menuWebView]) {
    [web stopLoading];
    [web.configuration.userContentController removeScriptMessageHandlerForName:@"motomapBottom"];
    web.navigationDelegate = nil;
  }
  self.onAction = nil; self.onHeight = nil; self.onFailure = nil; self.onMenuVisibility = nil;
}
@end
