# SPEC-SYNC-002 구현 계획

## 개요

TTS 위치 동기화를 인덱스 기반에서 노트명(`notePath`) 기반으로 개선하여 다중 디바이스 간 정렬 불일치 문제를 해결합니다.

## 기술 스택

- **언어**: JavaScript (ES2020+)
- **환경**: Obsidian DataviewJS
- **의존성**: 기존 SSE 동기화 인프라 (SPEC-PERF-001)

## 작업 분해

### Task 1: findIndexByNotePath 함수 구현 (30분)

**위치**: `sseSyncManager` 객체 내부

**구현 내용**:
```javascript
findIndexByNotePath(notePath) {
    const reader = window.azureTTSReader;
    if (!reader || !reader.pages || !notePath) {
        return -1;
    }

    // 1차: 완전 일치
    let index = reader.pages.findIndex(page => page.file.path === notePath);

    // 2차: 부분 일치 (경로 끝 일치)
    if (index === -1) {
        index = reader.pages.findIndex(page =>
            page.file.path.endsWith(notePath) ||
            notePath.endsWith(page.file.path)
        );
    }

    // 3차: 파일명만 일치 (최후 수단)
    if (index === -1) {
        const fileName = notePath.split('/').pop();
        index = reader.pages.findIndex(page =>
            page.file.name === fileName
        );
    }

    if (index !== -1) {
        console.log(`🔍 노트 찾음: "${notePath}" → index ${index}`);
    } else {
        console.warn(`⚠️ 노트 못찾음: "${notePath}", 인덱스 폴백 사용`);
    }

    return index;
}
```

**테스트**:
- 완전 일치 경로 테스트
- 상대 경로 / 절대 경로 혼합 테스트
- 파일명만 일치하는 케이스 테스트

### Task 2: updateUI 함수 수정 (20분)

**현재 위치**: 라인 ~916

**변경 사항**:
1. 함수 시그니처 확장: `updateUI(lastPlayedIndex)` → `updateUI(lastPlayedIndex, notePath, noteTitle)`
2. `notePath` 존재 시 `findIndexByNotePath` 호출
3. 인덱스 불일치 로깅 추가

**테스트**:
- notePath 있는 경우: 노트명 기반 동기화
- notePath 없는 경우: 인덱스 기반 폴백
- 인덱스 불일치 감지 로깅 확인

### Task 3: SSE 이벤트 핸들러 수정 (10분)

**현재 위치**: 라인 ~900

**변경 사항**:
```javascript
// Before
this.updateUI(data.lastPlayedIndex);

// After
this.updateUI(data.lastPlayedIndex, data.notePath, data.noteTitle);
```

### Task 4: syncPosition 함수 수정 (30분)

**현재 위치**: 라인 ~671

**변경 사항**:
1. 서버 데이터에서 `notePath` 확인
2. `findIndexByNotePath`로 정확한 인덱스 찾기
3. 로컬 저장소에 `notePath` 추가 저장
4. 인덱스 보정 로깅

### Task 5: optimisticUpdate 함수 수정 (10분)

**현재 위치**: 라인 ~503

**변경 사항**:
```javascript
localStorage.setItem('azureTTS_lastPlayedNotePath', notePath || '');
```

## 위험 분석

| 위험 | 확률 | 영향 | 완화 전략 |
|------|------|------|-----------|
| 경로 형식 불일치 | 중 | 중 | 다중 경로 비교 전략 (완전→부분→파일명) |
| 레거시 데이터 | 낮 | 낮 | notePath 없으면 인덱스 폴백 |
| 성능 저하 | 낮 | 낮 | findIndex는 O(n), pages 길이 제한적 |

## 예상 소요 시간

| Task | 예상 시간 |
|------|----------|
| Task 1 | 30분 |
| Task 2 | 20분 |
| Task 3 | 10분 |
| Task 4 | 30분 |
| Task 5 | 10분 |
| **총계** | **100분** (약 1.5시간) |

## 테스트 전략

### 단위 테스트

1. `findIndexByNotePath` 함수 테스트
   - 완전 일치 경로
   - 상대 경로
   - 파일명만 일치
   - 찾지 못하는 경우

### 통합 테스트

1. SSE 동기화 테스트 (동일 정렬)
2. SSE 동기화 테스트 (시뮬레이션 다른 정렬)
3. 레거시 데이터 호환성 테스트

### E2E 테스트

1. PC → 모바일 동기화
2. 모바일 → PC 동기화
3. 3개 이상 디바이스 동기화

## 롤백 계획

문제 발생 시:
1. `updateUI` 함수의 `notePath` 로직 주석 처리
2. 기존 인덱스 기반 동작으로 즉시 복구
3. 원인 분석 후 재배포

## 다음 단계

구현 완료 후:
1. SPEC-TEST-001에 노트명 기반 동기화 테스트 추가
2. SPEC-SYNC-002 상태를 Complete로 변경
3. 버전 v5.3.0 릴리스 노트 작성
