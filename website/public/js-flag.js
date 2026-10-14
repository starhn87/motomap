// CSP상 인라인 스크립트를 못 쓰므로, 첫 페인트 전에 연출용 숨김 상태를 켜는 블로킹 스크립트를 따로 둔다.
document.documentElement.classList.add('js');
