---
spec_id: SPEC-FIX-003
title: iOS TTS 재생 시 다음 노트로 넘어가지 않고 반복 재생되는 버그
status: Planned
priority: High
created: 2026-02-05
assigned: expert-debug, expert-frontend
tags: bug-fix, ios, tts, media-session, playback
lifecycle_level: spec-first
---

# SPEC-FIX-003: iOS TTS 재생 시 다음 노트로 넘어가지 않고 반복 재생되는 버그

## 문제 요약 (Problem Summary)

iOS 환경에서 TTS 재생 시 노트 재생이 완료되어도 다음 노트로 넘어가지 않고 같은 노트가 반복 재생되는 버그가 발생합니다.

### 증상
- 노트 1 재생 완료 후 노트 2가 아닌 노트 1이 다시 재생됨
- 수동으로 "다음" 버튼을 누르면 정상 작동
- iOS 잠금화면 재생 중 발생
- macOS/Windows에서는 정상 동작 (확인 필요)

### 발생 환경
- **플랫폼**: iOS (iPhone/iPad)
- **앱**: Obsidian Mobile (Safari WebView)
- **관련 기능**: Media Session API (잠금화면 컨트롤)

---

## 환경 (Environment)

### 시스템 컨텍스트
- **프로젝트**: obsidian-tts
- **현재 버전**: v5.2.0+
- **관련 파일**: `templates/v5-keychain/tts-reader-v5-keychain.md`

### iOS 제약사항
- Safari WebView에서 백그라운드 오디오 재생 제한
- Media Session API 동작이 데스크톱과 다름
- 잠금화면에서 자동 재생 제한

---

## 원인 분석 (Root Cause Analysis)

### 가설 1: Media Session `play` 핸들러 Race Condition (유력)

**문제 코드** (라인 3333-3352):
```javascript
navigator.mediaSession.setActionHandler('play', async () => {
    try {
        if (reader.audioElement && !reader.audioElement.error) {
            await reader.audioElement.play();
            reader.isPaused = false;
        } else {
            // 🚨 여기서 현재 노트 재생성
            await window.speakNoteWithServerCache(reader.currentIndex);
        }
    } catch (error) {
        // 🚨 재생 실패 시에도 현재 노트 재시도
        await window.speakNoteWithServerCache(reader.currentIndex);
    }
});
```

**문제 시나리오**:
1. 노트 1 재생 완료 → `onended` 발생
2. `speakNoteWithServerCache(1 + 1)` 호출 (다음 노트)
3. 노트 2 로딩 시작...
4. **동시에** iOS Media Session이 `play` 핸들러를 트리거 (자동 또는 사용자)
5. `reader.audioElement`가 아직 설정되지 않았거나 에러 상태
6. `speakNoteWithServerCache(reader.currentIndex)` 호출
7. `reader.currentIndex`가 아직 1이므로 노트 1 재생
8. 결과: 노트 1 반복 재생

### 가설 2: `onended` 이벤트 미발생 또는 지연

iOS Safari에서 특정 조건에서 `onended` 이벤트가 발생하지 않거나 지연될 수 있습니다:
- 백그라운드 전환 시
- 잠금화면 상태에서
- 오디오 세션 중단 시

### 가설 3: `reader.currentIndex` 업데이트 타이밍

`speakNoteWithServerCache` 함수에서 `reader.currentIndex`가 설정되는 시점:
```javascript
window.speakNoteWithServerCache = async function(index) {
    ...
    reader.currentIndex = index;  // 라인 3195
    reader.lastPlayedIndex = index;
    ...
}
```

Media Session `play` 핸들러가 이 라인 실행 전에 호출되면 이전 인덱스를 사용합니다.

---

## 요구사항 (Requirements)

### R1: Race Condition 방지 (Critical)
**WHEN** Media Session `play` 핸들러가 호출되면 **THEN** 현재 로딩/재생 상태를 확인하고 중복 재생을 방지해야 한다.

- **R1.1**: `isLoading` 상태에서 `play` 핸들러가 새 재생을 시작하지 않도록 함
- **R1.2**: `speakNoteWithServerCache` 함수 시작 시 즉시 `currentIndex` 업데이트
- **R1.3**: Media Session 핸들러에서 `reader.currentIndex` 대신 신뢰할 수 있는 상태 사용

### R2: iOS 백그라운드 재생 안정성 (State-Driven)
**IF** iOS에서 백그라운드로 전환되면 **THEN** 재생 상태가 올바르게 유지되어야 한다.

- **R2.1**: `onended` 이벤트가 백그라운드에서도 발생하도록 보장
- **R2.2**: 잠금화면에서 다음 노트 자동 재생 지원

### R3: 로깅 및 디버깅 (Ubiquitous)
**시스템은** iOS 재생 문제를 디버깅할 수 있는 충분한 로깅을 제공해야 한다.

- **R3.1**: `onended` 이벤트 발생 시 로깅
- **R3.2**: Media Session 핸들러 호출 시 로깅
- **R3.3**: `currentIndex` 변경 시 로깅

---

## 상세사양 (Specifications)

### S1: Media Session `play` 핸들러 수정

**현재 코드 (문제)**:
```javascript
navigator.mediaSession.setActionHandler('play', async () => {
    try {
        if (reader.audioElement && !reader.audioElement.error) {
            await reader.audioElement.play();
        } else {
            await window.speakNoteWithServerCache(reader.currentIndex);
        }
    } catch (error) {
        await window.speakNoteWithServerCache(reader.currentIndex);
    }
});
```

**수정 코드 (제안)**:
```javascript
navigator.mediaSession.setActionHandler('play', async () => {
    console.log('📱 Media Session play triggered', {
        isLoading: reader.isLoading,
        isPaused: reader.isPaused,
        currentIndex: reader.currentIndex
    });

    // 🚨 로딩 중이면 무시 (race condition 방지)
    if (reader.isLoading) {
        console.log('⏳ Ignoring play - already loading');
        return;
    }

    try {
        if (reader.audioElement && reader.audioElement.src && !reader.audioElement.error) {
            // 기존 오디오 재개
            await reader.audioElement.play();
            reader.isPaused = false;
            console.log('▶️ Resumed existing audio');
        } else if (reader.isPaused && reader.currentIndex >= 0) {
            // 일시정지 상태에서 재개
            await window.speakNoteWithServerCache(reader.currentIndex);
            console.log('🔄 Reloaded current note from pause state');
        } else {
            console.warn('⚠️ No valid audio state to resume');
        }
    } catch (error) {
        console.error('❌ Media Session play error:', error);
        // 에러 시에도 새 재생 시작하지 않음 (반복 재생 방지)
    }
});
```

### S2: `speakNoteWithServerCache` 함수 수정

**현재 코드 (라인 3195)**:
```javascript
const page = reader.pages[index];
reader.currentIndex = index;  // 나중에 설정
reader.lastPlayedIndex = index;
```

**수정 코드 (제안)**:
```javascript
window.speakNoteWithServerCache = async function(index) {
    const reader = window.azureTTSReader;

    // 🚨 함수 시작 시 즉시 인덱스 업데이트 (race condition 방지)
    reader.currentIndex = index;
    reader.isLoading = true;

    console.log(`🎵 speakNoteWithServerCache called: index=${index}`);

    if (index >= reader.pages.length || reader.isStopped) {
        reader.isLoading = false;
        reader.lastPlayedIndex = -1;
        ...
        return;
    }

    const page = reader.pages[index];
    reader.lastPlayedIndex = index;
    ...
}
```

### S3: `onended` 핸들러 로깅 추가

```javascript
reader.audioElement.onended = function() {
    console.log(`✅ Audio ended: index=${index}, next=${index + 1}`);
    URL.revokeObjectURL(audioUrl);
    if (!reader.isStopped && !reader.isPaused) {
        console.log(`➡️ Auto-advancing to next note: ${index + 1}`);
        setTimeout(() => window.speakNoteWithServerCache(index + 1), 100);
    } else {
        console.log(`⏸️ Playback stopped/paused, not advancing`);
        reader.isLoading = false;
    }
};
```

---

## 인수 기준 (Acceptance Criteria)

### AC1: Race Condition 방지

**Given** iOS에서 노트 1을 재생 완료했을 때
**When** `onended`와 Media Session `play`가 거의 동시에 발생하면
**Then** 노트 2가 한 번만 재생되어야 한다 (반복 재생 안 됨)

### AC2: 자동 다음 노트 재생

**Given** iOS 잠금화면에서 TTS를 재생 중일 때
**When** 노트 재생이 완료되면
**Then** 자동으로 다음 노트가 재생되어야 한다

### AC3: 일시정지 후 재개

**Given** iOS에서 TTS가 일시정지된 상태일 때
**When** 잠금화면에서 재생 버튼을 누르면
**Then** 현재 노트가 이어서 재생되어야 한다 (처음부터 아님)

### AC4: 로깅 확인

**Given** 수정된 코드가 배포되었을 때
**When** iOS에서 TTS를 재생하면
**Then** 콘솔에 다음 로그가 출력되어야 한다:
- `📱 Media Session play triggered`
- `🎵 speakNoteWithServerCache called`
- `✅ Audio ended`
- `➡️ Auto-advancing to next note`

---

## 실행 계획 (Execution Plan)

### Phase 1: 로깅 추가 (디버깅)
1. `onended`, Media Session 핸들러, `speakNoteWithServerCache`에 로깅 추가
2. iOS에서 테스트하여 실제 문제 원인 확인

### Phase 2: Race Condition 방지
1. `isLoading` 체크 로직 추가
2. `currentIndex` 즉시 업데이트
3. Media Session `play` 핸들러 방어 로직 추가

### Phase 3: iOS 테스트
1. 잠금화면 연속 재생 테스트
2. 백그라운드 전환 테스트
3. 수동 다음/이전 버튼 테스트

---

## 참고

### 관련 SPEC
- SPEC-PERF-001: SSE 기반 동기화 (완료)
- SPEC-FIX-002: TTS 기능 회귀 버그 (완료)

### iOS Media Session 참고
- [MDN: Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API)
- [WebKit: Media Session API](https://webkit.org/blog/14093/media-session-api/)

### 변경 이력
| 날짜 | 버전 | 변경 내용 |
|------|------|-----------|
| 2026-02-05 | 1.0 | 초기 SPEC 작성 (iOS 반복 재생 버그 분석) |
