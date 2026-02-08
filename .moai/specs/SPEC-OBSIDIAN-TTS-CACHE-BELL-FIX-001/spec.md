# SPEC-OBSIDIAN-TTS-CACHE-BELL-FIX-001

TTS 캐시 관리 및 종소리 재생 문제 분석 및 수정

---

## TAG BLOCK

```yaml
SPEC_ID: SPEC-OBSIDIAN-TTS-CACHE-BELL-FIX-001
Title: TTS 캐시 관리 및 종소리 재생 수정
Created: 2026-02-05
Status: Planned
Priority: High
Assigned: workflow-spec
Related: SPEC-OBSIDIAN-TTS-BELL-CACHE-001
Labels: tts, cache, bell, bug-fix
```

---

## 1. Environment

### 1.1 현재 시스템 상태

- **프로젝트:** Obsidian TTS 플러그인 (v5.1.0 - 모듈화 구조)
- **TTS 노트 템플릿:** `views/tts-ui/view.js` 기반 템플릿
- **통합 노트 템플릿:** `views/integrated-ui/view.js` 기반 템플릿
- **캐시 시스템:** 이중 캐시 (오프라인 IndexedDB + 서버 Azure Blob Storage)

### 1.2 모듈 의존성

```
tts-engine/view.js
  ├── audio-manager.js (오디오 재생 관리)
  └── cache-manager.js (캐시 관리)

tts-cache/view.js
  ├── offlineCacheManager (IndexedDB)
  └── serverCacheManager (Azure Blob Storage)

tts-ui/view.js (TTS 전용 UI)
  ├── 캐시 통계 표시
  ├── 개별 캐시 삭제 버튼
  └── 캐시 재생성 버튼

tts-bell/view.js (종소리 효과)
  ├── synthesizeBellSound()
  └── playTTSWithBellSequential()

integrated-ui/view.js (통합 노트 UI)
  └── 캐시 관리 UI 없음
```

---

## 2. Assumptions

### 2.1 사용자 환경 가정

- 사용자는 TTS 전용 노트와 통합 노트를 모두 사용 중
- TTS 전용 노트에는 캐시 관리 UI가 표시됨
- 통합 노트에는 캐시 관리 UI가 필요 없음 (사용자 피드백)

### 2.2 기술적 가정

- `tts-ui/view.js`는 TTS 전용 노트에서만 로드됨
- `integrated-ui/view.js`는 통합 노트에서만 로드됨
- 두 템플릿은 동시에 로드되지 않음
- 종소리 기능은 `tts-bell/view.js`에서 제공됨

---

## 3. Requirements

### R1: 개별 캐시 삭제 기능 확인

**WHEN** 사용자가 TTS 전용 노트에서 캐시 삭제 버튼을 클릭하면
**THE SYSTEM SHALL** 해당 노트의 오프라인 및 서버 캐시를 모두 삭제한다

**Criteria:**
- 삭제 전 확인 다이얼로그 표시
- 오프라인 캐시(`offlineCacheManager.deleteAudio()`) 삭제
- 서버 캐시(`serverCacheManager.deleteCacheFromBoth()`) 삭제
- 삭제 결과 피드백 제공

### R2: 오프라인 캐시에서 종소리 재생 지원

**WHEN** 오프라인 캐시된 오디오를 재생할 때
**THE SYSTEM SHALL** 종소리가 활성화된 경우 종소리를 먼저 재생한 후 TTS를 재생한다

**Criteria:**
- `playTTSWithBellSequential()` 함수 호출
- 종소리 비활성화 시: TTS만 재생
- 종소리 활성화 시: 종소리 → TTS 순차 재생

### R3: 통합 노트에서 캐시 관리 UI 비표시

**WHERE** 사용자가 통합 노트를 사용하는 경우
**THE SYSTEM SHALL** 캐시 관리 UI를 표시하지 않는다

**Rationale:**
- 사용자 피드백: "통합노트에는 캐시 불필요"
- 통합 노트는 위치 관리에 집중
- 캐시 관리는 TTS 전용 노트에서만 수행

### R4: 캐시 재생성 후 종소리 재생 보장

**WHEN** 사용자가 캐시 재생성 버튼을 클릭하여 새로운 TTS를 생성할 때
**THE SYSTEM SHALL** 재생 시 종소리가 올바르게 재생되어야 한다

**Criteria:**
- 재생성된 캐시는 종소리가 포함되지 않은 순수 TTS
- 재생 시 `playTTSWithBellSequential()` 호출로 종소리 추가

---

## 4. Specifications

### 4.1 개별 캐시 삭제 구현 분석

**Current Implementation (views/tts-ui/view.js:818-858):**

```javascript
// R3.1: 캐시 삭제 버튼
const deleteCacheBtn = cacheActionsCell.createEl('button', {
    text: '🗑️',
    attr: {
        style: 'padding: 5px 8px; cursor: pointer; border: none; background: #f44336; color: white; border-radius: 3px; font-size: 12px; margin-right: 3px;',
        title: '캐시 삭제'
    }
});
deleteCacheBtn.onclick = async function() {
    const page = pages[idx];
    const notePath = page.file.path;
    const content = window.serverCacheManager.getNoteContent(page);
    const cacheKey = await window.serverCacheManager.generateCacheKey(notePath, content);

    // R3.3: 삭제 전 확인 다이얼로그
    const confirmed = confirm(`"${page.file.name}"의 캐시를 삭제하시겠습니까?\n\n오프라인 캐시와 서버 캐시가 모두 삭제됩니다.`);
    if (!confirmed) return;

    try {
        // R3.2: 오프라인/서버 캐시 모두 삭제
        const result = await window.serverCacheManager.deleteCacheFromBoth(cacheKey);

        // R3.4: 삭제 결과 피드백
        let message = `"${page.file.name}" 캐시 삭제 완료:\n`;
        if (result.offline) message += '✅ 오프라인 캐시 삭제됨\n';
        if (result.server) message += '✅ 서버 캐시 삭제됨\n';
        if (result.errors.length > 0) {
            message += '\n⚠️ 오류:\n' + result.errors.join('\n');
        }

        alert(message);
        // ...
    } catch (error) {
        alert(`캐시 삭제 실패: ${error.message}`);
    }
};
```

**Analysis:**
- 개별 캐시 삭제 기능이 **이미 구현됨**
- 오프라인/서버 캐시 모두 삭제 지원
- 사용자 확인 다이얼로그 포함

**Issue:**
- 사용자가 "특정 노트에 대한 캐시삭제는 존재하지 않음"라고 보고한 이유는:
  1. 사용자가 **TTS 전용 노트가 아닌 통합 노트**를 사용 중일 가능성
  2. 또는 TTS 전용 노트를 사용 중이지만 캐시 삭제 버튼을 찾지 못함

---

### 4.2 종소리 재생 메커니즘 분석

**Current Implementation (views/tts-engine/view.js:1267-1291):**

```javascript
// 종소리 + TTS 연속 재생 (모든 캐시된 오디오에 종소리 추가)
if (window.playTTSWithBellSequential) {
    try {
        await window.playTTSWithBellSequential(audioBlob, reader.audioElement);
    } catch (bellError) {
        console.warn('⚠️ 종소리 재생 실패, TTS만 재생:', bellError.message);
        // 실패 시 일반 재생
        reader.audioElement.src = URL.createObjectURL(audioBlob);

        try {
            await reader.audioElement.play();
        } catch (playError) {
            handlePlayError(playError, reader, lastPlayedDiv, index);
            throw playError;
        }
    }
} else {
    // 종소리 비활성화 시 일반 재생
    try {
        await reader.audioElement.play();
    } catch (playError) {
        handlePlayError(playError, reader, lastPlayedDiv, index);
        throw playError;
    }
}
```

**Bell Implementation (views/tts-bell/view.js:222-268):**

```javascript
window.playTTSWithBellSequential = async function(audioBlob, audioElement) {
    if (!window.ttsBellConfig.enabled) {
        // 종소리 비활성화 시 바로 TTS 재생
        audioElement.src = URL.createObjectURL(audioBlob);
        await audioElement.play();
        return;
    }

    try {
        window.ttsLog('🔔 종소리 + TTS 연속 재생 시작');

        // 1. 종소리 재생
        const bellBuffer = await window.synthesizeBellSound();
        if (!bellBuffer) {
            throw new Error('종소리 생성 실패');
        }

        const bellContext = new (window.AudioContext || window.webkitAudioContext)();
        const bellSource = bellContext.createBufferSource();
        bellSource.buffer = bellBuffer;
        bellSource.connect(bellContext.destination);

        // 종소리 재생
        await new Promise((resolve, reject) => {
            bellSource.onended = resolve;
            bellSource.onerror = reject;
            bellSource.start();
        });

        // 2. 종소리 종료 후 TTS 재생
        window.ttsLog('🔔 종소리 재생 완료, TTS 재생 시작');
        audioElement.src = URL.createObjectURL(audioBlob);
        audioElement.playbackRate = window.azureTTSReader?.playbackRate || 1.0;
        await audioElement.play();

        window.ttsLog('✅ 종소리 + TTS 연속 재생 완료');

    } catch (error) {
        console.error('❌ 종소리 연속 재생 실패:', error);
        // 실패 시 TTS만 재생
        audioElement.src = URL.createObjectURL(audioBlob);
        audioElement.playbackRate = window.azureTTSReader?.playbackRate || 1.0;
        await audioElement.play();
    }
};
```

**Analysis:**
- 종소리 재생은 **재생 시점에 동적으로 추가**되는 방식
- 캐시된 오디오는 **종소리가 포함되지 않은 순수 TTS**
- 재생 시 `playTTSWithBellSequential()` 함수가 종소리를 먼저 재생

**Root Cause of "오프라인 캐시가 재생되면서는 다시 종소리가 들리지 않음":**

가능한 원인:
1. **`ttsBellConfig.enabled`가 `false`로 설정된 상태**
2. **`tts-bell/view.js` 모듈이 로드되지 않음**
3. **`playTTSWithBellSequential` 함수가 정의되지 않음**
4. **AudioContext 생성 실패**

---

### 4.3 캐시 관리 UI 배치 전략

**Current State:**

| UI Component | Location | Cache Management |
|--------------|----------|------------------|
| TTS 전용 노트 (`tts-ui/view.js`) | TTS 노트 템플릿 | ✅ 지원 (삭제/재생성 버튼) |
| 통합 노트 (`integrated-ui/view.js`) | 통합 노트 템플릿 | ❌ 미지원 (의도적) |

**Design Decision:**
- 통합 노트에는 **캐시 관리 UI를 추가하지 않음**
- 사용자 피드백: "통합노트에는 캐시 불필요"
- 통합 노트는 위치 동기화에 집중
- 캐시 관리는 TTS 전용 노트에서만 수행

---

### 4.4 해결 방법 정의

#### Solution 1: 개별 캐시 삭제 문제 해결

**Action Required:**
- 사용자에게 **TTS 전용 노트**를 사용 중인지 확인
- TTS 전용 노트가 아닌 경우, TTS 전용 노트로 전환 안내
- 또는 TTS 전용 노트에서 캐시 삭제 버튼 위치 안내

**User Communication:**
```
캐시 삭제 기능은 TTS 전용 노트에서만 제공됩니다.
현재 사용 중인 노트 템플릿을 확인해주세요.
```

#### Solution 2: 오프라인 캐시 종소리 재생 문제 해결

**Root Cause Analysis Required:**
1. `ttsBellConfig.enabled` 값 확인
2. `tts-bell/view.js` 로드 확인
3. `playTTSWithBellSequential` 함수 존재 확인
4. AudioContext 생성 가능성 확인

**Debug Steps:**
```javascript
// 1. 종소리 설정 확인
console.log('ttsBellConfig.enabled:', window.ttsBellConfig?.enabled);

// 2. 함수 존재 확인
console.log('playTTSWithBellSequential exists:', typeof window.playTTSWithBellSequential);

// 3. AudioContext 확인
const testContext = new (window.AudioContext || window.webkitAudioContext)();
console.log('AudioContext available:', !!testContext);
```

**Possible Fixes:**
- **Fix 1:** `ttsBellConfig.enabled`가 `false`인 경우 `true`로 변경
- **Fix 2:** `tts-bell/view.js` 모듈 로드 순서 확인
- **Fix 3:** `playTTSWithBellSequential` 함수 호출 조건 수정

#### Solution 3: 사용자 가이드라인 제공

**For Cache Management:**
1. TTS 전용 노트 열기
2. 노트 목록에서 "관리" 열 확인
3. 🗑️ 버튼으로 캐시 삭제
4. 🔄 버튼으로 캐시 재생성

**For Bell Sound:**
1. 브라우저 콘솔에서 `window.ttsBellConfig.enabled` 확인
2. `false`인 경우 `window.setBellEnabled(true)` 실행
3. 페이지 새로고침 후 재생 테스트

---

## 5. Traceability

| Requirement | Component | Verification Method |
|-------------|-----------|---------------------|
| R1 | `tts-ui/view.js:818-858` | TTS 전용 노트에서 캐시 삭제 버튼 클릭 테스트 |
| R2 | `tts-engine/view.js:1267-1291` | 오프라인 캐시 재생 시 종소리 확인 |
| R3 | `integrated-ui/view.js` | 통합 노트에서 캐시 UI 미표시 확인 |
| R4 | `tts-bell/view.js:222-268` | 캐시 재생성 후 재생 테스트 |

---

## 6. References

### Related Files
- `views/tts-engine/view.js` - TTS 재생 엔진 (라인 1267-1291: 종소리 연속 재생)
- `views/tts-cache/view.js` - 캐시 관리자 (라인 393-429: deleteCacheFromBoth)
- `views/tts-ui/view.js` - TTS 전용 UI (라인 818-914: 캐시 관리 버튼)
- `views/tts-bell/view.js` - 종소리 효과 (라인 222-268: playTTSWithBellSequential)
- `views/integrated-ui/view.js` - 통합 노트 UI (캐시 관리 UI 없음)

### Related SPECs
- SPEC-OBSIDIAN-TTS-BELL-CACHE-001: 종소리 캐시 전략 변경 (이전 수정)
