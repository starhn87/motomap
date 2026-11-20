package expo.modules.kakaonavi

import android.app.Application
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import android.view.WindowManager
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.constraintlayout.widget.ConstraintLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.kakaomobility.knsdk.KNCarType
import com.kakaomobility.knsdk.KNLanguageType
import com.kakaomobility.knsdk.KNRouteAvoidOption
import com.kakaomobility.knsdk.KNRoutePriority
import com.kakaomobility.knsdk.KNSDK
import com.kakaomobility.knsdk.R as NaviResources
import com.kakaomobility.knsdk.common.gps.KNGPSData
import com.kakaomobility.knsdk.common.gps.KNGPSReceiver
import com.kakaomobility.knsdk.common.objects.KNError
import com.kakaomobility.knsdk.common.objects.KNPOI
import com.kakaomobility.knsdk.guidance.knguidance.KNGuideRouteChangeReason
import com.kakaomobility.knsdk.guidance.knguidance.KNGuideState
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance
import com.kakaomobility.knsdk.guidance.knguidance.KNDriveGuidance
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
import com.kakaomobility.knsdk.map.knmaprenderer.objects.KNMapCameraUpdate
import com.kakaomobility.knsdk.ui.component.KNComponentCurPositionView
import com.kakaomobility.knsdk.ui.component.MapViewCameraMode
import com.kakaomobility.knsdk.ui.view.KNNaviView_GuideStateDelegate
import com.kakaomobility.knsdk.ui.view.KNNaviView_StateDelegate
import com.kakaomobility.knsdk.ui.view.KNNaviViewState
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.roundToInt

class KakaoGuideActivity : AppCompatActivity() {
  companion object {
    internal const val EXTRA_SESSION_ID = "expo.modules.kakaonavi.session_id"
    internal var session: KakaoGuideSession? = null
  }

  private var guide: KakaoGuideController? = null
  private var resumedReactHost: ReactHost? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val current = session?.takeIf { it.id == intent.getStringExtra(EXTRA_SESSION_ID) }
    val controller = current?.controller
    if (controller == null || !controller.attach(this)) {
      finish()
      return
    }
    guide = controller
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() = controller.handleBack()
    })
  }

  override fun onResume() {
    super.onResume()
    if (guide?.usesReactPanel() == true) {
      resumedReactHost = (application as? ReactApplication)?.reactHost
      resumedReactHost?.onHostResume(this)
    }
  }

  override fun onPause() {
    resumedReactHost?.onHostPause(this)
    resumedReactHost = null
    super.onPause()
  }

  override fun onDestroy() {
    guide?.detach(this)
    super.onDestroy()
  }
}

internal class KakaoGuideController(
  initial: KakaoGuideSession,
  private val application: Application,
) : KNNaviView_GuideStateDelegate,
  KNNaviView_StateDelegate,
  KNGuidance_GuideStateDelegate,
  KNGuidance_LocationGuideDelegate,
  KNGuidance_RouteGuideDelegate,
  KNGuidance_SafetyGuideDelegate,
  KNGuidance_VoiceGuideDelegate,
  KNGuidance_CitsGuideDelegate {

  private val avoidOptions = KNRouteAvoidOption.KNRouteAvoidOption_MotorWay.value
  private var host: KakaoGuideActivity? = null
  private var parked = false
  private var restoring = false
  private fun onMain(work: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) work() else handler.post(work)
  }

  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { finishGuide("카카오내비 응답이 늦어지고 있어요. 다시 시도해 주세요.") }
  private val closeOrphanedGuide = Runnable {
    if (host == null && !parked) finishGuide()
  }
  private var request: KakaoGuideSession? = initial
  private var installed = false
  private var view: KNNaviView? = null
  private var guidance: KNGuidance? = null
  private var started = false
  private var ended = false
  private var panel: MotoGuideControls? = null
  private var panelReady = false
  private var panelStartedAt = 0L
  private var guideRoot: FrameLayout? = null
  private var traffic: MotoTrafficRail? = null
  private var viewState = KNNaviViewState.NONE
  private var directionPopup: View? = null
  private var fallback: android.widget.Button? = null
  private var manualRefresh = false
  private var lastMatched: KNLocation? = null
  private var trafficStartRoute: KNRoute? = null
  private var trafficStart: KNLocation? = null
  private val expireTraffic = Runnable { updateTraffic() }
  private var nativeControls = emptyList<View>()
  private val keepNativeControlsHidden = ViewTreeObserver.OnPreDrawListener {
    nativeControls.forEach {
      if (it.visibility == View.VISIBLE) it.visibility = View.GONE
    }
    if (arrival != null || isSafetyScreen()) {
      view?.curDirComponent?.visibility = View.INVISIBLE
      view?.nextDirComponent?.visibility = View.INVISIBLE
      directionPopup?.visibility = View.INVISIBLE
    } else {
      directionPopup?.takeIf { it.visibility == View.VISIBLE }?.let { popup ->
        val parent = popup.parent as? View ?: return@let
        // SDK의 회전 팝업 제약은 하단 조작부 숨김 전후로 다시 계산된다.
        // SDK 계층과 데이터 갱신을 유지하고 실제 그리는 위치만 지도 기준점에 고정한다.
        val top = ((parent.height - dp(134)).coerceAtLeast(0) * .49f).roundToInt()
        val offset = (top - popup.top).toFloat()
        if (popup.translationY != offset) popup.translationY = offset
      }
    }
    true
  }
  private var guideTrip: KNTrip? = null
  private var activePriority = KNRoutePriority.KNRoutePriority_Recommand
  private var previewToken: Int? = null
  private var previewPassed = emptyList<KNPOI>()
  private var previousPassed = emptyList<KNPOI>()
  private var pendingEdit: GuideEdit? = null
  private val editRouteTimeout = Runnable { rejectEdit("E_KNSDK_RESUME_TIMEOUT") }
  private var lastGps: KNGPSData? = null
  private var roadName: String? = null
  private val expireRoadName = Runnable { updatePanel() }
  private var refreshing = false
  private var volume = 1f
  private var arrival: GuideArrivalRecovery? = null
  private var arrivalPrompt: AlertDialog? = null
  private var arrivalPromptShown = false
  private var arrivalRecorded = false
  private var recoveryTrip: KNTrip? = null
  private var recoveryPassed = emptyList<KNPOI>()
  private val arrivalGpsReceiver = object : KNGPSReceiver {
    override fun didReceiveGpsData(data: KNGPSData) {
      onMain { handleArrivalLocation(data) }
    }
  }


  fun prepare() {
    val request = request ?: return
    handler.postDelayed(timeout, 60_000)
    try {
      KNSDK.install(application, application.filesDir.resolve("kakao-navi").absolutePath)
      installed = true
      val appVersion = application.packageManager.getPackageInfo(application.packageName, 0).versionName ?: "1"
      KNSDK.initializeWithAppKey(
        request.appKey, appVersion, null, null, KNLanguageType.KNLanguageType_KOREAN,
      ) { error ->
        onMain {
          if (ended) return@onMain
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
      onMain {
        if (ended) return@onMain
        if (error != null || trip == null) {
          fail(error)
          return@onMain
        }
        trip.setRouteConfig(KNRouteConfiguration(KNCarType.KNCarType_Bike))
        trip.routeWithPriority(request.priority, avoidOptions) { routeError, routes ->
          onMain {
            if (ended) return@onMain
            if (routeError != null || routes.isNullOrEmpty()) fail(routeError)
            else {
              guideTrip = trip
              activePriority = request.priority
              val main = request.appActivity.get()
              if (main == null || main.isFinishing || !main.hasWindowFocus()) cancelGuide()
              else try {
                main.startActivity(request.guideIntent(main))
              } catch (_: RuntimeException) {
                finishGuide("카카오내비 안내 화면을 열지 못했어요.")
              }
            }
          }
        }
      }
    }
  }

  private fun poi(name: String, longitude: Double, latitude: Double): KNPOI {
    val coordinate = KNSDK.convertWGS84ToKATEC(longitude, latitude)
    return KNPOI(name, coordinate.x.roundToInt(), coordinate.y.roundToInt())
  }

  fun hasWindowFocus() = host?.hasWindowFocus() == true

  fun handleBack() {
    if (!started) cancelGuide()
    else if (panel?.expanded == true) panel?.setExpanded(false)
    else confirmEnd()
  }

  private fun confirmEnd() {
    val host = host ?: return
    AlertDialog.Builder(host)
      .setTitle("길안내를 종료할까요?")
      .setNegativeButton("계속 안내", null)
      .setPositiveButton("안내 종료") { _, _ -> finishGuide() }
      .show()
  }

  fun attach(screen: KakaoGuideActivity): Boolean {
    val trip = guideTrip ?: return false
    val engine = guidance ?: KNSDK.sharedGuidance() ?: return false
    if (ended || (host != null && !parked && !restoring)) return false
    if (host != null) destroyView()
    host = screen
    parked = false
    restoring = false
    handler.removeCallbacks(closeOrphanedGuide)
    val naviView = KNNaviView(screen).apply {
      // SDK UI에서 경로 설정을 다시 만들 때도 이륜차 차종을 사용한다.
      carType = KNCarType.KNCarType_Bike
      sndVolume = volume
      guideStateDelegate = this@KakaoGuideController
      stateDelegate = this@KakaoGuideController
    }
    view = naviView
    guidance = engine
    engine.guideStateDelegate = this
    engine.locationGuideDelegate = this
    engine.routeGuideDelegate = this
    engine.safetyGuideDelegate = this
    engine.voiceGuideDelegate = this
    engine.citsGuideDelegate = this
    val root = FrameLayout(screen).apply { addView(naviView, FrameLayout.LayoutParams(-1, -1)) }
    guideRoot = root
    viewState = KNNaviViewState.NONE
    directionPopup = naviView.findViewById<View>(NaviResources.id.component_cur_direction_popup)?.apply {
      val params = layoutParams as ConstraintLayout.LayoutParams
      params.width = dp(160)
      params.height = dp(134)
      params.topToBottom = ConstraintLayout.LayoutParams.UNSET
      params.bottomToTop = ConstraintLayout.LayoutParams.UNSET
      params.topToTop = ConstraintLayout.LayoutParams.PARENT_ID
      params.bottomToBottom = ConstraintLayout.LayoutParams.PARENT_ID
      params.verticalBias = .49f
      layoutParams = params
      findViewById<View>(NaviResources.id.cur_direction_img_layout)?.let { image ->
        image.layoutParams = image.layoutParams.apply { width = dp(80); height = dp(80) }
      }
      findViewById<android.widget.TextView>(NaviResources.id.cur_direction_popup_distance)?.apply {
        maxLines = 1
        minHeight = dp(44)
      }
    }
    traffic = MotoTrafficRail(screen).also { rail ->
      root.addView(rail, FrameLayout.LayoutParams(dp(24), dp(240), Gravity.BOTTOM or Gravity.END).apply {
        marginEnd = dp(12)
        bottomMargin = dp(92)
      })
      root.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
        val height = (root.height - root.paddingTop - root.paddingBottom - dp(240)).coerceIn(0, dp(240))
        if (rail.layoutParams.height != height) rail.layoutParams = rail.layoutParams.apply { this.height = height }
        updateTraffic()
      }
    }
    root.viewTreeObserver.addOnPreDrawListener(keepNativeControlsHidden)
    nativeControls = listOfNotNull(
      naviView.bottomComponent,
      naviView.bottomMenuComponent,
      naviView.findViewById<View>(NaviResources.id.component_cur_position),
      naviView.findViewById<View>(NaviResources.id.component_around_menu),
      naviView.findViewById<View>(NaviResources.id.component_zoom),
      naviView.findViewById<View>(NaviResources.id.component_mapmode),
    )
    ViewCompat.setOnApplyWindowInsetsListener(root) { target, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      target.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }
    screen.setContentView(root)
    if (arrival == null) naviView.initWithGuidance(engine, trip, activePriority, avoidOptions)
    else naviView.guidance = engine
    val guideMap = naviView.mapComponent.mapView
    guideMap.setOnTouchListener { _, event ->
      if (event.actionMasked != MotionEvent.ACTION_UP || !guideMap.usePanningGesture) {
        return@setOnTouchListener false
      }
      // 드래그는 유지하고 손을 뗄 때 SDK의 관성 이동만 시작하지 않게 한다.
      // 관성 이동 중에는 SDK가 현재 위치로 옮긴 카메라를 계속 덮어쓴다.
      guideMap.usePanningGesture = false
      try {
        guideMap.onTouchEvent(event)
      } finally {
        guideMap.usePanningGesture = true
      }
    }
    viewState = naviView.viewState
    mountPanel(screen, root, BuildConfig.MOTOMAP_GUIDE_RN)
    return true
  }

  private fun mountPanel(screen: KakaoGuideActivity, root: FrameLayout, useReact: Boolean) {
    traffic?.drawNative = !useReact
    if (BuildConfig.MOTOMAP_GUIDE_BENCHMARK) panelStartedAt = android.os.SystemClock.elapsedRealtime()
    try {
      val bottom = if (useReact) {
        MotoGuideRnPanel(screen, root, { request?.emit?.invoke("onAndroidGuidePanel", it) },
          { ready ->
            if (ready) setPanelReady(true)
            else if (guideRoot === root && panel is MotoGuideRnPanel) {
              panel?.destroy()
              panel = null
              mountPanel(screen, root, false)
            }
          }, ::handlePanelAction, ::updateTraffic)
      } else MotoGuidePanel(root, ::setPanelReady, ::handlePanelAction, ::updateTraffic)
      panel = bottom
      updatePanel(bottom)
      bottom.load()
    } catch (_: RuntimeException) {
      panel?.destroy()
      panel = null
      if (useReact) mountPanel(screen, root, false) else setPanelReady(false)
    }
  }

  fun usesReactPanel() = panel is MotoGuideRnPanel

  fun connectReactPanel(token: String) = (panel as? MotoGuideRnPanel)?.connect(token)

  fun reactPanelRendered(token: String) {
    (panel as? MotoGuideRnPanel)?.didRender(token)
  }

  fun reactPanelAction(token: String, action: String, value: Float?) {
    (panel as? MotoGuideRnPanel)?.action(token, action, value)
  }

  private fun dp(value: Int) = (application.resources.displayMetrics.density * value).roundToInt()

  private fun setPanelReady(ready: Boolean) {
    if (BuildConfig.MOTOMAP_GUIDE_BENCHMARK && ready && !panelReady) {
      val renderer = if (usesReactPanel()) "rn" else "web"
      val elapsed = android.os.SystemClock.elapsedRealtime() - panelStartedAt
      val routeMeters = guidance?.routesOnGuide?.firstOrNull()?.totalDist
      android.util.Log.i("MotoGuideBench", "ready renderer=$renderer elapsedMs=$elapsed routeMeters=$routeMeters")
    }
    panelReady = ready
    val root = guideRoot ?: return
    if (ready) {
      fallback?.let(root::removeView)
      fallback = null
    }
    if (!ready && !ended && fallback == null) {
      fallback = android.widget.Button(root.context).apply {
        text = "길안내 종료"
        setOnClickListener { confirmEnd() }
        root.addView(this, FrameLayout.LayoutParams(-2, dp(48), Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL))
      }
    }
    updateTraffic()
  }

  private fun isSafetyScreen() =
    viewState == KNNaviViewState.SafetyNormal || viewState == KNNaviViewState.SafetyTouch

  private fun updateTraffic() {
    val rail = traffic ?: return
    try {
      val engine = guidance
      val route = engine?.routesOnGuide?.firstOrNull()
      if (viewState == KNNaviViewState.DriveTouch || viewState == KNNaviViewState.DriveFullRoute) {
        rail.show(false)
        return
      }
      if (ended || arrival != null || refreshing || route == null) {
        rail.clear()
        return
      }
      val matched = lastMatched?.takeIf {
        lastGps?.let { gps -> gps.isFresh() && gps.posTrust } == true && it.route === route
      }
      if (trafficStartRoute !== route) {
        trafficStartRoute = route
        val first = route.mainRoadList().orEmpty().firstOrNull()?.fromLocation
        val poi = guideTrip?.start?.let { route.locationOfPoi(it) }
        trafficStart = listOfNotNull(first, poi).firstOrNull {
          it.route === route && abs(route.totalDist - route.remainDistFromLocation(it)) <= 3
        }
      }
      val start = matched ?: trafficStart
      if (matched != null) rail.sample(route, matched, true)
      else if (!rail.retain(route)) {
        if (start == null) rail.unknown(route)
        else rail.sample(route, start, false)
      }
      rail.show(panelReady && panel?.expanded != true && rail.layoutParams.height >= dp(80) &&
        (viewState == KNNaviViewState.DriveNormal || viewState == KNNaviViewState.NONE))
    } finally {
      (panel as? MotoGuideRnPanel)?.updateTraffic(rail.snapshot(
        (rail.layoutParams.height / application.resources.displayMetrics.density).roundToInt()
      ))
    }
  }

  private fun handlePanelAction(action: String, value: Float?) {
    if (ended || !started) return
    when (action) {
      "end" -> finishGuide()
      "volume" -> if (value != null) {
        volume = value
        view?.sndVolume = value
        updatePanel()
      }
      "recenter" -> recenterGuide()
      "routeEdit" -> if (previewToken == null && remainingVias().size <= 3) {
        request?.emit?.invoke("onGuideMenu", Bundle().apply { putInt("id", 107) })
      }
      "refresh" -> if (!refreshing) {
        panel?.toast("경로 새로고침을 요청했어요")
        manualRefresh = true
        val recovery = arrival
        if (recovery != null) {
          val gps = lastGps
          if (gps != null && gps.isFresh()) recoverRoute(recovery, gps)
          else {
            manualRefresh = false
            panel?.toast("현재 위치를 확인하고 있어요.")
          }
        } else {
          (guidance as? KNDriveGuidance)?.reRouteWithPriority(activePriority, avoidOptions)
        }
      }
    }
  }

  private fun recenterGuide() {
    val naviView = view ?: return
    // 숨겨 둔 SDK 버튼의 800ms 클릭 제한 없이 주행 추적 모드를 복구한다.
    naviView.findViewById<KNComponentCurPositionView>(NaviResources.id.component_cur_position)
      ?.delegate?.curPositionViewToCurLocation()
    val map = naviView.mapComponent.mapView
    val coordinate = map.userLocation?.coordinate?.takeIf {
      it.x.isFinite() && it.y.isFinite() && it.x > 0f && it.y > 0f
    } ?: return
    // 다음 GPS 갱신을 기다리지 않고 지도에 표시 중인 자차 위치로 카메라를 복귀시킨다.
    map.moveCamera(KNMapCameraUpdate().targetTo(coordinate), false, false)
  }

  private fun updatePanel(target: MotoGuideControls? = panel) {
    val trip = guidance?.trip ?: guideTrip
    val state = viewState
    updateTraffic()
    target?.update(mapOf(
      "goalName" to guideTrip?.goal?.name,
      "currentLocationName" to roadName?.takeIf { lastGps?.isFresh() == true },
      "remainingTime" to trip?.remainTime()?.takeIf { it >= 0 },
      "remainingDistance" to trip?.remainDist()?.takeIf { it >= 0 },
      "status" to when {
        refreshing -> if (arrival != null) "복귀 경로를 찾고 있어요" else "경로를 다시 찾고 있어요"
        arrival != null -> ""
        else -> null
      },
      "fullWidthStatus" to if (manualRefresh && refreshing) "경로를 다시 찾고 있어요" else null,
      "showRecenter" to (state == KNNaviViewState.DriveTouch || state == KNNaviViewState.DriveFullRoute || state == KNNaviViewState.SafetyTouch),
      "canRouteEdit" to (started && previewToken == null && remainingVias().size <= 3),
      "busy" to refreshing,
      "volume" to volume,
    ))
  }

  private fun KNGPSData.isFresh() =
    valid && pos.x.isFinite() && pos.y.isFinite() &&
      abs(System.currentTimeMillis() - timestamp.timeInMillis) <= 10_000

  private fun distanceToGoal(gps: KNGPSData): Double {
    val goal = guideTrip?.goal?.pos ?: return Double.POSITIVE_INFINITY
    return hypot(gps.pos.x - goal.x, gps.pos.y - goal.y)
  }

  private fun handleArrivalLocation(gps: KNGPSData) {
    val recovery = arrival ?: return
    if (ended || !gps.isFresh() || !gps.posTrust) return
    lastGps = gps
    val distance = distanceToGoal(gps)
    if (distance <= 300) {
      if (!arrivalRecorded) {
        arrivalRecorded = true
        guideTrip?.goal?.let { goal ->
          val point = KNSDK.convertKATECToWGS84(goal.pos.x, goal.pos.y)
          request?.emit?.invoke("onGuideArrival", Bundle().apply {
            putDouble("latitude", point.y)
            putDouble("longitude", point.x)
            putString("name", goal.name)
            putDouble("distance", distance)
          })
        }
      }
      if (!arrivalPromptShown && previewToken == null && hasWindowFocus()) showArrivalPrompt()
    }
    if (previewToken == null && hasWindowFocus() && recovery.shouldRecover(distance, android.os.SystemClock.elapsedRealtime())) {
      recoverRoute(recovery, gps)
    }
  }

  private fun showArrivalPrompt() {
    arrivalPromptShown = true
    val screen = host ?: return
    val prompt = AlertDialog.Builder(screen)
      .setTitle("목적지 주변입니다")
      .setMessage("지나치면 복귀 경로를 안내합니다.")
      .setNegativeButton("계속 안내", null)
      .setPositiveButton("안내 종료") { _, _ -> finishGuide() }
      .create()
    arrivalPrompt = prompt
    prompt.setOnDismissListener { if (arrivalPrompt === prompt) arrivalPrompt = null }
    prompt.show()
    handler.postDelayed({ if (arrivalPrompt === prompt) prompt.dismiss() }, 10_000)
  }

  private fun recoverRoute(recovery: GuideArrivalRecovery, gps: KNGPSData) {
    val trip = guideTrip ?: return
    val engine = guidance ?: return
    if (ended || refreshing) return
    refreshing = true
    recovery.begin(android.os.SystemClock.elapsedRealtime())
    updatePanel()
    val origin = KNPOI("현재 위치", gps.pos.x.roundToInt(), gps.pos.y.roundToInt())
    val passed = passedVias()
    val vias = remainingVias().toMutableList()
    KNSDK.makeTripWithStart(origin, trip.goal, vias.ifEmpty { null }) { error, next ->
      onMain {
        if (ended || arrival !== recovery) return@onMain
        if (error != null || next == null) {
          recoveryFailed()
          return@onMain
        }
        next.setRouteConfig(KNRouteConfiguration(KNCarType.KNCarType_Bike))
        next.routeWithPriority(activePriority, avoidOptions) { routeError, routes ->
          onMain {
            if (ended || arrival !== recovery) return@onMain
            if (routeError != null || routes.isNullOrEmpty()) recoveryFailed()
            else {
              recoveryPassed = passed
              recoveryTrip = next
              engine.startWithTrip(next, activePriority, avoidOptions)
            }
          }
        }
      }
    }
  }

  fun showNotice(message: String) {
    if (panelReady) panel?.toast(message)
    else android.widget.Toast.makeText(application, message, android.widget.Toast.LENGTH_SHORT).show()
  }

  private fun remainingVias(): List<KNPOI> =
    guideTrip?.let { it.vias.orEmpty().drop(it.passedVias().orEmpty().size) }.orEmpty()

  private fun passedVias(): List<KNPOI> = previousPassed + guideTrip?.passedVias().orEmpty()

  private fun point(poi: KNPOI): Map<String, Any> {
    val wgs = KNSDK.convertKATECToWGS84(poi.pos.x, poi.pos.y)
    return mapOf("name" to poi.name, "longitude" to wgs.x, "latitude" to wgs.y)
  }

  fun openPreview(token: Int): Map<String, Any?> {
    val trip = guideTrip
    val screen = host
    val activity = request?.appActivity?.get()
    val vias = remainingVias()
    if (ended || !started || !hasWindowFocus() || previewToken != null || trip == null ||
      screen == null || activity == null || activity.isFinishing || vias.size > 3
    ) throw CodedException("E_KNSDK_RESUME_STATE", "경로 미리보기를 열 수 없습니다.", null)
    val gps = latestManualGps()
    val start = gps?.let {
      val wgs = KNSDK.convertKATECToWGS84(it.pos.x.roundToInt(), it.pos.y.roundToInt())
      mapOf("longitude" to wgs.x, "latitude" to wgs.y)
    }
    previewPassed = passedVias()
    previewToken = token
    updatePanel()
    parked = true
    screen.finish()
    return mapOf(
      "token" to token, "start" to start, "goal" to point(trip.goal),
      "vias" to vias.map(::point), "passedVias" to previewPassed.map(::point), "priority" to activePriority.value,
    )
  }

  fun restoreFromLauncher() {
    if (!started || ended || parked || restoring || host?.isFinishing == false) return
    val current = request ?: return
    val main = current.appActivity.get()?.takeIf { !it.isFinishing && it.hasWindowFocus() } ?: return
    restoring = true
    try {
      main.startActivity(current.guideIntent(main))
    } catch (_: RuntimeException) {
      restoring = false
    }
  }

  fun returnToGuide(token: Int): Boolean {
    val current = request ?: return false
    val main = current.appActivity.get() ?: return false
    if (ended || previewToken != token || pendingEdit != null || main.isFinishing) return false
    main.startActivity(current.guideIntent(main))
    previewToken = null
    previewPassed = emptyList()
    updatePanel()
    return true
  }

  fun resumeGuide(
    token: Int, lng: Double, lat: Double, name: String, vias: List<Double>,
    priority: KNRoutePriority, completion: Promise,
  ) {
    val engine = guidance
    if (ended || previewToken != token || pendingEdit != null || engine == null) {
      throw CodedException("E_KNSDK_RESUME_STATE", "안내 상태가 변경됐어요.", null)
    }
    val passed = passedVias()
    val newlyPassed = passed.drop(previewPassed.size).toMutableList()
    val selected = vias.chunked(2).filter { pair ->
      val position = poi("", pair[0], pair[1]).pos
      val matched = newlyPassed.indexOfFirst { hypot((it.pos.x - position.x).toDouble(), (it.pos.y - position.y).toDouble()) < 5 }
      if (matched >= 0) newlyPassed.removeAt(matched)
      matched < 0
    }
    val nativeVias = selected.mapIndexed { index, pair -> poi("경유지 ${index + 1}", pair[0], pair[1]) }.toMutableList()
    val edit = GuideEdit(priority, selected.flatten(), passed, completion)
    pendingEdit = edit
    refreshing = true
    updatePanel()

    handler.postDelayed(editRouteTimeout, 25_000)
    requestEditOrigin(edit) { origin ->
      KNSDK.makeTripWithStart(origin, poi(name, lng, lat), nativeVias.ifEmpty { null }) { error, next ->
        onMain {
          if (ended || pendingEdit !== edit) return@onMain
          if (error != null || next == null) {
            rejectEdit("E_KNSDK_RESUME_TRIP_${error?.code ?: "UNKNOWN"}")
            return@onMain
          }
          next.setRouteConfig(KNRouteConfiguration(KNCarType.KNCarType_Bike))
          next.routeWithPriority(priority, avoidOptions) { routeError, routes ->
            onMain {
              if (ended || pendingEdit !== edit) return@onMain
              if (routeError != null || routes.isNullOrEmpty()) {
                rejectEdit("E_KNSDK_RESUME_TRIP_${routeError?.code ?: "UNKNOWN"}")
              } else {
                handler.removeCallbacks(editRouteTimeout)
                edit.trip = next
                // 활성 엔진에서 initWithGuidance는 뷰만 연결하고 새 Trip을 시작하지 않는다.
                engine.startWithTrip(next, priority, avoidOptions)
              }
            }
          }
        }
      }
    }
  }

  private fun latestManualGps(): KNGPSData? {
    val manager = KNSDK.sharedGpsManager()
    return listOfNotNull(lastGps, guidance?.locationGuide?.gpsOrigin, manager?.recentGpsData, manager?.lastValidGpsData)
      .filter { it.isFresh() }
      .maxByOrNull { it.timestamp.timeInMillis }
  }

  @android.annotation.SuppressLint("MissingPermission")
  private fun requestEditOrigin(edit: GuideEdit, ready: (KNPOI) -> Unit) {
    val gps = latestManualGps()
    if (gps != null) {
      ready(KNPOI("현재 위치", gps.pos.x.roundToInt(), gps.pos.y.roundToInt()))
      return
    }
    // 편집 동안 안내 SDK가 위치 콜백을 받지 못할 수 있다. 위치 이용 확인을 끝낸
    // 재안내 요청에 한해 새 위치를 한 번 받고, 취소·철회 시 같이 취소한다.
    val token = CancellationTokenSource()
    edit.gpsCancellation = token
    val locationRequest = CurrentLocationRequest.Builder()
      .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
      .setMaxUpdateAgeMillis(8_000)
      .setDurationMillis(8_000)
      .build()
    try {
      LocationServices.getFusedLocationProviderClient(application)
        .getCurrentLocation(locationRequest, token.token)
        .addOnCompleteListener { task ->
          if (ended || pendingEdit !== edit) return@addOnCompleteListener
          edit.gpsCancellation = null
          val location = if (task.isSuccessful) task.result else null
          if (location == null || !location.hasAccuracy() || location.accuracy > 100f) {
            rejectEdit("E_KNSDK_RESUME_GPS")
          } else {
            ready(poi("현재 위치", location.longitude, location.latitude))
          }
        }
    } catch (_: SecurityException) {
      rejectEdit("E_KNSDK_RESUME_GPS")
    }
  }

  private fun confirmEdit(engine: KNGuidance) {
    val edit = pendingEdit ?: return
    val trip = edit.trip ?: return
    if (engine.trip?.transId != trip.transId) return
    if (guideTrip?.goal?.pos != trip.goal.pos) arrivalRecorded = false
    guideTrip = trip
    previousPassed = edit.passed
    activePriority = edit.priority
    refreshing = false
    manualRefresh = false
    pendingEdit = null
    view?.initWithGuidance(engine, trip, activePriority, avoidOptions)
    edit.completion.resolve(mapOf("vias" to edit.vias, "passedVias" to edit.passed.map(::point)))
  }

  private fun rejectEdit(code: String) {
    val edit = pendingEdit ?: return
    pendingEdit = null
    handler.removeCallbacks(editRouteTimeout)
    edit.gpsCancellation?.cancel()
    refreshing = false
    manualRefresh = false
    edit.completion.reject(code, "경로를 변경할 수 없습니다.", null)
    updatePanel()
  }

  private class GuideEdit(
    val priority: KNRoutePriority,
    val vias: List<Double>,
    val passed: List<KNPOI>,
    val completion: Promise,
  ) {
    var trip: KNTrip? = null
    var gpsCancellation: CancellationTokenSource? = null
  }

  private fun recoveryFailed() {
    recoveryTrip = null
    recoveryPassed = emptyList()
    refreshing = false
    manualRefresh = false
    updatePanel()
    panel?.toast("복귀 경로를 찾지 못했어요.")
  }

  internal fun cancelGuide() = finishGuide("길안내 시작이 취소되었습니다.", "GUIDE_CANCELLED")

  private fun fail(error: KNError?) =
    finishGuide("카카오내비에서 경로를 준비하지 못했어요.", "E_KNSDK_ROUTE_${error?.code ?: "UNKNOWN"}")

  private fun finishGuide(message: String? = null, code: String? = null) {
    completeGuide(message, code)
    val screen = host
    if (screen == null) release() else screen.finish()
  }

  private fun completeGuide(message: String?, code: String?) {
    if (ended) return
    ended = true
    handler.removeCallbacksAndMessages(null)
    arrivalPrompt?.dismiss()
    if (arrival != null) KNSDK.removeLocationUpdate(arrivalGpsReceiver)
    rejectEdit("E_KNSDK_RESUME_CANCELLED")
    if (started) request?.emit?.invoke("onGuideEnd", Bundle())
    else request?.opening?.reject(code ?: "GUIDE_FAILED", message ?: "길안내 시작이 취소되었습니다.", null)
    guidance?.stop()
  }

  fun detach(screen: KakaoGuideActivity) {
    if (host !== screen) return
    destroyView()
    host = null
    if (!parked && !ended && started) {
      // 메인 singleTask가 런처 복귀 때 위 Activity를 제거한다. 실제 포커스 복귀 뒤 다시 연결한다.
      handler.postDelayed({ restoreFromLauncher() }, 100)
      handler.postDelayed({ restoreFromLauncher() }, 350)
      handler.postDelayed(closeOrphanedGuide, 2_500)
    } else if (!parked || ended) {
      completeGuide(null, null)
      release()
    }
  }

  private fun destroyView() {
    arrivalPrompt?.dismiss()
    guideRoot?.viewTreeObserver?.removeOnPreDrawListener(keepNativeControlsHidden)
    guideRoot = null
    panel?.destroy()
    panel = null
    panelReady = false
    traffic = null
    fallback = null
    directionPopup = null
    view?.stateDelegate = null
    view?.guideStateDelegate = null
    view?.let { (it.parent as? android.view.ViewGroup)?.removeView(it) }
    view = null
    guideRoot = null
    nativeControls = emptyList()
  }

  private fun release() {
    guidance?.apply {
      guideStateDelegate = null
      locationGuideDelegate = null
      routeGuideDelegate = null
      safetyGuideDelegate = null
      voiceGuideDelegate = null
      citsGuideDelegate = null
    }
    guidance = null
    if (installed) KNSDK.KNSDKRelease()
    installed = false
    request?.closed()
    request = null
  }

  override fun naviViewGuideState(state: KNGuideState) {
    if (state == KNGuideState.KNGuideState_OnSafetyGuide) holdDestination()
  }
  override fun naviViewGuideEnded() = finishGuide()
  override fun naviViewDidUpdateStatusBarColor(color: Int) = Unit
  override fun naviViewDidUpdateSndVolume(volume: Float) {
    this.volume = volume
    updatePanel()
  }
  override fun naviViewScreenState(state: KNNaviViewState) {
    viewState = state
    if (isSafetyScreen()) holdDestination()
    updatePanel()
  }
  override fun naviViewIsArrival(isArrival: Boolean) = Unit
  override fun naviViewDidUpdateCustomButton(id: Int, toggleOn: Boolean?) = Unit
  override fun naviViewDidUpdateMapCameraMode(mode: MapViewCameraMode) = Unit
  override fun naviViewDidUpdateUseDarkMode(mode: Boolean) = Unit
  override fun naviViewPopupOpenCheck(open: Boolean) = Unit

  override fun guidanceGuideStarted(guidance: KNGuidance) {
    if (ended) return
    confirmEdit(guidance)
    recoveryTrip?.takeIf { it.transId == guidance.trip?.transId }?.let {
      guideTrip = it
      previousPassed = recoveryPassed
      recoveryTrip = null
      recoveryPassed = emptyList()
      view?.initWithGuidance(guidance, it, activePriority, avoidOptions)
    }
    view?.guidanceGuideStarted(guidance)
    if (arrival != null) {
      KNSDK.removeLocationUpdate(arrivalGpsReceiver)
      arrival = null
      arrivalPrompt?.dismiss()
      view?.curDirComponent?.visibility = View.VISIBLE
      arrivalPromptShown = false
    }
    refreshing = false
    manualRefresh = false
    updatePanel()
    if (!started) {
      started = true
      handler.removeCallbacks(timeout)
      request?.emit?.invoke("onGuideStarted", Bundle())
      request?.opening?.resolve()
    }
  }

  override fun guidanceGuideEnded(guidance: KNGuidance) {
    if (ended) return
    if (!started) {
      view?.guidanceGuideEnded(guidance)
      finishGuide()
      return
    }
    holdDestination()
  }

  private fun holdDestination() {
    if (ended || !started || guidance?.guideState == KNGuideState.KNGuideState_OnRouteGuide ||
      arrival != null || pendingEdit?.trip != null) return
    val gps = lastGps?.takeIf { it.isFresh() && it.posTrust }
    arrival = GuideArrivalRecovery(gps?.let(::distanceToGoal) ?: Double.POSITIVE_INFINITY)
    refreshing = false
    manualRefresh = false
    view?.curDirComponent?.visibility = View.INVISIBLE
    view?.nextDirComponent?.visibility = View.INVISIBLE
    updatePanel()
    KNSDK.requestLocationUpdate(arrivalGpsReceiver)
    gps?.let(::handleArrivalLocation)
  }

  override fun guidanceCheckingRouteChange(guidance: KNGuidance) {
    refreshing = true
    view?.guidanceCheckingRouteChange(guidance)
    updatePanel()
  }

  override fun guidanceRouteUnchanged(guidance: KNGuidance) {
    refreshing = false
    manualRefresh = false
    view?.guidanceRouteUnchanged(guidance)
    updatePanel()
  }

  override fun guidanceRouteUnchangedWithError(guidance: KNGuidance, error: KNError) {
    if (!started) fail(error)
    else if (pendingEdit?.trip != null) {
      rejectEdit("E_KNSDK_RESUME_APPLY_${error.code}")
      if (arrival == null) guideTrip?.let { guidance.startWithTrip(it, activePriority, avoidOptions) }
    } else if (arrival != null) recoveryFailed()
    else {
      refreshing = false
      manualRefresh = false
      view?.guidanceRouteUnchangedWithError(guidance, error)
      updatePanel()
      panel?.toast("경로를 다시 찾지 못했어요.")
    }
  }

  override fun guidanceOutOfRoute(guidance: KNGuidance) {
    view?.guidanceOutOfRoute(guidance)
  }

  override fun guidanceRouteChanged(
    guidance: KNGuidance, fromRoute: KNRoute, fromLocation: KNLocation,
    toRoute: KNRoute, toLocation: KNLocation, reason: KNGuideRouteChangeReason,
  ) {
    refreshing = false
    manualRefresh = false
    confirmEdit(guidance)
    view?.guidanceRouteChanged(guidance)
    updatePanel()
  }

  override fun guidanceDidUpdateRoutes(guidance: KNGuidance, routes: List<KNRoute>, multiRouteInfo: KNMultiRouteInfo?) {
    view?.guidanceDidUpdateRoutes(guidance, routes, multiRouteInfo)
  }

  override fun guidanceDidUpdateIndoorRoute(guidance: KNGuidance, route: KNRoute?) {
    view?.guidanceDidUpdateIndoorRoute(guidance, route)
  }

  override fun guidanceDidUpdateLocation(guidance: KNGuidance, locationGuide: KNGuide_Location) {
    if (ended) return
    view?.guidanceDidUpdateLocation(guidance, locationGuide)
    val gps = locationGuide.gpsOrigin
    lastGps = gps
    lastMatched = locationGuide.locationForPrimaryRoute
    handler.removeCallbacks(expireTraffic)
    handler.postDelayed(expireTraffic, 10_100)
    roadName = locationGuide.location?.roadName?.trim()?.takeIf { it.isNotEmpty() }
    handler.removeCallbacks(expireRoadName)
    handler.postDelayed(expireRoadName, 10_100)
    updatePanel()
  }

  override fun guidanceDidUpdateRouteGuide(guidance: KNGuidance, routeGuide: KNGuide_Route) {
    if (arrival == null && !isSafetyScreen()) view?.guidanceDidUpdateRouteGuide(guidance, routeGuide)
    updatePanel()
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
