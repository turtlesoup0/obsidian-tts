# SPEC-OBSIDIAN-TTS-INTEGRATED-REVIEW-001: 구현 계획

## TAG BLOCK

```yaml
spec_id: SPEC-OBSIDIAN-TTS-INTEGRATED-REVIEW-001
title: TTS v5 및 통합 노트 기능 일관성 및 효율성 검토 구현 계획
status: Planned
priority: High
created: 2026-02-04
lifecycle: spec-first
```

## 개요

본 문서는 TTS v5와 통합 노트 시스템 간의 기능적 일관성, 코드 품질, 아키텍처 효율성, 사용자 경험을 검토하고 개선 사항을 도출하기 위한 구현 계획을 정의한다.

## 주요 마일스톤

### Milestone 1: 코드 정적 분석 (Primary Goal)
- **목표**: EARS 준수 여부 확인 및 잠재적 문제 식별
- **범위**: 모든 view 모듈 정적 분석
- **산출물**: 문제점 보고서, 개선 권장사항

### Milestone 2: 런타임 동작 검증 (Primary Goal)
- **목표**: 실제 동작 시나리오 테스트
- **범위**: 엔드포인트 일치, 인덱스 매칭, 타임스탬프 조정
- **산출물**: 테스트 결과, 동작 확인 로그

### Milestone 3: 성능 및 최적화 검토 (Secondary Goal)
- **목표**: 성능 병목 지점 식별
- **범위**: API 호출 빈도, DOM 렌더링, 메모리 사용
- **산출물**: 성능 프로파일, 최적화 권장사항

### Milestone 4: 사용자 경험 개선 (Secondary Goal)
- **목표**: UI/UX 개선사항 도출
- **범위**: 상태 표시, 피드백, 반응형 레이아웃
- **산출물**: UX 개선 제안서

## 기술 접근 방식

### Phase 1: 정적 분석 (Static Analysis)

**도구**:
- 코드 패턴 분석 (Regex 기반)
- EARS 준수 여부 체크리스트
- 의존성 그래프 분석

**검증 항목**:
1. Hoisting 문제 확인 (선언 순서)
2. Null/Undefined 체크 커버리지
3. 에러 메시지 명확성
4. 모듈 의존성 순서

**검증 방법**:
```bash
# Hoisting 검증
grep -n "updateButtonPositions\|const updateButtonPositions" views/integrated-ui/view.js

# Null 체크 검증
grep -n "if (!.*||.*length === 0)" views/tts-*.js
```

### Phase 2: 런타임 검증 (Runtime Validation)

**테스트 환경**:
- Obsidian Desktop (macOS/Windows)
- Obsidian Mobile (iOS/Android)
- 네트워크 조건: WiFi, 4G, Offline

**테스트 시나리오**:
1. TTS v5에서 재생 시작 → 통합 노트에서 위치 확인
2. 서버 시간 오정 주입 → 타임스탬프 조정 확인
3. 인덱스 불일치 상황 → 제목 폴백 동작 확인
4. 자동 이동 토글 ON/OFF → 상태 변경 확인

### Phase 3: 엔드포인트 일치 검증

**검증 절차**:
1. TTS v5 노트 열기 → `playbackPositionManager.apiEndpoint` 로그 확인
2. 통합 노트 열기 → `TTS_POSITION_READ_ENDPOINT` 로그 확인
3. 두 엔드포인트가 동일한지 비교 로그 확인

**기대 로그**:
```
✅ TTS Position Read Endpoint (통합 노트): https://.../api/playback-position
✅ TTS v5 Endpoint: https://.../api/playback-position
✅ 엔드포인트 일치 확인!
```

### Phase 4: Race Condition 시나리오 테스트

**시나리오**: 자동 폴링 중 수동 클릭
1. 자동 이동 토글 ON → 6초 간격 폴링 시작
2. 폴링 진행 중(🔄 상태) → TTS 위치 버튼 클릭
3. StateLock이 자동 폴링을 취소하고 수동 클릭 우선 처리
4. 결과: 수동 클릭으로 이동 완료

**기대 동작**:
```
🔄 [StateLock] Manual click priority: canceling auto-polling operation
🎙️ TTS 위치: 인덱스 매칭 "xxx" → index N
✅ [StateLock] Manual click operation completed successfully
```

## 아키텍처 설계 방향

### A1: 모듈 로드 순서 최적화

**현재 구조** (TTS v5):
```
1. tts-core (공통 유틸리티)
2. tts-config (설정)
3. tts-text (텍스트)
4. tts-cache (캐시)
5. tts-position (위치)
6. tts-bell (종소리)
7. tts-engine (엔진)
8. tts-ui (UI)
9. tts-debug (디버그)
```

**개선점**:
- 순환 의존성 방지 확인
- 불필요한 모듈 로드 제거
- 로드 실패 시 그레이스풀 디그레이션

### A2: StateLock 패턴 확장

**적용 범위**:
- TTS 자동 이동 (현재 적용됨)
- 스크롤 위치 동기화 (확장 가능)
- 캐시 무효화 (확장 가능)

**확장 시나리오**:
```javascript
// 스크롤 위치 저장 시도 중 TTS 재생 시작
StateLock: scroll-save vs tts-playback
→ TTS 재생 우선 (사용자 의도)
```

### A3: API 요청 최적화

**현재 구현**:
- APIThrottle 클래스: 최소 2초 간격
- 진행 중인 요청 재사용 (중복 방지)

**개선 방안**:
- 요청 취소 지원 (AbortController)
- 폴백 서버 자동 전환
- 요청 대기열 관리

### A4: 메모리 관리

**정리 전략**:
1. 다중 레이어 정리 메커니즘 (현재 구현됨)
2. Blob URL 해제 (URL.revokeObjectURL)
3. 이벤트 리스너 제거
4. IndexedDB 정리 (오래된 캐시)

## 위험 요소 및 대응 계획

### Risk 1: 엔드포인트 불일치
**확률**: Low
**영향**: High (위치 동기화 실패)
**대응**:
- 로그 기반 자동 검증 코드 추가
- 엔드포인트 설정 중앙화 (`tts-config`)

### Risk 2: Race Condition 누락
**확률**: Medium
**영향**: Medium (UI 깜빡임)
**대응**:
- StateLock 패턴 모든 위치 업데이트에 적용
- 단위 테스트 추가

### Risk 3: 모바일 성능 저하
**확률**: Medium
**영향**: High (사용자 경험)
**대응**:
- 저사양 디바이스 감지 최적화
- Lazy Loading 강화
- 폴링 간격 조정 (6초 → 10초)

## 품질 게이트 통과 기준

### Code Coverage
- [ ] EARS 요구사항 100% 매핑
- [ ] 모든 view 모듈 정적 분석 완료
- [ ] 핵심 경로 런타임 테스트 완료

### TRUST 5 Framework
- [ ] **Tested**: 주요 시나리오 테스트 통과
- [ ] **Readable**: 명확한 로그 메시지, 주석
- [ ] **Unified**: 일관된 코딩 스타일 (const/let, 화살표 함수)
- [ ] **Secured**: API 키 분리, 타임스탬프 검증
- [ ] **Trackable**: 모든 동작 로그 추적 가능

### Performance Targets
- [ ] API 호출 평균 응답 시간 < 2초
- [ ] 자동 폴링 메모리 누수 없음
- [ ] DOM 렌더링 지연 < 100ms

## 다음 단계 (Next Steps)

1. **정적 분석 실행**: 코드 패턴 분석 스크립트 실행
2. **런타임 테스트**: Obsidian 환경에서 테스트 시나리오 실행
3. **결과 종합**: 발견된 문제점 및 개선사항 보고서 작성
4. **개선 반영**: 우선순위별 문제 해결

## 참고 자료

- `views/tts-config/view.js`: TTS_OPERATION_MODES 정의
- `views/tts-position/view.js`: 위치 동기화 구현
- `views/integrated-ui/view.js`: 통합 UI 및 StateLock 구현
- `views/tts-engine/view.js`: TTS 재생 엔진
