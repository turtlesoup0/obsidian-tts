# 📘 Obsidian TTS 사용자 온보딩 개선 방안

> **목표**: 프로젝트 구조를 잘 모르는 사용자도 5분 안에 TTS를 사용할 수 있도록 개선

---

## 🎯 현재 문제점

### 1. 복잡한 초기 설정
- ❌ README와 여러 문서를 찾아 읽어야 함
- ❌ Azure Function URL을 수동으로 여러 파일에 복사해야 함
- ❌ Dataview 노트 템플릿 찾기 어려움
- ❌ 샘플 노트가 프로젝트 구조에 묻혀 있음

### 2. 설정 파일 분산
- ❌ TTS-V4-FRONTEND-TEMPLATE.md 내에 하드코딩된 URL
- ❌ 각 사용자가 템플릿을 수정해야 함
- ❌ Git 업데이트 시 설정 충돌 가능

### 3. 문서 탐색 어려움
- ❌ README.md가 너무 기술적
- ❌ 빠른 시작 가이드 부재
- ❌ 단계별 가이드 없음

---

## ✅ 해결 방안

### Phase 1: 설정 파일 분리 (완료)

#### 1.1 Properties 파일 기반 설정 ✅
- `config.properties.example` 생성
- `.gitignore`에 `config.properties` 추가
- 사용자별 설정 파일 분리

**파일 구조**:
```
obsidian-tts/
├── config.properties.example    # Git 추적
├── config.properties             # Git 무시 (사용자별)
├── .gitignore
└── shared/
    └── configLoader.js           # 설정 로드 모듈
```

**장점**:
- ✅ Git 업데이트 시 설정 보존
- ✅ 민감 정보 보호
- ✅ 단일 설정 파일

#### 1.2 Obsidian 노트 기반 설정 ✅
- `obsidian-tts-config.md` 자동 생성
- Dataview로 설정 로드
- TTS Reader가 자동으로 참조

**파일 구조**:
```
Your-Obsidian-Vault/
├── obsidian-tts-config.md       # Git 무시 (자동 생성)
├── TTS Reader.md                 # 템플릿에서 복사
└── .gitignore                    # 자동 업데이트
```

**장점**:
- ✅ Obsidian 내에서 설정 변경 가능
- ✅ GUI 기반 설정 편집
- ✅ 템플릿 업데이트 시 설정 유지

---

### Phase 2: 자동 설정 스크립트 (완료)

#### 2.1 setup-obsidian.sh ✅
**기능**:
1. Obsidian vault 자동 감지
2. Azure Function URL 입력 받기
3. 노트 경로 설정
4. `obsidian-tts-config.md` 자동 생성
5. `.gitignore` 자동 업데이트
6. TTS Reader 템플릿 다운로드

**사용 방법**:
```bash
cd /path/to/your/obsidian/vault
curl -O https://raw.githubusercontent.com/turtlesoup0/obsidian-tts/main/scripts/setup-obsidian.sh
chmod +x setup-obsidian.sh
./setup-obsidian.sh
```

**대화형 설정**:
```
🚀 Obsidian TTS 자동 설정을 시작합니다...

✅ Obsidian vault 감지됨

📝 Azure Function URL을 입력하세요:
   예: https://obsidian-tts-func.azurewebsites.net
URL: [사용자 입력]

📝 TTS를 사용할 노트가 있는 폴더 경로를 입력하세요 (vault 루트 기준):
   예: 1_Project/Study
경로: [사용자 입력]

✅ 설정 파일 생성 완료: obsidian-tts-config.md
✅ .gitignore에 설정 파일 추가됨
✅ TTS Reader 템플릿 다운로드 완료

🎉 설정이 완료되었습니다!
```

---

### Phase 3: 문서 개선 (완료)

#### 3.1 QUICK-START-GUIDE.md ✅
**구조**:
1. 사전 요구사항 체크리스트
2. Azure 리소스 생성 (CLI 명령 제공)
3. Obsidian 설정 (자동 + 수동)
4. 첫 TTS 노트 만들기
5. 문제 해결

**특징**:
- ✅ 복사 가능한 CLI 명령
- ✅ 단계별 스크린샷 (향후 추가)
- ✅ 문제 해결 섹션
- ✅ 5분 완료 목표

#### 3.2 README.md 개선 (계획)
**변경사항**:
- 기술적 세부사항 → 별도 문서로 이동
- 상단에 "빠른 시작" 링크 추가
- 비디오 튜토리얼 링크 (향후)

---

### Phase 4: 템플릿 제공 (완료)

#### 4.1 샘플 노트 ✅
**파일**: `templates/sample-tts-note.md`

**내용**:
- TTS 개념 설명
- 볼드 강조 예제
- 긴 문장 테스트
- 기술 용어 테스트
- 숫자 읽기 테스트

**사용 방법**:
```bash
cp templates/sample-tts-note.md "Your-Vault/My First TTS Note.md"
```

#### 4.2 TTS Reader 템플릿 (계획)
**파일**: `templates/tts-reader.md`

**변경사항**:
- 하드코딩된 URL 제거
- `window.ObsidianTTSConfig` 참조
- 설정 파일 자동 로드

**사용 방법**:
```bash
cp templates/tts-reader.md "Your-Vault/TTS Reader.md"
```

---

### Phase 5: Obsidian Community Plugin (향후 계획)

#### 5.1 플러그인 개발
**기능**:
1. **설정 UI**
   - Settings 탭에서 GUI로 설정
   - Azure Function URL 입력
   - 음성 선택 (드롭다운)
   - 캐시 설정

2. **TTS 리본 아이콘**
   - 사이드바에 TTS 아이콘
   - 클릭 시 TTS Reader 패널 열기
   - 노트 목록 자동 표시

3. **컨텍스트 메뉴**
   - 노트 우클릭 → "Read with TTS"
   - 선택한 텍스트 → "Read Selection"

4. **단축키 지원**
   - `Ctrl+Shift+P`: 재생/일시정지
   - `Ctrl+Shift+N`: 다음 노트
   - `Ctrl+Shift+S`: 정지

#### 5.2 플러그인 배포
**방법**:
1. Obsidian Community Plugin 등록
2. Plugin marketplace 게시
3. 자동 업데이트 지원

**장점**:
- ✅ 설정 GUI 제공
- ✅ Dataview 의존성 제거 가능
- ✅ 더 나은 UX
- ✅ 자동 업데이트

---

## 🛠️ 기술 스택

### 현재 구현 (Phase 1-4)
- **Backend**: Azure Functions (Node.js)
- **Frontend**: Obsidian Dataview (JavaScript)
- **설정**: Properties 파일 + Markdown 노트
- **배포**: Shell 스크립트

### 향후 구현 (Phase 5)
- **Plugin**: TypeScript
- **Build**: Rollup
- **Testing**: Jest
- **Publishing**: Obsidian Plugin API

---

## 📊 사용자 온보딩 플로우

### 현재 플로우 (개선 후)
```
1. README.md 읽기 (30초)
   ↓
2. QUICK-START-GUIDE.md로 이동 (10초)
   ↓
3. Azure 리소스 생성 (2분)
   ↓
4. setup-obsidian.sh 실행 (1분)
   ↓
5. 샘플 노트로 테스트 (1분)
   ↓
6. 🎉 완료! (총 5분)
```

### 향후 플로우 (Plugin 사용 시)
```
1. Obsidian Community Plugins 검색 (30초)
   ↓
2. "Obsidian TTS" 설치 및 활성화 (30초)
   ↓
3. Settings → Obsidian TTS → Azure Function URL 입력 (1분)
   ↓
4. TTS 아이콘 클릭 → 노트 선택 → 재생 (30초)
   ↓
5. 🎉 완료! (총 3분)
```

---

## 🎯 성공 지표

### 단기 목표 (1-2주)
- [ ] setup-obsidian.sh 사용률 > 80%
- [ ] 첫 재생까지 평균 시간 < 5분
- [ ] 설정 관련 이슈 감소 > 50%

### 중기 목표 (1-3개월)
- [ ] GitHub Stars > 100
- [ ] 활성 사용자 > 50명
- [ ] 문서 만족도 > 4.5/5

### 장기 목표 (6개월+)
- [ ] Obsidian Plugin 승인
- [ ] Plugin 다운로드 > 1000
- [ ] 활성 사용자 > 500명

---

## 🚀 다음 단계

### 즉시 실행 (완료)
- [x] config.properties.example 생성
- [x] configLoader.js 구현
- [x] .gitignore 업데이트
- [x] setup-obsidian.sh 작성
- [x] QUICK-START-GUIDE.md 작성
- [x] 샘플 노트 템플릿 생성

### 단기 실행 (1-2주)
- [ ] TTS Reader 템플릿 config 참조 방식으로 수정
- [ ] README.md 간소화 및 재구성
- [ ] 스크린샷 및 비디오 튜토리얼 제작
- [ ] dev 브랜치 테스트 및 main 머지

### 중기 실행 (1-3개월)
- [ ] Obsidian Plugin 개발 착수
- [ ] Plugin manifest 작성
- [ ] 기본 TTS 기능 구현
- [ ] 베타 테스터 모집

### 장기 실행 (6개월+)
- [ ] Plugin 고급 기능 추가
- [ ] Community Plugin 등록 신청
- [ ] 다국어 지원 (영어, 일본어 등)
- [ ] 음성 커스터마이징 기능

---

## 📝 참고 문서

- [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Dataview Plugin](https://github.com/blacksmithgu/obsidian-dataview)
- [Azure Functions Node.js](https://learn.microsoft.com/azure/azure-functions/functions-reference-node)

---

**작성일**: 2026-01-25
**작성자**: Claude (AI Assistant)
**버전**: 1.0
