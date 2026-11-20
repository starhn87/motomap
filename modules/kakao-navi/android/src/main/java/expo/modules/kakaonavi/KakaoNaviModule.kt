package expo.modules.kakaonavi

import android.Manifest
import android.app.Activity
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
import java.lang.ref.WeakReference
import java.util.UUID

class KakaoNaviModule : Module() {
  private var locationAllowed = false
  private var nextPreviewToken = 0

  override fun definition() = ModuleDefinition {
    Name("KakaoNavi")
    Constant("bridgeVersion") { 50 }
    Constant("features") {
      listOf("android_live_guidance", "location_privacy_stop", "guide_web_bottom", "guide_arrival_record", "guide_route_editing")
    }
    Events("onGuideStarted", "onGuideEnd", "onGuideFailed", "onGuideMenu", "onGuideArrival", "onAndroidGuidePanel")

    AsyncFunction("connectAndroidGuidePanel") { token: String ->
      if (locationAllowed) KakaoGuideActivity.session?.controller?.connectReactPanel(token) else null
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("androidGuidePanelRendered") { token: String ->
      if (locationAllowed) KakaoGuideActivity.session?.controller?.reactPanelRendered(token)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("androidGuidePanelAction") { token: String, action: String, value: Float? ->
      if (locationAllowed) KakaoGuideActivity.session?.controller?.reactPanelAction(token, action, value)
    }.runOnQueue(Queues.MAIN)

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

    OnDestroy { cancelOwnedGuide() }
    OnActivityDestroys { cancelOwnedGuide() }

    OnActivityEntersForeground {
      Handler(Looper.getMainLooper()).postDelayed({
        if (locationAllowed) KakaoGuideActivity.session?.controller?.restoreFromLauncher()
      }, 100)
    }

    AsyncFunction("showGuideNotice") { message: String ->
      val guide = KakaoGuideActivity.session?.controller
      if (guide?.hasWindowFocus() == true) guide.showNotice(message)
      else appContext.currentActivity?.let { Toast.makeText(it, message, Toast.LENGTH_SHORT).show() }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("openGuidePreview") {
      requireGuide().openPreview(++nextPreviewToken)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("returnToGuide") { token: Int ->
      locationAllowed && KakaoGuideActivity.session?.controller?.returnToGuide(token) == true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("resumeGuide") {
        token: Int, lng: Double, lat: Double, name: String, vias: List<Double>, priorityValue: Int, completion: Promise ->
      if (!validCoordinates(listOf(lng, lat) + vias)) {
        throw CodedException("GUIDE_COORDINATES", "목적지와 경유지를 확인해 주세요.", null)
      }
      requireGuide().resumeGuide(token, lng, lat, name, vias, routePriority(priorityValue), completion)
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
      if (start.size != 2 || goal.size != 2 || !validCoordinates(start + goal + vias)) {
        throw CodedException("GUIDE_COORDINATES", "출발지와 목적지, 경유지를 확인해 주세요.", null)
      }

      val session = KakaoGuideSession(
        this@KakaoNaviModule, WeakReference(activity), appKey, start[0], start[1], goal[0], goal[1],
        goalName, vias, routePriority(priorityValue), opening, ::sendEvent,
      )
      KakaoGuideActivity.session = session
      KakaoGuideController(session, activity.application).also {
        session.controller = it
        it.prepare()
      }
    }.runOnQueue(Queues.MAIN)
  }

  private fun cancelOwnedGuide() {
    Handler(Looper.getMainLooper()).post {
      KakaoGuideActivity.session?.takeIf { it.owner === this }?.cancel()
    }
  }

  private fun requireGuide(): KakaoGuideController =
    KakaoGuideActivity.session?.controller?.takeIf { locationAllowed }
      ?: throw CodedException("E_KNSDK_RESUME_STATE", "현재 길안내를 확인할 수 없습니다.", null)

  private fun validCoordinates(values: List<Double>): Boolean =
    values.size % 2 == 0 && values.chunked(2).all { it[0] in -180.0..180.0 && it[1] in -90.0..90.0 }

  private fun routePriority(value: Int) = when (value) {
    0 -> KNRoutePriority.KNRoutePriority_Recommand
    1 -> KNRoutePriority.KNRoutePriority_Time
    2 -> KNRoutePriority.KNRoutePriority_Distance
    4 -> KNRoutePriority.KNRoutePriority_WideWay
    else -> throw CodedException("GUIDE_PRIORITY", "지원하지 않는 경로 옵션입니다.", null)
  }
}

internal class KakaoGuideSession(
  val owner: KakaoNaviModule,
  val appActivity: WeakReference<Activity>,
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
  var controller: KakaoGuideController? = null
  private val stopRequests = mutableListOf<Promise>()

  fun guideIntent(context: Activity) = Intent(context, KakaoGuideActivity::class.java).apply {
    putExtra(KakaoGuideActivity.EXTRA_SESSION_ID, id)
  }

  fun cancel(completion: Promise? = null) {
    if (completion != null) stopRequests += completion
    val screen = controller
    if (screen != null) {
      screen.cancelGuide()
    } else {
      opening.reject("GUIDE_CANCELLED", "위치 이용이 중단되었습니다.", null)
      closed()
    }
  }

  fun closed() {
    controller = null
    if (KakaoGuideActivity.session === this) KakaoGuideActivity.session = null
    stopRequests.forEach { it.resolve() }
    stopRequests.clear()
  }
}
