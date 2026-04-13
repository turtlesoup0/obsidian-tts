"""
SSE 클라이언트 연결 관리자

Server-Sent Events (SSE) 연결을 관리하고 메시지를 브로드캐스트합니다.
단일 프로세스 환경에서 인메모리 큐를 사용하며, Redis Pub/Sub 확장이 가능합니다.
"""
import queue
import threading
import logging
from typing import Set, Optional
import json

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class SSEManager:
    """
    SSE 클라이언트 연결과 메시지 브로드캐스트를 관리하는 클래스

    단일 프로세스 환경에서는 인메모리 큐를 사용합니다.
    다중 프로세스 환경에서는 RedisSSEManager를 사용하세요.
    """

    def __init__(self, keep_alive_interval: int = 30):
        """
        SSE 매니저 초기화

        Args:
            keep_alive_interval: keep-alive 메시지 전송 간격 (초)
        """
        self.clients: Set[queue.Queue] = set()
        self.lock = threading.Lock()
        self.keep_alive_interval = keep_alive_interval
        logger.info("SSE Manager initialized (in-memory mode)")

    def add_client(self, client_queue: queue.Queue) -> None:
        """
        새로운 SSE 클라이언트 연결 추가

        Args:
            client_queue: 클라이언트별 큐
        """
        with self.lock:
            self.clients.add(client_queue)
            logger.info(f"Client added. Total clients: {len(self.clients)}")

    def remove_client(self, client_queue: queue.Queue) -> None:
        """
        SSE 클라이언트 연결 제거

        Args:
            client_queue: 제거할 클라이언트 큐
        """
        with self.lock:
            if client_queue in self.clients:
                self.clients.remove(client_queue)
                logger.info(f"Client removed. Total clients: {len(self.clients)}")

    def broadcast(self, data: str) -> int:
        """
        모든 연결된 SSE 클라이언트에게 메시지 브로드캐스트

        Args:
            data: 브로드캐스트할 JSON 문자열

        Returns:
            성공적으로 전송된 클라이언트 수
        """
        success_count = 0
        dead_clients = set()

        with self.lock:
            for client_queue in self.clients:
                try:
                    client_queue.put_nowait(data)
                    success_count += 1
                except queue.Full:
                    logger.warning("Client queue full, marking as dead")
                    dead_clients.add(client_queue)
                except Exception as e:
                    logger.error(f"Error broadcasting to client: {e}")
                    dead_clients.add(client_queue)

            # 죽은 클라이언트 제거
            for client_queue in dead_clients:
                self.clients.remove(client_queue)
                logger.info(f"Removed dead client. Total clients: {len(self.clients)}")

        if success_count > 0:
            logger.debug(f"Broadcast to {success_count} clients")

        return success_count

    def broadcast_playback_position(self, position_data: dict) -> int:
        """
        재생 위치 데이터 브로드캐스트

        Args:
            position_data: 재생 위치 데이터 (lastPlayedIndex, notePath, noteTitle, timestamp, deviceId)

        Returns:
            성공적으로 전송된 클라이언트 수
        """
        json_data = json.dumps(position_data, ensure_ascii=False)
        return self.broadcast(json_data)

    def broadcast_scroll_position(self, scroll_data: dict) -> int:
        """
        스크롤 위치 데이터 브로드캐스트

        Args:
            scroll_data: 스크롤 위치 데이터 (scrollTop, notePath, timestamp, deviceId)

        Returns:
            성공적으로 전송된 클라이언트 수
        """
        json_data = json.dumps(scroll_data, ensure_ascii=False)
        return self.broadcast(json_data)

    def get_client_count(self) -> int:
        """
        현재 연결된 클라이언트 수 반환

        Returns:
            연결된 클라이언트 수
        """
        with self.lock:
            return len(self.clients)


class RedisSSEManager(SSEManager):
    """
    Redis Pub/Sub을 사용하는 SSE 매니저

    다중 프로세스/다중 서버 환경에서 사용합니다.
    Redis가 다운되면 인메모리 모드로 자동 폴백합니다.
    """

    def __init__(self, redis_host: str = 'localhost', redis_port: int = 6379,
                 keep_alive_interval: int = 30):
        """
        Redis SSE 매니저 초기화

        Args:
            redis_host: Redis 호스트
            redis_port: Redis 포트
            keep_alive_interval: keep-alive 메시지 전송 간격 (초)
        """
        super().__init__(keep_alive_interval)
        self.redis_host = redis_host
        self.redis_port = redis_port
        self.redis_client = None
        self.redis_available = False

        try:
            import redis
            self.redis_client = redis.Redis(
                host=redis_host,
                port=redis_port,
                decode_responses=True
            )
            # Redis 연결 테스트
            self.redis_client.ping()
            self.redis_available = True
            logger.info(f"Redis SSE Manager initialized (redis://{redis_host}:{redis_port})")
        except Exception as e:
            logger.warning(f"Redis unavailable, falling back to in-memory mode: {e}")
            self.redis_available = False

    def publish(self, channel: str, data: str) -> int:
        """
        Redis 채널에 메시지 발행

        Args:
            channel: Redis 채널명
            data: 발행할 데이터

        Returns:
            구독자 수 (Redis 사용 불가 시 0)
        """
        if not self.redis_available:
            return 0

        try:
            result = self.redis_client.publish(channel, data)
            logger.debug(f"Published to {channel}: {result} subscribers")
            return result
        except Exception as e:
            logger.error(f"Redis publish error: {e}")
            self.redis_available = False
            return 0

    def broadcast_playback_position(self, position_data: dict) -> int:
        """
        재생 위치 데이터 Redis Pub/Sub 브로드캐스트

        Args:
            position_data: 재생 위치 데이터

        Returns:
            구독자 수
        """
        json_data = json.dumps(position_data, ensure_ascii=False)

        # Redis 사용 가능하면 발행
        if self.redis_available:
            subscribers = self.publish('tts:playback', json_data)
            if subscribers > 0:
                return subscribers

        # Redis 불가능하거나 구독자 없으면 인메모리 브로드캐스트
        return super().broadcast(json_data)

    def broadcast_scroll_position(self, scroll_data: dict) -> int:
        """
        스크롤 위치 데이터 Redis Pub/Sub 브로드캐스트

        Args:
            scroll_data: 스크롤 위치 데이터

        Returns:
            구독자 수
        """
        json_data = json.dumps(scroll_data, ensure_ascii=False)

        # Redis 사용 가능하면 발행
        if self.redis_available:
            subscribers = self.publish('tts:scroll', json_data)
            if subscribers > 0:
                return subscribers

        # Redis 불가능하거나 구독자 없으면 인메모리 브로드캐스트
        return super().broadcast(json_data)

    def subscribe_to_redis(self, channels: list, callback) -> None:
        """
        Redis 채널 구독 (별도 스레드에서 실행)

        Args:
            channels: 구독할 채널 목록
            callback: 메시지 수신 시 호출할 콜백 함수
        """
        if not self.redis_available:
            logger.warning("Redis unavailable, cannot subscribe")
            return

        import redis

        pubsub = self.redis_client.pubsub()
        pubsub.subscribe(*channels)

        def redis_listener():
            logger.info(f"Redis listener started for channels: {channels}")
            for message in pubsub.listen():
                if message['type'] == 'message':
                    channel = message['channel']
                    data = message['data']
                    logger.debug(f"Received from {channel}: {data}")
                    # 인메모리 클라이언트에게 전달
                    callback(data)

        thread = threading.Thread(target=redis_listener, daemon=True)
        thread.start()
