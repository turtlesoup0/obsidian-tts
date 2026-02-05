# Azure Functions 배포 가이드

## 개요

이 프로젝트는 GitHub Actions를 통해 Azure Functions에 자동 배포됩니다. 현재 Edge/Local 환경에서만 실행 중이며, Azure 배포는 필요 시 수동으로 트리거할 수 있습니다.

## 배포 환경

| 환경 | 상태 | 버전 | 설명 |
|------|------|------|------|
| **Local/Edge** | Active | v5.1.1 | 개발 및 테스트 환경 |
| **Azure Functions** | Standby | v5.0.x | 프로덕션 환경 (미배포 상태) |

## 배포 방법

### 방법 1: GitHub Actions 자동 배포 (권장)

main 브랜치에 푸시하면 자동으로 배포됩니다:

```bash
# 1. 변경사항 커밋
git add .
git commit -m "feat: your changes"

# 2. main 브랜치에 푸시 (자동 배포 트리거)
git push origin main
```

### 방법 2: GitHub Actions 수동 배포

1. **GitHub 저장소 접속**
   - https://github.com/turtlesoup0/obsidian-tts/actions

2. **워크플로우 선택**
   - "Deploy to Azure Functions" 선택

3. **수동 실행**
   - "Run workflow" 버튼 클릭
   - 브랜치: `main` 선택
   - "Run workflow" 클릭

### 방법 3: Azure Functions Core Tools (CLI)

```bash
# 1. Azure Functions Core Tools 설치
npm install -g azure-functions-core-tools@4 --unsafe-perm true

# 2. Azure에 로그인
az login

# 3. 배포
func azure functionapp publish obsidian-tts-func
```

### 방법 4: Visual Studio Code

1. **Azure Functions 확장 설치**
2. **함수 앱 우클릭** → "Deploy to Function App"
3. **배포 확인**

## 배포 전 확인 사항

### 1. GitHub Secrets 설정

다음 시크릿이 설정되어 있어야 합니다:

| 시크릿 이름 | 설명 |
|-----------|------|
| `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` | Azure Functions 게시 프로필 |

**게시 프로필 가져오기**:
```bash
# Azure Portal
# 1. 함수 앱 → 배포 센터 → 게시 프로필 가져오기
# 2. GitHub → Settings → Secrets and variables → Actions → New repository secret
# 3. AZURE_FUNCTIONAPP_PUBLISH_PROFILE로 등록
```

### 2. 워크플로우 설정 확인

`.github/workflows/azure-functions-deploy.yml`:
```yaml
env:
  AZURE_FUNCTIONAPP_NAME: obsidian-tts-func
  AZURE_FUNCTIONAPP_PACKAGE_PATH: '.'
  NODE_VERSION: '18.x'
```

## 배포 후 확인

### 1. Azure Portal

- **함수 앱**: https://ms.portal.azure.com/#@cloud lover/resource/subscriptions/{subscription}/resourceGroups/obsidian-tts-rg/providers/Microsoft.Web/sites/obsidian-tts-func/overview
- **배포 센터**: 최신 배포 기록 확인
- **로그 스트림**: 실시간 로그 확인

### 2. API 테스트

```bash
# scroll-position API 테스트
curl -X GET https://obsidian-tts-func.azurewebsites.net/api/scroll-position

# playback-position API 테스트
curl -X GET https://obsidian-tts-func.azurewebsites.net/api/playback-position
```

### 3. 로그 확인

Azure Portal → 함수 앱 → Log Analytics:
```kusto
AzureDiagnostics
| where Category == "Function"
| where log_s contains "SCROLL-PUT"
| project TimeGenerated, log_s
| order by TimeGenerated desc
| take 20
```

## 버전별 배포 상태

| 버전 | 배포일 | 상태 | 주요 변경사항 |
|------|--------|------|--------------|
| v5.1.1 | 미배포 | Local only | PC 스크롤 위치 저장 버그 수정 |
| v5.1.0 | 미배포 | Local only | 폴링 최적화, 오프라인 지원 |
| v5.0.2 | 배포됨 | Azure | 보안 강화 |

## 롤백 방법

이전 버전으로 롤백하려면:

1. **GitHub에서 이전 커밋 확인**
   ```bash
   git log --oneline
   ```

2. **이전 커밋으로 체크아웃**
   ```bash
   git checkout <commit-hash>
   ```

3. **배포**
   ```bash
   git push origin main --force
   ```

## 문제 해결

### 배포 실패

1. **GitHub Actions 로그 확인**
   - Actions 탭 → 실패한 워크플로우 클릭
   - 빨간색 단계의 로그 확인

2. **常见原因**:
   - `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` 미설정
   - 함수 앱 이름 불일치
   - Node 버전 호환성 문제

### 배포 후 500 에러

1. **Azure Portal 로그 스트림 확인**
2. **Application Insights 확인**
3. **함수 코드 로그 확인**

## 추가 자료

- [Azure Functions GitHub Actions](https://github.com/Azure/functions-action)
- [Azure Functions Core Tools](https://docs.microsoft.com/azure/azure-functions/functions-run-local)
- [Azure Functions 배포 문서](https://docs.microsoft.com/azure/azure-functions/deployment-functions-project#deploy-from-the-command-line)
