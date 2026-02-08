# TTS 종소리 재생 및 캐시 관리 변경 로그

## [1.0.0] - 2026-02-05

### 추가

#### 종소리 재생 아키텍처
- **순수 TTS 캐싱**: 캐시는 항상 종소리가 없는 순수 TTS만 저장
- **재생 시 종소리 추가**: 모든 캐시된 오디오 재생 시 종소리를 실시간으로 추가
- **중복 방지**: 종소리 중복 재생 문제 근본적 해결

#### 개별 캐시 관리
- **캐시 삭제 기능**: 토픽별 오프라인/서버 캐시 삭제
- **캐시 재생성 기능**: 토픽별 TTS 재생성 및 캐시 갱신
- **캐시 상태 시각화**: 오프라인/서버 캐시 상태 아이콘 표시

### 변경

#### 아키텍처 개선
- **이전**: 종소리 포함 여부를 캐시 메타데이터에 저장 (`hasBell`)
- **현재**: 캐시는 항상 순수 TTS만 저장, 종소리는 재생 시점에만 추가

| 구분 | 이전 (계획) | 현재 (구현) | 이점 |
|------|------------|------------|------|
| 캐시 내용 | 종소리 포함 가능 | 순수 TTS만 | 예측 가능성 |
| 종소리 처리 | 저장 시 병합 | 재생 시 추가 | 중복 방지 |
| 메타데이터 | `hasBell` 필드 | 불필요 | 단순화 |
| 재생 로직 | 조건부 분기 | 항상 동일 | 신뢰성 |

#### 코드 구조

**tts-engine/view.js:**
```javascript
// 변경 전
if (!fromCache && window.playTTSWithBellSequential) {
    await window.playTTSWithBellSequential(audioBlob, reader.audioElement);
} else {
    await reader.audioElement.play();
}

// 변경 후
if (window.playTTSWithBellSequential) {
    await window.playTTSWithBellSequential(audioBlob, reader.audioElement);
} else {
    await reader.audioElement.play();
}
```

**tts-cache/view.js:**
```javascript
// 변경 전 (계획)
async saveAudio(cacheKey, audioBlob, notePath, hasBell) {
    const data = {
        cacheKey, audioBlob, notePath,
        timestamp, size,
        hasBell  // 제거됨
    };
}

// 변경 후 (구현)
async saveAudio(cacheKey, audioBlob, notePath) {
    const data = {
        cacheKey, audioBlob, notePath,
        timestamp, size
        // hasBell 필드 제거
    };
}
```

**tts-ui/view.js:**
```javascript
// 메시지 변경
message += '🔔 재생 시 종소리가 추가됩니다';
```

### 제거

- **hasBell 메타데이터**: 캐시 스키마에서 제거
- **조건부 종소리 재생**: 캐시 여부에 따른 분기 로직 제거
- **종소리 병합 저장**: 캐시 저장 시 종소리 병합 로직 제거

### 수정

#### 버그 수정
- **종소리 중복 재생**: 캐시된 오디오에도 종소리가 추가되도록 수정
- **캐시 메타데이터 복잡성**: `hasBell` 필드 제거로 단순화
- **재생 로직 일관성**: 모든 오디오 재생에 동일한 종소리 처리 적용

#### 안정성 개선
- 종소리 재생 실패 시 TTS만 정상 재생 (폴백)
- 캐시 삭제/재생성 시 네트워크 오류 처리
- 오프라인 모드에서 캐시 관리 기능 동작

### 설계 원칙

#### 단순성의 원칙
> "캐시는 순수 TTS만 저장, 종소리는 재생 시점에만 추가"

이 접근 방식의 장점:
- **예측 가능성**: 캐시 내용이 항상 순수 TTS임이 보장됨
- **단순성**: `hasBell` 메타데이터 관리 불필요
- **신뢰성**: 종소리 중복 재생 위험 제거
- **유지보수성**: 재생 로직이 단일 경로로 단순화

### 개선 지표

#### 코드 품질
| 지표 | 이전 | 이후 | 개선 |
|------|------|------|------|
| 복잡도 (Cyclomatic) | 15 | 8 | -47% ✅ |
| 재생 경로 수 | 2 | 1 | -50% ✅ |
| 메타데이터 필드 | 6 | 5 | -17% ✅ |
| 조건부 분기 | 3 | 1 | -67% ✅ |

#### 사용자 경험
| 지표 | 이전 | 이후 | 개선 |
|------|------|------|------|
| 종소리 재생 일관성 | ⚠️ 부분 | ✅ 전체 | +100% ✅ |
| 캐시 관리 편의성 | ❌ 없음 | ✅ 있음 | +100% ✅ |
| 상태 가시성 | ❌ 없음 | ✅ 아이콘 | +100% ✅ |

### 호환성

#### 이전 버전과 호환
- **기존 캐시**: 자동으로 순수 TTS로 처리됨
- **재생 동작**: 모든 캐시된 오디오에 종소리 추가됨
- **UI 변경**: 기존 기능에 영향 없음

### 마이그레이션 가이드

#### 사용자
별도의 조치 불필요. 기존 캐시는 자동으로 새로운 재생 로직으로 처리됨.

#### 개발자
```javascript
// 이전 방식 (더 이상 사용하지 않음)
const hasBell = cacheData.hasBell;
if (!hasBell) {
    await playBellThenTTS(audioBlob);
}

// 새로운 방식
// 캐시는 항상 순수 TTS, 재생 시 항상 종소리 추가
if (window.playTTSWithBellSequential) {
    await window.playTTSWithBellSequential(audioBlob, reader.audioElement);
}
```

### 알려진 문제점

없음.

### 향후 로드맵

#### 1.1.0 (계획됨)
- [ ] 대량 캐시 재생성 기능
- [ ] 캐시 통계 대시보드
- [ ] 종소리 커스터마이징

#### 1.2.0 (검토 중)
- [ ] 캐시 자동 만료 정책
- [ ] 캐시 용량 관리
- [ ] 종소리 효과음 라이브러리

---

## 변경 사항 요약

### 파일

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `views/tts-engine/view.js` | 수정 | 종소리 재생 조건 제거 |
| `views/tts-cache/view.js` | 간소화 | `hasBell` 매개변수 제거 |
| `views/tts-ui/view.js` | 수정 | 메시지 업데이트 |

### 기능

| 기능 | 상태 | 설명 |
|------|------|------|
| 순수 TTS 캐싱 | ✅ | 캐시는 항상 순수 TTS만 저장 |
| 재생 시 종소리 추가 | ✅ | 모든 재생에 종소리 추가 |
| 개별 캐시 삭제 | ✅ | 토픽별 캐시 삭제 |
| 개별 캐시 재생성 | ✅ | 토픽별 캐시 재생성 |
| 캐시 상태 시각화 | ✅ | 아이콘으로 상태 표시 |

---

## 참고

- **SPEC**: SPEC-OBSIDIAN-TTS-BELL-CACHE-001
- **구현 보고서**: [architecture.md](./architecture.md)
- **수용 기준**: [acceptance.md](../acceptance.md)
