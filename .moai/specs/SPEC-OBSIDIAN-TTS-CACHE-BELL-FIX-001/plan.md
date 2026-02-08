# SPEC-OBSIDIAN-TTS-CACHE-BELL-FIX-001: Implementation Plan

---

## 1. Milestones

### Priority High (Primary Goal)

**M1: 근본 원인 분석 완료**
- 사용자 환경 파악 (TTS 전용 노트 vs 통합 노트)
- 종소리 설정 상태 확인
- 모듈 로드 순서 확인

**M2: 사용자 가이드라인 제공**
- 캐시 삭제 기능 사용 방법 문서화
- 종소리 문제 해결 가이드 제공
- 디버깅 단계 제공

### Priority Medium (Secondary Goal)

**M3: UI 개선 사항 반영**
- 캐시 관리 버튼 가시성 개선
- 사용자 피드백 UI 개선
- 상태 표시 개선

**M4: 문서화 업데이트**
- 사용자 매뉴얼 업데이트
- 트러블슈팅 가이드 추가

---

## 2. Technical Approach

### 2.1 근본 원인 분석 방법

#### Step 1: 사용자 환경 파악

```javascript
// 브라우저 콘솔에서 실행

// 1. 현재 페이지 확인
console.log('Current page:', document.body.getElementsByClassName('markdown-preview-view'));

// 2. TTS UI 모듈 로드 확인
console.log('tts-ui loaded:', typeof window.updateCacheStatusForNote !== 'undefined');

// 3. 통합 UI 모듈 로드 확인
console.log('integrated-ui loaded:', typeof window.integratedUIModule !== 'undefined');

// 4. 캐시 삭제 버튼 존재 확인
const deleteButtons = document.querySelectorAll('button[title="캐시 삭제"]');
console.log('Delete cache buttons found:', deleteButtons.length);
```

#### Step 2: 종소리 설정 확인

```javascript
// 브라우저 콘솔에서 실행

// 1. 종소리 설정 확인
console.log('Bell enabled:', window.ttsBellConfig?.enabled);
console.log('Bell volume:', window.ttsBellConfig?.volume);

// 2. 종소리 함수 존재 확인
console.log('playTTSWithBellSequential exists:', typeof window.playTTSWithBellSequential);

// 3. AudioContext 확인
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
console.log('AudioContext available:', typeof AudioContextClass === 'function');
```

#### Step 3: 재생 로그 확인

```javascript
// TTS 재생 전 로그 레벨 설정
window.TTS_DEBUG = true;

// 오프라인 캐시 재생 테스트
// 1. 특정 노트 재생
// 2. 콘솔에서 "🔔 종소리 + TTS 연속 재생 시작" 메시지 확인
```

### 2.2 해결 방법

#### Solution 1: 캐시 삭제 기능 사용 안내

**사용자가 통합 노트를 사용 중인 경우:**

```
캐시 삭제 기능은 TTS 전용 노트에서만 제공됩니다.

1. TTS 전용 노트를 엽니다.
2. 각 노트 행의 "관리" 열에서 🗑️ 버튼을 클릭합니다.
3. 삭제 확인 다이얼로그에서 "확인"을 클릭합니다.

오프라인 캐시와 서버 캐시가 모두 삭제됩니다.
```

**사용자가 TTS 전용 노트를 사용 중인 경우:**

```
캐시 삭제 버튼은 각 노트 행의 "관리" 열에 있습니다.

🗑️ 버튼: 캐시 삭제
🔄 버튼: 캐시 재생성

버튼이 보이지 않는 경우:
1. 페이지를 새로고침합니다.
2. 캐시 상태가 로드될 때까지 기다립니다 (약 1초).
```

#### Solution 2: 종소리 문제 해결

**Case 1: `ttsBellConfig.enabled`가 `false`인 경우**

```javascript
// 브라우저 콘솔에서 실행
window.setBellEnabled(true);
location.reload();
```

**Case 2: `tts-bell/view.js`가 로드되지 않은 경우**

```javascript
// TTS 노트 템플릿 확인
// 1. 노트编辑 모드로 전환
// 2. 다음 코드가 있는지 확인:
// ```dataviewjs
// dv.view('/views/tts-bell/view', { config: window.ttsConfig });
// ```
```

**Case 3: AudioContext 생성 실패**

```javascript
// 브라우저 호환성 확인
const hasAudioContext = typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined';
console.log('AudioContext supported:', hasAudioContext);

// 지원되지 않는 경우:
// - Chrome/Edge: 최신 버전으로 업데이트
// - Safari: 설정 > 사파리 > 고급에서 "사운드 확인" 활성화
```

---

## 3. Implementation Strategy

### 3.1 Phase 1: 진단 및 가이드라인 제공

**Deliverables:**
1. 사용자 환경 진단 스크립트
2. 문제 해결 가이드라인
3. 디버깅 단계 문서

**Implementation:**
- 브라우저 콘솔에서 실행 가능한 진단 코드 제공
- 단계별 해결 방법 문서화
- 사용자 피드백 수집

### 3.2 Phase 2: UI 개선 (선택 사항)

**Deliverables:**
1. 캐시 관리 버튼 가시성 개선
2. 상태 표시 개선
3. 사용자 피드백 메시지 개선

**Implementation:**
- 버튼 스타일 개선 (더 큰 아이콘, 명확한 라벨)
- 로딩 상태 표시 추가
- 에러 메시지 개선

### 3.3 Phase 3: 문서화 업데이트

**Deliverables:**
1. 사용자 매뉴얼 업데이트
2. 트러블슈팅 가이드 추가
3. FAQ 업데이트

**Implementation:**
- Obsidian vault에 문서 추가
- 스크린샷 포함
- 단계별 가이드 제공

---

## 4. Risk Analysis

### 4.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| AudioContext 미지원 브라우저 | Low | High | 폴백 메커니즘 제공 |
| 모듈 로드 순서 문제 | Medium | Medium | 로드 순서 확인 및 가이드 |
| 사용자 설정 초기화 | Low | Medium | 설정 백업/복구 가이드 |

### 4.2 User Experience Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| 사용자가 캐시 삭제 버튼을 찾지 못함 | High | Low | 명확한 가이드라인 제공 |
| 종소리 설정 위치를 모름 | Medium | Low | 설정 가이드 제공 |
| 통합 노트와 TTS 노트 혼동 | Medium | Medium | UI 차이점 문서화 |

---

## 5. Testing Plan

### 5.1 Unit Testing

```javascript
// Test 1: 캐시 삭제 기능 테스트
async function testCacheDelete() {
    const page = { file: { path: 'test.md', name: 'Test' } };
    const content = 'Test content';
    const cacheKey = await window.serverCacheManager.generateCacheKey(page.file.path, content);

    // 오프라인 캐시 저장
    await window.offlineCacheManager.saveAudio(cacheKey, new Blob(['audio']), page.file.path);

    // 삭제 테스트
    const result = await window.serverCacheManager.deleteCacheFromBoth(cacheKey);

    console.assert(result.offline === true, 'Offline cache delete failed');
    console.log('✅ Test 1 passed: Cache delete');
}

// Test 2: 종소리 재생 테스트
async function testBellPlayback() {
    // 종소리 활성화
    window.setBellEnabled(true);

    // 종소리 생성 테스트
    const bellBuffer = await window.synthesizeBellSound();
    console.assert(bellBuffer !== null, 'Bell synthesis failed');

    // 재생 테스트
    const audioContext = new AudioContext();
    const source = audioContext.createBufferSource();
    source.buffer = bellBuffer;
    source.connect(audioContext.destination);
    source.start();

    console.log('✅ Test 2 passed: Bell playback');
}
```

### 5.2 Integration Testing

```javascript
// Test 3: 오프라인 캐시 재생 시 종소리 테스트
async function testOfflineCacheWithBell() {
    // 1. 종소리 활성화
    window.setBellEnabled(true);

    // 2. 오프라인 캐시 저장
    const testBlob = new Blob(['test audio'], { type: 'audio/mpeg' });
    const cacheKey = 'test-cache-key';
    await window.offlineCacheManager.saveAudio(cacheKey, testBlob, 'test.md');

    // 3. 오프라인 캐시 로드
    const cachedAudio = await window.offlineCacheManager.getAudio(cacheKey);

    // 4. 재생 테스트
    const audioElement = new Audio();
    await window.playTTSWithBellSequential(cachedAudio, audioElement);

    console.log('✅ Test 3 passed: Offline cache with bell');
}
```

### 5.3 User Acceptance Testing

**Scenario 1: 캐시 삭제**
1. TTS 전용 노트 열기
2. 특정 노트의 🗑️ 버튼 클릭
3. 확인 다이얼로그에서 "확인" 클릭
4. **Expected:** 오프라인/서버 캐시 삭제 완료 메시지

**Scenario 2: 종소리 재생**
1. 종소리 활성화 (`window.setBellEnabled(true)`)
2. 오프라인 캐시된 노트 재생
3. **Expected:** 종소리 → TTS 순차 재생

---

## 6. Success Criteria

- [ ] 사용자가 캐시 삭제 기능을 찾을 수 있음
- [ ] 오프라인 캐시 재생 시 종소리가 들림
- [ ] 통합 노트에는 캐시 관리 UI가 없음 (의도적)
- [ ] 사용자 가이드라인이 제공됨
- [ ] 디버깅 도구가 제공됨

---

## 7. Rollback Plan

**If Issues Occur:**
1. 이전 SPEC으로 롤백: SPEC-OBSIDIAN-TTS-BELL-CACHE-001
2. Git revert: `git revert <commit-hash>`
3. 사용자에게 알림: 롤백 사유 및 대안 제공

**Recovery Steps:**
1. 문제 원인 분석
2. 수정 사항 반영
3. 재배포
4. 사용자 테스트

---

## 8. Next Steps

1. **Immediate:** 사용자에게 진단 스크립트 제공
2. **Short-term:** 가이드라인 문서 작성
3. **Long-term:** UI 개선 및 문서화 업데이트
