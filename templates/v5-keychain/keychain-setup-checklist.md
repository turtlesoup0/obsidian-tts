---
해시태그: "#검색제외"
---

# ✅ Keychain 설정 체크리스트 (TTS v5.0.0)

## 🎯 빠른 시작 (5분 완료)

### ☑️ Step 1: Obsidian 버전 확인
- [ ] Settings → About → Current version 확인
- [ ] Obsidian **1.11.5 이상** 사용 중
- [ ] 아니면 업데이트: Help → Check for updates

### ☑️ Step 2: v4 노트에서 민감정보 복사

`TTS 출제예상 읽기 v4 (Enhanced).md` 파일 열기:

- [ ] **Line 548**: `azureFunctionUrl` 값 복사
  ```
  예시: https://your-function-app.azurewebsites.net
  ```

- [ ] **Line 553**: `azureFreeApiKey` 값 복사
  ```
  예시: YOUR_AZURE_FREE_API_KEY_88_CHARACTERS
  ```

- [ ] **Line 554**: `azurePaidApiKey` 값 복사 (있으면)
  ```
  예시: YOUR_AZURE_PAID_API_KEY_88_CHARACTERS
  ```

### ☑️ Step 3: Keychain에 등록

**Settings → About → Keychain** 메뉴 열기:

#### 1️⃣ Azure Function URL 등록:
- [ ] Key name: `azure-function-url` (정확히 입력)
- [ ] Password: 복사한 `azureFunctionUrl` 붙여넣기
- [ ] **Set** 버튼 클릭

#### 2️⃣ 무료 API 키 등록:
- [ ] Key name: `azure-tts-free-key` (정확히 입력)
- [ ] Password: 복사한 `azureFreeApiKey` 붙여넣기
- [ ] **Set** 버튼 클릭

#### 3️⃣ 유료 API 키 등록 (선택):
- [ ] Key name: `azure-tts-paid-key` (정확히 입력)
- [ ] Password: 복사한 `azurePaidApiKey` 붙여넣기
- [ ] **Set** 버튼 클릭

### ☑️ Step 4: 동작 확인

- [ ] `TTS 출제예상 읽기 v5 (Keychain).md` 파일 열기
- [ ] 개발자 콘솔 열기 (F12 또는 Cmd+Option+I)
- [ ] 다음 메시지 확인:
  ```
  ✅ Keychain에서 민감정보 로드 완료
     - Azure Function URL: 등록됨 (Keychain)
     - 무료 API 키: 등록됨 (Keychain)
     - 유료 API 키: 등록됨 (Keychain)
  ```

### ☑️ Step 5: 재생 테스트

- [ ] "재생 시작" 버튼 클릭
- [ ] 정상적으로 TTS 재생됨
- [ ] 콘솔에 에러 없음

---

## 🔐 등록 정보 요약

| 키 이름 | 용도 | 예시 값 |
|---------|------|---------|
| `azure-function-url` | Azure Function 엔드포인트 | https://your-app.azurewebsites.net |
| `azure-tts-free-key` | 무료 Speech API 키 | DKSJfXU1Ll8e... (88자) |
| `azure-tts-paid-key` | 유료 Speech API 키 (선택) | 8oO5DXpYVVIA... (88자) |

---

## ⚠️ 주의사항

### ✅ 올바른 키 이름:
- `azure-function-url` (하이픈 사용, 소문자)
- `azure-tts-free-key` (하이픈 사용, 소문자)
- `azure-tts-paid-key` (하이픈 사용, 소문자)

### ❌ 잘못된 키 이름:
- `azure_function_url` (언더스코어 ❌)
- `AzureFunctionURL` (대문자 ❌)
- `azure-function-url ` (끝에 공백 ❌)

---

## 🛠️ 문제 해결

### ❌ "Keychain에 저장된 정보가 없습니다"

**확인 사항**:
1. 키 이름 정확히 입력했는지 (대소문자, 하이픈)
2. Password 필드에 값 입력했는지
3. Set 버튼 클릭했는지

**해결**:
- Settings → About → Keychain에서 다시 등록
- 키 이름을 복사-붙여넣기로 입력 (오타 방지)

### ❌ "API 엔드포인트 유효성 검사" 오류

**원인**: `azure-function-url`이 등록되지 않음

**해결**:
1. v4 노트에서 `azureFunctionUrl` 값 확인
2. Keychain에 `azure-function-url` 키로 등록
3. v5 노트 새로고침

### ❌ TTS 재생 시 401/403 오류

**원인**: API 키가 잘못되었거나 만료됨

**해결**:
1. Azure Portal에서 API 키 재확인
2. 필요시 키 재생성
3. Keychain에 새 키 등록 (동일한 키 이름으로 덮어쓰기)

---

## 📱 여러 PC에서 사용 시

Keychain은 PC별로 관리되므로, 각 PC에서 개별 등록 필요:

### PC 1 (메인):
- [x] Keychain 등록 완료
- [x] v5 노트로 재생 테스트

### PC 2 (서브):
- [ ] 동일한 키를 다시 등록
- [ ] azure-function-url
- [ ] azure-tts-free-key
- [ ] azure-tts-paid-key (선택)

### 모바일 (iPad/iPhone):
- [ ] Obsidian Mobile 1.11.5+ 업데이트
- [ ] Keychain 등록 (PC와 동일한 값)
- [ ] v5 노트로 재생 테스트

> **💡 Tip**: 보안상 클라우드 동기화되지 않는 것이 의도된 설계입니다.

---

## ✅ 완료 후 체크

설정 완료 후 다음 사항 확인:

- [ ] v5 노트에서 정상 재생됨
- [ ] 콘솔에 "✅ Keychain에서 민감정보 로드 완료" 메시지 표시
- [ ] 서버 캐시 정상 작동 (두 번째 재생 시 빠름)
- [ ] 재생 위치 동기화 작동 (다른 PC에서 이어서 재생)
- [ ] v4 노트는 백업용으로 보관

---

## 📞 추가 도움말

- **상세 가이드**: [Keychain 설정 가이드.md](Keychain%20설정%20가이드.md)
- **마이그레이션**: [v5 업그레이드 안내.md](v5%20업그레이드%20안내.md)
- **메인 노트**: [TTS 출제예상 읽기 v5 (Keychain).md](TTS%20출제예상%20읽기%20v5%20(Keychain).md)

---

**작성일**: 2026-01-30
**소요 시간**: 약 5분
**난이도**: ⭐⭐ (쉬움)
