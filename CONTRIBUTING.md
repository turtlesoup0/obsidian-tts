# 🤝 기여 가이드

Obsidian TTS 프로젝트에 기여해주셔서 감사합니다! 🎉

이 문서는 프로젝트에 효과적으로 기여하는 방법을 안내합니다.

---

## 📋 목차

- [행동 강령](#행동-강령)
- [기여 방법](#기여-방법)
- [개발 환경 설정](#개발-환경-설정)
- [코딩 스타일](#코딩-스타일)
- [커밋 메시지 가이드](#커밋-메시지-가이드)
- [Pull Request 프로세스](#pull-request-프로세스)
- [이슈 제보](#이슈-제보)

---

## 행동 강령

우리는 모든 기여자가 존중받는 환경을 만들고자 합니다:

- ✅ 서로 존중하고 건설적인 피드백을 제공합니다
- ✅ 다양한 관점과 경험을 환영합니다
- ✅ 초보자에게 친절하게 도움을 제공합니다
- ❌ 공격적이거나 차별적인 언어는 사용하지 않습니다

---

## 기여 방법

### 1. 코드 기여

- **버그 수정**: 이슈를 먼저 확인하거나 새로 생성한 후 수정
- **새 기능**: [Feature Request 이슈](../../issues/new?template=feature_request.yml)를 먼저 생성하여 논의
- **성능 개선**: 벤치마크 결과와 함께 제출
- **리팩토링**: 왜 필요한지 명확히 설명

### 2. 문서 기여

- 오타 수정
- 예제 추가
- 번역 (영어 → 한국어, 또는 다른 언어)
- 가이드 개선

### 3. 커뮤니티 지원

- [Discussions](../../discussions)에서 질문에 답변
- 이슈 재현 및 테스트
- 베타 테스터로 참여

---

## 개발 환경 설정

### 필수 요구사항

- **Node.js**: 18.x 이상
- **npm**: 9.x 이상
- **Azure CLI**: (배포 테스트 시)
- **Git**: 최신 버전

### 로컬 설정

```bash
# 1. 저장소 포크 및 클론
git clone https://github.com/YOUR-USERNAME/obsidian-tts.git
cd obsidian-tts

# 2. upstream 원격 저장소 추가
git remote add upstream https://github.com/turtlesoup0/obsidian-tts.git

# 3. 의존성 설치
npm install

# 4. 로컬 설정 파일 생성
cp local.settings.json.example local.settings.json
# local.settings.json에 Azure 키 입력

# 5. 로컬 서버 시작
npm start
```

### 브랜치 전략

```bash
# main 브랜치에서 최신 코드 가져오기
git checkout main
git pull upstream main

# 작업 브랜치 생성
git checkout -b feature/your-feature-name
# 또는
git checkout -b fix/bug-description
```

---

## 코딩 스타일

### JavaScript/Node.js

```javascript
// ✅ 좋은 예
async function generateTTS(text, options = {}) {
    const { voice = 'ko-KR-SunHiNeural', rate = 1.0 } = options;

    // 입력 검증
    if (!text || typeof text !== 'string') {
        throw new Error('Invalid text input');
    }

    // 로직 구현
    return await azureTTS.synthesize(text, voice, rate);
}

// ❌ 나쁜 예
function tts(t,v,r){
    return azureTTS.synthesize(t,v,r) // 에러 처리 없음
}
```

### 명명 규칙

- **변수/함수**: camelCase (`getUserData`, `isValid`)
- **상수**: UPPER_SNAKE_CASE (`API_ENDPOINT`, `MAX_RETRIES`)
- **클래스**: PascalCase (`CacheManager`, `TTSReader`)
- **파일명**: kebab-case (`cache-manager.js`, `tts-stream.js`)

### 주석

```javascript
// ✅ 좋은 주석: "왜"를 설명
// IndexedDB 재연결 필요: 일부 브라우저에서 연결이 끊어질 수 있음
await this.ensureConnection();

// ❌ 나쁜 주석: "무엇"을 반복
// 연결을 확인함
await this.ensureConnection();
```

---

## 커밋 메시지 가이드

### 형식

```
<타입>: <제목>

<본문> (선택)

<푸터> (선택)
```

### 타입

- `feat`: 새로운 기능
- `fix`: 버그 수정
- `docs`: 문서만 수정
- `style`: 코드 의미 변경 없음 (포맷팅, 세미콜론 등)
- `refactor`: 리팩토링
- `perf`: 성능 개선
- `test`: 테스트 추가/수정
- `chore`: 빌드, 설정 변경

### 예제

```bash
# 좋은 커밋 메시지
feat: 볼드 텍스트 음성 강조 기능 추가

SSML prosody 태그를 사용하여 **굵은 글씨**에
자동으로 강조 효과를 적용합니다.

Closes #42

# 나쁜 커밋 메시지
update code
fixed bug
asdf
```

---

## Pull Request 프로세스

### 1. PR 생성 전 체크리스트

- [ ] 코드가 정상적으로 동작합니다
- [ ] 기존 테스트가 모두 통과합니다
- [ ] 새로운 기능에 대한 테스트를 추가했습니다 (해당 시)
- [ ] 문서를 업데이트했습니다 (해당 시)
- [ ] 커밋 메시지가 가이드를 따릅니다
- [ ] `.gitignore`에 민감한 정보가 포함되지 않았습니다

### 2. PR 생성

```bash
# 작업 완료 후 푸시
git push origin feature/your-feature-name
```

GitHub에서 Pull Request 생성:
- 제목은 명확하고 간결하게
- 템플릿의 모든 섹션을 작성
- 스크린샷 첨부 (UI 변경 시)

### 3. 코드 리뷰

- 리뷰어의 피드백에 건설적으로 응답
- 요청된 변경사항을 반영
- CI 테스트가 모두 통과하는지 확인

### 4. 머지

- 리뷰 승인 후 maintainer가 머지합니다
- `Squash and merge` 또는 `Rebase and merge` 사용

---

## 이슈 제보

### 버그 리포트

[버그 리포트 템플릿](../../issues/new?template=bug_report.yml) 사용:

1. **재현 방법**: 단계별로 상세히 작성
2. **예상 동작**: 어떻게 동작해야 하는지
3. **실제 동작**: 실제로는 어떻게 되는지
4. **환경**: OS, 버전, 브라우저 등
5. **로그**: 에러 메시지, 콘솔 로그

### 기능 제안

[기능 제안 템플릿](../../issues/new?template=feature_request.yml) 사용:

1. **문제**: 해결하고 싶은 문제
2. **해결 방법**: 제안하는 방법
3. **대안**: 다른 접근 방법
4. **우선순위**: 얼마나 중요한지

---

## 테스트

### 백엔드 테스트

```bash
# 로컬에서 Azure Functions 실행
npm start

# API 테스트
curl -X POST http://localhost:7071/api/tts-stream \
  -H "Content-Type: application/json" \
  -d '{"text":"안녕하세요","voice":"ko-KR-SunHiNeural"}'
```

### 프론트엔드 테스트

1. Obsidian에서 `templates/tts-reader.md` 복사
2. 샘플 노트로 재생 테스트
3. 브라우저 개발자 도구(F12)에서 에러 확인

---

## 라이선스

기여하신 모든 코드는 [MIT License](LICENSE)에 따라 배포됩니다.

---

## 질문이 있으신가요?

- **사용 방법**: [Discussions](../../discussions) Q&A 섹션
- **버그/기능**: [Issues](../../issues)
- **실시간 대화**: (Discord/Slack 링크 - 추후 추가)

---

**다시 한번 감사드립니다!** 🙏

여러분의 기여로 Obsidian TTS가 더 좋아집니다! 🚀
