# SPEC-OBSIDIAN-TTS-INTEGRATED-REVIEW-001: 인수 기준

## TAG BLOCK

```yaml
spec_id: SPEC-OBSIDIAN-TTS-INTEGRATED-REVIEW-001
title: TTS v5 및 통합 노트 기능 검토 인수 기준
status: Planned
priority: High
created: 2026-02-04
lifecycle: spec-first
```

## 개요

본 문서는 TTS v5와 통합 노트 시스템 간의 기능적 일관성, 코드 품질, 아키텍처 효율성, 사용자 경험을 검증하기 위한 인수 기준을 정의한다.

## 테스트 시나리오 (Given-When-Then Format)

### T-엔드포인트-일치: 엔드포인트 일치 검증

**Scenario**: TTS v5와 통합 노트가 동일한 엔드포인트를 사용하는지 확인

```
Given TTS v5 노트가 열리고 tts-position 모듈이 로드됨
And 통합 노트가 열리고 TTS_POSITION_READ_ENDPOINT가 설정됨
When 콘솔 로그를 확인하면
Then 두 엔드포인트가 동일한 URL을 사용해야 한다
And "✅ 엔드포인트 일치 확인!" 메시지가 표시되어야 한다
```

**검증 단계**:
1. TTS v5 노트 열기
2. 브라우저 콘솔에서 로그 확인:
   ```
   ✅ TTS Position Read Endpoint (통합 노트): https://...
   ✅ TTS v5 Endpoint: https://...
   ✅ 엔드포인트 일치 확인!
   ```

### T-인덱스-매칭: 인덱스 기반 위치 매칭

**Scenario 1**: 인덱스가 유효하고 제목이 일치할 때

```
Given 서버에서 lastPlayedIndex=5, noteTitle="DB 정규화"를 반환
And 로컬 currentPageNames[5]="DB 정규화"
When 통합 노트가 서버에서 위치를 조회하면
Then 인덱스 5로 매칭되어야 한다
And "🎯 인덱스 기반 매칭: index=5, 제목 확인='DB 정규화'" 로그가 표시되어야 한다
```

**Scenario 2**: 인덱스가 유효하지만 제목이 불일치할 때

```
Given 서버에서 lastPlayedIndex=5, noteTitle="DB 정규화"를 반환
And 로컬 currentPageNames[5]="데이터베이스 설계"
When 통합 노트가 서버에서 위치를 조회하면
Then 인덱스 5로 매칭되어야 한다 (제목 불일치 경고)
And "⚠️ 인덱스 기반 매칭: index=5, 제목 불일치" 로그가 표시되어야 한다
```

**Scenario 3**: 인덱스가 범위를 벗어났을 때

```
Given 서버에서 lastPlayedIndex=999 (범위 초과)
And 로컬 페이지 배열 길이가 50
When 통합 노트가 서버에서 위치를 조회하면
Then 제목 기반 폴백 매칭을 시도해야 한다
```

### T-타임스탬프-조정: 서버 시간 오정 처리

**Scenario**: 서버 타임스탬프가 미래일 때

```
Given 서버에서 timestamp이 현재 시간보다 10분 미래인 값을 반환
When TTS v5가 syncPosition()을 호출하면
Then TIMESTAMP_TOLERANCE_MS(5분) 초과를 감지해야 한다
And 타임스탬프를 현재 시간으로 조정해야 한다
And updateSyncStatusUI('timestamp-adjusted')가 호출되어야 한다
And "⚠️ 서버 시간 오차 감지 → 현재 시간으로 조정됨" 메시지가 표시되어야 한다
And 로컬 위치를 우선 사용해야 한다
```

**검증 단계**:
1. 서버 시간을 강제로 미래로 설정 (테스트용)
2. TTS v5 재생 후 통합 노트에서 위치 확인
3. 로그에서 타임스탬프 조정 확인

### T-hoisting-방지: 함수 선언 순서 검증

**Scenario**: updateButtonPositions 함수가 선언 전에 호출되지 않음

```
Given integrated-ui/view.js 모듈이 로드됨
When initUI() 함수가 실행되면
Then updateButtonPositions 함수가 정의된 후에 호출되어야 한다
And "ReferenceError: updateButtonPositions is not defined" 에러가 발생하지 않아야 한다
```

**검증 방법**:
```bash
# 선언 라인 번호 확인
grep -n "const updateButtonPositions\|function updateButtonPositions" views/integrated-ui/view.js
# 호출 라인 번호 확인
grep -n "updateButtonPositions()" views/integrated-ui/view.js
# 선언이 호출보다 먼저 나와야 함
```

### T-null-체크: 배열 유효성 검증

**Scenario 1**: pages 배열이 비어있을 때

```
Given reader.pages가 undefined 또는 빈 배열
When speakNoteWithServerCache(index)가 호출되면
Then "❌ 재생할 노트가 없습니다" 메시지를 표시해야 한다
And 함수가 early return해야 한다
And 에러가 발생하지 않아야 한다
```

**Scenario 2**: 유효한 pages 배열

```
Given reader.pages.length > 0
When speakNoteWithServerCache(index)가 호출되면
Then 정상적으로 재생을 시작해야 한다
```

### T-모듈-로드-순서: 의존성 순서 검증

**Scenario**: 모듈이 올바른 순서로 로드됨

```
Given TTS v5 노트가 열림
When 모듈 로드가 진행되면
Then 다음 순서로 로드되어야 한다:
1. tts-core (먼저 로드)
2. tts-config
3. tts-text
4. tts-cache
5. tts-position
6. tts-bell
7. tts-engine
8. tts-ui
9. tts-debug (마지막)
And 각 모듈 로드 완료 로그가 순서대로 표시되어야 한다
```

### T-동적-엔드포인트: 모드 기반 엔드포인트 계산

**Scenario 1**: 로컬 모드

```
Given operationMode가 "local"로 설정됨
When getPlaybackPositionEndpoint()가 호출되면
Then M4 Pro 서버 URL을 반환해야 한다
And "📍 Position Endpoint: Local M4 Pro Server" 로그가 표시되어야 한다
```

**Scenario 2**: 서버 모드

```
Given operationMode가 "server"로 설정됨
When getPlaybackPositionEndpoint()가 호출되면
Then Azure Function URL을 반환해야 한다
And "📍 Position Endpoint: Azure Function" 로그가 표시되어야 한다
```

### T-StateLock: Race Condition 방지

**Scenario**: 자동 폴링 중 수동 클릭

```
Given 자동 이동 토글이 ON 상태
And 6초 간격 폴링이 진행 중 (상태: 🔄)
When 사용자가 TTS 위치 버튼을 클릭하면
Then StateLock이 자동 폴링을 강제 취소해야 한다
And "🔄 [StateLock] Manual click priority: canceling auto-polling operation" 로그가 표시되어야 한다
And 수동 클릭 동작이 우선 처리되어야 한다
And "✅ [StateLock] Manual click operation completed successfully" 로그가 표시되어야 한다
```

### T-동기화-상태-표시: 상태별 UI 표시

**Scenario 1**: 동기화 중

```
Given syncPosition()가 호출됨
When 조회가 진행 중이면
Then 상태가 "syncing"으로 설정되어야 한다
And 색상이 주황색 (rgba(255,193,7,0.3))이어야 한다
And 아이콘이 🔄여야 한다
And 텍스트가 "서버 동기화 중..."여야 한다
```

**Scenario 2**: 서버에서 동기화됨

```
Given 서버에서 더 최신 데이터를 가져옴
When 동기화가 완료되면
Then 상태가 "server"로 설정되어야 한다
And 색상이 초록색 (rgba(76,175,80,0.3))이어야 한다
And 아이콘이 ☁️여야 한다
And 텍스트에 디바이스 ID가 포함되어야 한다
```

**Scenario 3**: 타임스탬프 조정됨

```
Given 서버 타임스탬프가 미래임
When 타임스탬프 조정이 발생하면
Then 상태가 "timestamp-adjusted"로 설정되어야 한다
And 색상이 주황색 (rgba(255,152,0,0.3))이어야 한다
And 아이콘이 ⚠️여야 한다
And 텍스트가 "서버 시간 오차 감지 → 현재 시간으로 조정됨"이어야 한다
```

### T-자동-이동-토글: 토글 동작

**Scenario 1**: 토글 ON

```
Given 자동 이동 토글이 OFF 상태
When 사용자가 토글을 클릭하면
Then 토글 스위치가 active 클래스를 가져야 한다
And localStorage에 'ttsAutoMoveEnabled'='true'가 저장되어야 한다
And 상태 표시가 ● (초록색)이어야 한다
And 즉시 TTS 위치로 이동해야 한다 (gotoTTSPosition() 호출)
And TTSAutoMoveManager가 시작되어야 한다 (start() 호출)
```

**Scenario 2**: 토글 OFF

```
Given 자동 이동 토글이 ON 상태
When 사용자가 토글을 클릭하면
Then 토글 스위치가 active 클래스를 제거해야 한다
And localStorage에 'ttsAutoMoveEnabled'='false'가 저장되어야 한다
And 상태 표시가 ○ (회색)이어야 한다
And TTSAutoMoveManager가 중지되어야 한다 (stop() 호출)
```

### T-반응형-레이아웃: 화면 크기별 레이아웃

**Scenario 1**: 데스크톱 (> 1150px)

```
Given 화면 너비가 1200px
When 페이지가 로드되면
Then 3컬럼 레이아웃이 적용되어야 한다
And 첫 번째 컬럼 너비가 40%여야 한다
And 두 번째 컬럼 너비가 30%여야 한다
And 세 번째 컬럼 너비가 30%여야 한다
And 세 번째 컬럼이 표시되어야 한다 (display: table-cell)
```

**Scenario 2**: 태블릿 (768px - 1150px)

```
Given 화면 너비가 900px
When 페이지가 로드되면
Then 2컬럼 레이아웃이 적용되어야 한다
And 첫 번째 컬럼 너비가 50%여야 한다
And 두 번째 컬럼 너비가 50%여야 한다
And 세 번째 컬럼이 숨겨져야 한다 (display: none)
```

**Scenario 3**: 모바일 (< 768px)

```
Given 화면 너비가 600px
When 페이지가 로드되면
Then 1컬럼 레이아웃이 적용되어야 한다
And 첫 번째 컬럼 너비가 100%여야 한다
And 두 번째, 세 번째 컬럼이 숨겨져야 한다
```

## 품질 게이트 기준 (Quality Gates)

### QG-1: 기능적 일관성
- [ ] **엔드포인트 일치**: TTS v5와 통합 노트가 동일한 엔드포인트 사용
- [ ] **인덱스 매칭**: 서버 인덱스가 우선, 제목은 보조
- [ ] **타임스탬프 조정**: 미래 타임스탬프 자동 조정

### QG-2: 코드 품질
- [ ] **Hoisting 방지**: 함수 선언이 호출보다 먼저
- [ ] **Null 체크**: 모든 배열/객체 접근 전 null 체크
- [ ] **에러 메시지**: 명확하고 사용자 친화적인 에러 메시지

### QG-3: 아키텍처 효율성
- [ ] **모듈 로드 순서**: 의존성 순서 준수
- [ ] **동적 엔드포인트**: 모드 기반 자동 설정
- [ ] **StateLock**: Race Condition 방지
- [ ] **정리 핸들러**: 메모리 누수 방지

### QG-4: 사용자 경험
- [ ] **상태 표시**: 5가지 상태 명확히 구분
- [ ] **토글 동작**: 즉시 피드백 및 상태 저장
- [ ] **반응형 레이아웃**: 3가지 화면 크기 지원

## Definition of Done

각 시나리오에 대해 다음 조건이 충족되어야 완료로 간주한다:

1. **Given** 조건이 충족되었는지 확인
2. **When** 동작을 실행하고 결과 관찰
3. **Then** 기대 결과가 모두 충족되는지 확인
4. 콘솔 로그에 예상된 메시지가 표시되는지 확인
5. 에러가 발생하지 않는지 확인

## 검증 도구

### 정적 분석
```bash
# 엔드포인트 일치 검증
grep -r "playback-position" views/ --include="*.js"

# Hoisting 검증
grep -n "updateButtonPositions\|const updateButtonPositions" views/integrated-ui/view.js

# Null 체크 검증
grep -n "if (!.*||.*length === 0)" views/tts-*.js
```

### 런타임 검증
- 브라우저 개발자 도구 콘솔
- Obsidian 로그 뷰어
- 네트워크 탭 (API 호출 확인)

## 테스트 결과 템플릿

| 시나리오 | 상태 | 비고 |
|----------|------|------|
| T-엔드포인트-일치 | [ ] PASS / FAIL | |
| T-인덱스-매칭 | [ ] PASS / FAIL | |
| T-타임스탬프-조정 | [ ] PASS / FAIL | |
| T-hoisting-방지 | [ ] PASS / FAIL | |
| T-null-체크 | [ ] PASS / FAIL | |
| T-모듈-로드-순서 | [ ] PASS / FAIL | |
| T-동적-엔드포인트 | [ ] PASS / FAIL | |
| T-StateLock | [ ] PASS / FAIL | |
| T-동기화-상태-표시 | [ ] PASS / FAIL | |
| T-자동-이동-토글 | [ ] PASS / FAIL | |
| T-반응형-레이아웃 | [ ] PASS / FAIL | |
