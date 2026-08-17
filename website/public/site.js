document.documentElement.classList.add('js');

const revealTargets = [...document.querySelectorAll('[data-reveal]')];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

for (const target of revealTargets) {
  const delay = Math.min(Math.max(Number.parseInt(target.dataset.delay ?? '0', 10) || 0, 0), 600);
  target.style.setProperty('--reveal-delay', `${delay}ms`);
}

if (reduceMotion || !('IntersectionObserver' in window)) {
  for (const target of revealTargets) target.classList.add('is-visible');
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    {
      rootMargin: '0px 0px -8% 0px',
      threshold: 0.12,
    },
  );

  for (const target of revealTargets) observer.observe(target);
}

const rideStory = document.querySelector('[data-ride-story]');

if (rideStory && !reduceMotion) {
  const media = rideStory.querySelector('.ride-story-media');
  const shade = rideStory.querySelector('.ride-story-shade');
  const progress = rideStory.querySelector('.ride-story-progress span');
  const hero = rideStory.querySelector('[data-ride-hero]');
  const chapters = [...rideStory.querySelectorAll('[data-ride-chapter]')];
  const scrollLabel = rideStory.querySelector('.ride-story-scroll');
  const chapterWindows = [
    { start: 0.1, end: 0.29 },
    { start: 0.26, end: 0.45 },
    { start: 0.42, end: 0.61 },
    { start: 0.58, end: 0.77 },
    { start: 0.74, end: 1.06 },
  ];
  const transitionLength = 0.045;
  const clamp = (value) => Math.min(Math.max(value, 0), 1);
  const storyStepProgress = [
    0,
    ...chapterWindows.map(({ start, end }) => clamp((start + Math.min(end, 1)) / 2)),
  ];
  const transitionFallbackDuration = 900;
  let frameRequested = false;
  let transitionLocked = false;
  let transitionReleaseTimer;
  let targetStepIndex = null;
  let wheelGestureStartedAt = Number.NEGATIVE_INFINITY;
  let lastWheelAt = Number.NEGATIVE_INFINITY;
  let lastWheelMagnitude = 0;
  let lastWheelDirection = 0;
  let touchStartY = null;
  let touchConsumed = false;

  const getStoryStops = () => {
    const storyTop = rideStory.offsetTop;
    const scrollDistance = Math.max(rideStory.offsetHeight - window.innerHeight, 1);
    return [
      ...storyStepProgress.map((step) => storyTop + scrollDistance * step),
      storyTop + rideStory.offsetHeight,
    ];
  };

  const getCurrentStepIndex = (stops) => {
    if (targetStepIndex !== null) return targetStepIndex;

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const [index, stop] of stops.entries()) {
      const distance = Math.abs(stop - window.scrollY);
      if (distance >= nearestDistance) continue;
      nearestDistance = distance;
      nearestIndex = index;
    }
    return nearestIndex;
  };

  const getTargetStoryStep = (direction) => {
    const stops = getStoryStops();
    const currentScroll = window.scrollY;
    const storyStart = stops[0];
    const storyEnd = stops[stops.length - 1];

    if (currentScroll < storyStart - 4 || currentScroll > storyEnd + 4) return null;

    const nextIndex = getCurrentStepIndex(stops) + direction;
    if (nextIndex < 0 || nextIndex >= stops.length) return null;
    return { index: nextIndex, top: stops[nextIndex] };
  };

  const finishStoryTransition = () => {
    if (!transitionLocked) return;

    transitionLocked = false;
    targetStepIndex = null;
    window.clearTimeout(transitionReleaseTimer);
  };

  const moveStoryByStep = (direction) => {
    const target = getTargetStoryStep(direction);
    if (target === null) return false;

    transitionLocked = true;
    targetStepIndex = target.index;
    window.clearTimeout(transitionReleaseTimer);
    transitionReleaseTimer = window.setTimeout(finishStoryTransition, transitionFallbackDuration);

    window.scrollTo({ top: target.top, behavior: 'smooth' });
    return true;
  };

  // 고정 시간 동안 입력을 막지 않고, 연속 감쇠는 관성으로, 간격·방향·세기 변화는 새 입력으로 본다.
  const isNewWheelGesture = (event, direction, magnitude) => {
    const now = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    const gap = now - lastWheelAt;
    const gestureDuration = now - wheelGestureStartedAt;
    const directionChanged = lastWheelDirection !== 0 && direction !== lastWheelDirection;
    const mouseWheelImpulse = gap > 28 && magnitude >= 40 && magnitude >= lastWheelMagnitude * 0.8;
    const renewedTrackpadImpulse = (
      gestureDuration > 90
      && magnitude > Math.max(lastWheelMagnitude * 1.8, 10)
    );
    const isNew = (
      !Number.isFinite(lastWheelAt)
      || gap > 72
      || directionChanged
      || mouseWheelImpulse
      || renewedTrackpadImpulse
    );

    if (isNew) wheelGestureStartedAt = now;
    lastWheelAt = now;
    lastWheelMagnitude = magnitude;
    lastWheelDirection = direction;
    return isNew;
  };

  const handleWheel = (event) => {
    if (event.ctrlKey || event.deltaY === 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

    const direction = event.deltaY > 0 ? 1 : -1;
    if (getTargetStoryStep(direction) === null) return;

    event.preventDefault();
    const deltaScale = event.deltaMode === 1
      ? 16
      : event.deltaMode === 2
        ? window.innerHeight
        : 1;
    const magnitude = Math.abs(event.deltaY * deltaScale);
    if (isNewWheelGesture(event, direction, magnitude)) moveStoryByStep(direction);
  };

  const handleTouchStart = (event) => {
    touchStartY = event.touches.length === 1 ? event.touches[0].clientY : null;
    touchConsumed = false;
  };

  const handleTouchMove = (event) => {
    if (touchStartY === null || event.touches.length !== 1) return;

    if (touchConsumed) {
      event.preventDefault();
      return;
    }

    const delta = touchStartY - event.touches[0].clientY;
    if (Math.abs(delta) < 2) return;

    const direction = delta > 0 ? 1 : -1;
    if (getTargetStoryStep(direction) === null) return;

    event.preventDefault();
    if (Math.abs(delta) < 42) return;

    touchConsumed = true;
    moveStoryByStep(direction);
  };

  const finishTouch = () => {
    touchStartY = null;
    touchConsumed = false;
  };

  const handleStoryKey = (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement
      && (target.isContentEditable || target.matches('a, input, textarea, select, button'))
    ) return;

    let direction = 0;
    if (
      event.key === 'ArrowDown'
      || event.key === 'PageDown'
      || event.key === 'End'
      || (event.key === ' ' && !event.shiftKey)
    ) {
      direction = 1;
    } else if (
      event.key === 'ArrowUp'
      || event.key === 'PageUp'
      || event.key === 'Home'
      || (event.key === ' ' && event.shiftKey)
    ) {
      direction = -1;
    }

    if (direction === 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    if (getTargetStoryStep(direction) === null) return;

    event.preventDefault();
    if (event.repeat) return;
    moveStoryByStep(direction);
  };

  const updateRideStory = () => {
    const rect = rideStory.getBoundingClientRect();
    const scrollDistance = Math.max(rideStory.offsetHeight - window.innerHeight, 1);
    const storyProgress = clamp(-rect.top / scrollDistance);

    media.style.transform = `scale(${1.03 + storyProgress * 0.12})`;
    shade.style.opacity = `${0.76 + storyProgress * 0.2}`;
    progress.style.transform = `scaleY(${storyProgress})`;

    const heroOpacity = clamp((0.15 - storyProgress) / 0.05);
    hero.style.opacity = `${heroOpacity}`;
    hero.style.transform = `translate3d(0, ${(1 - heroOpacity) * -38}px, 0)`;

    for (const [index, chapter] of chapters.entries()) {
      const { start, end } = chapterWindows[index];
      const entering = clamp((storyProgress - start) / transitionLength);
      const leaving = clamp((end - storyProgress) / transitionLength);
      const opacity = Math.min(entering, leaving);
      const offset = (1 - entering) * 38 - (1 - leaving) * 38;

      chapter.style.opacity = `${opacity}`;
      chapter.style.transform = `translate3d(0, ${offset}px, 0)`;
    }

    scrollLabel.style.opacity = `${clamp(1 - storyProgress / 0.08)}`;
    frameRequested = false;
  };

  const requestRideStoryUpdate = () => {
    if (frameRequested) return;
    frameRequested = true;
    window.requestAnimationFrame(updateRideStory);
  };

  updateRideStory();
  window.addEventListener('scroll', requestRideStoryUpdate, { passive: true });
  window.addEventListener('resize', requestRideStoryUpdate);
  window.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('touchstart', handleTouchStart, { passive: true });
  window.addEventListener('touchmove', handleTouchMove, { passive: false });
  window.addEventListener('touchend', finishTouch, { passive: true });
  window.addEventListener('touchcancel', finishTouch, { passive: true });
  window.addEventListener('keydown', handleStoryKey);
  window.addEventListener('scrollend', finishStoryTransition, { passive: true });
}
