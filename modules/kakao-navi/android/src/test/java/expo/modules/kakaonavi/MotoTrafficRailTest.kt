package expo.modules.kakaonavi

import org.junit.Assert.assertEquals
import org.junit.Test

class MotoTrafficRailTest {
  @Test
  fun progressIsScaledToEntireRoute() {
    assertEquals(1f, remainingTrafficFraction(4000, 4000, true), 0f)
    assertEquals(0.75f, remainingTrafficFraction(3000, 4000, true), 0f)
    assertEquals(0.5f, remainingTrafficFraction(2000, 4000, true), 0f)
    assertEquals(0f, remainingTrafficFraction(0, 4000, true), 0f)
  }

  @Test
  fun unavailablePositionStartsAtBottomAndDistancesAreClamped() {
    assertEquals(1f, remainingTrafficFraction(2000, 4000, false), 0f)
    assertEquals(1f, remainingTrafficFraction(2000, 0, true), 0f)
    assertEquals(1f, remainingTrafficFraction(4003, 4000, true), 0f)
    assertEquals(0f, remainingTrafficFraction(-3, 4000, true), 0f)
  }
}
