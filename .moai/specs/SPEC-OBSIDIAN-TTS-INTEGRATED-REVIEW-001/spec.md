# SPEC-OBSIDIAN-TTS-INTEGRATED-REVIEW-001: TTS v5 및 통합 노트 기능 검토

## TAG BLOCK

```yaml
spec_id: SPEC-OBSIDIAN-TTS-INTEGRATED-REVIEW-001
title: TTS v5 및 통합 노트 기능 일관성 및 효율성 검토
status: Planned
priority: High
created: 2026-02-04
domain: Obsidian
type: Review
lifecycle: spec-first
```

## Environment

### 시스템 환경
- **플랫폼**: Obsidian (Desktop/Mobile)
- **언어**: JavaScript (DataviewJS)
- **서비스**: Azure Function, Azure Blob Storage, M4 Pro 로컬 서버
- **모듈 아키텍처**: dv.view() 기반 9개 모듈 (TTS v5), integrated-ui (통합 노트)

### 대상 파일
- **TTS v5 Note**: `1_Project/정보 관리 기술사/999_기술사 준비/1_Dataview 노트/TTS 출제예상 읽기 v5 (Keychain).md`
- **Integrated Note**: `1_Project/정보 관리 기술사/999_기술사 준비/1_Dataview 노트/기술사_출제예상 (통합, 서버동기화, 최적화).md`
- **View 모듈**: `views/tts-*.js`, `views/integrated-ui/view.js`, `views/scroll-manager/view.js`

## Assumptions

### 기술 가정
- [A1] Azure Function API가 안정적으로 작동하고 응답 시간이 2초 이내임
- [A2] M4 Pro 로컬 서버가 동일 네트워크에서 접근 가능함
- [A3] Dataview 플러그인이 정상적으로 로드되고 dv.view()를 지원함
- [A4] localStorage와 IndexedDB가 브라우저에서 지원됨

### 비즈니스 가정
- [B1] 사용자는 TTS 재생 중 위치 동기화가 필요함
- [B2] 통합 노트에서 TTS 위치로 자동 이동 기능이 필요함
- [B3] 모바일/태블릿 환경에서도 동일한 기능이 작동해야 함

### 검증 방법
- [V1] 코드 정적 분석으로 EARS 준수 여부 확인
- [V2] 브라우저 콘솔 로그로 동작 확인
- [V3] 서버 로그로 API 호출 검증

## Requirements (EARS Format)

### R1: 기능적 일관성 (Functional Consistency)

#### R1.1: 공통 엔드포인트 사용
**WHEN** TTS v5가 재생 위치를 저장하고 통합 노트가 위치를 조회할 때 **THEN** 시스템은 동일한 서버 엔드포인트를 사용해야 한다.

**사양**:
- TTS v5: `window.playbackPositionManager.apiEndpoint` (PUT/GET)
- 통합 노트: `TTS_POSITION_READ_ENDPOINT` (GET)
- 두 엔드포인트는 동일한 URL을 사용해야 함

**검증**:
```javascript
// 통합 노트의 검증 코드 (기존 구현됨)
if (window.playbackPositionManager?.apiEndpoint) {
    const ttsV5Endpoint = window.playbackPositionManager.apiEndpoint;
    const match = (ttsV5Endpoint === TTS_POSITION_READ_ENDPOINT);
    window.ttsLog(match ? '✅ 엔드포인트 일치 확인!' : '⚠️ 엔드포인트 불일치 감지!');
}
```

#### R1.2: 인덱스 기반 매칭 (Index-First Matching)
**WHEN** 서버에서 재생 위치를 조회할 때 **THEN** 시스템은 `lastPlayedIndex`를 우선 사용하고, `noteTitle`은 보조 확인용으로만 사용해야 한다.

**사양**:
- R1.2.1: `serverData.lastPlayedIndex`가 유효하고 범위 내에 있으면 인덱스만 사용
- R1.2.2: 제목 매칭은 인덱스가 범위를 벗어났을 때만 폴백으로 사용
- R1.2.3: 인덱스와 제목이 모두 일치하면 성공, 불일치하면 경고 로그

**구현 위치**:
- `views/integrated-ui/view.js`: `handleResponse()` 메서드 (R1.1-R1.3)
- `views/integrated-ui/view.js`: `gotoTTSPosition()` 함수 (R1.1-R1.2)

#### R1.3: 타임스탬프 조정 (Server Time Error Handling)
**WHEN** 서버 타임스탬프가 현재 시간보다 5분 이상 미래일 때 **THEN** 시스템은 현재 시간으로 조정하고 로컬 위치를 우선 사용해야 한다.

**사양**:
- R1.3.1: 타임스탬프 허용 오차: 5분 (300,000ms)
- R1.3.2: 미래 타임스탬프 감지 시 `updateSyncStatusUI('timestamp-adjusted')` 호출
- R1.3.3: 조정된 타임스탬프를 사용하여 로컬 위치 반환

**구현 위치**:
- `views/tts-position/view.js`: `syncPosition()` 메서드 (R2.1-R2.3)

### R2: 코드 품질 (Code Quality)

#### R2.1: Hoisting 문제 방지
**WHEN** 모든 모듈에서 변수를 선언할 때 **THEN** 시스템은 `const`/`let`을 사용하고 `var`를 피해야 한다.

**현재 상태**:
- `views/integrated-ui/view.js`: `updateButtonPositions` 함수가 호이스팅 문제로 인해 선언보다 먼저 호출됨 (수정됨)
- `views/tts-engine/view.js`: pages 배열 유효성 검증 추가됨

#### R2.2: Null/Undefined 체크
**WHEN** 배열이나 객체에 접근할 때 **THEN** 시스템은 null/undefined 체크를 먼저 수행해야 한다.

**사양**:
```javascript
// 올바른 패턴
if (!reader.pages || reader.pages.length === 0) {
    console.error('❌ 재생할 노트가 없습니다.');
    return;
}
```

#### R2.3: 빈 상태 방어적 프로그래밍
**WHEN** 비어있는 상태일 때 **THEN** 시스템은 명확한 에러 메시지를 사용자에게 표시해야 한다.

**구현 예시**:
```javascript
if (lastPlayedDiv) {
    lastPlayedDiv.innerHTML = '❌ 재생할 노트가 없습니다. Dataview 쿼리를 확인하세요.';
}
```

### R3: 아키텍처 효율성 (Architecture Efficiency)

#### R3.1: 모듈화된 View 시스템
**WHEN** TTS 시스템을 로드할 때 **THEN** 시스템은 9개 독립 모듈을 의존성 순서대로 로드해야 한다.

**모듈 구조**:
```
tts-core (공통 유틸리티)
  ↓
tts-config (설정 로딩)
  ↓
tts-text (텍스트 처리)
  ↓
tts-cache (캐시 관리)
  ↓
tts-position (위치 동기화)
  ↓
tts-bell (종소리)
  ↓
tts-engine (재생 엔진)
  ↓
tts-ui (UI 생성)
  ↓
tts-debug (디버그)
```

#### R3.2: 동적 엔드포인트 설정
**WHEN** TTS 동작 모드가 변경될 때 **THEN** 시스템은 해당 모드에 맞는 엔드포인트를 자동으로 선택해야 한다.

**동작 모드**:
- `local`: M4 Pro 서버 직접 사용
- `server`: Azure Function 사용
- `hybrid`: TTS는 로컬, 위치 동기화는 Azure

**구현 위치**:
- `views/tts-config/view.js`: `TTS_OPERATION_MODES` 정의 (lines 102-127)
- `views/tts-position/view.js`: `getPlaybackPositionEndpoint()` 함수 (lines 13-35)

#### R3.3: StateLock으로 Race Condition 방지
**WHEN** 자동 폴링과 수동 클릭이 동시에 발생할 때 **THEN** 시스템은 StateLock으로 원자적 상태 변경을 보장해야 한다.

**구현**:
- `views/integrated-ui/view.js`: `StateLock` 클래스 (lines 208-237)
- 수동 클릭(`manual-click`)이 자동 폴링(`auto-polling`)보다 우선순위 가짐

#### R3.4: 정리 핸들러 (Cleanup Handlers)
**WHEN** 노트가 전환되거나 닫힐 때 **THEN** 시스템은 타이머, 옵저버, 이벤트 리스너를 정리해야 한다.

**다중 레이어 정리**:
- L1: MutationObserver (DOM 제거 감지)
- L2: visibilitychange (탭 숨김/표시)
- L3: beforeunload (페이지 언로드)

### R4: 사용자 경험 (User Experience)

#### R4.1: 동기화 상태 표시
**WHEN** 위치 동기화가 진행될 때 **THEN** 시스템은 현재 상태를 명확하게 표시해야 한다.

**상태 표시**:
- `syncing`: 🔄 서버 동기화 중... (주황색)
- `server`: ☁️ 서버에서 동기화됨 (초록색)
- `uploaded`: ✅ 서버에 업로드됨 (초록색)
- `local`: 📱 로컬 상태 사용 (회색)
- `timestamp-adjusted`: ⚠️ 서버 시간 오차 감지 (주황색)

#### R4.2: 자동 이동 토글
**WHEN** 사용자가 자동 이동 토글을 켤 때 **THEN** 시스템은 즉시 TTS 위치로 이동하고 주기적 모니터링을 시작해야 한다.

**구현**:
- `views/integrated-ui/view.js`: 토글 스위치 생성 및 이벤트 처리 (lines 1229-1276)
- localStorage에 상태 저장 (`ttsAutoMoveEnabled`)

#### R4.3: 수동 버튼 즉시 피드백
**WHEN** 사용자가 TTS 위치 버튼을 클릭할 때 **THEN** 시스템은 즉시 "확인 중..." 상태를 표시해야 한다.

**구현**:
```javascript
ttsBtn.textContent = '🎙️ 확인 중...';
// ... API 호출 및 처리
ttsBtn.textContent = `🎙️ ${name}`;
```

#### R4.4: 반응형 레이아웃
**WHEN** 화면 크기가 변경될 때 **THEN** 시스템은 모바일/태블릿/데스크톱에 맞는 레이아웃을 적용해야 한다.

**브레이크포인트**:
- Mobile: < 768px (1컬럼)
- Tablet: 768px - 1150px (2컬럼)
- Desktop: > 1150px (3컬럼)

## Specifications

### S1: 공통 엔드포인트 아키텍처

**목적**: TTS v5와 통합 노트 간 위치 동기화 일관성 보장

**구조**:
```
TTS v5 (writes)
    ↓ PUT
Azure Function: /api/playback-position
    ↓ GET
Integrated Note (reads)
```

**엔드포인트 계산 흐름**:
1. `tts-config` 모듈에서 `TTS_OPERATION_MODES` 정의
2. `tts-position` 모듈에서 `getPlaybackPositionEndpoint()`로 동적 계산
3. 통합 노트에서 동일한 엔드포인트 사용 확인 로그

### S2: StateLock 기반 Race Condition 방지

**목적**: 자동 폴링과 수동 클릭 간 충돌 방지

**동작 순서**:
1. 자동 폴링 진입: `StateLock.acquire('auto-polling')`
2. 수동 클릭 진입: `StateLock.acquire('manual-click')` (우선순위 높음)
3. 수동 클릭이 진행 중인 자동 폴링 강제 취소
4. 수동 클릭 완료 후 `StateLock.release()`
5. 자동 폴링 재개

### S3: 다중 레이어 정리 메커니즘

**목적**: 메모리 누수 방지 및 리소스 정리

**정리 순서**:
1. 타이머 중지 (`clearInterval`)
2. 옵저버 연결 해제 (`disconnect()`)
3. 이벤트 리스너 제거 (`removeEventListener`)
4. Map에서 Manager 제거
5. API 쓰로틀 리셋

## Traceability

| 요구사항 | 구현 위치 | 테스트 시나리오 |
|----------|-----------|----------------|
| R1.1 | tts-position/view.js:37, integrated-ui:76 | T-엔드포인트-일치 |
| R1.2 | integrated-ui/view.js:413-461 | T-인덱스-매칭 |
| R1.3 | tts-position/view.js:129-146 | T-타임스탬프-조정 |
| R2.1 | integrated-ui/view.js:952 | T-hoisting-방지 |
| R2.2 | tts-engine/view.js:267-275 | T-null-체크 |
| R3.1 | TTS v5 Note:31-71 | T-모듈-로드-순서 |
| R3.2 | tts-config/view.js:102-139 | T-동적-엔드포인트 |
| R3.3 | integrated-ui/view.js:208-237 | T-StateLock |
| R4.1 | tts-position/view.js:184-221 | T-동기화-상태-표시 |
| R4.2 | integrated-ui/view.js:1229-1396 | T-자동-이동-토글 |
| R4.4 | integrated-ui/view.js:634-781 | T-반응형-레이아웃 |
