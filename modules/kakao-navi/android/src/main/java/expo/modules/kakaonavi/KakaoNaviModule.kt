package expo.modules.kakaonavi

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.kakaomobility.knsdk.KNRoutePriority
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

class KakaoNaviModule : Module() {
  private var locationAllowed = false

  override fun definition() = ModuleDefinition {
    Name("KakaoNavi")
    Constant("bridgeVersion") { 42 }
    Constant("features") { listOf("android_live_guidance", "location_privacy_stop") }
    Events("onGuideStarted", "onGuideEnd", "onGuideFailed", "onGuideMenu")

    AsyncFunction("setLocationUseAllowed") { allowed: Boolean ->
      locationAllowed = allowed
      if (!allowed) KakaoGuideActivity.session?.cancel()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopLocationUse") { completion: Promise ->
      locationAllowed = false
      val session = KakaoGuideActivity.session
      if (session == null) completion.resolve()
      else session.cancel(completion)
    }.runOnQueue(Queues.MAIN)

    OnDestroy {
      Handler(Looper.getMainLooper()).post {
        KakaoGuideActivity.session?.takeIf { it.owner === this@KakaoNaviModule }?.cancel()
      }
    }

    AsyncFunction("showGuideNotice") { message: String ->
      appContext.currentActivity?.let { Toast.makeText(it, message, Toast.LENGTH_SHORT).show() }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("startAndroidGuide") {
        appKey: String, start: List<Double>, goal: List<Double>, goalName: String,
        vias: List<Double>, priorityValue: Int, opening: Promise ->
      val activity = appContext.currentActivity
        ?: throw CodedException("GUIDE_NO_ACTIVITY", "길안내 화면을 열 수 없습니다.", null)
      if (!locationAllowed || !activity.hasWindowFocus()) {
        throw CodedException("GUIDE_INACTIVE", "모토맵 화면에서 다시 시도해 주세요.", null)
      }
      if (ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
        throw CodedException("GUIDE_LOCATION_PERMISSION", "길안내에는 정확한 위치 권한이 필요합니다.", null)
      }
      if (KakaoGuideActivity.session != null) {
        throw CodedException("GUIDE_BUSY", "진행 중인 길안내가 있어요. 잠시 후 다시 시도해 주세요.", null)
      }
      val priority = when (priorityValue) {
        0 -> KNRoutePriority.KNRoutePriority_Recommand
        1 -> KNRoutePriority.KNRoutePriority_Time
        2 -> KNRoutePriority.KNRoutePriority_Distance
        4 -> KNRoutePriority.KNRoutePriority_WideWay
        else -> throw CodedException("GUIDE_PRIORITY", "지원하지 않는 경로 옵션입니다.", null)
      }
      if (start.size != 2 || goal.size != 2 || vias.size % 2 != 0 ||
        (start + goal + vias).chunked(2).any { it[0] !in -180.0..180.0 || it[1] !in -90.0..90.0 }
      ) throw CodedException("GUIDE_COORDINATES", "출발지와 목적지, 경유지를 확인해 주세요.", null)

      val session = KakaoGuideSession(
        this@KakaoNaviModule, appKey, start[0], start[1], goal[0], goal[1], goalName, vias, priority, opening, ::sendEvent,
      )
      KakaoGuideActivity.session = session
      try {
        activity.startActivity(Intent(activity, KakaoGuideActivity::class.java).apply {
          putExtra(KakaoGuideActivity.EXTRA_SESSION_ID, session.id)
        })
      } catch (error: RuntimeException) {
        KakaoGuideActivity.session = null
        throw error
      }
    }.runOnQueue(Queues.MAIN)
  }
}

internal class KakaoGuideSession(
  val owner: KakaoNaviModule,
  val appKey: String,
  val startLng: Double,
  val startLat: Double,
  val goalLng: Double,
  val goalLat: Double,
  val goalName: String,
  val vias: List<Double>,
  val priority: KNRoutePriority,
  val opening: Promise,
  val emit: (String, Bundle) -> Unit,
) {
  val id: String = UUID.randomUUID().toString()
  var activity: KakaoGuideActivity? = null
  private val stopRequests = mutableListOf<Promise>()

  fun cancel(completion: Promise? = null) {
    if (completion != null) stopRequests += completion
    val screen = activity
    if (screen != null) {
      screen.cancelGuide()
    } else {
      opening.reject("GUIDE_CANCELLED", "위치 이용이 중단되었습니다.", null)
      closed()
    }
  }

  fun closed() {
    activity = null
    if (KakaoGuideActivity.session === this) KakaoGuideActivity.session = null
    stopRequests.forEach { it.resolve() }
    stopRequests.clear()
  }
}
