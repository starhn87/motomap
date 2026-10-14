// 스크롤 등장 연출과 기능 챕터의 폰 화면 교체만 담당한다. 자연 스크롤을 가로채지 않는다.
document.documentElement.classList.add('js');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealTargets = [...document.querySelectorAll('[data-reveal]')];

// 한 영역 안의 줄·요소를 문서 순서대로 80ms씩 늦춰 순차적으로 등장시킨다.
for (const target of revealTargets) {
  const base = Number.parseFloat(target.dataset.base ?? '0') || 0;
  const items = target.querySelectorAll('.ln > span, .fx, .rule');
  for (const [index, item] of items.entries()) {
    item.style.setProperty('--d', `${(base + index * 0.08).toFixed(2)}s`);
  }
}

if (reduceMotion || !('IntersectionObserver' in window)) {
  for (const target of revealTargets) target.classList.add('is-in');
} else {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      }
    },
    { threshold: 0.2, rootMargin: '0px 0px -8% 0px' },
  );
  for (const target of revealTargets) revealObserver.observe(target);

  // 첫 화면 경로선이 그려지듯 이어진다.
  document.querySelector('.route-line path')?.animate(
    [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
    { duration: 2400, easing: 'cubic-bezier(.45, 0, .2, 1)', fill: 'both' },
  );
}

// 화면 중앙에 들어온 챕터를 강조하고, 고정된 폰 화면을 해당 캡처로 바꾼다.
const chapters = [...document.querySelectorAll('[data-chapter]')];
const stagePhones = [...document.querySelectorAll('.chapter-stage .phone')];

if ('IntersectionObserver' in window) {
  const chapterObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const activeIndex = Number(entry.target.dataset.chapter);
        for (const chapter of chapters) chapter.classList.toggle('is-active', chapter === entry.target);
        for (const [index, phone] of stagePhones.entries()) {
          phone.classList.toggle('is-active', index === activeIndex);
        }
      }
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  for (const chapter of chapters) chapterObserver.observe(chapter);
} else {
  for (const chapter of chapters) chapter.classList.add('is-active');
}
