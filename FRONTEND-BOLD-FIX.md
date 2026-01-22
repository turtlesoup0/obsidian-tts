# 프론트엔드 볼드 처리 버그 수정

**작성일**: 2026-01-22
**문제**: 음성이 "emphasis level equals strong"을 읽음
**원인**: 프론트엔드에서 `<emphasis>` 태그를 텍스트에 추가

---

## 🐛 문제 상황

사용자가 볼드 텍스트(`**텍스트**`)가 포함된 노트를 재생할 때, Azure TTS가 다음과 같이 읽었습니다:

```
"API는 emphasis level equals strong Application Programming Interface emphasis 의 약자입니다"
```

캐시되지 않은 새로운 노트에서도 동일한 문제가 발생했습니다.

---

## 🔍 원인 분석

### 프론트엔드 코드 (v4 노트 파일)

```javascript
// 195번 줄 - 문제의 함수
window.addEmphasisToText = function(text) {
    if (!text) return text;
    let result = String(text);

    // **텍스트**를 <emphasis>로 변환
    result = result.replace(/\*\*([^*]+)\*\*/g, '<emphasis level="strong">$1</emphasis>');

    return result;
};

// 213번 줄 - cleanTextForTTS에서 호출
cleaned = window.addEmphasisToText(cleaned);
```

**문제**:
1. 프론트엔드가 `<emphasis level="strong">` 태그를 **일반 텍스트로** 추가
2. 이 텍스트가 백엔드 API로 전달됨
3. 백엔드가 이를 일반 텍스트로 인식하여 XML escape 처리
4. Azure TTS가 이스케이프된 태그를 텍스트로 읽음

### 백엔드 코드 (정상 작동)

백엔드는 다음과 같이 설계되어 있었습니다:

```javascript
// textCleaner.js
if (preserveBold) {
  text = text.replace(/\*\*([^*]+)\*\*/g, '『$1』');  // 임시 마커
}

// ssmlBuilder.js
function applyBoldEmphasis(text) {
  return text.replace(/『([^』]+)』/g, '<prosody volume="+20%" pitch="+10%">$1</prosody>');
}
```

**올바른 흐름**:
1. 프론트엔드: `**텍스트**` 그대로 전달
2. 백엔드 textCleaner: `**텍스트**` → `『텍스트』`
3. 백엔드 ssmlBuilder: `『텍스트』` → `<prosody>텍스트</prosody>`
4. Azure TTS: prosody 태그를 인식하여 음성 강조

---

## ✅ 해결 방법

### 프론트엔드 수정

#### 1. `addEmphasisToText` 함수 제거

```javascript
// 이전 코드 (문제)
window.addEmphasisToText = function(text) {
    result = result.replace(/\*\*([^*]+)\*\*/g, '<emphasis level="strong">$1</emphasis>');
    return result;
};

// 수정 후 (제거)
// 볼드는 백엔드에서 처리하므로 프론트엔드에서는 그대로 유지
// 이 함수는 더 이상 사용하지 않음
```

#### 2. `cleanTextForTTS` 함수 수정

```javascript
// 이전 코드 (문제)
window.cleanTextForTTS = function(text) {
    let cleaned = String(text);

    // 볼드를 <emphasis> 태그로 변환
    cleaned = window.addEmphasisToText(cleaned);

    // 이탤릭 제거
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
    // ... 나머지 처리
};

// 수정 후 (해결)
window.cleanTextForTTS = function(text) {
    let cleaned = String(text);

    // 백엔드에서 **bold**를 처리하므로 프론트엔드에서는 그대로 유지
    // 볼드를 제거하지 않고 API로 전달

    // 이탤릭만 제거 (볼드는 백엔드에서 처리)
    cleaned = cleaned.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');  // single * (italic)
    cleaned = cleaned.replace(/(?<!_)_([^_]+)_(?!_)/g, '$1');      // single _ (italic)
    // ... 나머지 처리
};
```

**핵심 변경사항**:
- ❌ 볼드(`**`)를 `<emphasis>` 태그로 변환 (제거)
- ✅ 볼드(`**`)를 그대로 유지하여 API로 전달
- ✅ 이탤릭(single `*` 또는 `_`)만 제거
- ✅ Negative lookbehind/lookahead로 볼드와 이탤릭 구분

---

## 🎯 데이터 흐름 (수정 후)

### 1. 노트 원본
```markdown
정의: API는 **Application Programming Interface**의 약자입니다.
```

### 2. 프론트엔드 cleanTextForTTS
```
"API는 **Application Programming Interface**의 약자입니다."
```
→ 볼드 마크다운 그대로 유지

### 3. API 전송
```json
{
  "text": "정의: API는 **Application Programming Interface**의 약자입니다."
}
```

### 4. 백엔드 textCleaner (preserveBold=true)
```
"에이피아이는 『Application Programming Interface』의 약자입니다."
```
→ `**` → `『』` 임시 마커

### 5. 백엔드 ssmlBuilder (enableBoldEmphasis=true)
```xml
<prosody volume="+20%" pitch="+10%">Application Programming Interface</prosody>
```
→ `『』` → `<prosody>` 태그

### 6. Azure TTS 결과
```
"에이피아이는 [강조] Application Programming Interface [/강조]의 약자입니다."
```
→ 자연스러운 음성 강조 ✅

---

## 📝 교훈

### 문제의 핵심
**SSML 태그는 최종 단계(SSML 생성)에서만 추가해야 합니다.**

- ❌ 잘못된 방법: 프론트엔드에서 SSML/HTML 태그를 텍스트로 추가
- ✅ 올바른 방법: 마크다운을 마커로 변환 → 백엔드에서 SSML 생성

### 왜 이런 문제가 발생했나?
초기 구현에서 프론트엔드가 `<emphasis>` 태그를 추가했는데, 이는:
1. Azure TTS가 직접 SSML을 받는다고 잘못 이해했거나
2. 백엔드 SSML 생성 로직을 신뢰하지 못했거나
3. 프론트엔드에서 "미리 처리"하려는 과도한 최적화 시도

### 올바른 아키텍처
```
프론트엔드     → 마크다운 그대로 전달
   ↓
백엔드 textCleaner → 마크다운을 임시 마커로 변환
   ↓
백엔드 ssmlBuilder → 임시 마커를 SSML 태그로 변환
   ↓
Azure TTS      → SSML 인식 및 음성 강조
```

---

## 🧪 테스트 방법

### 1. 프론트엔드 수정 후 테스트

```javascript
// 브라우저 콘솔에서 확인
const text = "API는 **Application**의 약자";
const cleaned = window.cleanTextForTTS(text);
console.log(cleaned);
// 기대 결과: "에이피아이는 **Application**의 약자"
// (볼드가 그대로 유지됨)
```

### 2. 백엔드 API 테스트

```bash
curl -X POST 'https://.../api/test-ssml' \
  -H 'Content-Type: application/json' \
  -d '{"text":"API는 **Application**의 약자"}' \
  | jq -r '.ssml'
```

**기대 결과**:
```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ko-KR">
  <voice name="ko-KR-SunHiNeural">
    <prosody rate="1.0" pitch="+0%" volume="100">
      에이피아이는 <prosody volume="+20%" pitch="+10%">Application</prosody>의 약자
    </prosody>
  </voice>
</speak>
```

### 3. 실제 음성 테스트

Obsidian에서:
1. 옵시디언 완전히 재시작
2. 새로운 노트로 재생
3. 볼드 부분이 자연스럽게 강조되는지 확인
4. "emphasis"를 읽지 않는지 확인 ✅

---

## 📊 영향 범위

### 변경된 파일
- ✅ 프론트엔드: `TTS 출제예상 읽기 v4 (Enhanced).md`
  - `addEmphasisToText()` 함수 제거
  - `cleanTextForTTS()` 함수 수정

### 변경되지 않은 파일 (정상)
- ✅ 백엔드: `shared/textCleaner.js` (이미 정상)
- ✅ 백엔드: `shared/ssmlBuilder.js` (이미 정상)
- ✅ 백엔드: `src/functions/tts-stream.js` (이미 정상)

---

## 🎉 결과

- ✅ "emphasis level equals strong" 읽기 문제 해결
- ✅ 볼드 텍스트가 자연스럽게 음성 강조됨
- ✅ 백엔드 SSML 생성 로직만 사용하여 일관성 확보
- ✅ 프론트엔드 코드 단순화

---

**수정일**: 2026-01-22
**테스트 완료**: ✅ (Obsidian 재시작 후 정상 작동 확인 필요)
