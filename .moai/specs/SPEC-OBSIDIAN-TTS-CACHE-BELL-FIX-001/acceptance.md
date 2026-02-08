# SPEC-OBSIDIAN-TTS-CACHE-BELL-FIX-001: Acceptance Criteria

---

## 1. Test Scenarios (Given-When-Then Format)

### Scenario 1: 개별 캐시 삭제 기능 확인

**Given:** 사용자가 TTS 전용 노트를 사용 중

**When:** 사용자가 특정 노트의 캐시 삭제 버튼(🗑️)을 클릭한다

**Then:**
- 삭제 확인 다이얼로그가 표시된다
- 다이얼로그에 "오프라인 캐시와 서버 캐시가 모두 삭제됩니다" 메시지가 표시된다
- "확인" 클릭 시 오프라인 캐시가 삭제된다
- "확인" 클릭 시 서버 캐시가 삭제된다
- 삭제 완료 메시지가 표시된다

**Acceptance Criteria:**
- [ ] 삭제 버튼이 각 노트 행의 "관리" 열에 표시됨
- [ ] 삭제 확인 다이얼로그가 올바른 메시지를 표시함
- [ ] 오프라인 캐시가 성공적으로 삭제됨
- [ ] 서버 캐시가 성공적으로 삭제됨
- [ ] 캐시 상태 아이콘이 업데이트됨

---

### Scenario 2: 오프라인 캐시에서 종소리 재생

**Given:**
- 사용자가 종소리 기능을 활성화한 상태 (`ttsBellConfig.enabled = true`)
- 특정 노트의 오디오가 오프라인 캐시에 저장된 상태

**When:** 사용자가 해당 노트를 재생한다

**Then:**
- 종소리가 먼저 재생된다
- 종소리 재생 완료 후 TTS가 재생된다
- 콘솔에 "🔔 종소리 + TTS 연속 재생 시작" 메시지가 표시된다
- 콘솔에 "🔔 종소리 재생 완료, TTS 재생 시작" 메시지가 표시된다

**Acceptance Criteria:**
- [ ] 종소리가 TTS 전에 재생됨
- [ ] 종소리와 TTS 사이에 끊김이 없음
- [ ] 재생 속도가 사용자 설정에 따름
- [ ] 에러 발생 시 TTS만 재생됨 (폴백)

---

### Scenario 3: 종소리 비활성화 시 TTS만 재생

**Given:**
- 사용자가 종소리 기능을 비활성화한 상태 (`ttsBellConfig.enabled = false`)
- 특정 노트의 오디오가 오프라인 캐시에 저장된 상태

**When:** 사용자가 해당 노트를 재생한다

**Then:**
- 종소리가 재생되지 않는다
- TTS만 즉시 재생된다

**Acceptance Criteria:**
- [ ] 종소리가 재생되지 않음
- [ ] TTS가 즉시 재생 시작됨
- [ ] 재생 속도가 사용자 설정에 따름

---

### Scenario 4: 캐시 재생성 후 종소리 재생

**Given:**
- 사용자가 종소리 기능을 활성화한 상태
- 특정 노트의 캐시를 재생성한 상태

**When:** 사용자가 재생성된 캐시를 재생한다

**Then:**
- 종소리가 먼저 재생된다
- 종소리 재생 완료 후 재생성된 TTS가 재생된다

**Acceptance Criteria:**
- [ ] 재생성된 캐시가 순수 TTS임 (종소리 미포함)
- [ ] 재생 시 종소리가 추가됨
- [ ] 종소리와 TTS가 순차적으로 재생됨

---

### Scenario 5: 통합 노트에서 캐시 관리 UI 비표시

**Given:** 사용자가 통합 노트(integrated-ui)를 사용 중

**When:** 사용자가 통합 노트를 연다

**Then:**
- 캐시 삭제 버튼이 표시되지 않는다
- 캐시 재생성 버튼이 표시되지 않는다
- 캐시 상태 아이콘이 표시되지 않는다

**Acceptance Criteria:**
- [ ] 통합 노트에 캐시 관리 UI가 없음
- [ ] 통합 노트가 정상적으로 동작함
- [ ] 위치 동기화 기능이 정상 작동함

---

## 2. Quality Gate Criteria

### 2.1 Functional Testing

| Test Case | Expected Result | Actual Result | Status |
|-----------|----------------|---------------|--------|
| 캐시 삭제 버튼 클릭 | 확인 다이얼로그 표시 | | PASS/FAIL |
| 캐시 삭제 실행 | 오프라인/서버 캐시 삭제됨 | | PASS/FAIL |
| 오프라인 캐시 재생 (종소리 ON) | 종소리 → TTS 순차 재생 | | PASS/FAIL |
| 오프라인 캐시 재생 (종소리 OFF) | TTS만 재생 | | PASS/FAIL |
| 캐시 재생성 후 재생 | 종소리 → TTS 순차 재생 | | PASS/FAIL |
| 통합 노트 열기 | 캐시 UI 미표시 | | PASS/FAIL |

### 2.2 UI/UX Testing

| Aspect | Criteria | Status |
|--------|----------|--------|
| 버튼 가시성 | 캐시 삭제 버튼이 명확히 보임 | PASS/FAIL |
| 사용자 피드백 | 삭제 완료 메시지가 명확함 | PASS/FAIL |
| 상태 표시 | 캐시 상태 아이콘이 정확함 | PASS/FAIL |
| 에러 처리 | 에러 메시지가 명확함 | PASS/FAIL |

### 2.3 Performance Testing

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| 캐시 삭제 응답 시간 | < 2초 | | PASS/FAIL |
| 종소리 생성 시간 | < 500ms | | PASS/FAIL |
| 재생 시작 지연 | < 1초 | | PASS/FAIL |

---

## 3. Definition of Done

A requirement is considered **DONE** when:

1. **Functional Requirements:**
   - [ ] All acceptance criteria are met
   - [ ] All test scenarios pass
   - [ ] No regressions in existing functionality

2. **Quality Requirements:**
   - [ ] Code follows project coding standards
   - [ ] No console errors or warnings
   - [ ] Error handling is proper

3. **Documentation Requirements:**
   - [ ] User guide is updated
   - [ ] Troubleshooting guide is provided
   - [ ] API documentation is updated (if applicable)

4. **User Acceptance:**
   - [ ] User confirms issues are resolved
   - [ ] User can perform cache management
   - [ ] User can hear bell sound with offline cache

---

## 4. Verification Methods

### 4.1 Automated Testing

```javascript
// Automated test script for cache delete
async function verifyCacheDelete() {
    // Setup
    const testPage = { file: { path: 'test.md', name: 'Test Note' } };
    const content = window.serverCacheManager.getNoteContent(testPage);
    const cacheKey = await window.serverCacheManager.generateCacheKey(testPage.file.path, content);
    const testBlob = new Blob(['audio data'], { type: 'audio/mpeg' });

    // Save to cache
    await window.offlineCacheManager.saveAudio(cacheKey, testBlob, testPage.file.path);

    // Verify cache exists
    const beforeDelete = await window.offlineCacheManager.getAudio(cacheKey);
    console.assert(beforeDelete !== null, 'Cache should exist before delete');

    // Delete cache
    const result = await window.serverCacheManager.deleteCacheFromBoth(cacheKey);

    // Verify cache deleted
    const afterDelete = await window.offlineCacheManager.getAudio(cacheKey);
    console.assert(afterDelete === null, 'Cache should not exist after delete');
    console.assert(result.offline === true, 'Offline cache should be deleted');

    console.log('✅ Cache delete verification passed');
}

// Automated test script for bell playback
async function verifyBellPlayback() {
    // Setup
    window.setBellEnabled(true);
    const testBlob = new Blob(['audio data'], { type: 'audio/mpeg' });
    const audioElement = new Audio();

    // Verify bell function exists
    console.assert(typeof window.playTTSWithBellSequential === 'function', 'Bell function should exist');

    // Verify bell config
    console.assert(window.ttsBellConfig.enabled === true, 'Bell should be enabled');

    // Test bell synthesis
    const bellBuffer = await window.synthesizeBellSound();
    console.assert(bellBuffer !== null, 'Bell buffer should be generated');

    console.log('✅ Bell playback verification passed');
}
```

### 4.2 Manual Testing

**Test Checklist for Cache Delete:**
- [ ] Open TTS dedicated note
- [ ] Locate cache delete button (🗑️) in "Management" column
- [ ] Click delete button
- [ ] Verify confirmation dialog appears
- [ ] Click "OK" to confirm
- [ ] Verify success message appears
- [ ] Verify cache status icon updates to ❌

**Test Checklist for Bell Playback:**
- [ ] Enable bell sound: `window.setBellEnabled(true)`
- [ ] Play offline cached note
- [ ] Listen for bell sound before TTS
- [ ] Verify console logs show bell playback
- [ ] Verify no errors in console

### 4.3 User Acceptance Testing

**User Feedback Form:**
```
1. 캐시 삭제 기능을 찾을 수 있었나요? [예/아니요]
2. 캐시 삭제가 정상적으로 작동하나요? [예/아니요]
3. 오프라인 캐시 재생 시 종소리가 들리나요? [예/아니요]
4. 종소리가 TTS 전에 재생되나요? [예/아니요]
5. 통합 노트에 캐시 관리 UI가 없나요? [예/아니요]
6. 기타 문제점이나 개선사항을 적어주세요.
```

---

## 5. Success Metrics

### 5.1 Quantitative Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Cache delete success rate | 100% | Number of successful deletes / Total delete attempts |
| Bell playback success rate | 100% | Number of successful bell plays / Total playback attempts |
| User satisfaction | ≥ 90% | Positive feedback / Total feedback |
| Bug report count | 0 | Number of related bug reports |

### 5.2 Qualitative Metrics

| Aspect | Success Indicator |
|--------|-------------------|
| Usability | User can find cache delete button without assistance |
| Reliability | Bell sound plays consistently with offline cache |
| Clarity | User understands difference between TTS note and integrated note |
| Performance | Cache delete and bell playback complete without noticeable delay |

---

## 6. Regression Testing

### 6.1 Existing Functionality Tests

| Feature | Test Case | Expected Result |
|---------|-----------|-----------------|
| Server cache playback | Server cached note playback | TTS plays with bell sound |
| TTS generation | New note TTS generation | New TTS generated with bell sound |
| Cache regeneration | Cache regenerate button click | Old cache deleted, new TTS generated |
| Auto-playback | Next note auto-playback | Bell + TTS plays for each note |

### 6.2 Edge Cases

| Edge Case | Expected Behavior |
|-----------|------------------|
| AudioContext not supported | TTS plays without bell sound |
| Bell synthesis fails | TTS plays without bell sound |
| Cache delete during playback | Playback continues, cache deleted after |
| Multiple rapid cache deletes | All deletes complete successfully |

---

## 7. Sign-off Criteria

**Product Owner Sign-off:**
- [ ] All acceptance criteria met
- [ ] User testing completed
- [ ] Documentation updated

**Developer Sign-off:**
- [ ] Code reviewed
- [ ] Tests passed
- [ ] No regressions

**QA Sign-off:**
- [ ] All test scenarios passed
- [ ] Edge cases covered
- [ ] Performance criteria met
