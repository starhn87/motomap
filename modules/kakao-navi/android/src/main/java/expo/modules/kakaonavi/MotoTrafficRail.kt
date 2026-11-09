package expo.modules.kakaonavi

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.os.SystemClock
import android.view.View
import com.kakaomobility.knsdk.KNTrafficState
import com.kakaomobility.knsdk.guidance.knguidance.common.KNLocation
import com.kakaomobility.knsdk.map.uicustomsupport.renewal.theme.base.KNMapRouteTheme
import com.kakaomobility.knsdk.trip.kntrip.knroute.KNRoute
import kotlin.math.abs

internal class MotoTrafficRail(context: Context) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val outline = RectF()
  private val segment = RectF()
  private val path = Path()
  private val colors = KNTrafficState.entries.associateBy { it.value }
  private val smooth = KNMapRouteTheme.trafficDay().lineColors.normal
  private var route: KNRoute? = null
  private var samples = emptyList<KNTrafficState>()
  private var sampledAt = 0L
  private var remaining = 0
  private var positioned = false
  private var visible = false

  init {
    alpha = 0f
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  fun sample(route: KNRoute, from: KNLocation, hasPosition: Boolean) {
    val distance = route.remainDistFromLocation(from)
    if (distance <= 0) {
      clear()
      return
    }
    val now = SystemClock.elapsedRealtime()
    if (this.route === route && positioned == hasPosition && samples.isNotEmpty() &&
      now - sampledAt < 10_000 && abs(distance - remaining) < maxOf(100, remaining / 48)
    ) return
    this.route = route
    remaining = distance
    sampledAt = now
    positioned = hasPosition
    val count = minOf(48, maxOf(1, distance / 25))
    var previous = from
    samples = List(count) { index ->
      val end = from.locationAfterDist(minOf(distance - 1, distance * (index + 1) / count))
      if (end == null || end.route !== route || end.distFromS <= previous.distFromS) {
        KNTrafficState.KNTrafficState_Unknown
      } else {
        // 이 API는 평균 속도 × 10에 KNTrafficState 값을 더해 반환한다.
        val status = colors[previous.avrTrafStToLocation(end) % 10] ?: KNTrafficState.KNTrafficState_Unknown
        previous = end
        status
      }
    }
    contentDescription = if (hasPosition) "남은 경로 교통 흐름, ${distance / 1000.0}킬로미터"
      else "경로 교통 흐름, GPS 수신 대기"
    invalidate()
  }

  fun unknown(route: KNRoute) {
    if (this.route === route && !positioned && sampledAt == 0L) return
    this.route = route
    positioned = false
    sampledAt = 0
    samples = listOf(KNTrafficState.KNTrafficState_Unknown)
    contentDescription = "경로 교통 흐름, 정보 없음"
    invalidate()
  }

  fun show(show: Boolean) {
    val target = show && samples.isNotEmpty()
    if (visible == target) return
    visible = target
    importantForAccessibility = if (target) IMPORTANT_FOR_ACCESSIBILITY_YES else IMPORTANT_FOR_ACCESSIBILITY_NO
    animate().cancel()
    if (ValueAnimator.areAnimatorsEnabled()) animate().alpha(if (target) 1f else 0f).setDuration(170).start()
    else alpha = if (target) 1f else 0f
  }

  fun clear() {
    route = null
    samples = emptyList()
    show(false)
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    if (samples.isEmpty()) return
    val unit = resources.displayMetrics.density
    val x = width / 2f
    val y = height - 11 * unit
    outline.set(x - 4 * unit, 0f, x + 4 * unit, y)
    paint.color = Color.WHITE
    canvas.drawRoundRect(outline, 4 * unit, 4 * unit, paint)
    outline.inset(1.5f * unit, 1.5f * unit)
    path.reset()
    path.addRoundRect(outline, 2.5f * unit, 2.5f * unit, Path.Direction.CW)
    canvas.save()
    canvas.clipPath(path)
    val step = outline.height() / samples.size
    samples.forEachIndexed { index, state ->
      paint.color = when (state) {
        KNTrafficState.KNTrafficState_Red -> 0xFFF7404A.toInt()
        KNTrafficState.KNTrafficState_Orange -> 0xFFFF990D.toInt()
        KNTrafficState.KNTrafficState_Yellow -> 0xFFFFD926.toInt()
        KNTrafficState.KNTrafficState_Blue -> smooth
        KNTrafficState.KNTrafficState_Blocked -> 0xFF851F29.toInt()
        else -> 0xFFB8BBC0.toInt()
      }
      segment.set(outline.left, outline.bottom - (index + 1) * step, outline.right, outline.bottom - index * step + .5f)
      canvas.drawRect(segment, paint)
      if (state == KNTrafficState.KNTrafficState_Blocked) {
        canvas.save()
        canvas.clipRect(segment)
        paint.color = Color.WHITE
        var line = segment.top
        while (line < segment.bottom) {
          canvas.drawLine(segment.left, line + 3 * unit, segment.right, line, paint)
          line += 6 * unit
        }
        canvas.restore()
      }
    }
    canvas.restore()
    val accent = if (positioned) 0xFF22C55E.toInt() else 0xFFA1A1AA.toInt()
    paint.color = accent
    canvas.drawCircle(x, y, 11 * unit, paint)
    paint.color = Color.WHITE
    canvas.drawCircle(x, y, 9 * unit, paint)
    paint.color = accent
    path.reset()
    path.moveTo(x, y - 5 * unit)
    path.lineTo(x + 4 * unit, y + 3 * unit)
    path.lineTo(x, y + unit)
    path.lineTo(x - 4 * unit, y + 3 * unit)
    path.close()
    canvas.drawPath(path, paint)
  }
}
