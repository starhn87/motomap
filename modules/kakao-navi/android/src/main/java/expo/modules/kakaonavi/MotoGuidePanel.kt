package expo.modules.kakaonavi

import android.animation.ValueAnimator
import android.graphics.Color
import android.view.animation.DecelerateInterpolator
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import kotlin.math.roundToInt

internal class MotoGuidePanel(
  private val root: FrameLayout,
  private val onReady: (Boolean) -> Unit,
  private val onAction: (String, Float?) -> Unit,
  private val onExpanded: () -> Unit,
) {
  private companion object {
    const val ORIGIN = "https://appassets.androidplatform.net"
    const val DIRECTORY = "/motomap-guide/"
    const val DOCUMENT = "${ORIGIN}${DIRECTORY}navigation-bottom.html"
    const val BRIDGE = "MotoMapAndroid"
    val fonts = setOf("Pretendard-Regular.woff2", "Pretendard-SemiBold.woff2", "Pretendard-Bold.woff2")
  }

  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { destroy() }
  private var state: Map<String, Any?> = emptyMap()
  private var lastRendered: String? = null
  private var ready = false
  private var closed = false
  private var collapsing = false
  var expanded = false
    private set

  private val backdrop = View(root.context).apply {
    setBackgroundColor(0x55000000)
    visibility = View.GONE
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    setOnClickListener { setExpanded(false) }
  }

  private val web = object : WebView(root.context) {
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
      if (!expanded && event.actionMasked == MotionEvent.ACTION_DOWN && event.y < height - dp(68)) {
        if (state["showRecenter"] != true || event.y > dp(44) ||
          kotlin.math.abs(event.x - width / 2f) > dp(66)) return false
      }
      return super.dispatchTouchEvent(event)
    }
  }

  fun load() {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      destroy()
      return
    }
    root.addView(backdrop, FrameLayout.LayoutParams(-1, -1))
    root.addView(web)
    web.visibility = View.INVISIBLE
    web.setBackgroundColor(Color.TRANSPARENT)
    web.overScrollMode = View.OVER_SCROLL_NEVER
    web.settings.javaScriptEnabled = true
    web.settings.allowFileAccess = false
    web.settings.allowContentAccess = false
    web.settings.blockNetworkLoads = true
    web.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true

      override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
        val url = request.url.toString()
        val path = url.removePrefix(ORIGIN + DIRECTORY)
        val mime = when {
          url == DOCUMENT -> "text/html"
          url == ORIGIN + DIRECTORY + path && path in fonts -> "font/woff2"
          else -> return WebResourceResponse("text/plain", "UTF-8", null)
        }
        return try {
          WebResourceResponse(mime, if (path in fonts) null else "UTF-8", view.context.assets.open("motomap-guide/$path"))
        } catch (_: java.io.IOException) {
          WebResourceResponse("text/plain", "UTF-8", null)
        }
      }

      override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        if (request.isForMainFrame) destroy()
      }

      override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        destroy()
        return true
      }
    }
    WebViewCompat.addWebMessageListener(web, BRIDGE, setOf(ORIGIN)) { view, message, origin, mainFrame, _ ->
      if (!closed && mainFrame && origin == Uri.parse(ORIGIN) && view.url == DOCUMENT) {
        val data = message.data
        if (data != null && data.length <= 512) receive(data)
      }
    }
    layout()
    handler.postDelayed(timeout, 10_000)
    web.loadUrl(DOCUMENT)
  }

  private fun receive(raw: String) {
    val payload = try { JSONObject(raw) } catch (_: org.json.JSONException) { return }
    val action = payload.optString("action")
    if (action == "ready" && !ready) {
      ready = true
      handler.removeCallbacks(timeout)
      web.visibility = View.VISIBLE
      render()
      onReady(true)
    } else if (ready) {
      when (action) {
        "menu" -> setExpanded(!expanded)
        "volume" -> (payload.opt("value") as? Number)?.toFloat()?.takeIf { it.isFinite() }
          ?.let { onAction(action, it.coerceIn(0f, 1f)) }
        "routeEdit" -> if (state["canRouteEdit"] == true && state["busy"] != true) {
          setExpanded(false)
          onAction(action, null)
        }
        "end", "refresh", "recenter" -> {
          setExpanded(false)
          onAction(action, null)
        }
      }
    }
  }

  fun setExpanded(expand: Boolean) {
    if (!ready || expanded == expand || collapsing) return
    if (expand) {
      expanded = true
      render()
      backdrop.visibility = View.VISIBLE
      onExpanded()
      if (ValueAnimator.areAnimatorsEnabled()) {
        web.translationY = (web.layoutParams.height + dp(8)).toFloat()
        backdrop.alpha = 0f
        web.animate().translationY(0f).setInterpolator(DecelerateInterpolator()).setDuration(220).start()
        backdrop.animate().alpha(1f).setDuration(180).start()
      } else backdrop.alpha = 1f
    } else if (ValueAnimator.areAnimatorsEnabled()) {
      collapsing = true
      backdrop.animate().alpha(0f).setDuration(160).start()
      web.animate().translationY((web.height + dp(8)).toFloat()).setDuration(180)
        .withEndAction { finishCollapse() }.start()
    } else finishCollapse()
  }

  private fun finishCollapse() {
    collapsing = false
    expanded = false
    web.translationY = 0f
    backdrop.visibility = View.GONE
    render()
    onExpanded()
  }

  fun update(values: Map<String, Any?>) {
    if (state == values) return
    state = values
    render()
  }

  private fun render() {
    if (!ready) return
    layout()
    val json = JSONObject(state + mapOf("expanded" to expanded, "menuOpen" to expanded)).toString()
    if (json == lastRendered) return
    lastRendered = json
    web.evaluateJavascript("window.MotoMapBottom.render(JSON.parse(${JSONObject.quote(json)}))", null)
  }

  fun toast(text: String) {
    if (ready) web.evaluateJavascript("window.MotoMapBottom.toast(${JSONObject.quote(text)})", null)
  }

  private fun layout() {
    val height = when {
      expanded -> minOf(dp(238), (root.height - dp(44)).takeIf { it > 0 } ?: dp(238))
      else -> dp(120)
    }
    val params = web.layoutParams as? FrameLayout.LayoutParams
    val inset = if (expanded) 0 else dp(12)
    val bottom = if (expanded) 0 else dp(8)
    if (params?.height == height && params.marginStart == inset && params.bottomMargin == bottom) return
    web.layoutParams = FrameLayout.LayoutParams(-1, height, Gravity.BOTTOM).apply {
      marginStart = inset
      marginEnd = inset
      bottomMargin = bottom
    }
  }

  fun destroy() {
    if (closed) return
    closed = true
    ready = false
    expanded = false
    handler.removeCallbacks(timeout)
    web.animate().cancel()
    backdrop.animate().cancel()
    root.removeView(web)
    root.removeView(backdrop)
    web.destroy()
    onReady(false)
  }

  private fun dp(value: Int) = (value * root.resources.displayMetrics.density).roundToInt()
}
