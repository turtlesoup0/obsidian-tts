# SPEC-OBSIDIAN-TTS-POSITION-SYNC-001: TTS 위치 동기화 근본 분석

## 상태: 분석 완료, 근본 수정 미적용 (중간 커밋)

## 사용자 요구사항

1. **Azure 의존성 최소화**: Edge 서버가 항상 primary. Azure는 Edge 장애 시 비상용
2. **폴링 최소화**: SSE가 정상이면 폴링 0. SSE 이벤트만으로 동작
3. **근본 원인 해결**: 밴드에이드 수정 금지

## 증상

- 태블릿에서 TTS 재생 시 태블릿 자체 위치추적은 정상
- PC/모바일 통합노트에서 자동이동 불가
- "TTS 위치" 버튼 클릭 시 잘못된 노트로 이동
- SSE 연결은 정상 (연결됨 상태)
- Docker 로그에 PUT /api/playback-position 요청 없음 (GET만 존재)

## 발견된 5가지 근본 문제

### Issue 1: async IIFE 비동기 초기화 경쟁 조건 [심각도: HIGH]

**파일**: `views/tts-position/view.js` lines 25-72

```
(async () => {
    await loadScript('...');  // 비동기 스크립트 로드
    initializePlaybackPositionManager();  // 여기서 매니저 생성
})();  // ← dv.view()가 이 Promise를 await하지 않음!
```

- `dv.view("views/tts-position")`가 반환될 때 async IIFE가 아직 실행 중
- 후속 모듈(tts-engine)이 `window.playbackPositionManager`를 사용할 때 아직 undefined일 수 있음
- 실제로는 loadScript의 onerror가 즉시 resolve되어 대부분 타이밍에 문제없지만, 보장되지 않음

### Issue 2: ConfigResolver 경로 오류 [심각도: MEDIUM]

**파일**: `views/tts-position/view.js` line 45

```
await loadScript('../../Projects/obsidian-tts/shared/configResolver.js');
```

- Obsidian webview에서 이 상대 경로가 올바른 파일시스템 경로로 해석되지 않음
- `script.onerror → resolve()`로 조용히 실패
- 결과: `window.ConfigResolver`가 undefined → Edge-First 패치 미적용

### Issue 3: Edge-First 패치 무효 (Dead Code) [심각도: LOW]

**파일**: `views/tts-position/view.js` lines 48-66

- ConfigResolver가 로드되지 않으므로 (Issue 2) 패치 블록 전체가 실행되지 않음
- `getPlaybackPositionEndpoint()`는 이미 ConfigResolver를 우회하므로 패치 자체가 불필요
- 17줄의 dead code

### Issue 4: Edge 실패 시 무성 Azure Fallback [심각도: CRITICAL]

**파일**: `views/tts-position/view.js` lines 185-227

- `savePosition`이 Edge PUT 실패 시 Azure로 조용히 fallback
- Azure는 데이터를 저장하지만 SSE broadcast 기능 없음
- 결과: 다른 기기의 SSE 리스너가 업데이트를 받지 못함
- Docker 로그 확인 결과: Azure에 PUT 도달 (`deviceId: "MacIntel-qfshixmb"`, `noteTitle: "SW아키텍처"`)
  Edge에는 PUT 미도달

### Issue 5: scroll-manager의 스텁 playbackPositionManager [심각도: MEDIUM]

**파일**: `views/scroll-manager/view.js` lines 147-170

- `savePosition()` 메서드 없는 스텁 매니저를 생성
- 통합노트에서 scroll-manager가 tts-position의 async IIFE보다 먼저 실행되면
  `if (!window.playbackPositionManager)` 체크를 통과하여 전체 초기화를 건너뜀
- 통합노트에서는 savePosition이 불필요하므로 직접적 영향은 제한적

## 현재 커밋에 포함된 중간 수정 (밴드에이드)

### integrated-ui/view.js
1. **getTTSPosition**: Edge+Azure 병렬 조회, timestamp 비교 → 최신 데이터 선택
   - ⚠️ Azure 요청 증가 (요구사항 1 위반)
2. **handleSSEModeChanged**: SSE 모드에서 10초 저빈도 폴링 유지
   - ⚠️ 불필요한 폴링 (요구사항 2 위반)
3. **gotoTTSPosition/handleTTSPositionChanged/pollTTSPosition**: noteTitle 우선 매칭
   - ✅ 올바른 수정 (유지)
4. **pollTTSPosition**: lastPosition 비교를 noteTitle 기반으로 변경
   - ✅ 올바른 수정 (유지)

### tts-position/view.js
1. **getPlaybackPositionEndpoint**: ConfigResolver 우회, Edge URL 직접 반환
   - ✅ 방향 올바름 (하지만 async IIFE 문제로 적용 불확실)
2. **savePosition**: 진단 로깅 추가
   - ⚠️ 임시 진단용

### tts-engine/view.js
1. **savePosition 호출**: 존재 여부 체크 + 진단 로깅
   - ⚠️ 임시 진단용

### sse-sync/view.js
1. **onopen 콜백**: 재연결 시 connectionMode/notifySSEStateChange 호출
   - ✅ 올바른 수정 (유지)

## 근본 수정 계획 (다음 단계)

### 수정 대상 (3파일 제한)
1. `views/tts-position/view.js`: async IIFE 제거 → 동기 초기화, ConfigResolver 코드 전체 제거
2. `views/integrated-ui/view.js`: getTTSPosition Edge-first 순차 조회, SSE 모드 폴링 완전 중지
3. `views/tts-engine/view.js`: 방어적 가드 정리

### 설계 원칙
- PUT은 반드시 Edge로 → SSE broadcast 작동
- getTTSPosition: Edge 우선 순차 (Azure는 Edge 실패 시에만)
- SSE 활성 시 폴링 = 0 (SSE 이벤트만으로 동작)
- noteTitle 우선 매칭 유지 (인덱스 공간 불일치 해결)
