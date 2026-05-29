"""
TTS preprocessing normalizer.

목적
----
edge-tts 가 영문 축약어(JWT, HTTP, ICBM 등)를 뭉개는 문제를 해결하기 위해
합성 직전 텍스트에서 영문 약어를 발음 가능한 형태로 변환한다.

전제
----
- 노트 원문(SoT)은 절대 수정하지 않는다. 정규화는 TTS 입력 파이프라인 안에서만.
- 변환은 영문 약어 → "X X X X" 글자 분리만 수행 (한글 음차 변환 X).

흐름
----
1. ENABLED=false 면 패스스루.
2. [A-Z][A-Z0-9]{1,5} 토큰 추출.
3. 토큰별 사전(`acronym-dict.json`) 룩업 → 결과 사용.
4. 사전 미스 → 휴리스틱(화이트리스트/forcelist/모음 비율 ≤25%) 적용.
5. **LLM 호출 0건.** 사전 빌드는 별도 배치(scripts/rebuild-dict.sh, 일 1회 04:00).

환경변수
--------
TTS_NORMALIZE_ENABLED      기본 false. 'true' 일 때만 활성.
TTS_NORMALIZE_DICT_PATH    기본 /app/data/acronym-dict.json
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------- 설정 ----------

ENABLED: bool = os.environ.get('TTS_NORMALIZE_ENABLED', 'false').lower() == 'true'
DICT_PATH: Path = Path(os.environ.get('TTS_NORMALIZE_DICT_PATH', '/app/data/acronym-dict.json'))


# ---------- 휴리스틱 자료 (사전 미스 시 fallback) ----------

# 모음 패턴이 분명해서 단어처럼 발음되는 약어. 글자 분리 금지.
ACRONYM_WHITELIST: frozenset[str] = frozenset({
    'NATO', 'NASA', 'ARMA', 'ARIMA', 'GARCH', 'JSON', 'JPEG', 'GIF', 'PNG',
    'SCUBA', 'LASER', 'RADAR', 'SONAR', 'OPEC', 'ASEAN', 'UNICEF', 'UNESCO',
    'AJAX', 'SOAP', 'YAML', 'TOML', 'BIOS', 'MIDI', 'WIFI',
})

# 모음 충분해도 사람들이 글자별 발음하는 고빈도 도메인 약어.
ACRONYM_FORCE_SPLIT: frozenset[str] = frozenset({
    'CEO', 'CFO', 'CTO', 'CIO', 'COO', 'KPI', 'ROI', 'IPO', 'IR', 'PR',
    'API', 'SDK', 'CLI', 'GUI', 'CRM', 'ERP', 'OS', 'IT', 'IP', 'IoT',
    'AWS', 'GCP', 'IAM', 'EC2', 'S3', 'RDS', 'VPC', 'DNS', 'CDN', 'SSO',
    'AI', 'ML', 'DL', 'NLP', 'LLM', 'RAG', 'CV', 'GPU', 'TPU', 'FPGA',
    'ETL', 'OLAP', 'OLTP', 'BI', 'EDW', 'DW',
    'TLS', 'SSL', 'MFA', 'RBAC', 'CSRF', 'XSS', 'CVE', 'SOC',
    'IPv4', 'IPv6', 'UDP', 'SSH', 'FTP', 'SMTP', 'IMAP', 'POP3',
})

VOWELS: frozenset[str] = frozenset('AEIOU')

# Python \b 는 unicode \w 기준이라 한글이 영문에 붙어 있을 때 boundary 가 안 잡힌다
# (예: 'SQL은' → \w\w 로 boundary 없음). ASCII 영숫자 lookaround 로 직접 정의해
# 'IDoS' 내부 매칭은 막고 'SQL은' 의 'SQL' 은 매칭하는 것을 동시에 만족.
_ACRONYM_PATTERN: re.Pattern[str] = re.compile(
    r'(?<![A-Za-z0-9_])[A-Z][A-Z0-9]{1,5}(?![A-Za-z0-9_])'
)


# ---------- 사전 로드 (모듈 import 시 1회) ----------

def _load_dict(path: Path) -> dict[str, str]:
    """파일이 없거나 손상되면 빈 dict — 휴리스틱 단독 모드로 graceful degradation."""
    try:
        if path.is_file():
            data = json.loads(path.read_text(encoding='utf-8'))
            if isinstance(data, dict):
                return {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, str)}
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning('[normalize] dict load failed: %s', exc)
    return {}


_DICT: dict[str, str] = _load_dict(DICT_PATH)
if _DICT:
    logger.info('[normalize] dict loaded: %d entries from %s', len(_DICT), DICT_PATH)
else:
    logger.info('[normalize] dict empty/missing — heuristic-only mode')


# ---------- 공개 API ----------

def normalize_for_tts(text: str) -> str:
    """
    합성 직전 텍스트 정규화. server.py 의 cache_key 생성 전에 호출하라.

    각 [A-Z][A-Z0-9]{1,5} 토큰에 대해:
      1. 사전 hit → 사전 값 사용 (배치로 빌드된 vault 약어 사전)
      2. 사전 miss → 휴리스틱 (화이트리스트/forcelist/모음 비율 ≤25%)
    LLM 호출 0건, 응답시간 ~0.1ms.
    """
    if not ENABLED or not text:
        return text
    return _ACRONYM_PATTERN.sub(_replace_token, text)


# ---------- 내부 ----------

def _replace_token(match: re.Match[str]) -> str:
    tok = match.group(0)
    # 사전 우선 (vault 배치 빌드 결과)
    if tok in _DICT:
        return _DICT[tok]
    # 사전 미스: 휴리스틱
    return _split_if_initialism(tok)


def _split_if_initialism(token: str) -> str:
    """
    화이트리스트 → 그대로 (NATO, JSON, ...)
    forcelist → 글자 분리 (API, IBM, ...)
    모음 비율 ≤25% → 글자 분리 (JWT, HTTP, ICBM, ...)
    그 외 → 그대로 (모호한 경계 케이스는 건드리지 않음)
    """
    if token in ACRONYM_WHITELIST:
        return token
    if token in ACRONYM_FORCE_SPLIT:
        return ' '.join(token)

    letters_only = ''.join(c for c in token if c.isalpha())
    if not letters_only:
        return token

    vowel_count = sum(1 for c in letters_only if c in VOWELS)
    if vowel_count == 0:
        return ' '.join(token)
    # ICBM(I 1개/4=25%), REST(E 1개/4=25%) 같은 25% 정확 일치 경계 케이스가
    # 사람의 자연스러운 발음(글자별)과 일치하므로 ≤ 25% 로 잡는다.
    # NATO(50%), NASA(50%), ARMA(50%) 등은 영향 없음.
    if vowel_count / len(letters_only) <= 0.25:
        return ' '.join(token)

    return token
