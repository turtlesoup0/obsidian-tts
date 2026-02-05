---
spec_id: SPEC-PERF-001
title: TTS 위치 추적을 위한 폴링 대체 동기화 방식 검토
status: Planned
priority: High
created: 2026-02-05
tags: performance, synchronization, websocket, sse, event-driven
related_specs: []
---

# 검수 기준 (Acceptance Criteria)

## 개요

이 문서는 SPEC-PERF-001의 검수 기준을 정의한다. 각 기능에 대한 Given-When-Then 형식의 테스트 시나리오와 정의 완료(Definition of Done) 기준을 포함한다.

---

## 정의 완료 (Definition of Done)

### 문서 완료 기준

- [ ] spec.md에 모든 요구사항(R1-R6)이 EARS 형식으로 정의됨
- [ ] 현재 폴링 방식의 문제점이 정량적으로 분석됨
- [ ] 최소 3가지 대안 기술이 상세 분석됨
- [ ] 각 대안의 장단점 비교표가 포함됨
- [ ] 최종 권장 사항과 근거가 명확히 제시됨

### 분석 완료 기준

- [ ] 현재 시스템의 성능 지표가 측정됨
  - [ ] 요청 빈도 (요청/분)
  - [ ] 평균 응답 시간
  - [ ] 배터리 소모
  - [ ] 데이터 사용량
- [ ] 각 대안의 기술적 타당성이 평가됨
  - [ ] Obsidian DataviewJS API 지원 여부
  - [ ] Azure 서비스 통합 가능성
  - [ ] 모바일 환경 호환성
- [ ] 비용 분석이 완료됨
  - [ ] 초기 개발 비용 추정
  - [ ] 월 운영 비용 추정

---

## 테스트 시나리오 (Test Scenarios)

### AC1: 현재 폴링 방식 분석

#### AC1.1 폴링 간격 확인

**Given** 사용자가 통합 노트를 열고 `startPolling`을 호출할 때
**When** 브라우저 DevTools Console에서 폴링 간격을 확인하면
**Then** 폴링 간격이 명확히 식별되어야 한다 (예: 5000ms, 10000ms)

#### AC1.2 요청 빈도 측정

**Given** 사용자가 1분간 TTS를 재생할 때
**When** Network 탭에서 `/api/playback-position` 요청 수를 확인하면
**Then** 요청 횟수가 기록되어야 한다 (예: 12회 = 5초 간격)

#### AC1.3 불필요한 요청 비율 분석

**Given** 사용자가 TTS를 일시 정지하고 1분간 대기할 때
**When** Network 탭에서 요청을 확인하면
**Then** 변경이 없음에도 불구하고 요청이 전송되는 것을 확인해야 한다

#### AC1.4 배터리 소모 측정 (모바일)

**Given** 사용자가 모바일 기기에서 1시간동안 TTS를 재생할 때
**When** 배터리 사용량을 확인하면
**Then** 배터리 소모율이 기록되어야 한다

---

### AC2: Page Visibility API 기반 폴링 최적화

#### AC2.1 백그라운드 진입 시 폴링 중지

**Given** 사용자가 TTS를 재생 중이고
**And** 폴링이 활성화되어 있을 때
**When** 사용자가 다른 탭으로 전환하면 (document.hidden === true)
**Then** 폴링이 중지되어야 한다
**And** Network 탭에 새로운 요청이 없어야 한다

#### AC2.2 포그라운드 복귀 시 즉시 동기화

**Given** 사용자가 백그라운드에서 포그라운드로 복귀할 때
**When** visibilitychange 이벤트가 발생하면
**Then** 즉시 서버에서 최신 위치를 동기화해야 한다
**And** 폴링이 재개되어야 한다

#### AC2.3 동적 폴링 간격 조절

**Given** 사용자가 5분간 TTS와 상호작용하지 않을 때
**When** 다음 폴링 요청이 발생하면
**Then** 폴링 간격이 연장되어야 한다 (예: 5초 → 30초)

**Given** 사용자가 다시 TTS를 조작할 때
**When** 활동이 감지되면
**Then** 폴링 간격이 단축되어야 한다 (예: 30초 → 5초)

---

### AC3: Optimistic UI 기반 위치 동기화

#### AC3.1 즉시 UI 업데이트

**Given** 사용자가 다음 노트로 넘어갈 때
**When** `savePosition()`을 호출하면
**Then** UI가 즉시 업데이트되어야 한다 (서버 응답을 기다리지 않음)
**And** 로컬 저장소에 위치가 저장되어야 한다

#### AC3.2 백그라운드 동기화

**Given** 사용자가 위치를 변경하고 UI가 즉시 업데이트되었을 때
**When** 백그라운드에서 서버 PUT 요청이 완료되면
**Then** Console에 성공 메시지가 표시되어야 한다

#### AC3.3 서버 실패 시 로컬 상태 유지

**Given** 사용자가 위치를 변경했을 때
**When** 서버 PUT 요청이 실패하면 (네트워크 오류)
**Then** 로컬 업데이트는 유지되어야 한다
**And** 사용자에게 경고가 표시되어야 하지만 UI는 롤백되지 않아야 한다

#### AC3.4 충돌 해결 (타임스탬프 기반)

**Given** 디바이스 A에서 50번 노트까지 재생했을 때
**And** 디바이스 B에서 오프라인으로 45번 노트까지 재생했을 때
**When** 디바이스 B가 온라인이 되어 동기화하면
**Then** 디바이스 A의 위치 (50, 최신 타임스탬프)가 우선되어야 한다
**And** 디바이스 B에 50번 노트가 표시되어야 한다

---

### AC4: SSE (Server-Sent Events) 기반 푸시 (선택)

#### AC4.1 SSE 연결 established

**Given** 사용자가 노트를 열고 EventSource를 초기화할 때
**When** SSE 연결이 성공하면
**Then** `onopen` 이벤트가 발생해야 한다
**And** Console에 연결 성공 메시지가 표시되어야 한다

#### AC4.2 서버 푸시 수신

**Given** SSE 연결이 활성화되어 있고
**And** 다른 디바이스에서 위치를 변경했을 때
**When** 서버에서 이벤트를 푸시하면
**Then** `onmessage` 이벤트가 발생해야 한다
**And** 수신한 데이터로 UI가 업데이트되어야 한다

#### AC4.3 자동 재연결

**Given** SSE 연결이 활성화되어 있을 때
**When** 네트워크가 일시적으로 차단되었다가 복구되면
**Then** EventSource가 자동으로 재연결을 시도해야 한다
**And** 재연결 성공 후 메시지 수신이 재개되어야 한다

#### AC4.4 연결 해제 처리

**Given** SSE 연결이 활성화되어 있을 때
**When** 사용자가 탭을 닫거나 페이지를 이동하면
**Then** EventSource 연결이 정상적으로 해제되어야 한다
**And** 서버에서 리소스가 정리되어야 한다

---

### AC5: Obsidian DataviewJS API 호환성

#### AC5.1 WebSocket API 지원 여부

**Given** DataviewJS 환경에서
**When** `typeof WebSocket`을 확인하면
**Then** WebSocket이 정의되어 있거나 undefined여야 한다
**And** 지원 여부가 명확히 확인되어야 한다

#### AC5.2 EventSource API 지원 여부

**Given** DataviewJS 환경에서
**When** `typeof EventSource`를 확인하면
**Then** EventSource가 정의되어 있어야 한다
**And** SSE 연결이 가능해야 한다

#### AC5.3 Page Visibility API 지원 여부

**Given** DataviewJS 환경에서
**When** `document.addEventListener('visibilitychange', ...)`를 호출하면
**Then** 이벤트 리스너가 등록되어야 한다
**And** `document.hidden`으로 상태 확인이 가능해야 한다

---

### AC6: 비용 분석

#### AC6.1 현재 방식 비용 계산

**Given** 현재 폴링 방식이 5초 간격일 때
**When** 1시간 동안 실행되면
**Then** 총 720회의 요청이 발생해야 한다
**And** Azure Functions 실행 시간 비용이 계산되어야 한다

#### AC6.2 폴링 최적화 비용 절감

**Given** 폴링 최적화 (Page Visibility)가 적용될 때
**When** 사용자가 50% 시간을 백그라운드에서 보내면
**Then** 요청 횟수가 50% 감소해야 한다 (720회 → 360회)
**And** 비용 절감액이 계산되어야 한다

#### AC6.3 SignalR/SSE 추가 비용 계산

**Given** SignalR 또는 SSE가 도입될 때
**When** 월 100,000 메시지가 처리되면
**Then** 월 비용이 추정되어야 있다
**And** 현재 폴링 방식과 비교되어야 한다

---

### AC7: 모바일 환경 테스트

#### AC7.1 iOS Obsidian 앱 테스트

**Given** 사용자가 iOS Obsidian 앱을 사용할 때
**When** Page Visibility API로 백그라운드 진입을 감지하면
**Then** 폴링이 중지되어야 한다
**And** 포그라운드 복귀 시 동기화되어야 한다

#### AC7.2 Android Obsidian 앱 테스트

**Given** 사용자가 Android Obsidian 앱을 사용할 때
**When** 앱이 백그라운드로 전환되면
**Then** 네트워크 요청이 중지되어야 한다
**And** 배터리 소모가 감소해야 한다

#### AC7.3 백그라운드 탭에서 연결 유지

**Given** SSE 연결이 활성화되어 있을 때
**When** 사용자가 다른 탭으로 전환하면
**Then** 연결이 유지되거나 graceful하게 해제되어야 한다
**And** 에러가 발생하지 않아야 한다

---

### AC8: 오프라인 지원

#### AC8.1 오프라인 상태에서 위치 변경

**Given** 사용자가 오프라인 상태일 때
**When** 다음 노트로 넘어가면
**Then** 로컬 저장소에 위치가 저장되어야 한다
**And** UI가 정상적으로 업데이트되어야 한다

#### AC8.2 온라인 복귀 시 동기화

**Given** 사용자가 오프라인에서 여러 노트를 재생했을 때
**When** 온라인이 되면
**Then** 백그라운드에서 서버에 최신 위치가 동기화되어야 한다
**And** 충돌 해결 로직이 적용되어야 한다

---

### AC9: 롤백 계획

#### AC9.1 기능 플래그로 on/off

**Given** 새로운 동기화 방식이 도입될 때
**When** 문제가 발생하여 롤백이 필요하면
**Then** 기능 플래그로 기존 방식으로 즉시 전환할 수 있어야 한다

#### AC9.2 기존 방식과 병행 운영

**Given** 새로운 방식이 배포될 때
**When** 일부 사용자에게 새로운 방식이 적용될 때
**And** 다른 사용자에게는 기존 방식이 적용될 때
**Then** 두 방식이 모두 정상 작동해야 한다
**And** 데이터 일관성이 유지되어야 한다

---

## 품질 게이트 (Quality Gates)

### LSP 품질 게이트 (Plan Phase)

- [ ] **Baseline 캡처**: 현재 시스템 성능 지표가 측정됨
- [ ] **문법 오류**: 없음 (EARS 형식 검증)
- [ ] **완전성**: 모든 요구사항(R1-R6)이 정의됨

### 분석 품질 게이트

- [ ] **정량적 분석**: 성능 지표가 수치화됨
- [ ] **비교 분석**: 각 방식이 동일한 기준으로 비교됨
- [ ] **권장 사항**: 명확한 근거와 함께 제시됨

### 문서 품질 게이트

- [ ] **EARS 준수**: 모든 요구사항이 EARS 패턴을 따름
- [ ] **추적 가능성**: 요구사항-설계 매핑이 존재
- [ ] **검증 가능성**: 각 요구사항에 대한 검증 방법이 정의됨

---

## 성공 지표 (Success Metrics)

### 성능 개선 목표

| 지표 | 현재 (폴링) | 목표 (최적화) | 측정 방법 |
|------|-------------|---------------|-----------|
| 동기화 지연 | 5-10초 | < 5초 | 변경 발생부터 반영까지 |
| 요청 수/시간 | ~720회/시간 | < 360회/시간 | Network 탭 |
| 배터리 소모 | 기준 | -50% | 1시간 사용 배터리 감소율 |
| 백그라운드 요청 | 계속 발생 | 0회 | 백그라운드 진입 후 |

### 사용자 경험 개선 목표

- [ ] UI 반응성: 즉시 업데이트 (Optimistic UI)
- [ ] 오프라인 지원: 네트워크 없어도 작동
- [ ] 충돌 해결: 자동으로 최신 위치 선택
- [ ] 모바일 배터리: 1시간 사용 시 5% 미만 소모

---

## 검증 방법 (Verification Methods)

### 자동화된 테스트

**코드 검증**:
```bash
# 1. 폴링 간격 확인
grep -r "setInterval" templates/ | grep -i "position"

# 2. Page Visibility API 사용 확인
grep -r "visibilitychange\|document.hidden" templates/

# 3. Optimistic UI 패턴 확인
grep -A 5 "savePosition" templates/ | grep "localStorage"
```

### 수동 테스트 체크리스트

**데스크톱 환경**:
- [ ] Chrome DevTools Network 탭으로 요청 빈도 확인
- [ ] Lighthouse로 배터리 성능 측정
- [ ] 다른 탭으로 전환 시 폴링 중지 확인
- [ ] 오프라인 모드에서 위치 변경 테스트 (DevTools → Network → Offline)

**모바일 환경**:
- [ ] iOS/Android Obsidian 앱에서 테스트
- [ ] 백그라운드/포그라운드 전환 테스트
- [ ] 배터리 사용량 모니터링

### Azure Monitor 확인

- [ ] Azure Functions 요청 로그 확인
- [ ] Blob Storage 업데이트 빈도 확인
- [ ] 비용 추적 (Cost Management)

---

## 다음 단계 (Next Steps)

검수 기준 충족 후:

1. **PoC 구현**: `/moai:2-run SPEC-PERF-001`로 개념 증명 구현
2. **성능 비교**: 각 방식의 실제 성능 측정
3. **최종 결정**: 비용-이익 분석 후 최종 방식 선택
4. **실제 구현**: 선택된 방식으로 프로덕션 구현 SPEC 작성

---

## 참고 자료

### Gherkin 문법 참고
- [Cucumber Docs: Given-When-Then](https://cucumber.io/docs/gherkin/reference/)
- [EARS Format](https://github.com/awanio/trs-ears)

### 테스트 도구
- Chrome DevTools: Network, Performance, Lighthouse
- Azure Portal: Monitor, Cost Management
- Obsidian Mobile: 실제 기기 테스트
- EventSource Tester: SSE 연결 테스트 도구

---

## SSE 검수 기준 (추가)

### AC10: tts-proxy 서버 검증

#### AC10.1 서버 실행 및 헬스 체크

**Given** Mac mini에 tts-proxy가 설치되어 있을 때
**When** `python server.py`를 실행하면
**Then** 서버가 포트 5051에서 정상적으로 시작해야 한다
**And** `/health` 엔드포인트에 접근 시 `{"status":"healthy","sse_clients":N}` 형식 응답을 반환해야 한다

#### AC10.2 SSE 엔드포인트 형식 검증

**Given** tts-proxy 서버가 실행 중일 때
**When** `/api/events/playback`에 GET 요청을 보내면
**Then** HTTP 200 상태 코드를 반환해야 한다
**And** `Content-Type` 헤더가 `text/event-stream`이어야 한다
**And** `Cache-Control` 헤더가 `no-cache`이어야 한다
**And** `Connection` 헤더가 `keep-alive`이어야 한다

### AC11: SSE 브로드캐스트 검증

#### AC11.1 단일 클라이언트 브로드캐스트

**Given** EventSource 연결이 하나 활성화되어 있을 때
**When** `/api/playback-position`에 PUT 요청을 보내면
**Then** 연결된 EventSource가 `playback` 이벤트를 수신해야 한다
**And** 수신된 데이터의 `lastPlayedIndex`가 PUT 요청의 값과 일치해야 한다
**And** 수신까지의 지연이 < 100ms여야 한다

#### AC11.2 다중 클라이언트 브로드캐스트

**Given** 3개의 EventSource 연결이 활성화되어 있을 때
**When** `/api/playback-position`에 PUT 요청을 보내면
**Then** 모든 EventSource가 동일한 `playback` 이벤트를 수신해야 한다
**And** 각 클라이언트 수신 시간 차이가 < 50ms여야 한다

#### AC11.3 keep-alive 메시지

**Given** EventSource 연결이 활성화되어 있을 때
**And** 30초 동안 위치 변경이 없을 때
**When** 30초가 경과하면
**Then** `: keep-alive` 메시지가 전송되어야 한다
**And** 연결이 유지되어야 한다

### AC12: 클라이언트 SSE 연결 관리

#### AC12.1 초기화 및 연결

**Given** Obsidian에서 tts-reader 템플릿이 로드되었을 때
**When** `window.sseSyncManager.init(edgeServerUrl)`를 호출하면
**Then** EventSource가 `/api/events/playback`에 연결되어야 한다
**And** 연결 상태 인디케이터가 "🟢 실시간 동기화"를 표시해야 한다

#### AC12.2 이벤트 수신 및 UI 업데이트

**Given** 두 디바이스에서 SSE 연결이 활성화되어 있을 때
**When** 디바이스 A에서 다음 노트로 넘어가면
**Then** 디바이스 B에서 `playback` 이벤트를 수신해야 한다
**And** 디바이스 B의 UI가 < 100ms 내에 업데이트되어야 한다
**And** 현재 문장 하이라이트가 정확히 표시되어야 한다

#### AC12.3 백그라운드 연결 해제

**Given** SSE 연결이 활성화되어 있을 때
**When** 사용자가 다른 탭으로 전환하면 (document.hidden === true)
**Then** EventSource 연결이 정상적으로 해제되어야 한다
**And** 서버에서 클라이언트 목록에서 제거되어야 한다
**And** 배터리 소모가 감소해야 한다

#### AC12.4 포그라운드 복귀 시 재연결

**Given** SSE 연결이 백그라운드에서 해제되었을 때
**When** 사용자가 탭으로 다시 전환하면 (document.hidden === false)
**Then** EventSource가 재연결되어야 한다
**And** 최신 재생 위치가 즉시 동기화되어야 한다
**And** 연결 상태 인디케이터가 "🟢 실시간 동기화"로 변경되어야 한다

### AC13: 폴백 메커니즘

#### AC13.1 엣지서버 불가 시 폴백

**Given** tts-proxy 서버가 실행 중이지 않을 때
**When** 클라이언트가 초기화되면
**Then** Azure Functions 폴링 모드로 자동 전환해야 한다
**And** 연결 상태 인디케이터가 "🟡 폴링 동기화"를 표시해야 한다
**And** 기존 폴링 기능이 정상 작동해야 한다

#### AC13.2 네트워크 복구 시 SSE 복귀

**Given** Azure Functions 폴링 모드로 실행 중일 때
**When** tts-proxy 서버가 다시 실행되면
**Then** 다음 초기화 시점에 SSE 모드로 자동 복귀해야 한다
**And** 사용자 개입 없이 자동 전환되어야 한다

### AC14: 성능 검증

#### AC14.1 SSE 지연 시간

**Given** 두 디바이스가 SSE로 연결되어 있을 때
**When** 한 디바이스에서 위치 변경을 발생시키면
**Then** 다른 디바이스에서 < 100ms 내에 업데이트가 반영되어야 한다

#### AC14.2 배터리 소모

**Given** SSE 모드로 1시간 동안 TTS를 재생할 때
**When** 배터리 사용량을 측정하면
**Then** 배터리 소모가 < 2%여야 한다 (폴링 5% 대비 60% 개선)

#### AC14.3 동시 연결 수

**Given** tts-proxy 서버가 실행 중일 때
**When** 100개의 EventSource 연결을 동시에 생성하면
**Then** 모든 연결이 정상적으로 유지되어야 한다
**And** 서버 메모리 사용이 < 500MB여야 한다

### AC15: Redis Pub/Sub 확장 (선택)

#### AC15.1 다중 프로세스 브로드캐스트

**Given** 두 개의 tts-proxy 프로세스가 실행 중일 때
**And** 프로세스 1에 클라이언트 A가 연결되어 있을 때
**When** 프로세스 2의 PUT 엔드포인트를 호출하면
**Then** Redis Pub/Sub을 통해 클라이언트 A가 메시지를 수신해야 한다

#### AC15.2 Redis 장애 시 인메모리 폴백

**Given** Redis Pub/Sub이 활성화되어 있을 때
**When** Redis 서버가 다운되면
**Then** 로그에 "Redis 연결 실패, 인메모리 모드 사용" 메시지가 표시되어야 한다
**And** 단일 프로세스 내 브로드캐스트는 계속 작동해야 한다
**And** 새로운 SSE 연결이 정상적으로 수락되어야 한다
