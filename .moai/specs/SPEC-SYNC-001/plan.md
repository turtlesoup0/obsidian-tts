---
spec_id: SPEC-SYNC-001
title: 마지막 재생 항목 디바이스 간 동기화 기능 강화
status: Planned
priority: High
created: 2026-02-05
assigned: manager-spec
tags: sync, playback-state, cross-device, offline-first
lifecycle_level: spec-first
related_specs:
  - SPEC-PERF-001
  - SPEC-FIX-001
---

# SPEC-SYNC-001: 구현 계획

## 목차
1. [개발 단계](#개발-단계)
2. [기술적 접근 방식](#기술적-접근-방식)
3. [위험 관리](#위험-관리)
4. [마일스톤](#마일스톤)

---

## 개발 단계

### 1단계: 백엔드 API 구현 (최우선)

#### 목표
향상된 재생 상태 저장/조회 API 구현

#### 작업 항목

**1.1 playback-state.js 함수 생성**
- 파일: `src/functions/playback-state.js`
- GET /api/playback-state 엔드포인트 구현
- PUT /api/playback-state 엔드포인트 구현
- OPTIONS preflight 지원
- CORS 헤더 처리

**1.2 Blob Storage 컨테이너 구성**
- `playback-state` 컨테이너 생성
- `playback-state.json` Blob 생성
- 공급 엑세스 정책 구성 (개발용)
- 프라이빗 액세스 정책 구성 (프로덕션용)

**1.3 충돌 해결 로직 구현**
- 타임스탬프 비교 로직
- Last-Write-Wins 전략 적용
- Debouncing (5초 이내 중복 무시)
- 충돌 로그 기록 기능

**1.4 데이터 검증**
- 입력 파라미터 유효성 검사
- 데이터 타입 검증
- 범위 검증 (currentTime, duration, playbackRate, volume)

#### 성공 기준
- GET 요청으로 정상 상태 조회
- PUT 요청으로 상태 저장 성공
- 충돌 감지 및 응답 반환
- Azure Portal에서 함수 실행 확인

---

### 2단계: 클라이언트 상태 관리자 구현

#### 목표
재생 상태를 추적하고 동기화하는 클라이언트 모듈 구현

#### 작업 항목

**2.1 playbackStateManager 모듈 생성**
```javascript
// tts-reader-v5-keychain.md에 추가
window.playbackStateManager = {
    // 초기화, 상태 저장, 상태 불러오기, 충돌 처리
    // spec.md S3.1 참조
};
```

**2.2 Audio Element 이벤트 리스너 연결**
- `timeupdate` 이벤트로 currentTime 추적
- `play` 이벤트로 status를 playing으로 변경
- `pause` 이벤트로 status를 paused로 변경
- `ended` 이벤트로 status를 stopped로 변경
- `ratechange` 이벤트로 playbackRate 변경 감지
- `volumechange` 이벤트로 volume 변경 감지

**2.3 자동 동기화 타이머 구현**
- 5초 간격으로 상태 자동 저장
- Page Visibility API 기반 배터리 최적화
- 페이지 활성화 시 즉시 동기화
- 백그라운드에서 동기화 중단

**2.4 세션 관리**
- sessionId 생성 (UUID v4)
- deviceType 감지 (desktop, mobile, tablet)
- platform 감지 (macos, windows, linux, ios, android)
- appVersion 추적

#### 성공 기준
- 오디오 재생 중 상태가 실시간으로 추적됨
- 설정 변경 시 자동으로 서버에 저장됨
- 백그라운드에서 불필요한 네트워크 요청 없음
- 세션 정보가 정확하게 식별됨

---

### 3단계: 이어서 듣기 UI 구현

#### 목표
다른 디바이스에서 재생 중일 때 이어서 듣기 UI 제공

#### 작업 항목

**3.1 모달 컴포넌트 구현**
- `showResumePlaybackUI()` 함수
- 진행 바 표시 (현재 시간 / 총 시간)
- 디바이스 정보 표시
- 이어서 듣기 / 처음부터 버튼

**3.2 상태 비교 로직**
- 로컬 상태 vs 서버 상태 비교
- 시간 차이 계산 (임계값: 10초 이상)
- 충돌 감지 시 알림 표시

**3.3 스타일링**
- 다크 모드 지원 (Obsidian 테마 호환)
- 반응형 디자인 (모바일/데스크톱)
- 애니메이션 (모달 표시/숨김)

#### 성공 기준
- 다른 디바이스에서 재생 중일 때 모달이 표시됨
- 진행 바가 정확한 위치를 표시함
- 이어서 듣기 버튼 클릭 시 올바른 위치부터 재생됨
- 모바일과 데스크톱 모두에서 UI가 정상적으로 표시됨

---

### 4단계: 오프라인 지원 구현

#### 목표
오프라인 환경에서도 기본 기능 작동 및 온라인 복구 시 동기화

#### 작업 항목

**4.1 로컬 Storage 캐싱**
- `offlineStateManager` 모듈 구현
- localStorage에 현재 상태 캐싱
- `azureTTS_offlineState` 키 사용

**4.2 오프라인 큐 관리**
- 오프라인 상태에서의 변경사항 큐잉
- `azureTTS_offlineQueue` 키 사용
- FIFO (First-In-First-Out) 처리

**4.3 온라인/오프라인 이벤트 리스너**
- `window.addEventListener('online', ...)`
- `window.addEventListener('offline', ...)`
- 온라인 복구 시 자동 큐 처리

**4.4 네트워크 상태 감지**
- `navigator.onLine` API 활용
- 네트워크 상태 UI 표시 (선택적)
- 오프라인 알림 토스트

#### 성공 기준
- 오프라인 상태에서도 상태 변경이 로컬에 저장됨
- 온라인 복구 시 큐에 저장된 변경사항이 자동으로 서버에 전송됨
- 네트워크 에러가 우아하게 처리됨 (Graceful degradation)

---

### 5단계: 테스트 및 검증

#### 목표
모든 기능에 대한 테스트 수행 및 버그 수정

#### 작업 항목

**5.1 단위 테스트**
- playbackStateManager 메서드 테스트
- 충돌 해결 로직 테스트
- 오프라인 큐 관리 테스트

**5.2 통합 테스트**
- Azure Blob Storage와의 통합 테스트
- API 엔드포인트 테스트
- 다중 디바이스 동기화 테스트

**5.3 E2E 테스트**
- PC에서 재생 → 모바일에서 이어서 듣기
- 모바일에서 설정 변경 → PC에 반영
- 오프라인 상태에서 재생 → 온라인 복구 후 동기화

**5.4 성능 테스트**
- API 응답 시간 측정 (목표: < 500ms)
- 동기화 빈도에 따른 배터리 소모 측정
- 데이터 크기에 따른 전송 시간 측정

#### 성공 기준
- 모든 테스트 시나리오 통과
- 성능 목표 달성
- 회귀 버그 없음
- 기존 기능 호환성 유지

---

### 6단계: 문서화 및 배포

#### 목표
사용자 및 개발자를 위한 문서 업데이트 및 프로덕션 배포

#### 작업 항목

**6.1 사용자 문서 업데이트**
- `docs/guides/cross-device-playback-sync.md` 업데이트
- README.md에 새로운 기능 추가
- 사용자 온보딩 가이드 업데이트

**6.2 개발자 문서 업데이트**
- API 문서 업데이트 (playback-state 엔드포인트)
- 데이터 구조 문서화
- 충돌 해결 전략 문서화

**6.3 CHANGELOG.md 업데이트**
- 새로운 기능 추가
- 버그 수정 내역
- 이전 버전과의 호환성 주의사항

**6.4 Azure 배포**
- Azure Functions에 배포
- 프로덕션 환경 설정 업데이트
- 모니터링 설정

#### 성공 기준
- 모든 문서가 최신 상태로 유지됨
- 프로덕션 환경에서 기능이 정상 작동함
- 사용자 피드백 수집 및 대응 계획 수립

---

## 기술적 접근 방식

### 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                      클라이언트 A (PC)                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  playbackStateManager                                      │ │
│  │    - init() 초기화                                         │ │
│  │    - saveState() 상태 저장                                 │ │
│  │    - loadState() 상태 불러오기                             │ │
│  │    - handleConflict() 충돌 처리                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           ↓ PUT                                 │
│  Audio Element Events → timeupdate, play, pause, ended         │
│                           ↓                                    │
│  자동 동기화 (5초 간격, Page Visibility 기반)                  │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ↓ HTTP PUT/GET
┌─────────────────────────────────────────────────────────────────┐
│              Azure Functions (playback-state)                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  1. CORS preflight 확인                                   │ │
│  │  2. request.json() 파싱                                   │ │
│  │  3. 현재 서버 상태 조회                                   │ │
│  │  4. 타임스탬프 비교 (충돌 감지)                            │ │
│  │  5. Debouncing (5초 이내 중복 무소)                       │ │
│  │  6. Blob Storage에 상태 저장                              │ │
│  │  7. 충돌 로그 기록                                        │ │
│  │  8. 응답 반환 (conflict 플래그 포함)                       │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ↓ Upload/Download
┌─────────────────────────────────────────────────────────────────┐
│              Azure Blob Storage                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  playback-state 컨테이너                                   │ │
│  │    └── playback-state.json Blob                           │ │
│  │        {                                                   │ │
│  │          lastPlayedIndex: 42,                              │ │
│  │          notePath: "...",                                  │ │
│  │          noteTitle: "...",                                 │ │
│  │          timestamp: 1737672000000,                         │ │
│  │          deviceId: "MacIntel-abc123",                      │ │
│  │          playbackState: {                                  │ │
│  │            currentTime: 125.5,                             │ │
│  │            duration: 300.0,                                │ │
│  │            status: "paused",                               │ │
│  │            lastUpdated: 1737672001000                      │ │
│  │          },                                                │ │
│  │          playbackSettings: {                               │ │
│  │            playbackRate: 1.5,                              │ │
│  │            volume: 80,                                     │ │
│  │            voiceId: "ko-KR-SunHiNeural"                    │ │
│  │          },                                                │ │
│  │          noteContext: { ... },                             │ │
│  │          sessionInfo: { ... }                              │ │
│  │        }                                                   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          ↑
                          │ HTTP PUT/GET
┌─────────────────────────────────────────────────────────────────┐
│                      클라이언트 B (Mobile)                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  이어서 듣기 UI                                            │ │
│  │    - 서버 상태 확인                                        │ │
│  │    - 충돌 감지 시 알림                                    │ │
│  │    - 이어서 듣기 / 처음부터 선택                           │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

### 데이터 흐름

#### 정상 흐름 (충돌 없음)

```
클라이언트 A (PC)                서버                          클라이언트 B (Mobile)
     |                           |                                  |
     | [오디오 재생 시작]            |                                  |
     | timeupdate 이벤트           |                                  |
     | currentTime: 10.5초          |                                  |
     |                           |                                  |
     |---PUT /api/playback-state--->|                                  |
     | { currentTime: 10.5,         |                                  |
     |   status: "playing" }        |                                  |
     |                           | [상태 저장]                       |
     |                           | timestamp: T0                    |
     |<-----------------200 OK ----|                                  |
     | { success: true }           |                                  |
     |                           |                                  |
     | [10초 후 재생 중단]          |                                  |
     | pause 이벤트                |                                  |
     | currentTime: 125.5초         |                                  |
     |                           |                                  |
     |---PUT /api/playback-state--->|                                  |
     | { currentTime: 125.5,        |                                  |
     |   status: "paused" }         |                                  |
     |                           | [상태 업데이트]                   |
     |                           | timestamp: T1 (T0 + 10s)          |
     |<-----------------200 OK ----|                                  |
     |                           |                                  |
     |                           |                                  |
     |                           |----------GET /api/playback-state-->|
     |                           |                                  | [앱 실행]
     |                           |                                  | [서버 상태 요청]
     |                           |<---------200 OK (state)-----------|
     |                           | { currentTime: 125.5,             |
     |                           |   status: "paused",               |
     |                           |   deviceId: "MacIntel-abc123" }    |
     |                           |                                  |
     |                           |                                  | [이어서 듣기 UI 표시]
     |                           |                                  | "PC에서 125.5초까지 재생"
```

#### 충돌 흐름 (다중 디바이스 동시 사용)

```
클라이언트 A (PC)                서버                          클라이언트 B (Mobile)
     |                           |                                  |
     | [재생 중: currentTime=100s] |                                  | [재생 중: currentTime=50s]
     |                           |                                  |
     |---PUT (timestamp=T1)------->|                                  |
     | { currentTime: 100,         |                                  |
     |   timestamp: T1 }           |                                  |
     |                           | [상태 저장: T1]                  |
     |                           |                                  |---PUT (timestamp=T2)--->
     |                           |                                  | { currentTime: 50,
     |                           |                                  |   timestamp: T2 }
     |                           | [T2 > T1 확인]                   |
     |                           | [클라이언트 B 상태 저장]          |
     |                           |                                  |<---------200 OK---------
     |                           |                                  | { success: true }
     |<---------200 OK-----------|                                  |
     | { success: true }           |                                  |
     |                           |                                  |
     | [3초 후 추가 재생]          |                                  |
     | currentTime: 103s           |                                  |
     |                           |                                  |
     |---PUT (timestamp=T3)------->|                                  |
     | { currentTime: 103,         |                                  |
     |   timestamp: T3 }           |                                  |
     |                           | [T3 < T2 확인: 충돌!]           |
     |                           | [서버 상태(T2) 유지]             |
     |<---------200 OK-----------|                                  |
     | { conflict: true,           |                                  |
     |   serverState: {            |                                  |
     |     currentTime: 200,       |                                  |
     |     deviceId: "iPad-xyz"    |                                  |
     |   }                        |                                  |
     | }                          |                                  |
     |                           |                                  |
     | [충돌 알림 표시]            |                                  |
     | "다른 디바이스에서 더 최신 상태"                              |
```

---

### 코드 구조

#### 백엔드 파일 구조

```
src/functions/
├── playback-position.js    (기존, 유지 - 역호환성)
├── playback-state.js       (신규 - 향상된 기능)
├── scroll-position.js      (기존, 변경 없음)
└── ...

shared/
├── blobHelper.js           (수정: getPlaybackStateContainer 추가)
├── corsHelper.js           (기존, 변경 없음)
└── ...
```

#### 클라이언트 파일 구조

```
templates/v5-keychain/
├── tts-reader-v5-keychain.md
│   ├── playbackPositionManager (기존, 유지)
│   ├── playbackStateManager (신규)
│   └── offlineStateManager (신규)
```

---

## 위험 관리

### 잠재적 위험

#### 위험 1: 데이터 크기 증가로 인한 성능 저하
- **위험도**: 중간 (Medium)
- **영향**: API 응답 시간 증가, 네트워크 사용량 증가
- **완화 방안**:
  - 필요한 필드만 전송 (선택적 필드)
  - Gzip 압축 사용 (Azure Functions 기본 지원)
  - delta 업데이트 고려 (변경된 필드만 전송)

#### 위험 2: 다중 디바이스 충돌 빈도 증가
- **위험도**: 높음 (High)
- **영향**: 사용자 경험 저하, 데이터 불일치
- **완화 방안**:
  - 명확한 충돌 해결 전략 (Last-Write-Wins)
  - 사용자에게 충돌 알림 및 선택권 제공
  - Debouncing으로 불필요한 업데이트 감소
  - 충돌 로그로 문제 분석 및 개선

#### 위험 3: 역호환성 깨짐
- **위험도**: 높음 (High)
- **영향**: 기존 사용자 기능 작동 불가
- **완화 방안**:
  - 기존 `/api/playback-position` 엔드포인트 유지
  - 새 필드를 선택적 (optional)으로 만듦
  - 클라이언트 버전 감지 및 조건부 응답
  - 점진적 마이그레이션 지원

#### 위험 4: 오프라인 큐 처리 실패
- **위험도**: 중간 (Medium)
- **영향**: 데이터 손실, 동기화 누락
- **완화 방안**:
  - 영구적 Storage (IndexedDB) 사용으로 데이터 유지
  - 실패 시 재시도 메커니즘
  - 사용자에게 수동 동기화 옵션 제공

#### 위험 5: 배터리 소모 증가
- **위험도**: 중간 (Medium)
- **영향**: 모바일 기기 배터리 빠른 소모
- **완화 방안**:
  - Page Visibility API로 백그라운드 동기화 중단
  - 동기화 간격 조정 (5초 → 10초로 설정 가능)
  - Wi-Fi 연결 시에만 자동 동기화

### 롤백 계획

**롤백 트리거**:
1. API 응답 시간이 3초 이상 증가
2. 다중 디바이스 충돌율이 20% 이상
3. 기존 기능 회귀 버그 발견
4. 사용자 불만이 임계값 초과

**롤백 절차**:
1. Git revert로 신규 파일 제거
2. 기존 `/api/playback-position` 엔드포인트만 사용
3. 핫픽스 후보로 등록
4. 근본 원인 분석 후 재시도

---

## 마일스톤

### 1단계: 기본 구현 (1주)

- [ ] playback-state.js API 구현
- [ ] 클라이언트 playbackStateManager 구현
- [ ] 기본 동기화 기능 작동
- [ ] PC 간 동기화 테스트 통과

### 2단계: UI/UX 구현 (1주)

- [ ] 이어서 듣기 UI 구현
- [ ] 충돌 알림 UI 구현
- [ ] 디바이스 정보 표시
- [ ] PC ↔ Mobile 동기화 테스트 통과

### 3단계: 고급 기능 (1주)

- [ ] 오프라인 지원 구현
- [ ] 충돌 해결 로직 강화
- [ ] 충돌 로그 기록
- [ ] 오프라인 큐 테스트 통과

### 4단계: 테스트 및 배포 (1주)

- [ ] 전체 테스트 수행
- [ ] 성능 최적화
- [ ] 문서 업데이트
- [ ] 프로덕션 배포
- [ ] 사용자 피드백 수집

---

## 다음 단계

### 즉시 실행 (우선순위: 최상)
1. Azure Portal에서 `playback-state` 컨테이너 생성
2. `playback-state.js` 함수 파일 생성
3. 로컬 테스트 환경 설정

### 단기 실행 (1주일)
1. 기본 API 엔드포인트 구현
2. 클라이언트 상태 관리자 구현
3. PC 간 기본 동기화 테스트

### 중기 실행 (2-3주일)
1. 이어서 듣기 UI 구현
2. 모바일/PC 교차 동기화
3. 오프라인 지원 구현

### 장기 실행 (1개월)
1. 전체 테스트 및 버그 수정
2. 성능 최적화
3. 프로덕션 배포
4. 사용자 문서 업데이트
