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
  const chapters = [...rideStory.querySelectorAll('[data-ride-chapter]')];
  const devices = rideStory.querySelector('.ride-story-devices');
  const scrollLabel = rideStory.querySelector('.ride-story-scroll');
  const chapterWindows = [
    { start: -0.08, end: 0.26 },
    { start: 0.18, end: 0.52 },
    { start: 0.44, end: 0.78 },
  ];
  let frameRequested = false;

  const clamp = (value) => Math.min(Math.max(value, 0), 1);

  const updateRideStory = () => {
    const rect = rideStory.getBoundingClientRect();
    const scrollDistance = Math.max(rideStory.offsetHeight - window.innerHeight, 1);
    const storyProgress = clamp(-rect.top / scrollDistance);

    media.style.transform = `scale(${1.03 + storyProgress * 0.14})`;
    shade.style.opacity = `${0.76 + storyProgress * 0.2}`;
    progress.style.transform = `scaleY(${storyProgress})`;

    for (const [index, chapter] of chapters.entries()) {
      const { start, end } = chapterWindows[index];
      const entering = clamp((storyProgress - start) / 0.08);
      const leaving = clamp((end - storyProgress) / 0.08);
      const opacity = Math.min(entering, leaving);
      const offset = (1 - entering) * 38 - (1 - leaving) * 38;

      chapter.style.opacity = `${opacity}`;
      chapter.style.transform = `translate3d(0, ${offset}px, 0)`;
    }

    const finale = clamp((storyProgress - 0.7) / 0.1);
    devices.style.opacity = `${finale}`;
    devices.style.transform = `translate3d(0, ${(1 - finale) * 90}px, 0) scale(${0.94 + finale * 0.06})`;
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
}
