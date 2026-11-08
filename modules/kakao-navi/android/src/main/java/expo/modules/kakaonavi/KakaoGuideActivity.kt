package expo.modules.kakaonavi

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.kakaomobility.knsdk.KNCarType
import com.kakaomobility.knsdk.KNLanguageType
import com.kakaomobility.knsdk.KNRouteAvoidOption
import com.kakaomobility.knsdk.KNSDK
import com.kakaomobility.knsdk.common.objects.KNError
import com.kakaomobility.knsdk.common.objects.KNPOI
import com.kakaomobility.knsdk.guidance.knguidance.KNGuideRouteChangeReason
import com.kakaomobility.knsdk.guidance.knguidance.KNGuideState
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_CitsGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_GuideStateDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_LocationGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_RouteGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_SafetyGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_VoiceGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.citsguide.KNGuide_Cits
import com.kakaomobility.knsdk.guidance.knguidance.common.KNLocation
import com.kakaomobility.knsdk.guidance.knguidance.locationguide.KNGuide_Location
import com.kakaomobility.knsdk.guidance.knguidance.routeguide.KNGuide_Route
import com.kakaomobility.knsdk.guidance.knguidance.routeguide.objects.KNMultiRouteInfo
import com.kakaomobility.knsdk.guidance.knguidance.safetyguide.KNGuide_Safety
import com.kakaomobility.knsdk.guidance.knguidance.safetyguide.objects.KNSafety
import com.kakaomobility.knsdk.guidance.knguidance.voiceguide.KNGuide_Voice
import com.kakaomobility.knsdk.trip.knrouteconfiguration.KNRouteConfiguration
import com.kakaomobility.knsdk.trip.kntrip.KNTrip
import com.kakaomobility.knsdk.trip.kntrip.knroute.KNRoute
import com.kakaomobility.knsdk.ui.view.KNNaviView
import com.kakaomobility.knsdk.ui.view.KNNaviView_GuideStateDelegate
import kotlin.math.roundToInt

class KakaoGuideActivity : AppCompatActivity(),
  KNNaviView_GuideStateDelegate,
  KNGuidance_GuideStateDelegate,
  KNGuidance_LocationGuideDelegate,
  KNGuidance_RouteGuideDelegate,
  KNGuidance_SafetyGuideDelegate,
  KNGuidance_VoiceGuideDelegate,
  KNGuidance_CitsGuideDelegate {

  companion object {
    // 모듈과 Activity 모두 메인 스레드에서 접근한다. 위치 좌표를 Intent에 저장하지 않는다.
    internal const val EXTRA_SESSION_ID = "expo.modules.kakaonavi.session_id"
    internal var session: KakaoGuideSession? = null
    private val avoidOptions = KNRouteAvoidOption.KNRouteAvoidOption_MotorWay.value
  }

  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { finishGuide("카카오내비 응답이 늦어지고 있어요. 다시 시도해 주세요.") }
  private var request: KakaoGuideSession? = null
  private var installed = false
  private var view: KNNaviView? = null
  private var guidance: KNGuidance? = null
  private var started = false
  private var ended = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val request = session
    if (request == null || request.activity != null || request.id != intent.getStringExtra(EXTRA_SESSION_ID)) {
      finish()
      return
    }
    this.request = request
    request.activity = this

    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        if (!started) {
          cancelGuide()
          return
        }
        AlertDialog.Builder(this@KakaoGuideActivity)
          .setTitle("길안내를 종료할까요?")
          .setNegativeButton("계속 안내", null)
          .setPositiveButton("안내 종료") { _, _ -> finishGuide() }
          .show()
      }
    })
    setContentView(LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      addView(ProgressBar(context))
      addView(TextView(context).apply { text = "카카오내비 안내를 준비하고 있어요" })
    })
    handler.postDelayed(timeout, 60_000)
    try {
      KNSDK.install(application, filesDir.resolve("kakao-navi").absolutePath)
      installed = true
      val appVersion = packageManager.getPackageInfo(packageName, 0).versionName ?: "1"
      KNSDK.initializeWithAppKey(
        request.appKey, appVersion, null, null, KNLanguageType.KNLanguageType_KOREAN,
      ) { error ->
        runOnUiThread {
          if (ended) return@runOnUiThread
          if (error != null) {
            finishGuide("카카오내비 초기화에 실패했습니다.", "E_KNSDK_INIT_${error.code}")
          } else requestRoute(request)
        }
      }
    } catch (_: RuntimeException) {
      finishGuide("카카오내비를 준비하지 못했어요. 다시 시도해 주세요.")
    }
  }

  private fun requestRoute(request: KakaoGuideSession) {
    val origin = poi("출발지", request.startLng, request.startLat)
    val destination = poi(request.goalName, request.goalLng, request.goalLat)
    val vias = request.vias.chunked(2).mapIndexed { index, pair ->
      poi("경유지 ${index + 1}", pair[0], pair[1])
    }.toMutableList()
    KNSDK.makeTripWithStart(origin, destination, vias.ifEmpty { null }) { error, trip ->
      runOnUiThread {
        if (ended) return@runOnUiThread
        if (error != null || trip == null) {
          fail(error)
          return@runOnUiThread
        }
        trip.setRouteConfig(KNRouteConfiguration(KNCarType.KNCarType_Bike))
        trip.routeWithPriority(request.priority, avoidOptions) { routeError, routes ->
          runOnUiThread {
            if (ended) return@runOnUiThread
            if (routeError != null || routes.isNullOrEmpty()) fail(routeError)
            else showGuide(request, trip)
          }
        }
      }
    }
  }

  private fun poi(name: String, longitude: Double, latitude: Double): KNPOI {
    val coordinate = KNSDK.convertWGS84ToKATEC(longitude, latitude)
    return KNPOI(name, coordinate.x.roundToInt(), coordinate.y.roundToInt())
  }

  private fun showGuide(request: KakaoGuideSession, trip: KNTrip) {
    val engine = KNSDK.sharedGuidance()
    if (engine == null) {
      finishGuide("카카오내비 안내 화면을 열지 못했어요.")
      return
    }
    val naviView = KNNaviView(this).apply {
      // SDK UI에서 경로 설정을 다시 만들 때도 이륜차 차종을 사용한다.
      carType = KNCarType.KNCarType_Bike
      guideStateDelegate = this@KakaoGuideActivity
    }
    view = naviView
    guidance = engine
    engine.guideStateDelegate = this
    engine.locationGuideDelegate = this
    engine.routeGuideDelegate = this
    engine.safetyGuideDelegate = this
    engine.voiceGuideDelegate = this
    engine.citsGuideDelegate = this
    val root = android.widget.FrameLayout(this).apply { addView(naviView) }
    ViewCompat.setOnApplyWindowInsetsListener(root) { target, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      target.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }
    setContentView(root)
    naviView.initWithGuidance(engine, trip, request.priority, avoidOptions)
  }

  internal fun cancelGuide() = finishGuide("길안내 시작이 취소되었습니다.", "GUIDE_CANCELLED")

  private fun fail(error: KNError?) =
    finishGuide("카카오내비에서 경로를 준비하지 못했어요.", "E_KNSDK_ROUTE_${error?.code ?: "UNKNOWN"}")

  private fun finishGuide(message: String? = null, code: String? = null) {
    completeGuide(message, code)
    finish()
  }

  private fun completeGuide(message: String?, code: String?) {
    if (ended) return
    ended = true
    handler.removeCallbacks(timeout)
    if (started) request?.emit?.invoke("onGuideEnd", Bundle())
    else request?.opening?.reject(code ?: "GUIDE_FAILED", message ?: "길안내 시작이 취소되었습니다.", null)
    guidance?.stop()
  }

  override fun onStop() {
    super.onStop()
    if (!started && !ended && request != null) cancelGuide()
  }

  override fun onDestroy() {
    completeGuide(null, null)
    guidance?.apply {
      guideStateDelegate = null
      locationGuideDelegate = null
      routeGuideDelegate = null
      safetyGuideDelegate = null
      voiceGuideDelegate = null
      citsGuideDelegate = null
    }
    view?.guideStateDelegate = null
    view?.let { (it.parent as? android.view.ViewGroup)?.removeView(it) }
    super.onDestroy()
    if (installed) KNSDK.KNSDKRelease()
    request?.closed()
    request = null
  }

  override fun naviViewGuideState(state: KNGuideState) = Unit
  override fun naviViewGuideEnded() = finishGuide()

  override fun guidanceGuideStarted(guidance: KNGuidance) {
    if (ended) return
    view?.guidanceGuideStarted(guidance)
    if (!started) {
      started = true
      handler.removeCallbacks(timeout)
      request?.emit?.invoke("onGuideStarted", Bundle())
      request?.opening?.resolve()
    }
  }

  override fun guidanceGuideEnded(guidance: KNGuidance) {
    if (ended) return
    view?.guidanceGuideEnded(guidance)
    finishGuide()
  }

  override fun guidanceCheckingRouteChange(guidance: KNGuidance) {
    view?.guidanceCheckingRouteChange(guidance)
  }

  override fun guidanceRouteUnchanged(guidance: KNGuidance) {
    view?.guidanceRouteUnchanged(guidance)
  }

  override fun guidanceRouteUnchangedWithError(guidance: KNGuidance, error: KNError) {
    if (!started) fail(error) else view?.guidanceRouteUnchangedWithError(guidance, error)
  }

  override fun guidanceOutOfRoute(guidance: KNGuidance) {
    view?.guidanceOutOfRoute(guidance)
  }

  override fun guidanceRouteChanged(
    guidance: KNGuidance, fromRoute: KNRoute, fromLocation: KNLocation,
    toRoute: KNRoute, toLocation: KNLocation, reason: KNGuideRouteChangeReason,
  ) {
    view?.guidanceRouteChanged(guidance)
  }

  override fun guidanceDidUpdateRoutes(guidance: KNGuidance, routes: List<KNRoute>, multiRouteInfo: KNMultiRouteInfo?) {
    view?.guidanceDidUpdateRoutes(guidance, routes, multiRouteInfo)
  }

  override fun guidanceDidUpdateIndoorRoute(guidance: KNGuidance, route: KNRoute?) {
    view?.guidanceDidUpdateIndoorRoute(guidance, route)
  }

  override fun guidanceDidUpdateLocation(guidance: KNGuidance, locationGuide: KNGuide_Location) {
    view?.guidanceDidUpdateLocation(guidance, locationGuide)
  }

  override fun guidanceDidUpdateRouteGuide(guidance: KNGuidance, routeGuide: KNGuide_Route) {
    view?.guidanceDidUpdateRouteGuide(guidance, routeGuide)
  }

  override fun guidanceDidUpdateSafetyGuide(guidance: KNGuidance, safetyGuide: KNGuide_Safety?) {
    view?.guidanceDidUpdateSafetyGuide(guidance, safetyGuide)
  }

  override fun guidanceDidUpdateAroundSafeties(guidance: KNGuidance, safeties: List<KNSafety>?) {
    view?.guidanceDidUpdateAroundSafeties(guidance, safeties)
  }

  override fun shouldPlayVoiceGuide(guidance: KNGuidance, voiceGuide: KNGuide_Voice, newData: MutableList<ByteArray>) = true
  override fun willPlayVoiceGuide(guidance: KNGuidance, voiceGuide: KNGuide_Voice) = Unit
  override fun didFinishPlayVoiceGuide(guidance: KNGuidance, voiceGuide: KNGuide_Voice) {
    view?.didFinishPlayVoiceGuide(guidance, voiceGuide)
  }

  override fun didUpdateCitsGuide(guidance: KNGuidance, citsGuide: KNGuide_Cits) {
    view?.didUpdateCitsGuide(guidance, citsGuide)
  }
}
