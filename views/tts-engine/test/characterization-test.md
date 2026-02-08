# TTS Engine Characterization Test
# SPEC-OBSIDIAN-TTS-AUDIO-INTERRUPT-001

## Purpose
Document existing behavior to preserve functionality during refactoring.

## Test Environment
- Target: Obsidian Desktop Plugin (Electron)
- Audio API: HTML5 Audio Element
- Test Date: 2026-02-05

## Characterization Tests

### CT1: isPlaying 플래그 동작

**Test**: `isPlaying` 플래그는 오디오 실제 재생 상태를 정확히 반영해야 함

**Current Behavior**:
```javascript
// play 이벤트 발생 시
reader.isPlaying = true;

// pause 이벤트 발생 시
reader.isPlaying = false;

// 일시정지 함수 호출 시
reader.isPlaying = false;

// 정지 함수 호출 시
reader.isPlaying = false;
```

**Expected**:
- 재생 시작: `isPlaying === true`
- 일시정지: `isPlaying === false`
- 정지: `isPlaying === false`

---

### CT2: 인터럽트 감지 (_wasPlayingBeforeInterruption)

**Test**: OS 강제 정지 시 `_wasPlayingBeforeInterruption` 플래그 설정

**Current Behavior**:
```javascript
audio.addEventListener('pause', function() {
    reader.isPlaying = false;

    if (reader.isPaused || reader.isStopped) {
        reader._wasPlayingBeforeInterruption = false;
        return;
    }
    // OS가 강제로 정지한 경우
    reader._wasPlayingBeforeInterruption = true;
    reader._lastInterruptionTime = Date.now();
});
```

**Expected**:
- 사용자 일시정지: `_wasPlayingBeforeInterruption === false`
- OS 강제 정지: `_wasPlayingBeforeInterruption === true`

---

### CT3: visibilitychange 기반 복구

**Test**: 화면이 다시 보일 때 자동 복구 시도

**Current Behavior**:
```javascript
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState !== 'visible') return;
    if (!reader._wasPlayingBeforeInterruption) return;
    if (reader.isPaused || reader.isStopped) return;

    setTimeout(async function() {
        // Fast path
        if (audio.readyState >= 2) {
            await audio.play();
            return;
        }

        // Blob recovery path
        if (reader._currentAudioBlob) {
            const newUrl = URL.createObjectURL(reader._currentAudioBlob);
            audio.src = newUrl;
            await audio.play();
            return;
        }

        // Full reload path
        await window.speakNoteWithServerCache(reader.currentIndex);
    }, 500);
});
```

**Expected**:
- 500ms 지연 후 복구 시도
- Fast path → Blob recovery → Full reload 순서

---

### CT4: Watchdog 상태 불일치 감지

**Test**: 10초 간격으로 상태 불일치 감지

**Current Behavior**:
```javascript
setInterval(function() {
    if (!reader.isPaused && !reader.isStopped &&
        audio.src && audio.paused && audio.readyState >= 2) {
        const now = Date.now();
        if (reader._watchdogDetectedAt === 0) {
            reader._watchdogDetectedAt = now;
        } else if (now - reader._watchdogDetectedAt > 5000) {
            audio.play();
        }
    } else {
        reader._watchdogDetectedAt = 0;
    }
}, 10000);
```

**Expected**:
- 10초 간격 체크
- 5초 유예 기간 후 복구 시도

---

### CT5: 재생 완료 처리

**Test**: 오디오 재생 완료 시 다음 노트 자동 재생

**Current Behavior**:
```javascript
reader.audioElement.onended = function() {
    URL.revokeObjectURL(audioUrl);
    reader._currentAudioBlob = null;
    reader._currentAudioUrl = null;
    reader._wasPlayingBeforeInterruption = false;

    if (!reader.isStopped && !reader.isPaused) {
        setTimeout(() => window.speakNoteWithServerCache(index + 1), 100);
    }
};
```

**Expected**:
- Blob URL 해제
- 상태 플래그 초기화
- 다음 노트 자동 재생 (정지/일시정지 아닐 때만)

---

### CT6: 오디오 에러 처리

**Test**: 네트워크 에러 시 오프라인 캐시로 복구

**Current Behavior**:
```javascript
reader.audioElement.onerror = async function(e) {
    const errorType = reader.audioElement.error?.code;

    if (errorType === 2 || errorType === 3) {
        const offlineAudio = await window.offlineCacheManager.getAudio(cacheKey);
        if (offlineAudio) {
            const audioUrl = URL.createObjectURL(offlineAudio);
            reader.audioElement.src = audioUrl;
            await reader.audioElement.play();
        }
    }
};
```

**Expected**:
- 네트워크 에러(code 2, 3) 시 오프라인 캐시 시도

---

## Safety Net Verification

### Existing Tests
- ✅ 재생/일시정지/정지 기본 기능
- ✅ 인터럽트 감지
- ✅ 자동 복구 시도
- ✅ Watchdog 상태 체크

### Test Coverage Assessment
- Core playback paths: Covered
- Interrupt detection: Partially covered
- Recovery mechanisms: Covered
- Error handling: Partially covered

---

## Behavior Snapshot (Preserved)

### State Variables to Preserve
```javascript
{
    isPlaying: false,
    isPaused: false,
    isStopped: false,
    _wasPlayingBeforeInterruption: false,
    _lastInterruptionTime: 0,
    _currentAudioBlob: null,
    _currentAudioUrl: null,
    _watchdogTimerId: null,
    _watchdogDetectedAt: 0
}
```

### Event Handlers to Preserve
- pause: Set `isPlaying = false`, check for interruption
- play: Set `isPlaying = true`, clear interruption flags
- ended: Clean up and trigger next note
- error: Try offline cache recovery

### Recovery Order (Must Preserve)
1. Fast path: Direct `audio.play()` if readyState >= 2
2. Blob recovery: Recreate URL from `_currentAudioBlob`
3. Full reload: Call `speakNoteWithServerCache()`

---

## Success Criteria for Refactoring

### Must Preserve
- All existing event handlers must work identically
- Recovery order must remain: Fast → Blob → Full
- isPlaying flag must track actual audio state
- User pause vs OS interrupt distinction maintained

### Can Improve
- Add state machine for clearer state management
- Add error classification (temporary vs permanent)
- Add Media Session API integration
- Add headphone detection
- Improve error messages
- Add timeout for recovery attempts
