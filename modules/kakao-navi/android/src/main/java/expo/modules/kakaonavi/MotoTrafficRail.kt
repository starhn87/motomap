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

internal fun remainingTrafficFraction(remaining: Int, total: Int, hasPosition: Boolean): Float =
  if (hasPosition && total > 0) remaining.coerceIn(0, total).toFloat() / total else 1f

internal data class MotoTrafficSnapshot(
  val colors: List<Int>,
  val fraction: Float,
  val sampledFraction: Float,
  val positioned: Boolean,
  val visible: Boolean,
  val height: Int,
)

internal class MotoTrafficRail(context: Context) : View(context) {
  var drawNative = true
    set(value) {
      field = value
      visibility = if (value) VISIBLE else GONE
    }
  private data class Profile(val states: List<KNTrafficState>, val fraction: Float)

  private val unknown = 0xFFB8BBC0.toInt()
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val outline = RectF()
  private val segment = RectF()
  private val path = Path()
  private val colors = KNTrafficState.entries.associateBy { it.value }
  private val smooth = KNMapRouteTheme.trafficDay().lineColors.normal
  private var route: KNRoute? = null
  private var profile: Profile? = null
  private var previousProfile: Profile? = null
  private var sampledAt = 0L
  private var sampledRemaining = 0
  private var displayedFraction = 1f
  private var targetFraction = 1f
  private var positioned = false
  private var visible = false
  private val progressAnimator = ValueAnimator().apply {
    duration = 300
    addUpdateListener {
      displayedFraction = it.animatedValue as Float
      if (it.animatedFraction >= 1f) previousProfile = null
      invalidate()
    }
  }

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
    val fraction = remainingTrafficFraction(distance, route.totalDist, hasPosition)
    val samePositionMode = this.route === route && positioned == hasPosition
    setProgress(fraction, drawNative && visible && samePositionMode && hasPosition && ValueAnimator.areAnimatorsEnabled())
    val now = SystemClock.elapsedRealtime()
    if (samePositionMode && profile != null &&
      now - sampledAt < 10_000 && abs(distance - sampledRemaining) < maxOf(100, sampledRemaining / 48)
    ) return
    this.route = route
    sampledRemaining = distance
    sampledAt = now
    positioned = hasPosition
    // 새 표본이 시작되는 곳까지 화살표가 갈 동안, 이미 그려 둔 색을 유지한다.
    val oldProfile = profile
    if (progressAnimator.isRunning && fraction < displayedFraction &&
      oldProfile != null && oldProfile.fraction > (previousProfile?.fraction ?: fraction)
    ) previousProfile = oldProfile
    val count = minOf(48, maxOf(1, distance / 25))
    var previous = from
    val samples = List(count) { index ->
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
    profile = Profile(samples, fraction)
    contentDescription = if (hasPosition) "남은 경로 교통 흐름, ${distance / 1000.0}킬로미터"
      else "경로 교통 흐름, GPS 수신 대기"
    invalidate()
  }

  private fun setProgress(fraction: Float, animated: Boolean) {
    if (fraction == targetFraction && (animated || !progressAnimator.isRunning)) return
    progressAnimator.cancel()
    targetFraction = fraction
    if (animated && displayedFraction != fraction) {
      progressAnimator.setFloatValues(displayedFraction, fraction)
      progressAnimator.start()
    } else {
      displayedFraction = fraction
      previousProfile = null
      invalidate()
    }
  }

  // 같은 경로의 마지막 교통 표본과 진행 위치는 GPS 수신 중단에도 보존한다.
  fun retain(route: KNRoute): Boolean {
    if (this.route !== route || profile == null || sampledAt == 0L) return false
    positioned = false
    contentDescription = "경로 교통 흐름, GPS 수신 대기, 확인된 구간 길이 ${sampledRemaining / 1000.0}킬로미터"
    invalidate()
    return true
  }

  fun unknown(route: KNRoute) {
    if (this.route === route && !positioned && sampledAt == 0L) return
    this.route = route
    positioned = false
    sampledAt = 0
    setProgress(1f, false)
    profile = Profile(listOf(KNTrafficState.KNTrafficState_Unknown), 1f)
    contentDescription = "경로 교통 흐름, 정보 없음"
    invalidate()
  }

  fun show(show: Boolean) {
    val target = show && profile != null
    if (visible == target) return
    visible = target
    if (!target) setProgress(targetFraction, false)
    if (!drawNative) return
    importantForAccessibility = if (target) IMPORTANT_FOR_ACCESSIBILITY_YES else IMPORTANT_FOR_ACCESSIBILITY_NO
    animate().cancel()
    if (ValueAnimator.areAnimatorsEnabled()) animate().alpha(if (target) 1f else 0f).setDuration(170).start()
    else alpha = if (target) 1f else 0f
  }

  fun clear() {
    route = null
    profile = null
    previousProfile = null
    setProgress(1f, false)
    show(false)
    invalidate()
  }

  override fun onDetachedFromWindow() {
    setProgress(targetFraction, false)
    super.onDetachedFromWindow()
  }

  override fun onDraw(canvas: Canvas) {
    val currentProfile = profile ?: return
    val unit = resources.displayMetrics.density
    val x = width / 2f
    val radius = 11 * unit
    outline.set(x - 4 * unit, radius, x + 4 * unit, height - radius)
    val y = outline.top + outline.height() * displayedFraction
    paint.color = Color.WHITE
    canvas.drawRoundRect(outline, 4 * unit, 4 * unit, paint)
    outline.inset(1.5f * unit, 1.5f * unit)
    path.reset()
    path.addRoundRect(outline, 2.5f * unit, 2.5f * unit, Path.Direction.CW)
    canvas.save()
    canvas.clipPath(path)
    // 캐시된 색 구간은 경로의 같은 거리에 두고 현재 위치 아래를 가린다.
    paint.color = 0xFFA1A8B1.toInt()
    canvas.drawRect(outline, paint)
    val liveBottom = outline.top + outline.height() * displayedFraction
    canvas.clipRect(outline.left, outline.top, outline.right, liveBottom)
    paint.color = unknown
    canvas.drawRect(outline, paint)
    previousProfile?.let { drawProfile(canvas, it, unit) }
    drawProfile(canvas, currentProfile, unit)
    canvas.restore()
    val accent = if (positioned) 0xFF22C55E.toInt() else 0xFFA1A1AA.toInt()
    paint.color = accent
    canvas.drawCircle(x, y, radius, paint)
    paint.color = Color.WHITE
    canvas.drawCircle(x, y, 9 * unit, paint)
    paint.color = accent
    path.reset()
    // 지도 자차(navi_car_on_bike)의 원 대비 화살표 비율을 따른다.
    path.moveTo(x, y - 4.6f * unit)
    path.lineTo(x + 5.5f * unit, y + 4f * unit)
    path.lineTo(x, y + 1.6f * unit)
    path.lineTo(x - 5.5f * unit, y + 4f * unit)
    path.close()
    canvas.drawPath(path, paint)
  }

  fun snapshot(heightDp: Int): MotoTrafficSnapshot? = profile?.let {
    MotoTrafficSnapshot(it.states.map(::trafficColor), targetFraction, it.fraction, positioned, visible, heightDp)
  }

  private fun trafficColor(state: KNTrafficState): Int = when (state) {
    KNTrafficState.KNTrafficState_Red -> 0xFFF7404A.toInt()
    KNTrafficState.KNTrafficState_Orange -> 0xFFFF990D.toInt()
    KNTrafficState.KNTrafficState_Yellow -> 0xFFFFD926.toInt()
    KNTrafficState.KNTrafficState_Blue -> smooth
    KNTrafficState.KNTrafficState_Blocked -> 0xFF851F29.toInt()
    else -> unknown
  }

  private fun drawProfile(canvas: Canvas, profile: Profile, unit: Float) {
    val sampledBottom = outline.top + outline.height() * profile.fraction
    val step = (sampledBottom - outline.top) / profile.states.size
    profile.states.forEachIndexed { index, state ->
      paint.color = trafficColor(state)
      segment.set(outline.left, sampledBottom - (index + 1) * step, outline.right, sampledBottom - index * step + .5f)
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
  }
}
