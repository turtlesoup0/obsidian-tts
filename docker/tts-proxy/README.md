# tts-proxy SSE Server

TTS 위치 동기화를 위한 SSE (Server-Sent Events) 기반 실시간 프록시 서버입니다.

## 기능

- **SSE 실시간 동기화**: 재생 위치와 스크롤 위치를 실시간으로 브로드캐스트
- **REST API 호환성**: 기존 GET/PUT 엔드포인트 유지
- **Redis Pub/Sub 지원**: 다중 서버 환경에서 Redis 사용 가능 (선택사항)
- **자동 폴백**: Redis 다운 시 인메모리 모드로 자동 전환
- **Keep-alive**: 30초 간격으로 연결 유지

## 시스템 요구사항

- Python 3.12+
- Flask 3.0+
- (선택사항) Redis 6.x+

## 설치

### 1. Python 의존성 설치

```bash
cd docker/tts-proxy
pip install -r requirements.txt
```

### 2. Redis 설치 (선택사항)

다중 프로세스/다중 서버 환경에서 필요합니다.

**macOS**:
```bash
brew install redis
brew services start redis
```

**Linux (Ubuntu/Debian)**:
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

**Docker**:
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

## 실행

### 기본 실행 (인메모리 모드)

```bash
python server.py
```

서버가 포트 5051에서 실행됩니다.

### 환경 변수 설정

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `TTS_PROXY_PORT` | 5051 | 서버 포트 |
| `TTS_DATA_DIR` | ./data/tts-cache | 데이터 저장 디렉토리 |
| `REDIS_ENABLED` | false | Redis 사용 여부 |
| `REDIS_HOST` | localhost | Redis 호스트 |
| `REDIS_PORT` | 6379 | Redis 포트 |

### Redis 사용 모드

```bash
REDIS_ENABLED=true REDIS_HOST=localhost REDIS_PORT=6379 python server.py
```

## API 엔드포인트

### SSE 엔드포인트

#### `/api/events/playback` (GET)
재생 위치 실시간 스트림

**Event Type**: `playback`

**Response Format**:
```
event: playback
data: {"lastPlayedIndex":42,"notePath":"test.md","noteTitle":"Test","timestamp":1738234567890,"deviceId":"desktop-chrome"}
```

#### `/api/events/scroll` (GET)
스크롤 위치 실시간 스트림

**Event Type**: `scroll`

**Response Format**:
```
event: scroll
data: {"scrollTop":100,"notePath":"test.md","timestamp":1738234567890,"deviceId":"desktop-chrome"}
```

### REST API 엔드포인트

#### `/api/playback-position` (GET/PUT)

**GET**: 재생 위치 조회
```bash
curl http://localhost:5051/api/playback-position
```

**PUT**: 재생 위치 저장 + SSE 브로드캐스트
```bash
curl -X PUT http://localhost:5051/api/playback-position \
  -H "Content-Type: application/json" \
  -d '{
    "lastPlayedIndex": 42,
    "notePath": "test.md",
    "noteTitle": "Test Note",
    "deviceId": "desktop-chrome"
  }'
```

#### `/api/scroll-position` (GET/PUT)

**GET**: 스크롤 위치 조회
```bash
curl http://localhost:5051/api/scroll-position
```

**PUT**: 스크롤 위치 저장 + SSE 브로드캐스트
```bash
curl -X PUT http://localhost:5051/api/scroll-position \
  -H "Content-Type: application/json" \
  -d '{
    "scrollTop": 100,
    "notePath": "test.md",
    "deviceId": "desktop-chrome"
  }'
```

#### `/health` (GET)
서버 상태 확인
```bash
curl http://localhost:5051/health
```

**Response**:
```json
{
  "status": "healthy",
  "timestamp": 1738234567890,
  "sse_clients": 2,
  "redis_enabled": false
}
```

## 클라이언트 연결 예제

### JavaScript (EventSource API)

```javascript
// SSE 연결
const eventSource = new EventSource('http://localhost:5051/api/events/playback');

// 이벤트 리스너
eventSource.addEventListener('playback', (e) => {
  const data = JSON.parse(e.data);
  console.log('Playback position updated:', data);

  // 데이터 형식:
  // {
  //   "lastPlayedIndex": 42,
  //   "notePath": "test.md",
  //   "noteTitle": "Test",
  //   "timestamp": 1738234567890,
  //   "deviceId": "desktop-chrome"
  // }
});

// 에러 처리
eventSource.onerror = (error) => {
  console.error('SSE connection error:', error);
  // EventSource는 자동으로 재연결을 시도합니다
};

// 연결 해제
eventSource.close();
```

### Python (requests + SSE)

```python
import requests
import json

def listen_to_sse():
    url = 'http://localhost:5051/api/events/playback'

    with requests.get(url, stream=True) as response:
        response.raise_for_status()

        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')

                # SSE 파싱
                if line.startswith('data: '):
                    data = json.loads(line[6:])
                    print('Playback position:', data)
                elif line.startswith(': keep-alive'):
                    print('Keep-alive received')

if __name__ == '__main__':
    listen_to_sse()
```

## 배포

### systemd 서비스로 등록 (Linux)

`/etc/systemd/system/tts-proxy.service`:

```ini
[Unit]
Description=TTS Proxy SSE Server
After=network.target

[Service]
Type=simple
User=tts-user
WorkingDirectory=/path/to/docker/tts-proxy
Environment="TTS_PROXY_PORT=5051"
Environment="TTS_DATA_DIR=/var/lib/tts-cache"
Environment="REDIS_ENABLED=true"
ExecStart=/usr/bin/python3 /path/to/docker/tts-proxy/server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

서비스 시작:
```bash
sudo systemctl daemon-reload
sudo systemctl enable tts-proxy
sudo systemctl start tts-proxy
```

### Docker 배포

`Dockerfile`:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .
COPY sse_manager.py .

ENV TTS_PROXY_PORT=5051
ENV TTS_DATA_DIR=/data/tts-cache

RUN mkdir -p /data/tts-cache

EXPOSE 5051

CMD ["python", "server.py"]
```

`docker-compose.yml`:

```yaml
version: '3.8'

services:
  tts-proxy:
    build: .
    ports:
      - "5051:5051"
    volumes:
      - tts-data:/data/tts-cache
    environment:
      - TTS_PROXY_PORT=5051
      - TTS_DATA_DIR=/data/tts-cache
      - REDIS_ENABLED=true
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - redis
    restart: always

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: always

volumes:
  tts-data:
```

실행:
```bash
docker-compose up -d
```

## 테스트

### SSE 연결 테스트

```bash
# 재생 위치 SSE 스트림 테스트
curl -N http://localhost:5051/api/events/playback
```

### 브로드캐스트 테스트

터미널 1 (SSE 연결):
```bash
curl -N http://localhost:5051/api/events/playback
```

터미널 2 (PUT 요청):
```bash
curl -X PUT http://localhost:5051/api/playback-position \
  -H "Content-Type: application/json" \
  -d '{"lastPlayedIndex": 1, "notePath": "test.md", "noteTitle": "Test", "deviceId": "test"}'
```

터미널 1에서 브로드캐스트된 메시지를 확인할 수 있어야 합니다.

## 문제 해결

### 연결이 자주 끊김

- **원인**: Nginx/프록시 버퍼링
- **해결**: `X-Accel-Buffering: no` 헤더가 포함되어 있는지 확인

### Keep-alive가 도착하지 않음

- **원인**: 프록시 타임아웃
- **해결**: 프록시 태임아웃을 60초 이상으로 설정

### Redis 연결 실패

- **확인**: `redis-cli ping`으로 Redis 실행 상태 확인
- **폴백**: Redis 다운 시 자동으로 인메모리 모드로 전환됨

## 모니터링

### 로그 확인

```bash
# 로그는 stdout으로 출력됩니다
python server.py
```

### 연결된 클라이언트 수 확인

```bash
curl http://localhost:5051/health
```

응답의 `sse_clients` 필드로 현재 연결된 클라이언트 수를 확인할 수 있습니다.

## 라이선스

MIT License

## 관련 문서

- [SPEC-PERF-001](../../../.moai/specs/SPEC-PERF-001/spec.md) - SSE 구현 상세사양
- [cross-device-playback-sync.md](../../../docs/guides/cross-device-playback-sync.md) - 디바이스 간 동기화 가이드
