# 📦 TTS v5.0.0 Keychain 템플릿

> **Obsidian 1.11.5 이상 필요** - Keychain API 지원

---

## 📁 포함된 파일

| 파일명 | 설명 | 용도 |
|--------|------|------|
| `tts-reader-v5-keychain.md` | TTS 메인 노트 | 실제 TTS 재생 노트 |
| `keychain-setup-guide.md` | Keychain 설정 가이드 | 상세 설정 방법 |
| `keychain-setup-checklist.md` | 설정 체크리스트 | 5분 빠른 시작 |
| `v5-upgrade-guide.md` | 업그레이드 가이드 | v4→v5 마이그레이션 |

---

## 🚀 빠른 시작 (5분)

### 1단계: Keychain에 민감정보 등록

```
Obsidian Settings → About → Keychain
```

등록할 키 (3개):
1. **Key name**: `azure-function-url`
   **Password**: Azure Function URL (예: `https://your-app.azurewebsites.net`)

2. **Key name**: `azure-tts-free-key`
   **Password**: Azure Speech 무료 API 키

3. **Key name**: `azure-tts-paid-key` (선택)
   **Password**: Azure Speech 유료 API 키

### 2단계: 템플릿 복사

```bash
# Obsidian vault로 이동
cd /path/to/your/obsidian/vault

# TTS 메인 노트 복사
cp /path/to/templates/v5-keychain/tts-reader-v5-keychain.md "TTS Reader v5.md"

# 설정 가이드 복사 (선택)
cp /path/to/templates/v5-keychain/keychain-setup-guide.md .
cp /path/to/templates/v5-keychain/keychain-setup-checklist.md .
```

### 3단계: 재생 테스트

1. `TTS Reader v5.md` 파일 열기
2. 콘솔(F12)에서 확인:
   ```
   ✅ Keychain에서 민감정보 로드 완료
      - Azure Function URL: 등록됨 (Keychain)
      - 무료 API 키: 등록됨 (Keychain)
   ```
3. "재생 시작" 버튼 클릭

---

## 🔐 보안 이점

### v4 vs v5 비교

| 항목 | v4 (하드코딩) | v5 (Keychain) |
|------|---------------|---------------|
| API 키 저장 | 노트 파일 내 | Keychain 암호화 |
| Git 안전성 | ⚠️ 수동 관리 필요 | ✅ 자동 분리 |
| Azure URL 노출 | ⚠️ 노출됨 | ✅ 숨김 |
| 노트 수정 필요 | ❌ 매번 수정 | ✅ 수정 불필요 |
| 여러 Vault 사용 | ⚠️ 복사 필요 | ✅ 키 재사용 |

---

## 📚 상세 문서

### 신규 사용자
1. **체크리스트 확인**: `keychain-setup-checklist.md`
2. **상세 가이드**: `keychain-setup-guide.md`
3. **메인 노트 사용**: `tts-reader-v5-keychain.md`

### v4 사용자
1. **마이그레이션 가이드**: `v5-upgrade-guide.md`
2. v4 노트에서 API 키 복사
3. Keychain에 등록
4. v5 노트로 전환

---

## 🛠️ 문제 해결

### "Keychain API를 사용할 수 없습니다" 오류

**원인**: Obsidian 버전 1.11.5 미만

**해결**:
```
Settings → About → Current version 확인
Help → Check for updates
```

### "Keychain에 저장된 정보가 없습니다" 경고

**원인**: 키 등록하지 않음 또는 키 이름 오타

**해결**:
1. Settings → About → Keychain
2. 키 이름 정확히 입력:
   - `azure-function-url` (하이픈, 소문자)
   - `azure-tts-free-key`
   - `azure-tts-paid-key`

### API 호출 실패 (401/403)

**원인**: 잘못된 API 키 또는 만료

**해결**:
1. Azure Portal에서 키 확인
2. 필요시 키 재생성
3. Keychain에 새 키 등록 (덮어쓰기)

---

## 🌟 주요 기능

### v5.0.0에서 유지되는 기능

- ✅ Azure Blob Storage 캐시 공유
- ✅ 오프라인 캐시 (IndexedDB)
- ✅ 디바이스 간 재생 위치 동기화
- ✅ 볼드 텍스트 강조
- ✅ 발음 최적화 (40+ 기술 약어)
- ✅ iOS 잠금 화면 연속 재생
- ✅ 재생 속도 조절

### v5.0.0 신규 기능

- 🔐 Keychain 통합
- 🛡️ 민감정보 완전 분리
- 🔑 자동 API 키 로드
- ✅ Git 안전성 개선

---

## 📞 지원

- **이슈 보고**: [GitHub Issues](https://github.com/turtlesoup0/obsidian-tts/issues)
- **문서**: [프로젝트 README](../../README.md)
- **빠른 시작**: [QUICK-START-GUIDE](../../QUICK-START-GUIDE.md)

---

**버전**: 5.0.0
**릴리스 날짜**: 2026-01-30
**Obsidian 요구사항**: 1.11.5+
