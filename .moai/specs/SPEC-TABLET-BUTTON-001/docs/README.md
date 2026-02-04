# SPEC-TABLET-BUTTON-001: 태블릿 버튼 표시 Race Condition 수정

## 개요

이 프로젝트는 iPad/iPhone(고성능 디바이스)에서 발생하는 TTS 버튼 표시 문제를 해결합니다. Obsidian Dataview 플러그인의 비동기 렌더링 특성으로 인한 Race Condition을 수정하여 모든 플랫폼에서 일관된 UI를 제공합니다.

## 문제 설명

### 현상
- iPad M1, iPhone(고성능) 디바이스에서 "저장", "이동", "TTS" 버튼이 표시되지 않음
- Android Tablet(저사양)과 Desktop에서는 정상 작동

### 원인
```
querySelector('tbody tr') 가 <tbody>만 존재해도 true 반환
    ↓
고성능 디바이스에서 <tr> 추가 전에 initUI() 호출
    ↓
rows.length === 0 → early return → 버튼 미생성
```

## 해결 방안

### 핵심 수정 사항

1. **안전한 행 감지 로직**
   - `<tbody>`와 `<tr>`을 분리 확인
   - `rows.length > 0` 명시적 체크

2. **개선된 MutationObserver**
   - 각 단계별 null 체크
   - 실제 행 개수 확인

3. **초기화 스케줄링**
   - `requestIdleCallback`/`setTimeout` 폴백 유지
   - 재시도 메커니즘 추가

## 기술 스택

- **대상 플랫폼**: Obsidian (Electron, Capacitor)
- **주요 API**: MutationObserver, requestIdleCallback
- **테스트 환경**: iPad, iPhone, Android Tablet, Desktop

## 파일 구조

```
views/integrated-ui/
├── view.js                           (수정 대상)
├── __tests__/
│   ├── view.characterization.test.js (기존 테스트)
│   └── view.race-condition.test.js   (새로운 테스트)
```

## 품질 지표

| 지표 | 목표 | 결과 |
|-----|------|------|
| Race Condition 해결 | 100% | 완료 |
| Null Safety | 완전 | 달성 |
| Platform Compatibility | 개선 | 향상 |
| Code Coverage | 85%+ | 충족 |
| LSP Errors | 0 | 충족 |

## 사용 방법

### 설치
이 수정은 `views/integrated-ui/view.js` 파일에 직접 적용됩니다.

### 검증
```bash
# 테스트 실행
npm test -- views/integrated-ui/__tests__

# 특정 테스트 시나리오
npm test -- --testNamePattern="iPad 고성능"
```

## 관련 문서

- [기술 보고서](./technical-report.md) - Race Condition 상세 분석
- [테스트 가이드](./testing-guide.md) - Obsidian 크로스 플랫폼 테스트 방법
- [변경 로그](./CHANGELOG.md) - 상세 변경사항

## 라이선스

Apache-2.0

---

마지막 업데이트: 2026-02-04
