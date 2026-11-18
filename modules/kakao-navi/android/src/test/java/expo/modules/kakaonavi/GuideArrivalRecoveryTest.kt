package expo.modules.kakaonavi

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GuideArrivalRecoveryTest {
  @Test fun ignoresNoisySamplesAndRequiresThreeDepartureSamples() {
    val recovery = GuideArrivalRecovery(Double.POSITIVE_INFINITY)
    assertFalse(recovery.shouldRecover(Double.NaN, 1))
    assertFalse(recovery.shouldRecover(20.0, 2))
    assertFalse(recovery.shouldRecover(62.0, 3))
    assertFalse(recovery.shouldRecover(64.0, 4))
    assertFalse(recovery.shouldRecover(48.0, 5))
    assertFalse(recovery.shouldRecover(65.0, 6))
    assertFalse(recovery.shouldRecover(67.0, 7))
    assertTrue(recovery.shouldRecover(70.0, 8))
  }

  @Test fun limitsAutomaticRecoveryAttemptsAndHonorsCooldown() {
    val recovery = GuideArrivalRecovery(20.0)
    recovery.begin(1_000)
    repeat(3) { assertFalse(recovery.shouldRecover(90.0, 15_999)) }
    assertTrue(recovery.shouldRecover(90.0, 16_000))
    recovery.begin(16_000)
    repeat(2) { assertFalse(recovery.shouldRecover(90.0, 31_000)) }
    assertTrue(recovery.shouldRecover(90.0, 31_000))
    recovery.begin(31_000)
    repeat(4) { assertFalse(recovery.shouldRecover(90.0, 46_000)) }
  }
}
