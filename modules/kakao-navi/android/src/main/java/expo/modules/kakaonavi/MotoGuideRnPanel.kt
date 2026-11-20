package expo.modules.kakaonavi

import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.widget.FrameLayout
import com.facebook.react.ReactApplication
import com.facebook.react.interfaces.fabric.ReactSurface
import java.util.UUID

internal interface MotoGuideControls {
  val expanded: Boolean
  fun load()
  fun update(values: Map<String, Any?>)
  fun setExpanded(expand: Boolean)
  fun toast(text: String)
  fun destroy()
}

internal class MotoGuideRnPanel(
  private val screen: KakaoGuideActivity,
  private val root: FrameLayout,
  private val emit: (Bundle) -> Unit,
  private val onReady: (Boolean) -> Unit,
  private val onAction: (String, Float?) -> Unit,
  private val onExpanded: () -> Unit,
) : MotoGuideControls {
  val token: String = UUID.randomUUID().toString()
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { if (!closed && !ready) onReady(false) }
  private val reactHost = (screen.application as ReactApplication).reactHost
    ?: error("ReactHost is unavailable")
  private var surface: ReactSurface? = null
  private var ready = false
  private var closed = false
  private var state: Map<String, Any?> = emptyMap()
  private var traffic: MotoTrafficSnapshot? = null
  override var expanded = false
    private set

  private val overlay = object : FrameLayout(screen) {
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
      if (!expanded && event.actionMasked == MotionEvent.ACTION_DOWN) {
        val inBar = event.y >= height - dp(76) && event.x in dp(12)..(width - dp(12))
        val inRecenter = state["showRecenter"] == true && state["fullWidthStatus"] == null &&
          event.y in (height - dp(128))..(height - dp(82)) &&
          kotlin.math.abs(event.x - width / 2f) <= dp(68)
        if (!inBar && !inRecenter) return false
      }
      return super.dispatchTouchEvent(event)
    }
  }

  override fun load() {
    val initial = Bundle().apply { putString("token", token) }
    val next = reactHost.createSurface(screen, "MotoMapAndroidGuide", initial)
    surface = next
    val view = requireNotNull(next.view)
    view.setBackgroundColor(Color.TRANSPARENT)
    overlay.addView(view, FrameLayout.LayoutParams(-1, -1))
    root.addView(overlay, FrameLayout.LayoutParams(-1, -1))
    handler.postDelayed(timeout, 3_000)
    next.start()
  }

  fun connect(key: String): Bundle? = if (accepts(key)) snapshot() else null

  fun didRender(key: String) {
    if (!accepts(key) || ready) return
    ready = true
    handler.removeCallbacks(timeout)
    onReady(true)
  }

  fun action(key: String, action: String, value: Float?) {
    if (!accepts(key) || !ready) return
    when (action) {
      "menu" -> setExpanded(!expanded)
      "volume" -> value?.takeIf { it.isFinite() }?.let { onAction(action, it.coerceIn(0f, 1f)) }
      "routeEdit" -> if (state["canRouteEdit"] == true && state["busy"] != true) {
        setExpanded(false)
        onAction(action, null)
      }
      "refresh", "recenter", "end" -> {
        setExpanded(false)
        onAction(action, null)
      }
    }
  }

  private fun accepts(key: String) = !closed && token == key

  override fun update(values: Map<String, Any?>) {
    if (state == values) return
    state = values
    publish()
  }

  fun updateTraffic(value: MotoTrafficSnapshot?) {
    if (traffic == value) return
    traffic = value
    publish()
  }

  override fun setExpanded(expand: Boolean) {
    if (!ready || expanded == expand) return
    expanded = expand
    publish()
    onExpanded()
  }

  override fun toast(text: String) {
    if (ready) emit(Bundle().apply {
      putString("token", token)
      putString("toast", text)
    })
  }

  private fun publish() {
    if (!closed) emit(snapshot())
  }

  private fun snapshot() = Bundle().apply {
    putString("token", token)
    putBoolean("expanded", expanded)
    putBundle("state", Bundle().apply {
      for ((key, value) in state) when (value) {
        is String -> putString(key, value)
        is Number -> putDouble(key, value.toDouble())
        is Boolean -> putBoolean(key, value)
        null -> Unit
      }
    })
    traffic?.let { data ->
      putBundle("traffic", Bundle().apply {
        putIntArray("colors", data.colors.toIntArray())
        putDouble("fraction", data.fraction.toDouble())
        putDouble("sampledFraction", data.sampledFraction.toDouble())
        putBoolean("positioned", data.positioned)
        putBoolean("visible", data.visible)
        putInt("height", data.height)
      })
    }
  }

  override fun destroy() {
    if (closed) return
    closed = true
    ready = false
    handler.removeCallbacks(timeout)
    surface?.let {
      it.stop()
      it.detach()
    }
    surface = null
    root.removeView(overlay)
    overlay.removeAllViews()
  }

  private fun dp(value: Int): Float = value * root.resources.displayMetrics.density
}
