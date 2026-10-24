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
@property(nonatomic, strong) NSURL *documentURL;
@property(nonatomic, strong) NSDictionary *state;
@property(nonatomic) BOOL ready;
@property(nonatomic) BOOL failed;
@property(nonatomic) BOOL invalidated;
@property(nonatomic) BOOL expanded;
@property(nonatomic) CGFloat bottomInset;
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
  WKWebViewConfiguration *config = [WKWebViewConfiguration new];
  KNNaviBottomMessage *handler = [KNNaviBottomMessage new]; handler.owner = self;
  [config.userContentController addScriptMessageHandler:handler name:@"motomapBottom"];
  _webView = [[WKWebView alloc] initWithFrame:self.bounds configuration:config];
  _webView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  _webView.navigationDelegate = self;
  _webView.opaque = NO;
  _webView.backgroundColor = UIColor.clearColor;
  _webView.scrollView.backgroundColor = UIColor.clearColor;
  _webView.scrollView.bounces = NO;
  _webView.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
  [self addSubview:_webView];
  NSURL *url = [NSBundle.mainBundle URLForResource:@"MotoMapNavigationUI" withExtension:@"bundle"];
  NSBundle *bundle = url ? [NSBundle bundleWithURL:url] : nil;
  _documentURL = [bundle URLForResource:@"navigation-bottom" withExtension:@"html"];
  if (_documentURL) [_webView loadFileURL:_documentURL allowingReadAccessToURL:_documentURL.URLByDeletingLastPathComponent];
  else dispatch_async(dispatch_get_main_queue(), ^{ [self fail]; });
  __weak KNNaviBottomPanel *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    if (!weakSelf.ready) [weakSelf fail];
  });
  return self;
}
- (void)fail {
  if (self.invalidated || self.failed) return;
  self.failed = YES; self.ready = NO;
  if (self.onFailure) self.onFailure();
}
- (void)setBottomInset:(CGFloat)inset {
  if (_bottomInset == MAX(0, inset)) return;
  _bottomInset = MAX(0, inset);
  [self publish];
  [self publishHeight];
}
- (void)publishHeight {
  self.accessibilityViewIsModal = self.expanded && self.ready;
  if (self.onHeight) self.onHeight((self.expanded ? 280 : KNNaviBottomCollapsedHeight + ([self.state[@"showRecenter"] boolValue] ? KNNaviBottomRecenterHeight : 0)) + self.bottomInset);
}
- (void)updateState:(NSDictionary *)state {
  BOOL heightChanged = [self.state[@"showRecenter"] boolValue] != [state[@"showRecenter"] boolValue];
  self.state = [state copy];
  if (heightChanged) [self publishHeight];
  [self publish];
}
- (BOOL)pointInside:(CGPoint)point withEvent:(UIEvent *)event {
  if (!self.expanded && [self.state[@"showRecenter"] boolValue] && point.y < KNNaviBottomRecenterHeight &&
      fabs(point.x - self.bounds.size.width / 2) > 80) return NO;
  return [super pointInside:point withEvent:event];
}
- (void)publish {
  if (!self.ready || self.invalidated || self.failed) return;
  NSMutableDictionary *payload = [self.state mutableCopy];
  payload[@"expanded"] = @(self.expanded); payload[@"bottomInset"] = @(self.bottomInset);
  NSData *json = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
  if (!json) return;
  NSString *text = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
  [self.webView evaluateJavaScript:[NSString stringWithFormat:@"window.MotoMapBottom.render(%@)",text] completionHandler:nil];
}
- (BOOL)accessibilityPerformEscape {
  if (!self.expanded) return NO;
  [self collapse]; return YES;
}
- (void)collapse { self.expanded = NO; [self publishHeight]; [self publish]; }
- (void)receiveMessage:(WKScriptMessage *)message {
  if (self.invalidated || self.failed || !message.frameInfo.mainFrame ||
      ![message.frameInfo.request.URL.path isEqualToString:self.documentURL.path] ||
      ![message.body isKindOfClass:NSDictionary.class]) return;
  NSDictionary *body = message.body;
  NSString *action = body[@"action"];
  if (![action isKindOfClass:NSString.class]) return;
  if ([action isEqualToString:@"ready"]) {
    self.ready = YES; [self publishHeight]; [self publish];
    if (self.onAction) self.onAction(@"ready",@{});
    return;
  }
  if (!self.ready) return;
  if ([action isEqualToString:@"menu"]) {
    self.expanded = !self.expanded; [self publishHeight]; [self publish]; return;
  }
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
  [self.webView stopLoading];
  [self.webView.configuration.userContentController removeScriptMessageHandlerForName:@"motomapBottom"];
  self.webView.navigationDelegate = nil;
  self.onAction = nil; self.onHeight = nil; self.onFailure = nil;
}
@end
