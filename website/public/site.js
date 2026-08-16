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
