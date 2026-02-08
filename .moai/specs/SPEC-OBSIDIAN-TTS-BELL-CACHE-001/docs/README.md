# TTS 종소리 재생 및 캐시 관리 기능 문서

## 개요

SPEC-OBSIDIAN-TTS-BELL-CACHE-001은 TTS 시스템의 종소리 재생 및 개별 캐시 관리 기능을 구현합니다.

## 핵심 원칙

> "캐시는 순수 TTS만 저장, 종소리는 재생 시점에만 추가"

이 원칙은 다음과 같은 이점을 제공합니다:

- **예측 가능성**: 캐시 내용이 항상 순수 TTS임이 보장됨
- **단순성**: `hasBell` 메타데이터 관리 불필요
- **신뢰성**: 종소리 중복 재생 위험 제거
- **유지보수성**: 재생 로직이 단일 경로로 단순화

## 문서 목차

### 주요 문서

| 문서 | 설명 |
|------|------|
| [CHANGELOG.md](./CHANGELOG.md) | 버전별 변경 사항 |
| [architecture.md](./architecture.md) | 시스템 아키텍처 및 데이터 흐름 |
| [acceptance.md](../acceptance.md) | 수용 기준 (Given-When-Then) |
| [plan.md](../plan.md) | 구현 계획 및 마일스톤 |
| [spec.md](../spec.md) | 전체 요구사항 명세 |

## 빠른 시작

### 구현 개요

이 SPEC은 다음 기능을 구현합니다:

1. **종소리 재생**: 모든 캐시된 오디오 재생 시 종소리 추가
2. **순수 TTS 캐싱**: 캐시는 항상 종소리 없는 순수 TTS만 저장
3. **개별 캐시 삭제**: 토픽별 캐시 삭제 기능
4. **개별 캐시 재생성**: 토픽별 캐시 재생성 기능
5. **캐시 상태 시각화**: 캐시 상태 아이콘 표시

### 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────┐
│                      사용자 UI                           │
│  [토픽 목록] [캐시 상태: 💾] [삭제: 🗑️] [재생성: 🔄]   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    TTS 엔진                            │
│  speakNoteWithServerCache()                             │
│    → 캐시 확인                                          │
│    → playTTSWithBellSequential()                        │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│   오프라인 캐시      │         │    서버 캐시         │
│   (IndexedDB)       │         │  (Azure Blob)       │
│  순수 TTS 오디오     │         │  순수 TTS 오디오     │
└─────────────────────┘         └─────────────────────┘
```

### 재생 흐름

1. 사용자가 토픽 재생 요청
2. TTS 엔진이 캐시 확인
3. 캐시에서 순수 TTS 오디오 로드
4. **종소리 생성 및 재생**
5. **TTS 오디오 재생**

## 변경 사항

### v1.0.0 (2026-02-05)

#### 추가
- 순수 TTS 캐싱 아키텍처
- 개별 캐시 삭제/재생성 기능
- 캐시 상태 시각화

#### 변경
- 종소리 재생 로직 단순화 (`hasBell` 제거)
- 캐시 메타데이터 스키마 간소화

#### 제거
- `hasBell` 캐시 메타데이터 필드
- 조건부 종소리 재생 분기 로직

상세 내용은 [CHANGELOG.md](./CHANGELOG.md)를 참조하세요.

## 기술 스택

- **Obsidian**: 플러그인 플랫폼
- **Web Audio API**: 종소리 실시간 생성
- **IndexedDB**: 오프라인 캐시 저장소
- **Azure Blob Storage**: 서버 캐시 저장소
- **Azure Speech Service**: TTS 생성

## 테스트

### 수용 기준

모든 수용 기준은 [acceptance.md](../acceptance.md)에 정의되어 있습니다:

- UC-01: 캐시된 토픽 재생 시 종소리 재생
- UC-02: 개별 캐시 삭제
- UC-03: 개별 캐시 재생성
- UC-04: 캐시 상태 시각화
- UC-05: 대량 작업
- UC-06: 오프라인 모드

### 테스트 실행

테스트는 다음과 같이 실행합니다:

```bash
# 단위 테스트
npm test -- views/tts-engine/view.test.js

# 통합 테스트
npm test -- integration/cache-management.test.js

# E2E 테스트
npm test -- e2e/tts-bell-playback.test.js
```

## 참고 자료

### 관련 SPEC

- SPEC-OBSIDIAN-TTSV5-SYNC-001: TTS v5 동기화
- SPEC-TTS-AUTOMOVE-001: TTS 자동 이동
- SPEC-TABLET-BUTTON-001: 태블릿 버튼

### 외부 참고

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Azure Speech Service](https://docs.microsoft.com/azure/cognitive-services/speech-service/)

## 라이선스

이 프로젝트는 내부용으로 개발되었습니다.

---

**SPEC ID**: SPEC-OBSIDIAN-TTS-BELL-CACHE-001
**상태**: ✅ 완료 (COMPLETED)
**완료일**: 2026-02-05
