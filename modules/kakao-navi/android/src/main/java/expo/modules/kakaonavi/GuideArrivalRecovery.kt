package expo.modules.kakaonavi

internal class GuideArrivalRecovery(private var closestDistance: Double) {
  private var departures = 0
  private var attempts = 0
  private var lastAttempt = 0L

  fun shouldRecover(distance: Double, now: Long): Boolean {
    if (!distance.isFinite() || distance < 0) return false
    closestDistance = minOf(closestDistance, distance)
    if (distance < 60 || distance < closestDistance + 30) {
      departures = 0
      return false
    }
    departures++
    return departures >= 3 && attempts < 3 && (attempts == 0 || now - lastAttempt >= 15_000)
  }

  fun begin(now: Long) {
    attempts++
    lastAttempt = now
    departures = 0
  }
}
