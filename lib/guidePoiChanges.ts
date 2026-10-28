// 안내 화면이 열린 동안의 저장 장소 변경만 알린다. 장소 내용은 전역 이벤트에 복제하지 않는다.
const listeners=new Set<()=>void>();
export function notifyGuideFavoritesChanged() { for(const listener of listeners)listener(); }
export function listenGuideFavoritesChanged(listener:()=>void) { listeners.add(listener);return ()=>{listeners.delete(listener);}; }
