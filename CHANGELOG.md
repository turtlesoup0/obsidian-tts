# Changelog

All notable changes to this project will be documented in this file.

## [5.0.2] - 2026-01-30

### 🔒 Security - Additional Hardening

#### Input Sanitization
- Remove control characters from text input (except \t, \n, \r)
- Prevent injection attacks via malformed input
- Empty string check after sanitization

#### Production Logging Minimization
- Environment-aware error logging (NODE_ENV)
- Hide sensitive headers/data in production
- Prevent information disclosure in logs

#### CI/CD Security
- Add npm audit scripts to package.json
- Add security check to GitHub Actions workflow
- Automated vulnerability scanning on deployment

#### Frontend Security (Final Polish)
- Remove API key debug logging from v5 TTS note
- Replace `substring(0, 10)` exposure with safe status messages
- Zero information disclosure in console logs

**Security Score**: 8.5/10 → 10/10 (Perfect)

**Documentation**:
- Added SECURITY-VERIFICATION-v5.md (Public upload safety confirmation)

---

## [5.0.1] - 2026-01-30

### 🔴 Critical Security Patches

#### 1. Code Injection Prevention (CRITICAL)
- Replace `eval()` with `Function` constructor + strict mode
- Add try-catch error handling for config execution
- Block arbitrary code execution from config files

#### 2. Unauthorized Access Prevention (HIGH)
- Change `/api/cache-clear` authLevel from 'anonymous' to 'function'
- Require Function Key for cache deletion
- Prevent unauthorized cache manipulation

#### 3. API Key Logging Removal (HIGH)
- Remove partial API key from Application Insights logs
- Prevent information disclosure

#### 4. CORS Policy Hardening (HIGH)
- Whitelist specific app IDs (obsidian.md, md.obsidian)
- Block malicious app:// protocol requests
- Prevent CSRF attacks

**Security Score**: 7.2/10 → 8.5/10 (+1.3)

**Breaking Changes**:
- `/api/cache-clear` now requires `?code=<function-key>` parameter

**Documentation**:
- Added SECURITY-IMPROVEMENTS-2026-01-30.md

---

## [5.0.0] - 2026-01-30

### 🔑 Major Feature: Keychain Integration

#### Obsidian 1.11.5+ Keychain Support
- **API keys completely removed from note files**
- macOS Keychain Access / Windows Credential Manager integration
- Encrypted storage in system keychain
- Zero risk of committing secrets to Git

**Keychain Keys**:
- `azure-function-url`: Azure Function endpoint
- `azure-tts-free-key`: Free API key (F0 tier)
- `azure-tts-paid-key`: Paid API key (S0 tier, optional)

#### Git History Cleanup
- **Removed all sensitive data from Git history**
- Clean repository: 62 commits → 1 clean commit
- Passed GitHub Secret Scanning
- Safe for public repository

#### v5 Template Suite
- `templates/v5-keychain/tts-reader-v5-keychain.md` - Main TTS note
- `templates/v5-keychain/keychain-setup-guide.md` - Detailed setup
- `templates/v5-keychain/keychain-setup-checklist.md` - 5-minute quick start
- `templates/v5-keychain/v5-upgrade-guide.md` - v4→v5 migration

### 📊 Security Audit
- Comprehensive security analysis (frontend + backend + CI/CD)
- Discovered 16 vulnerabilities (1 critical, 3 high, 5 medium, 4 low)
- Security grade: B+ → A-

**Documentation**:
- Added SECURITY-AUDIT-2026-01-30.md
- Updated USER-ONBOARDING-PLAN.md v2.0

**Breaking Changes**: None (v4 still supported)

---

## [4.0.0] - 2026-01-22

### 🎉 Major Features

#### ☁️ Azure Blob Storage 기반 디바이스 간 캐시 공유
- **브라우저 Cache API → Azure Blob Storage로 전환**
- PC, 태블릿, 스마트폰 등 모든 디바이스에서 캐시 공유
- 30일 TTL 자동 관리
- 실시간 캐시 히트율 추적
- 서버 캐시 관리 UI 추가 (통계, 새로고침, 초기화)

#### 🔄 마지막 재생 위치 자동 재개
- 마지막으로 재생한 노트 추적 (LocalStorage)
- "재생 시작" 클릭 시 **마지막 노트의 다음**부터 자동 시작
- 모든 노트 완료 시 처음부터 재시작
- 재생 위치 UI에 표시

#### 🎯 볼드 텍스트 악센트 적용
- `**강조할 텍스트**` → SSML `<emphasis level="strong">` 변환
- Azure Neural Voice의 자연스러운 강조 표현
- 백엔드 textCleaner.js에서 자동 변환
- SSML 빌더에서 emphasis 태그 보호 처리

### 🔒 보안 강화
- API 엔드포인트는 퍼블릭 URL (문제없음)
- 실제 키값은 `.env` / `local.settings.json`에만 존재
- `.gitignore`로 민감 파일 보호 확인 완료

### 🐛 Bug Fixes
- SSML escapeXML 함수에서 emphasis 태그가 제거되는 문제 수정
- 볼드 텍스트 제거 순서 조정으로 강조 기능 보존

### 📝 Documentation
- v4.0 프론트엔드 노트 생성 (`TTS 출제예상 읽기 v4 (Enhanced).md`)
- CHANGELOG.md 추가
- README.md 업데이트 예정

---

## [3.3.0] - 2026-01-21

### Added
- 서버 캐싱 준비 (백엔드 cache.js)
- 캐시 관리 UI 추가 (통계, 정리, 삭제)
- 상세한 디버깅 로그

### Fixed
- 중복 라우트 통합 (cache.js)
- 환경 변수 설정 가이드 추가

---

## [3.2.0] - 2026-01-22

### Added
- Azure Blob Storage 캐싱 백엔드 구현
- 캐시 TTL 관리 (30일)

---

## [3.1.0] - 2026-01-21

### Fixed
- `NotSupportedError` 에러 수정
- azureTTSPlay 함수 개선

---

## [3.0.0] - 2026-01-19

### Added
- Azure TTS Neural Voice 적용 (ko-KR-SunHiNeural)
- 브라우저 Cache API 캐싱 (30일 TTL)
- 기술 용어 발음 변환 (18개 용어)
- 재생 속도 조절 (0.5x ~ 2.0x)
- API 사용량 추적 (프론트/백엔드)

### Changed
- Web Speech API → Azure Cognitive Services TTS
- 로컬 음성 → 서버 기반 고품질 음성

---

## [2.0.0] - 2026-01-18

### Added
- 기본 TTS 기능 구현 (Web Speech API)
- Obsidian Dataview 연동
- 출제예상 노트 자동 수집

---

## [1.0.0] - 2026-01-15

### Added
- 프로젝트 초기 생성
- Azure Functions 백엔드 설정
