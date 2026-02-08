"""
SSE 클라이언트 연결 관리자

Server-Sent Events (SSE) 연결을 채널별로 관리하고 메시지를 브로드캐스트합니다.
playback과 scroll 채널이 독립적으로 동작하여 상호 간섭을 방지합니다.
"""
import queue
import threading
import logging
from typing import Dict, Set
import json

logger = logging.getLogger(__name__)


class SSEManager:
    """
    채널별 SSE 클라이언트 관리자

    각 채널(playback, scroll)이 독립적인 client set을 가지므로
    브로드캐스트 시 다른 채널의 클라이언트에게 메시지가 전달되지 않습니다.
    """

    def __init__(self, keep_alive_interval: int = 30):
        self._channels: Dict[str, Set[queue.Queue]] = {}
        self._lock = threading.Lock()
        self.keep_alive_interval = keep_alive_interval
        logger.info("SSE Manager initialized (in-memory, channel-based)")

    def add_client(self, client_queue: queue.Queue, channel: str) -> None:
        """채널에 SSE 클라이언트 추가"""
        with self._lock:
            if channel not in self._channels:
                self._channels[channel] = set()
            self._channels[channel].add(client_queue)
            count = len(self._channels[channel])
        logger.info(f"[{channel}] Client added. Total: {count}")

    def remove_client(self, client_queue: queue.Queue, channel: str) -> None:
        """채널에서 SSE 클라이언트 제거"""
        with self._lock:
            clients = self._channels.get(channel)
            if clients and client_queue in clients:
                clients.discard(client_queue)
                count = len(clients)
            else:
                count = 0
        logger.info(f"[{channel}] Client removed. Total: {count}")

    def broadcast(self, channel: str, data: str) -> int:
        """특정 채널의 모든 클라이언트에게 메시지 브로드캐스트"""
        success_count = 0
        dead_clients = []

        with self._lock:
            clients = self._channels.get(channel)
            if not clients:
                return 0

            for client_queue in clients:
                try:
                    client_queue.put_nowait(data)
                    success_count += 1
                except queue.Full:
                    logger.warning(f"[{channel}] Client queue full, marking as dead")
                    dead_clients.append(client_queue)
                except Exception as e:
                    logger.error(f"[{channel}] Broadcast error: {e}")
                    dead_clients.append(client_queue)

            for dead in dead_clients:
                clients.discard(dead)
                logger.info(f"[{channel}] Removed dead client. Total: {len(clients)}")

        return success_count

    def broadcast_playback_position(self, position_data: dict) -> int:
        """재생 위치 데이터를 playback 채널에 브로드캐스트"""
        json_data = json.dumps(position_data, ensure_ascii=False)
        return self.broadcast('playback', json_data)

    def broadcast_scroll_position(self, scroll_data: dict) -> int:
        """스크롤 위치 데이터를 scroll 채널에 브로드캐스트"""
        json_data = json.dumps(scroll_data, ensure_ascii=False)
        return self.broadcast('scroll', json_data)

    def get_client_count(self, channel: str = None) -> int:
        """연결된 클라이언트 수 반환. channel=None이면 전체 합산."""
        with self._lock:
            if channel:
                return len(self._channels.get(channel, set()))
            return sum(len(c) for c in self._channels.values())
