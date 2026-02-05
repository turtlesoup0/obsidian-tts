# SPEC-SYNC-002 인수 기준 (Acceptance Criteria)

## AC1: 정렬 불일치 상황에서 정확한 동기화

### 시나리오

```gherkin
Given PC와 모바일에서 pages 배열 정렬이 다를 때
  And PC에서 pages[10]이 "AI 기술.md"
  And 모바일에서 pages[10]이 "빅데이터.md" (정렬 다름)
When PC에서 "AI 기술.md" (index=10) 재생 완료 후 동기화 이벤트 발생
Then 모바일에서 "AI 기술.md"가 하이라이트되어야 한다
  And 콘솔에 "📊 인덱스 불일치 감지: 서버 index=10, 로컬 index=X" 로그 출력
```

### 검증 방법

1. 시뮬레이션: `pages` 배열 순서를 수동으로 변경
2. 서버에서 `{lastPlayedIndex: 10, notePath: "AI 기술.md"}` 이벤트 수신
3. `findIndexByNotePath("AI 기술.md")`가 올바른 인덱스 반환 확인
4. 해당 인덱스의 노트가 하이라이트 확인

---

## AC2: SSE 실시간 동기화에서 notePath 사용

### 시나리오

```gherkin
Given 디바이스 A와 B에서 SSE 연결 활성화
  And 두 디바이스에서 동일한 tts-reader 노트 열림
When 디바이스 A에서 "3-Study/정보 관리 기술사/AI.md" 재생
Then 디바이스 B에서 < 100ms 내에 같은 노트가 하이라이트
  And 콘솔에 "✅ UI 업데이트: index=X, note='AI.md'" 로그 출력
```

### 검증 방법

1. 두 디바이스에서 tts-reader 노트 열기
2. 디바이스 A에서 재생 시작
3. 디바이스 B 콘솔에서 로그 확인:
   - `📥 SSE playback update received: {notePath: "...", ...}`
   - `🔍 노트 찾음: "..." → index X`
   - `✅ UI 업데이트: index=X, note="..."`
4. 디바이스 B에서 올바른 노트 하이라이트 확인

---

## AC3: 레거시 데이터 호환성

### 시나리오

```gherkin
Given 서버에 notePath 없는 구버전 데이터 존재
  And 데이터: {lastPlayedIndex: 5, timestamp: ..., deviceId: ...}
When 새 클라이언트가 동기화 수행
Then 인덱스 기반으로 pages[5]가 하이라이트
  And 콘솔에 "⚠️ 노트 못찾음" 경고 없음 (notePath 자체가 없으므로)
```

### 검증 방법

1. 서버에 notePath 없는 테스트 데이터 PUT
   ```bash
   curl -X PUT http://100.107.208.106:5051/api/playback-position \
     -H "Content-Type: application/json" \
     -d '{"lastPlayedIndex":5,"timestamp":1234567890}'
   ```
2. 클라이언트에서 동기화 수행
3. `pages[5]` 노트가 하이라이트 확인
4. 콘솔에 에러 없음 확인

---

## AC4: 인덱스 불일치 감지 로깅

### 시나리오

```gherkin
Given 서버 인덱스와 로컬 인덱스가 다를 때
When 동기화 수행
Then 콘솔에 다음 형식의 로그 출력:
  | 📊 인덱스 불일치 감지: 서버 index=10, 로컬 index=7, note="AI.md" |
```

### 검증 방법

1. 서버에 `{lastPlayedIndex: 10, notePath: "AI.md"}` 전송
2. 로컬에서 `findIndexByNotePath("AI.md")`가 7 반환 (정렬 다름)
3. 콘솔에서 불일치 로그 확인

---

## AC5: 노트 못찾음 시 폴백

### 시나리오

```gherkin
Given notePath에 해당하는 노트가 현재 pages에 없을 때
  And 서버 데이터: {lastPlayedIndex: 10, notePath: "삭제된노트.md"}
When 동기화 수행
Then pages[10]으로 폴백 동작
  And 콘솔에 "⚠️ 노트 못찾음: '삭제된노트.md', 인덱스 폴백 사용" 경고 출력
```

### 검증 방법

1. 존재하지 않는 notePath로 테스트 데이터 PUT
2. 클라이언트에서 동기화 수행
3. 콘솔에서 경고 로그 확인
4. 인덱스 기반으로 하이라이트 확인

---

## 테스트 체크리스트

| AC | 테스트 항목 | 상태 | 비고 |
|----|------------|------|------|
| AC1 | 정렬 불일치 시 정확한 동기화 | ⬜ | 시뮬레이션 필요 |
| AC2 | SSE notePath 기반 동기화 | ⬜ | 두 디바이스 필요 |
| AC3 | 레거시 데이터 호환성 | ⬜ | curl 테스트 |
| AC4 | 인덱스 불일치 로깅 | ⬜ | 콘솔 확인 |
| AC5 | 노트 못찾음 폴백 | ⬜ | curl 테스트 |

---

## 수동 테스트 스크립트

### 테스트 1: notePath 기반 동기화 확인

**Obsidian 콘솔에서 실행**:
```javascript
// 현재 pages 배열 확인
console.log('현재 pages:', window.azureTTSReader.pages.map((p, i) => `${i}: ${p.file.path}`));

// findIndexByNotePath 테스트
const testPath = window.azureTTSReader.pages[5].file.path;
const foundIndex = window.sseSyncManager.findIndexByNotePath(testPath);
console.log(`테스트: "${testPath}" → index ${foundIndex}`);
```

### 테스트 2: SSE 이벤트로 동기화 트리거

**터미널에서 실행**:
```bash
# notePath 포함 위치 업데이트
curl -X PUT http://100.107.208.106:5051/api/playback-position \
  -H "Content-Type: application/json" \
  -d '{"lastPlayedIndex":10,"notePath":"3-Study/정보관리기술사/AI.md","noteTitle":"AI","timestamp":'$(date +%s000)',"deviceId":"test-cli"}'
```

**Obsidian 콘솔에서 확인**:
```
📥 SSE playback update received: {...}
🔍 노트 찾음: "3-Study/정보관리기술사/AI.md" → index X
✅ UI 업데이트: index=X, note="AI"
```

### 테스트 3: 레거시 데이터 (notePath 없음)

```bash
# notePath 없는 레거시 데이터
curl -X PUT http://100.107.208.106:5051/api/playback-position \
  -H "Content-Type: application/json" \
  -d '{"lastPlayedIndex":3,"timestamp":'$(date +%s000)',"deviceId":"legacy-device"}'
```

**예상 결과**: 인덱스 기반으로 `pages[3]` 하이라이트, 경고 없음
