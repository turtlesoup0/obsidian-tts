# tts-proxy — TTS 프록시 서버

Obsidian TTS 시스템의 핵심 백엔드. TTS 생성 프록시, 파일 캐시, SSE 실시간 동기화, VAD 무음 제거, 축약어 정규화를 하나의 Flask 서버에서 처리합니다.

---

## 빠른 시작

> **전제조건**: tts-proxy는 OpenAI 호환 TTS 백엔드(`/v1/audio/speech`)를 호출합니다.
> `.env.edge-tts` 프리셋은 백엔드를 호스트명 `openai-edge-tts:5050`으로 찾으므로,
> [openai-edge-tts](https://github.com/travisvn/openai-edge-tts)를 자체 docker-compose로
> **먼저** 실행해 외부 네트워크 `openai-edge-tts_default`를 만들어야 합니다.
> 호스트에서 백엔드를 직접 실행 중이면 `TTS_BACKEND_URL=http://host.docker.internal:5050`을
> 사용하세요(Linux는 compose에 `extra_hosts: ["host.docker.internal:host-gateway"]` 필요).

### Docker Compose (권장)

```bash
# 처음 한 번 — 백엔드 프리셋 복사 (.env.* 는 gitignore 처리됨)
cp .env.edge-tts.example .env.edge-tts

# Edge TTS 백엔드 사용 (무료 클라우드)
docker compose --env-file .env.edge-tts up -d

# CosyVoice3 백엔드 사용 (로컬 GPU)
cp .env.cosyvoice3.example .env.cosyvoice3
docker compose --env-file .env.cosyvoice3 up -d
```

### 직접 실행

```bash
pip install -r requirements.txt
TTS_BACKEND_URL=http://localhost:5050 python server.py
```

서버가 `http://localhost:5051` 에서 시작됩니다.

### 동작 확인

```bash
# 헬스 체크
curl http://localhost:5051/health

# TTS 생성 테스트
curl -X POST http://localhost:5051/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"안녕하세요","voice":"ko-KR-SunHiNeural"}' \
  --output test.mp3
```

---

## 구성 요소

```
server.py          # Flask 메인 (18개 엔드포인트)
cache_manager.py   # SHA256 기반 파일 캐시 + 히트율/사용량 통계
sse_manager.py     # SSE 브로드캐스트 (인메모리 큐 / Redis Pub/Sub)
vad_processor.py   # Silero VAD 모델로 앞뒤 무음·숨소리 자동 제거
normalizer.py      # 영문 축약어(JWT, API 등) → 글자별 분리 발음
```

### 요청 처리 흐름

```
클라이언트 요청
  │
  ├─ normalizer: 텍스트 전처리 (축약어 분리)
  │
  ├─ cache_manager: SHA256(text+voice+rate) 로 캐시 키 생성
  │   ├─ HIT → 즉시 audio/mpeg 반환
  │   └─ MISS ↓
  │
  ├─ TTS 백엔드 호출 (POST /v1/audio/speech)
  │   └─ 지수 백오프 재시도 (최대 3회)
  │
  ├─ vad_processor: Silero VAD로 무음 트리밍
  │
  └─ cache_manager: 결과 .mp3 파일로 저장
      └─ audio/mpeg 반환 (X-Cache: MISS)
```

---

## 환경변수 전체 레퍼런스

### TTS 백엔드

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `TTS_BACKEND_URL` | `http://localhost:5050` | TTS 백엔드 주소. OpenAI Audio Speech API 호환 필요 (`/v1/audio/speech`) |
| `TTS_MODEL` | (빈 값) | 모델명 오버라이드. 설정 시 클라이언트 요청 모델 무시. MLX 등 로컬 백엔드에서 모델 지정 시 사용 |
| `TTS_TIMEOUT` | `120` | 백엔드 요청 타임아웃 (초). CosyVoice는 180 권장 |
| `TTS_MAX_RETRIES` | `3` | 실패 시 재시도 횟수. 지수 백오프 적용 (1s, 2s, 4s + jitter) |
| `TTS_RETRY_BASE_DELAY` | `1.0` | 재시도 기본 대기시간 (초) |
| `TTS_DISABLE_INTERNAL_CACHE` | `false` | `true`로 설정 시 매 요청마다 백엔드 호출 (캐시 무시). 백엔드 전환 직후 옛 캐시 HIT 차단용 |

### 텍스트 정규화

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `TTS_NORMALIZE_ENABLED` | `false` | 영문 축약어 정규화 활성화(opt-in). LLM 호출 0건, 응답 <1ms. docker-compose 프리셋도 기본 `false` |
| `TTS_NORMALIZE_DICT_PATH` | `/app/data/acronym-dict.json` | 축약어 사전 경로(선택). 없으면 휴리스틱 단독 모드로 동작 |

### 서버

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `TTS_PROXY_PORT` | `5051` | 서버 포트 |
| `TTS_DATA_DIR` | `./data/tts-cache` | 캐시 파일 + 통계 JSON 저장 경로 |
| `CORS_ORIGINS` | `app://obsidian.md,http://localhost:*,...` | CORS 허용 출처. `*` = 모든 Origin 허용 (Tailscale 내부망 등) |
| `FLASK_ENV` | `production` | Flask 환경 |

### VAD (무음 제거)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `VAD_ENABLED` | `true` | Silero VAD 무음 트리밍 활성화 |
| `VAD_PADDING_MS` | `100` | 음성 구간 앞뒤 여백 (ms) |

### Redis (선택)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `REDIS_ENABLED` | `false` | Redis Pub/Sub SSE 모드. 다중 프로세스 환경에서 필요 |
| `REDIS_HOST` | `localhost` | Redis 호스트 |
| `REDIS_PORT` | `6379` | Redis 포트 |

---

## TTS 백엔드 전환

### 프리셋 파일 사용

저장소의 `.example` 프리셋을 복사해 간편 전환 (`.env.*` 자체는 `.gitignore` 처리됨):

```bash
# 처음 한 번 — 프리셋 복사
cp .env.edge-tts.example .env.edge-tts
cp .env.cosyvoice3.example .env.cosyvoice3

# Edge TTS (Microsoft Edge 클라우드, 무료)
docker compose --env-file .env.edge-tts up -d

# CosyVoice3 (로컬 GPU 추론)
docker compose --env-file .env.cosyvoice3 up -d
```

### 프리셋 파일 내용

**.env.edge-tts:**
```env
TTS_BACKEND_URL=http://openai-edge-tts:5050
TTS_TIMEOUT=120
TTS_MODEL=
TTS_MAX_RETRIES=3
```

**.env.cosyvoice3:**
```env
TTS_BACKEND_URL=http://host.docker.internal:5052
TTS_TIMEOUT=180
TTS_MODEL=
TTS_MAX_RETRIES=2
TTS_DISABLE_INTERNAL_CACHE=true
```

### 커스텀 백엔드 연결

OpenAI Audio Speech API 호환 (`POST /v1/audio/speech`)이면 어떤 백엔드든 연결 가능:

```bash
# 예: 자체 TTS 서버
TTS_BACKEND_URL=http://my-tts-server:8000 docker compose up -d
```

필요한 API 스펙:
```
POST /v1/audio/speech
Content-Type: application/json

{
  "model": "tts-1",
  "input": "텍스트",
  "voice": "alloy"
}

Response: audio/mpeg binary
```

### 백엔드 전환 시 주의사항

- `TTS_DISABLE_INTERNAL_CACHE=true` 설정 권장 — 옛 백엔드의 캐시 HIT 방지
- 안정화 후 `false`로 복귀하여 캐시 활용
- 캐시 완전 초기화: `curl -X DELETE http://localhost:5051/api/cache-clear`

---

## API 엔드포인트

### TTS 생성 (4개 호환 엔드포인트)

모든 엔드포인트는 동일한 내부 로직 `_handle_tts_request()`를 공유합니다:

| 엔드포인트 | 메서드 | 용도 |
|-----------|--------|------|
| `/api/tts` | GET | `?text=...&voice=...` 쿼리 파라미터 방식. `<audio src>` 태그 지원 |
| `/api/tts` | POST | JSON body 방식. `rate`, `useCache` 파라미터 지원 |
| `/api/tts-stream` | POST | Azure TTS API 호환 |
| `/v1/audio/speech` | POST | OpenAI Audio Speech API 호환. `model`, `input`, `voice` |

**POST /api/tts 요청:**
```json
{
  "text": "안녕하세요",
  "voice": "ko-KR-SunHiNeural",
  "rate": 1.0,
  "useCache": true
}
```

**응답:**
```
HTTP 200
Content-Type: audio/mpeg
X-Cache: HIT | MISS
X-Content-Type-Options: nosniff
```

### 캐시 관리

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/cache/<key>` | GET | 캐시 조회. 전체/축약 키 모두 지원 |
| `/api/cache/<key>` | PUT | `audio/mpeg` body로 캐시 저장 |
| `/api/cache/<key>` | DELETE | 단일 캐시 삭제 |
| `/api/cache-clear` | DELETE | 전체 캐시 삭제 |

### SSE 실시간 동기화

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/events/playback` | GET | 재생 위치 SSE 스트림. `event: playback` |
| `/api/events/scroll` | GET | 스크롤 위치 SSE 스트림. `event: scroll` |

SSE 메시지 형식:
```
event: playback
data: {"lastPlayedIndex":42,"notePath":"note.md","timestamp":1738234567890,"deviceId":"desktop"}

: keep-alive
```

### REST 동기화

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/playback-position` | GET | 마지막 재생 위치 조회 |
| `/api/playback-position` | PUT | 재생 위치 저장 + SSE 브로드캐스트 |
| `/api/scroll-position` | GET | 스크롤 위치 조회 |
| `/api/scroll-position` | PUT | 스크롤 위치 저장 + SSE 브로드캐스트 |

### 통계

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/health` | GET | 서버 상태 (SSE 클라이언트 수, VAD, 백엔드 URL) |
| `/api/stats` | GET | 요청/캐시 히트/에러 통계 |
| `/api/usage` | GET | 일별 문자 수/요청 수 |
| `/api/cache-stats` | GET | 캐시 파일 수, 총 크기 |

---

## 축약어 정규화 상세

### 작동 방식

```
입력: "JWT 토큰으로 API 인증"
  ↓ normalizer.py
출력: "J W T 토큰으로 A P I 인증"
```

### 판단 로직 (우선순위)

1. **사전 룩업** (`acronym-dict.json`, **선택**): 있으면 최우선 적용
2. **Whitelist**: `NATO`, `JSON`, `YAML` 등 단어처럼 발음하는 약어 → 그대로
3. **Forcelist**: `API`, `CEO`, `AWS` 등 글자별 발음하는 약어 → 분리
4. **모음 비율 휴리스틱**: 모음 비율 25% 이하 → 분리 (예: `JWT`=0%, `HTTP`=0%)

복수형(`APIs`→`A P I s`)·소유격(`API's`)도 처리한다. 대문자 전용 토큰만 매칭하므로
mixed-case(`IoT`, `IPv6` 등)는 정규화 대상이 아니다.

### 사전 (선택)

사전 파일(`acronym-dict.json`)은 **선택 사항**이다. 없으면 위 2~4단계 휴리스틱 단독 모드로
graceful degradation 하므로 정규화 자체는 그대로 동작한다. vault 약어를 사전으로 빌드하는
배치 파이프라인(LLM 분류 등)은 이 저장소의 범위 밖이며, 별도 프로젝트에서 생성한 사전을
`TTS_NORMALIZE_DICT_PATH` 로 마운트하면 1순위로 적용된다.

---

## 배포 옵션

### Docker Compose (기본)

```bash
docker compose --env-file .env.edge-tts up -d
```

포함 서비스:
- `tts-proxy`: Flask 서버 (포트 5051)
- `redis`: Redis 7 Alpine (내부 네트워크, 선택)

### launchd (macOS)

```xml
<!-- ~/Library/LaunchAgents/com.obsidian.tts-proxy.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.obsidian.tts-proxy</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/docker</string>
        <string>compose</string>
        <string>-f</string>
        <string>/path/to/docker/tts-proxy/docker-compose.yml</string>
        <string>--env-file</string>
        <string>/path/to/docker/tts-proxy/.env.edge-tts</string>
        <string>up</string>
        <string>-d</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
```

### systemd (Linux)

```ini
# /etc/systemd/system/tts-proxy.service
[Unit]
Description=Obsidian TTS Proxy
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/docker/tts-proxy
ExecStart=/usr/bin/docker compose --env-file .env.edge-tts up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable tts-proxy
sudo systemctl start tts-proxy
```

---

## 문제 해결

### TTS 생성 실패

```bash
# 1. 백엔드 연결 확인
curl http://localhost:5051/health
# tts_backend 필드 확인

# 2. 백엔드 직접 테스트
curl -X POST http://localhost:5050/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"tts-1","input":"test","voice":"alloy"}' \
  --output test.mp3

# 3. Docker 로그
docker logs obsidian-tts-proxy --tail 50
```

### 캐시 HIT인데 다른 음성이 나옴

백엔드를 전환한 직후 발생. 옛 백엔드의 캐시가 남아있기 때문:

```bash
# 방법 1: 캐시 우회 활성화
# docker-compose.yml 에서 TTS_DISABLE_INTERNAL_CACHE=true

# 방법 2: 캐시 전체 초기화
curl -X DELETE http://localhost:5051/api/cache-clear
```

### SSE 연결이 끊어짐

```bash
# 연결된 클라이언트 수 확인
curl http://localhost:5051/health | jq .sse_clients

# SSE 스트림 직접 테스트
curl -N http://localhost:5051/api/events/playback
```

- Nginx/리버스 프록시 사용 시 `X-Accel-Buffering: no` 필요
- 프록시 타임아웃을 60초 이상으로 설정

### Redis 연결 실패

```bash
redis-cli ping
# PONG 이면 정상
```

Redis 다운 시 자동으로 인메모리 모드로 폴백. 단일 서버 환경에서는 Redis 불필요 (`REDIS_ENABLED=false`).

---

## 라이선스

MIT License
