# SPEC-OBSIDIAN-TTS-BELL-CACHE-001: 구현 계획

## 태그 블록

```yaml
tags: [PLAN, TTS, bell, cache, obsidian, audio]
spec: SPEC-OBSIDIAN-TTS-BELL-CACHE-001
domain: OBSIDIAN
status: COMPLETED
created: 2026-02-05
completed: 2026-02-05
```

## 개요 (Overview)

본 SPEC은 TTS 시스템에서 종소리 효과음 재생 및 개별 캐시 관리 기능을 구현하기 위한 계획을 정의합니다.

## 주요 목표 (Primary Goals)

**목표 1: 종소리 재생 문제 해결 (우선순위: 높음)**
- 캐시된 오디오 재생 시에도 종소리 효과음 재생
- 종소리 포함 캐시 자동 저장 메커니즘 구현

**목표 2: 개별 캐시 관리 UI (우선순위: 높음)**
- 토픽별 캐시 삭제 기능
- 토픽별 캐시 재생성 기능
- 캐시 상태 시각화

**목표 3: 모드 호환성 (우선순위: 중간)**
- 오프라인 모드 지원
- 에지 서버 모드 지원

## 기술적 접근 (Technical Approach)

### 1단계: 종소리 재생 아키텍처 수정

**현재 문제점 분석:**
```javascript
// views/tts-engine/view.js:1266
// 종소리는 새로 생성된 TTS(!fromCache)에만 재생됨
if (!fromCache && window.playTTSWithBellSequential) {
    await window.playTTSWithBellSequential(audioBlob, reader.audioElement);
}
```

**해결 방법 A: 캐시된 오디오에도 종소리 재생**
- 장점: 기존 캐시 유지, 빠른 구현
- 단점: 종소리가 매번 실시간으로 재생됨

**해결 방법 B: 종소리 포함 캐시 저장**
- 장점: 일관된 오디오 품질, 재생 속도 향상
- 단점: 기존 캐시 무효화, 추가 처리 시간

**선택: 방법 A + B 혼합**
- 캐시된 오디오는 즉시 종소리 재생 (방법 A)
- 새로 생성되는 오디오는 종소리 병합 후 저장 (방법 B)

### 2단계: 캐시 스키마 확장

**IndexedDB 스키마 변경:**
```javascript
// 기존
{ cacheKey, audioBlob, notePath, timestamp, size }

// 변경 후
{
    cacheKey,
    audioBlob,
    notePath,
    timestamp,
    size,
    hasBell: false,        // 새로운 필드
    cacheVersion: 1        // 새로운 필드
}
```

**마이그레이션 전략:**
1. 기존 캐시는 `hasBell: false`로 처리
2. 점진적 마이그레이션 (재생성 시 업데이트)

### 3단계: UI 컴포넌트 구조

**노트 행 레이아웃:**
```
┌──────────────────────────────────────────────────────────────┐
│ 📝 노트 제어권자                    [🔊] [💾 파랑] [🗑️] [🔄] │
│    정의: ~                                                  │
└──────────────────────────────────────────────────────────────┘
```

**캐시 상태 아이콘:**
- 💾 회색: 캐시 없음
- 💾 파랑: 오프라인 캐시만
- 💾 초록: 서버+오프라인 캐시

## 구현 마일스톤 (Milestones)

### 마일스톤 1: 종소리 재생 수정 (필수)

**작업:**
1. `views/tts-engine/view.js`의 `speakNoteWithServerCache()` 함수 수정
2. `fromCache` 상관없이 종소리 재생 로직 적용
3. 종소리 설정 확인 로직 추가

**구현 포인트:**
```javascript
// 변경 전
if (!fromCache && window.playTTSWithBellSequential) { ... }

// 변경 후
if (window.ttsBellConfig.enabled && window.playTTSWithBellSequential) {
    await window.playTTSWithBellSequential(audioBlob, reader.audioElement);
} else {
    await reader.audioElement.play();
}
```

**완료 기준:**
- 캐시된 오디오 재생 시 종소리 들림
- 종소리 비활성화 시 정상 동작

### 마일스톤 2: 개별 캐시 삭제 기능 (필수)

**작업:**
1. 캐시 삭제 버튼 UI 추가
2. 개별 캐시 삭제 함수 구현
3. 확인 다이얼로그 구현

**구현 포인트:**
```javascript
// 새로운 함수
window.deleteNoteCache = async function(cacheKey, notePath) {
    // 1. 오프라인 캐시 삭제
    await window.offlineCacheManager.deleteAudio(cacheKey);

    // 2. 서버 캐시 삭제 (로컬 모드 제외)
    if (window.ttsModeConfig?.features?.cache !== 'local') {
        await fetch(`${serverCacheManager.cacheApiEndpoint}/${cacheKey}`, {
            method: 'DELETE'
        });
    }
}
```

**완료 기준:**
- 삭제 버튼 클릭으로 개별 캐시 삭제됨
- 삭제 전 확인 다이얼로그 표시됨
- 삭제 후 피드백 메시지 표시됨

### 마일스톤 3: 개별 캐시 재생성 기능 (필수)

**작업:**
1. 재생성 버튼 UI 추가
2. 캐시 재생성 함수 구현
3. 로딩 표시 및 피드백

**구현 포인트:**
```javascript
// 새로운 함수
window.regenerateNoteCache = async function(cacheKey, page) {
    // 1. 기존 캐시 삭제
    await window.deleteNoteCache(cacheKey, page.file.path);

    // 2. TTS 새로 생성
    const content = window.serverCacheManager.getNoteContent(page);
    const audioBlob = await window.callAzureTTS(content);

    // 3. 종소리 병합 (활성화 시)
    if (window.ttsBellConfig.enabled) {
        audioBlob = await window.createTTSWithBell(audioBlob);
    }

    // 4. 캐시 저장
    await window.offlineCacheManager.saveAudio(cacheKey, audioBlob, page.file.path);
    await window.serverCacheManager.saveAudioToServer(cacheKey, audioBlob);

    return audioBlob;
}
```

**완료 기준:**
- 재생성 버튼 클릭으로 캐시 재생성됨
- 재생성 중 로딩 표시됨
- 재생성 후 자동 재생 시작됨

### 마일스톤 4: UI 통합 (필수)

**작업:**
1. 노트 행에 캐스 상태 아이콘 추가
2. 캐시 관리 버튼 추가
3. 캐시 통계 표시

**구현 포인트:**
- `views/tts-ui/view.js`의 `renderNoteRow()` 함수 수정
- 캐시 상태 확인 함수 추가
- 버튼 이벤트 핸들러 연결

**완료 기준:**
- 각 노트 행에 캐스 상태 표시됨
- 삭제/재생성 버튼 동작함
- 캐스 통계 실시간 업데이트됨

### 마일스톤 5: 오프라인/에지 모드 지원 (선택)

**작업:**
1. 로컬 모드에서 서버 캐시 작업 스킵
2. 네트워크 오러 처리
3. 오프라인 알림 메시지

**완료 기준:**
- 오프라인 모드에서 캐스 관리 정상 동작
- 네트워크 오류 시 적절한 메시지 표시

## 위험 및 대응 (Risks & Mitigation)

### 위험 1: 기존 캐시 무효화
- **영향:** 사용자 경험 저하, 재다운로드 필요
- **대응:** 점진적 마이그레이션, 기존 캐시는 종소리 없이 재생 후 병합

### 위험 2: API 할당량 초과
- **영향:** 대량 재생성 시 할당량 소모
- **대응:** 재생성 횟수 제한, 배치 작업 지연

### 위험 3: Web Audio API 호환성
- **영향:** 일부 브라우저에서 종소리 재생 실패
- **대응:** 폴백 메커니즘, 브라우저 감지

## 테스트 전략 (Test Strategy)

### 단위 테스트
- 종소리 재생 함수 테스트
- 캐시 삭제/재생성 함수 테스트

### 통합 테스트
- 캐시된 오디오 종소리 재생 테스트
- UI 버튼 동작 테스트

### 사용자 테스트
- 오프라인 모드에서 캐시 관리 테스트
- 대량 작업 성능 테스트

## 롤백 계획 (Rollback Plan)

이슈 발생 시:
1. 기존 코드로 즉시 롤백
2. 기존 캐시 유지
3. 종소리 기능만 비활성화

## 참고 (References)

- 기존 SPEC: `.moai/specs/SPEC-OBSIDIAN-DV-*/`
- 관련 코드: `views/tts-*/`
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
