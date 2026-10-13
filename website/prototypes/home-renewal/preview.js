const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const hero = document.querySelector('.hero');
const mapImage = document.querySelector('[data-map-image]');
const chatImage = document.querySelector('[data-chat-image]');
const caption = document.querySelector('.device-caption');
const screenButtons = document.querySelectorAll('[data-screen]');

// 실제 앱 캡처만 전환한다. 검색·위치·분석 API는 호출하지 않는다.
screenButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const isMap = button.dataset.screen === 'map';
    screenButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    mapImage.hidden = !isMap;
    chatImage.hidden = isMap;
    const shownImage = isMap ? mapImage : chatImage;
    shownImage.classList.remove('screen-enter');
    requestAnimationFrame(() => shownImage.classList.add('screen-enter'));
    caption.textContent = isMap ? '내 주변의 라이더 장소를 한눈에.' : '원하는 지역과 분위기를 말로 물어보세요.';
  });
});

// 스크롤을 가로채거나 단계 잠금을 만들지 않는다.
let framePending = false;
const updateHero = () => {
  framePending = false;
  const progress = reducedMotion.matches ? 0 : Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / hero.offsetHeight));
  hero.style.setProperty('--hero-progress', String(progress));
};
window.addEventListener('scroll', () => {
  if (framePending) return;
  framePending = true;
  requestAnimationFrame(updateHero);
}, { passive: true });
reducedMotion.addEventListener('change', updateHero);
updateHero();

// JS가 없거나 관찰 API를 지원하지 않아도 콘텐츠는 기본적으로 보인다.
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('reveal-in');
      observer.unobserve(entry.target);
    });
  }, { threshold: .08 });
  document.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
}
