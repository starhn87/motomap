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
  let frameRequested = false;

  const clamp = (value) => Math.min(Math.max(value, 0), 1);

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
}
