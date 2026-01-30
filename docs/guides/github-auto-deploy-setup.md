# GitHub Actions 자동 배포 설정 가이드

**작성일**: 2026-01-22
**목적**: main 브랜치 푸시 시 자동으로 Azure Functions에 배포

---

## ✅ 이미 완료된 작업

1. **GitHub Actions 워크플로우 파일 생성**
   - `.github/workflows/azure-functions-deploy.yml` 생성 완료
   - Node.js 18.x 환경 설정
   - npm install 및 빌드 자동화

---

## 🔧 추가 설정 필요 (사용자가 해야 할 일)

### 1단계: Azure Publish Profile 다운로드

#### 방법 1: Azure Portal에서 다운로드
1. [Azure Portal](https://portal.azure.com) 접속
2. Function App 검색 → `obsidian-tts-func` 선택
3. 상단 메뉴에서 **"Get publish profile"** 클릭
4. `.PublishSettings` 파일 다운로드됨

#### 방법 2: Azure CLI 사용
```bash
az functionapp deployment list-publishing-profiles \
  --name obsidian-tts-func \
  --resource-group <your-resource-group> \
  --xml
```

출력된 XML을 복사하세요.

---

### 2단계: GitHub Secrets에 Publish Profile 추가

1. **GitHub 저장소 접속**
   - https://github.com/turtlesoup0/obsidian-tts

2. **Settings → Secrets and variables → Actions 이동**

3. **"New repository secret" 클릭**

4. **Secret 정보 입력**
   - Name: `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`
   - Value: 다운로드한 `.PublishSettings` 파일의 전체 내용 붙여넣기

5. **"Add secret" 클릭**

---

### 3단계: 워크플로우 테스트

#### Git 푸시로 자동 배포 테스트
```bash
cd /Users/turtlesoup0/Documents/obsidian-tts

# 테스트용 빈 커밋
git commit --allow-empty -m "test: GitHub Actions 자동 배포 테스트"
git push origin main
```

#### 배포 상태 확인
1. GitHub 저장소 → **Actions** 탭 이동
2. 최신 워크플로우 실행 확인
3. 각 단계별 로그 확인
4. 성공 시 ✅ 표시

---

## 🎯 자동 배포 동작 방식

### 트리거
- `main` 브랜치에 푸시할 때마다 자동 실행
- 수동 실행: GitHub Actions 탭에서 "Run workflow" 버튼

### 배포 과정
```
1. GitHub에서 코드 체크아웃
2. Node.js 18.x 환경 설정
3. npm install (의존성 설치)
4. npm run build (있는 경우)
5. Azure Functions에 배포
6. 완료 (3-5분 소요)
```

---

## 🔍 문제 해결

### 문제 1: "Secret not found" 에러
**원인**: `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` Secret이 없음
**해결**: 2단계 다시 수행

### 문제 2: "Authentication failed" 또는 "Unauthorized (401)" 에러
**원인**: Azure Function App의 Basic Auth가 비활성화됨
**해결**:
```bash
# SCM Basic Auth 활성화
az resource update --resource-group speech-resources \
  --name scm --namespace Microsoft.Web \
  --resource-type basicPublishingCredentialsPolicies \
  --parent sites/obsidian-tts-func \
  --set properties.allow=true

# FTP Basic Auth 활성화
az resource update --resource-group speech-resources \
  --name ftp --namespace Microsoft.Web \
  --resource-type basicPublishingCredentialsPolicies \
  --parent sites/obsidian-tts-func \
  --set properties.allow=true

# 새 Publish Profile 다운로드 및 업데이트
az functionapp deployment list-publishing-profiles \
  --name obsidian-tts-func \
  --resource-group speech-resources \
  --xml > profile.xml

gh secret set AZURE_FUNCTIONAPP_PUBLISH_PROFILE < profile.xml
rm profile.xml
```

### 문제 3: "npm install failed" 에러
**원인**: package.json 또는 package-lock.json 문제
**해결**:
```bash
# 로컬에서 테스트
npm install
npm run build --if-present
```

정상 작동하면 커밋 후 푸시

### 문제 4: 배포는 성공했지만 함수가 작동 안함
**원인**: 환경 변수 미설정
**해결**: Azure Portal → Configuration에서 환경 변수 확인
```
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=koreacentral
AZURE_STORAGE_CONNECTION_STRING=...
```

---

## 📊 배포 히스토리 확인

### GitHub Actions 탭에서 확인
- 각 배포의 성공/실패 상태
- 배포 소요 시간
- 각 단계별 로그

### Azure Portal에서 확인
- Function App → Deployment Center
- 배포 히스토리 및 로그 확인

---

## 🎉 장점

### 자동화
- 수동 배포 불필요
- `git push`만으로 자동 배포
- 휴먼 에러 감소

### 버전 관리
- 모든 배포가 Git 커밋과 연결
- 문제 발생 시 이전 버전으로 롤백 가능
- 배포 히스토리 추적

### 팀 협업
- Pull Request → Merge 시 자동 배포
- 모든 팀원이 동일한 배포 프로세스 사용

---

## 🔒 보안

### Secrets 보호
- Publish Profile은 GitHub Secrets에 암호화 저장
- 워크플로우 로그에 노출되지 않음
- 저장소 관리자만 접근 가능

### 최소 권한 원칙
- Publish Profile은 해당 Function App만 배포 가능
- Azure 전체 권한 없음

---

## 📝 워크플로우 파일 상세 설명

```yaml
name: Deploy to Azure Functions
# GitHub Actions UI에 표시될 이름

on:
  push:
    branches:
      - main
  # main 브랜치에 푸시할 때 트리거

  workflow_dispatch:
  # GitHub UI에서 수동 실행 가능

env:
  AZURE_FUNCTIONAPP_NAME: obsidian-tts-func
  # 배포할 Function App 이름

  NODE_VERSION: '18.x'
  # Node.js 버전 (Azure Functions v4 요구사항)

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    # Ubuntu 최신 버전에서 실행

    steps:
    - name: 'Checkout GitHub Action'
      uses: actions/checkout@v4
      # 코드 체크아웃

    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
      # Node.js 환경 설정

    - name: 'Install Dependencies'
      run: npm install
      # 의존성 설치

    - name: 'Deploy to Azure'
      uses: Azure/functions-action@v1
      with:
        app-name: ${{ env.AZURE_FUNCTIONAPP_NAME }}
        publish-profile: ${{ secrets.AZURE_FUNCTIONAPP_PUBLISH_PROFILE }}
      # Azure Functions에 배포
```

---

## 🚀 완료 상태

1. ✅ 워크플로우 파일 커밋 및 푸시
2. ✅ Azure Publish Profile 다운로드
3. ✅ GitHub Secrets에 추가
4. ✅ Basic Auth 활성화
5. ✅ 테스트 커밋으로 자동 배포 검증 완료

**최종 배포 결과**: ✓ success (54초 소요)
**GitHub Actions URL**: https://github.com/turtlesoup0/obsidian-tts/actions

---

## 📞 도움말

문제 발생 시:
1. GitHub Actions 로그 확인
2. Azure Function App 로그 확인
3. [GitHub Actions 문서](https://docs.github.com/en/actions)
4. [Azure Functions 문서](https://learn.microsoft.com/azure/azure-functions/)

---

**작성일**: 2026-01-22
**최종 업데이트**: 2026-01-22
**상태**: ✅ 자동 배포 설정 완료 및 검증됨
