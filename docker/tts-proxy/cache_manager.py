"""
TTS 캐시 및 사용량 추적 모듈

캐시 키 생성, 통계 수집, 일별 사용량 추적을 담당합니다.
"""
import json
import time
import hashlib
import logging
import threading
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)


class CacheManager:
    """TTS 캐시 통계 및 사용량 관리"""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.cache_dir = data_dir / 'tts-cache'
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self._stats_file = data_dir / 'stats.json'
        self._usage_file = data_dir / 'usage.json'

        self._stats_lock = threading.Lock()
        self._usage_lock = threading.Lock()

        # 통계 초기화
        self.stats = {
            'totalRequests': 0,
            'cacheHits': 0,
            'cacheMisses': 0,
            'backendRequests': 0,
            'errors': 0,
            'startTime': int(time.time())
        }

        # 사용량 초기화
        self.usage = {
            'totalCharacters': 0,
            'totalRequests': 0,
            'dailyUsage': {}
        }

        # 기존 데이터 로드
        self._load_stats()
        self._load_usage()

    def _load_stats(self):
        if self._stats_file.exists():
            try:
                self.stats.update(json.loads(self._stats_file.read_text(encoding='utf-8')))
            except Exception as e:
                logger.warning(f"Failed to load stats: {e}")

    def _load_usage(self):
        if self._usage_file.exists():
            try:
                self.usage.update(json.loads(self._usage_file.read_text(encoding='utf-8')))
            except Exception as e:
                logger.warning(f"Failed to load usage: {e}")

    def _save_stats(self):
        try:
            self._stats_file.write_text(
                json.dumps(self.stats, ensure_ascii=False, indent=2), encoding='utf-8'
            )
        except Exception as e:
            logger.error(f"Failed to save stats: {e}")

    def _save_usage(self):
        try:
            self._usage_file.write_text(
                json.dumps(self.usage, ensure_ascii=False, indent=2), encoding='utf-8'
            )
        except Exception as e:
            logger.error(f"Failed to save usage: {e}")

    @staticmethod
    def generate_cache_key(text: str, voice: str, rate: str = None) -> str:
        """캐시 키 생성 (SHA256 해시)"""
        key_data = f"{text}|{voice}|{rate or ''}"
        return hashlib.sha256(key_data.encode('utf-8')).hexdigest()

    def cache_path(self, key: str) -> Path:
        """캐시 키에 대응하는 파일 경로"""
        return self.cache_dir / f"{key}.mp3"

    def update_stats(self, cache_hit: bool = False, backend_request: bool = False, error: bool = False):
        """통계 업데이트"""
        with self._stats_lock:
            self.stats['totalRequests'] += 1
            if cache_hit:
                self.stats['cacheHits'] += 1
            else:
                self.stats['cacheMisses'] += 1
            if backend_request:
                self.stats['backendRequests'] += 1
            if error:
                self.stats['errors'] += 1
        self._save_stats()

    def update_usage(self, text: str):
        """사용량 업데이트"""
        with self._usage_lock:
            self.usage['totalCharacters'] += len(text)
            self.usage['totalRequests'] += 1

            today = datetime.now().strftime('%Y-%m-%d')
            if today not in self.usage['dailyUsage']:
                self.usage['dailyUsage'][today] = {'characters': 0, 'requests': 0}
            self.usage['dailyUsage'][today]['characters'] += len(text)
            self.usage['dailyUsage'][today]['requests'] += 1
        self._save_usage()

    def get_stats_summary(self) -> dict:
        """통계 요약 (캐시 히트율 포함)"""
        with self._stats_lock:
            stats = self.stats.copy()
        stats['uptime'] = int(time.time()) - stats['startTime']
        total = stats['cacheHits'] + stats['cacheMisses']
        stats['cacheHitRate'] = round((stats['cacheHits'] / total) * 100, 2) if total > 0 else 0.0
        return stats
