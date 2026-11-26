// RN 0.86 Fabric은 네이티브가 보낸 top-level 이벤트가 레지스트리에 없으면
// `Unsupported top level event type`으로 앱을 종료한다.
// codegen은 `onMapRendered`를 `mapRendered`로 보내고, EventEmitter가 `topMapRendered`로 정규화한다.
// 2.9.1 JS spec에는 이 이름이 없다. 핸들러는 붙이지 않고 이름만 등록한다.

export const NAVER_MAP_FABRIC_EVENTS = {
  topFirstMapRender: 'onFirstMapRender',
  topMapRendered: 'onMapRendered',
  topMapLoaded: 'onMapLoaded',
} as const;

type DirectEventRegistry = Record<string, { registrationName?: string } | undefined>;

export function fabricTopLevelEventName(specName: string): string {
  if (!specName.startsWith('on') || specName.length < 3) {
    throw new Error(`지도 이벤트 spec 이름은 on으로 시작해야 합니다: ${specName}`);
  }
  const dispatch = `${specName[2].toLowerCase()}${specName.slice(3)}`;
  if (dispatch.startsWith('top')) return dispatch;
  if (dispatch.startsWith('on')) return `top${dispatch.slice(2)}`;
  return `top${dispatch[0].toUpperCase()}${dispatch.slice(1)}`;
}

export function registerNaverMapFabricEvents(directEventTypes: DirectEventRegistry): string[] {
  const added: string[] = [];
  for (const [topLevelType, registrationName] of Object.entries(NAVER_MAP_FABRIC_EVENTS)) {
    if (directEventTypes[topLevelType] == null) {
      directEventTypes[topLevelType] = { registrationName };
      added.push(topLevelType);
    }
  }
  return added;
}
