---
해시태그: "#검색제외"
---

# 🔐 Obsidian Keychain 설정 가이드

## 📌 개요

Obsidian 1.11.5 버전부터 Keychain 기능이 추가되어 API 키, 비밀번호 등 민감한 정보를 안전하게 저장할 수 있습니다.

이 가이드는 Azure TTS v5.0.0에서 사용하는 API 키를 Keychain에 등록하는 방법을 설명합니다.

---

## 🔑 등록할 키 목록

TTS v5.0.0에서 사용하는 키:

| 키 이름 | 설명 | 필수 여부 |
|---------|------|-----------|
| `azure-function-url` | Azure Function 엔드포인트 URL | ✅ 필수 |
| `azure-tts-free-key` | Azure Speech 무료 API 키 (F0 tier) | ✅ 필수 |
| `azure-tts-paid-key` | Azure Speech 유료 API 키 (S0 tier) | ⭕ 선택 |

---

## 📝 Keychain 등록 방법

### 1단계: Settings 열기

1. Obsidian 좌측 하단의 **⚙️ Settings** 아이콘 클릭
2. 또는 단축키: `Cmd + ,` (macOS) / `Ctrl + ,` (Windows)

### 2단계: About 메뉴로 이동

1. Settings 왼쪽 메뉴에서 **About** 클릭
2. 아래로 스크롤하여 **Keychain** 섹션 찾기

### 3단계: 민감정보 등록

#### Azure Function URL 등록:

1. **Key name** 입력란에 정확히 입력: `azure-function-url`
2. **Password** 입력란에 Azure Function URL 입력
3. **Set** 버튼 클릭

예시:
```
Key name: azure-function-url
Password: https://your-function-app.azurewebsites.net
```

#### 무료 API 키 등록:

1. **Key name** 입력란에 정확히 입력: `azure-tts-free-key`
2. **Password** 입력란에 Azure Speech 무료 API 키 입력
3. **Set** 버튼 클릭

예시:
```
Key name: azure-tts-free-key
Password: YOUR_AZURE_FREE_API_KEY_88_CHARACTERS
```

#### 유료 API 키 등록 (선택사항):

1. **Key name** 입력란에 정확히 입력: `azure-tts-paid-key`
2. **Password** 입력란에 Azure Speech 유료 API 키 입력
3. **Set** 버튼 클릭

예시:
```
Key name: azure-tts-paid-key
Password: YOUR_AZURE_PAID_API_KEY_88_CHARACTERS
```

### 4단계: 등록 확인

1. 등록 후 Settings 닫기 (재시작 불필요)
2. TTS v5 노트 열기
3. 개발자 콘솔 열기 (F12 또는 `Cmd+Option+I`)
4. 다음 메시지 확인:
   ```
   ✅ Keychain에서 민감정보 로드 완료
      - Azure Function URL: 등록됨 (Keychain)
      - 무료 API 키: 등록됨 (Keychain)
      - 유료 API 키: 등록됨 (Keychain)
   ```

---

## 🔍 Keychain 저장 위치

Keychain에 저장된 데이터는 운영체제의 보안 저장소에 암호화되어 저장됩니다.

### macOS (Keychain Access)

1. **Keychain Access** 앱 실행
   - Spotlight 검색 (Cmd + Space) → "Keychain Access" 입력
2. 좌측에서 **login** 키체인 선택
3. 검색창에 `azure-tts` 입력
4. 등록된 키 확인:
   - `azure-tts-free-key` (Application password)
   - `azure-tts-paid-key` (Application password)

### Windows (Credential Manager)

1. **제어판** 열기
2. **Credential Manager** (자격 증명 관리자) 선택
3. **Windows 자격 증명** 탭 클릭
4. **일반 자격 증명** 섹션에서 확인:
   - `obsidian-azure-tts-free-key`
   - `obsidian-azure-tts-paid-key`

### Linux (Secret Service)

```bash
# Secret Service 확인
secret-tool search service obsidian attribute azure-tts-free-key
```

---

## 🛠️ 문제 해결

### ❌ "Keychain에 저장된 API 키가 없습니다" 오류

**원인**: 키 이름을 잘못 입력했거나 등록하지 않음

**해결**:
1. 키 이름이 정확한지 확인 (대소문자, 하이픈 포함)
   - ✅ 올바른 예: `azure-function-url`, `azure-tts-free-key`
   - ❌ 잘못된 예: `azure_function_url`, `AzureFunctionURL`
2. Settings → About → Keychain에서 다시 등록
3. 필수 키 확인:
   - `azure-function-url` (필수)
   - `azure-tts-free-key` (필수)

### ❌ "Keychain API를 사용할 수 없습니다" 오류

**원인**: Obsidian 버전이 1.11.5 미만

**해결**:
1. Obsidian 업데이트: Help → Check for updates
2. 또는 수동 다운로드: https://obsidian.md/download
3. 버전 확인: Settings → About → Current version

### ❌ API 키가 작동하지 않음

**원인**: 키가 잘못되었거나 만료됨

**해결**:
1. Azure Portal에서 키 확인
2. 키 재생성 후 Keychain에 다시 등록
3. TTS 노트에서 테스트:
   ```javascript
   await window.testApiKey()
   ```

---

## 🔄 키 변경/삭제 방법

### 키 변경:

1. Settings → About → Keychain
2. 동일한 **Key name**으로 새 **Password** 입력
3. **Set** 버튼 클릭 → 기존 값 덮어쓰기

### 키 삭제:

#### macOS:
1. Keychain Access 앱 실행
2. 키 검색 → 우클릭 → **Delete**

#### Windows:
1. Credential Manager 열기
2. 키 선택 → **제거** 클릭

---

## 🔐 보안 권장 사항

### ✅ 해야 할 것:

- Keychain에 API 키 저장 (Git 커밋에서 자동 제외)
- 각 PC에서 개별 등록 (동기화 금지)
- 정기적으로 Azure Portal에서 키 로테이션

### ❌ 하지 말아야 할 것:

- 노트 파일에 API 키 하드코딩
- Keychain 데이터를 클라우드 동기화
- 여러 사람과 같은 API 키 공유

---

## 📚 참고 자료

- [Obsidian 1.11.5 Release Notes](https://obsidian.md/changelog/2024-11-15-desktop-v1.11.5/)
- [Azure Speech Services 가격](https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/)
- [TTS v5.0.0 노트](TTS%20출제예상%20읽기%20v5%20(Keychain).md)

---

**작성일**: 2026-01-30
**대상 버전**: Obsidian 1.11.5+, TTS v5.0.0+
