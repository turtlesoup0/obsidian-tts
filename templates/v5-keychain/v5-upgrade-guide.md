---
해시태그: "#검색제외"
---

# 🔐 TTS v5.0.0 업그레이드 안내

## 📌 주요 변경사항

**v4.3.0 → v5.0.0**: Keychain 통합으로 보안 강화

### 🆕 새로운 기능:

- **🔐 Keychain 통합**: API 키를 Obsidian Keychain에 안전하게 저장
- **🛡️ 민감정보 분리**: 노트 파일에서 API 키 완전 제거
- **🔑 자동 연동**: 플러그인 재시작 없이 즉시 적용
- **✅ Git 안전**: API 키가 커밋에 포함되지 않음

---

## 🚀 빠른 시작

### 1. Keychain에 민감정보 등록

```
Settings → About → Keychain
```

등록할 키:
- **Key name**: `azure-function-url`
  **Password**: (Azure Function URL, 예: https://your-app.azurewebsites.net)

- **Key name**: `azure-tts-free-key`
  **Password**: (Azure Speech 무료 API 키)

- **Key name**: `azure-tts-paid-key`
  **Password**: (Azure Speech 유료 API 키, 선택)

### 2. v5 노트 사용

기존 v4 대신 다음 파일 사용:
- `TTS 출제예상 읽기 v5 (Keychain).md`

### 3. 동작 확인

1. v5 노트 열기
2. 콘솔(F12)에서 확인:
   ```
   ✅ Keychain에서 API 키 로드 완료
   ```

---

## 📂 파일 구성

| 파일명 | 설명 |
|--------|------|
| `TTS 출제예상 읽기 v5 (Keychain).md` | ⭐ 메인 TTS 노트 (Keychain 기반) |
| `TTS 출제예상 읽기 v4 (Enhanced).md` | 이전 버전 (백업용) |
| `Keychain 설정 가이드.md` | 📖 Keychain 상세 설정 방법 |
| `v5 업그레이드 안내.md` | 📋 이 문서 |

---

## ⚠️ 중요 사항

### Obsidian 버전 요구사항:

- **최소 버전**: Obsidian 1.11.5
- **확인 방법**: Settings → About → Current version
- **업데이트**: Help → Check for updates

### v4에서 마이그레이션:

1. ✅ **DO**: v4 노트에서 API 키 복사
2. ✅ **DO**: Keychain에 등록
3. ✅ **DO**: v5 노트로 전환
4. ❌ **DON'T**: v4 노트의 API 키 그대로 사용

---

## 🔄 버전 비교

| 기능 | v4.3.0 | v5.0.0 |
|------|--------|--------|
| API 키 저장 | 노트 내 하드코딩 | Keychain (암호화) |
| Git 안전성 | ⚠️ 수동 관리 필요 | ✅ 자동 분리 |
| 보안 수준 | 🟡 중간 | 🟢 높음 |
| 동기화 | ⚠️ 키도 함께 동기화 | ✅ 설정만 동기화 |
| 설정 방법 | 코드 수정 | UI에서 간편 등록 |

---

## 📖 상세 가이드

### 1. Keychain 설정

자세한 내용: [Keychain 설정 가이드.md](Keychain%20설정%20가이드.md)

- macOS Keychain Access 사용법
- Windows Credential Manager 사용법
- 문제 해결 방법

### 2. 마이그레이션 절차

v5 노트 내 "마이그레이션 가이드" 섹션 참조:
- API 키 복사 방법
- Keychain 등록 단계
- 동작 확인 방법

---

## 🛠️ 문제 해결

### Q: "Keychain에 저장된 API 키가 없습니다" 오류

**A**:
1. 키 이름 확인: `azure-tts-free-key` (정확히 입력)
2. Settings → About → Keychain에서 재등록
3. Obsidian 재시작 (선택)

### Q: Obsidian 1.11.5 미만 버전 사용 중

**A**:
- v4 노트 계속 사용 (Keychain 미지원)
- 또는 Obsidian 업데이트 권장

### Q: v5로 전환했는데 작동 안 됨

**A**:
1. 콘솔(F12) 열어서 에러 메시지 확인
2. `await window.testApiKey()` 실행하여 키 테스트
3. 필요시 v4로 롤백 후 재시도

---

## 🎯 다음 단계

### 1. 지금 바로 시작:

```
1. Settings → About → Keychain 열기
2. azure-function-url 등록 (Azure Function URL)
3. azure-tts-free-key 등록 (무료 API 키)
4. v5 노트로 재생 테스트
```

### 2. 추가 최적화 (선택):

- 유료 API 키 등록 (월 500만 자 무료 소진 시)
- 오프라인 캐시 관리 (Settings에서 설정)
- 여러 PC에서 Keychain 개별 등록

---

## 📞 문의 및 피드백

- 버그 발견: v5 노트 하단 "버그 리포트" 섹션 참조
- 기능 요청: 개발자 콘솔(F12) 로그와 함께 제보

---

**버전**: 5.0.0
**업그레이드 날짜**: 2026-01-30
**권장 조치**: ⭐ 지금 바로 Keychain 등록하세요!
