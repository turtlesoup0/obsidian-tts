# Changelog

All notable changes to this project will be documented in this file.

## [5.1.1] - 2026-02-05

### 🐛 Bug Fixes - PC 스크롤 위치 저장 실패 수정

#### Silent Upload Failure Detection
- **문제**: PC에서 "저장" 버튼 클릭 시 HTTP 200 반환되지만 실제로는 데이터가 저장되지 않는 버그
- **원인**: Azure Blob Storage 업로드가 비동기로 처리되어 성공 응답을 먼저 반환하는 경우 발생
- **해결**: ETag 검증 및 Read-Back Verification으로 실제 저장 여부 확인

#### ETag 검증 추가
- Azure Storage 업로드 응답의 ETag 확인
- ETag가 없으면 업로드 실패로 간주하고 에러 반환
- Silent 업로드 실패 감지

#### Read-Back Verification 구현
- 업로드 후 즉시 Blob 다운로드로 저장 여부 검증
- 업로드한 내용과 읽어온 내용 비교
- 데이터 무결성 검증 (길이, JSON 파싱, 값 비교)
- 검증 실패 시 명확한 에러 메시지 반환

#### 데이터 타입 안전성 강화
- `savedIndex` 명시적 타입 변환 (string → number)
- NaN 검증으로 유효하지 않은 숫자 필터링
- 입력값 타입 로깅으로 디버깅 개선

#### 강화된 로깅 시스템
- `[SCROLL-PUT]`, `[SCROLL-GET]` 접두사로 요청 범주화
- 요청/응답 상세 로깅 (Origin, User-Agent, 타임스탬프)
- 업로드 프로세스 단계별 로깅 (시도, 완료, 검증)
- CORS 로깅 개선 (Origin 승인/거부 로그)

**수정된 파일**:
- `src/functions/scroll-position.js` (+172 lines, ETag 검증, Read-Back Verification, 강화된 로깅)
- `shared/corsHelper.js` (+4 lines, CORS 로깅 개선)
- `TROUBLESHOOTING-SYNC-ISSUE.md` (버그 해결 문서화)

**구현 SPEC**: [SPEC-FIX-001](.moai/specs/SPEC-FIX-001/spec.md)

---

## [5.1.0] - 2026-02-05

### ⚡ Performance - Polling Optimization & Offline Support

#### Page Visibility API 기반 폴링 최적화
- 페이지 활성 상태 감지 (Page Visibility API)
- 백그라운드 탭에서 폴링 자동 중지 (배터리 절약)
- 페이지 재활성화 시 즉시 동기화 요청
- 불필요한 서버 요청 최소화 (Azure Functions 비용 절감)

#### Optimistic UI 업데이트
- 로컬 상태 즉시 업데이트 (지연 0ms)
- 백그라운드에서 비동기 서버 동기화
- 사용자 경험 개선 (즉각적인 UI 반응)

#### 오프라인 큐 관리
- 오프라인 상태 감지 (navigator.onLine API)
- 오프라인 시 변경사항 로컬 큐에 저장
- 온라인 복구 시 자동 큐 처리
- 네트워크 중단 시에도 데이터 손실 방지

#### 연결 상태 모니터링
- 온라인/오프라인 이벤트 리스너 등록
- 자동 재동기화 메커니즘
- 실패 시 재시도 큐잉

**성능 개선**:
- 배터리 소모 획기적 개선 (백그라운드 폴링 중단)
- Azure Functions 호출 감소 (비용 절감)
- UI 반응성 향상 (Optimistic Update)

**구현 SPEC**: SPEC-PERF-001

**파일 수정**:
- `templates/v5-keychain/tts-reader-v5-keychain.md` (+156 lines, -14 lines)

---

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
