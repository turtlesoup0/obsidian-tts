#!/usr/bin/env python3
"""
Vault-wide 영문 약어 발음 사전 빌더.

목적
----
TTS 정규화의 LLM 호출을 런타임에서 빌드타임으로 옮긴다 (AOT 정규화).
vault 전체 *.md 를 스캔해 등장하는 unique 영문 약어를 추출하고, 각 약어를
LLM 에 한 번씩 물어 "단어처럼(WORD) / 글자별(SPELL)" 분류한 결과를 JSON
사전으로 저장한다. TTS 정규화 시점에는 LLM 호출 없이 사전 룩업만 수행하므로
응답시간이 < 10ms 로 떨어지고 mlx_lm.server 가 항상 떠있을 필요가 없어진다.

사용
----
    # 최초 빌드 (vault 전체)
    python scripts/build-acronym-dict.py

    # 증분 (기존 사전 보존, 새 토큰만 LLM 질의)
    python scripts/build-acronym-dict.py

    # 전체 재빌드 (기존 사전 무시)
    python scripts/build-acronym-dict.py --rebuild

    # 빈도 상위 N개만 (테스트용)
    python scripts/build-acronym-dict.py --limit 30

    # 다른 vault / 사전 경로 지정
    python scripts/build-acronym-dict.py --vault /path/to/vault --dict /path/to/dict.json

출력 사전 형식
--------------
    {
      "JWT":  "J W T",
      "HTTP": "H T T P",
      "ICBM": "I C B M",
      "ARMA": "ARMA",
      "JSON": "JSON",
      ...
    }

key   = vault 에 실제 등장한 토큰 (대문자, 숫자 포함, 2~6자)
value = TTS 입력으로 들어갈 정규화된 형태
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path


# ---------- 기본 경로/설정 ----------

DEFAULT_VAULT = Path('/Users/turtlesoup0-macmini/obsidian/turtlesoup0')
DEFAULT_DICT = Path('/Users/turtlesoup0-macmini/Projects/obsidian-tts/docker/tts-proxy/data/acronym-dict.json')
DEFAULT_ENDPOINT = 'http://127.0.0.1:8091/v1/chat/completions'
DEFAULT_MODEL = 'mlx-community/gemma-4-e4b-it-4bit'

# macOS/Linux 표준 영어 단어 사전. 일반 영어 단어(AFTER, BEFORE, COLUMN, GRANT 등)가
# SPELL 로 잘못 분류되는 것을 막는 신호. 4자 이상 토큰만 적용 (짧은 토큰은 우연 일치
# 위험: AS, ON, AT, BE, IT, IS 같은 단어).
ENGLISH_WORDS_PATH = Path('/usr/share/dict/words')
MIN_LEN_FOR_DICT_LOOKUP = 4

# 영어 사전 룩업이 자동 잡지 못하는 ML/IT 도메인 모델·기술명 등은 명시적으로 WORD.
# (BERT, CLAUDE, GEMMA 등 — 영어 사전에 없거나, 있어도 일반 단어 의미와 다름)
DOMAIN_WORD_OVERRIDES = frozenset({
    'BERT', 'GEMMA', 'CLAUDE', 'LLAMA', 'GPT', 'GPTS',  # ML 모델
    'CUDA', 'METAL', 'OPENGL', 'WEBGL',                  # 그래픽/컴퓨팅
    'KAFKA', 'NGINX', 'REDIS', 'NPM',                    # 인프라
    'YOLO',                                              # 알고리즘
})

# normalizer.py 와 동일한 토큰 패턴 (한글 인접 경계도 잡음)
ACRONYM_PATTERN = re.compile(r'(?<![A-Za-z0-9_])[A-Z][A-Z0-9]{1,5}(?![A-Za-z0-9_])')

VOWELS = set('AEIOU')

# normalizer.py 의 ACRONYM_WHITELIST / ACRONYM_FORCE_SPLIT 와 일치 시켜야 함.
# 빌드 단계에서 미리 결과를 채워두면 LLM 호출이 줄어든다.
WHITELIST_AS_WORD = frozenset({
    'NATO', 'NASA', 'ARMA', 'ARIMA', 'GARCH', 'JSON', 'JPEG', 'GIF', 'PNG',
    'SCUBA', 'LASER', 'RADAR', 'SONAR', 'OPEC', 'ASEAN', 'UNICEF', 'UNESCO',
    'AJAX', 'SOAP', 'YAML', 'TOML', 'BIOS', 'MIDI', 'WIFI',
})
FORCE_SPELL = frozenset({
    'CEO', 'CFO', 'CTO', 'CIO', 'COO', 'KPI', 'ROI', 'IPO', 'IR', 'PR',
    'API', 'SDK', 'CLI', 'GUI', 'CRM', 'ERP', 'OS', 'IT', 'IP', 'IoT',
    'AWS', 'GCP', 'IAM', 'EC2', 'S3', 'RDS', 'VPC', 'DNS', 'CDN', 'SSO',
    'AI', 'ML', 'DL', 'NLP', 'LLM', 'RAG', 'CV', 'GPU', 'TPU', 'FPGA',
    'ETL', 'OLAP', 'OLTP', 'BI', 'EDW', 'DW',
    'TLS', 'SSL', 'MFA', 'RBAC', 'CSRF', 'XSS', 'CVE', 'SOC',
    'IPv4', 'IPv6', 'UDP', 'SSH', 'FTP', 'SMTP', 'IMAP', 'POP3',
})

# LLM 분류 프롬프트 — 매우 짧게. 출력 토큰 최소화로 속도 최대화.
SYSTEM_PROMPT = (
    'You classify English acronym pronunciation for Korean TTS.\n'
    'Output exactly one word: WORD or SPELL.\n'
    '- WORD: pronounceable as a single word (NATO, NASA, ARMA, JSON, SCUBA, RADAR, JPEG)\n'
    '- SPELL: must be spelled letter by letter (JWT, HTTP, ICBM, CEO, API, SQL, TCP, NHL)\n'
    'No explanation. No punctuation. Just WORD or SPELL.'
)


def extract_unique_tokens(vault: Path, exclude_glob: list[str]) -> Counter[str]:
    """vault 의 모든 *.md 에서 영문 약어 토큰을 빈도와 함께 추출."""
    counter: Counter[str] = Counter()
    n_files = 0
    for md in vault.rglob('*.md'):
        # 제외 디렉터리 (.git, .obsidian, .trash 등)
        if any(part.startswith('.') for part in md.relative_to(vault).parts[:-1]):
            continue
        if any(md.match(g) for g in exclude_glob):
            continue
        try:
            text = md.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue
        n_files += 1
        for m in ACRONYM_PATTERN.finditer(text):
            counter[m.group(0)] += 1
    print(f'[scan] scanned {n_files} files, {len(counter)} unique tokens')
    return counter


def load_english_words(path: Path = ENGLISH_WORDS_PATH) -> frozenset[str]:
    """macOS/Linux 표준 영어 단어 사전을 uppercase set 으로 로드."""
    if not path.is_file():
        return frozenset()
    try:
        with path.open(encoding='utf-8', errors='ignore') as f:
            return frozenset(w.strip().upper() for w in f if w.strip())
    except OSError:
        return frozenset()


_ENGLISH_WORDS = load_english_words()


def heuristic_verdict(token: str) -> str:
    """LLM 호출 없이 즉시 결정 가능한 케이스. 룰은 normalizer.py 와 동일."""
    if token in WHITELIST_AS_WORD:
        return 'WORD'
    if token in DOMAIN_WORD_OVERRIDES:
        return 'WORD'
    if token in FORCE_SPELL:
        return 'SPELL'
    # 영어 사전 룩업: 4자 이상 + 영어 단어 → 단어로 발음 (AFTER, COLUMN, GRANT 등)
    if len(token) >= MIN_LEN_FOR_DICT_LOOKUP and token in _ENGLISH_WORDS:
        return 'WORD'
    letters = ''.join(c for c in token if c.isalpha())
    if not letters:
        return 'WORD'
    vc = sum(1 for c in letters if c in VOWELS)
    if vc == 0 or vc / len(letters) <= 0.25:
        return 'SPELL'
    # 모음 비율 25% 초과: 휴리스틱으로 단정 어려움 → LLM 에게 맡김
    return ''


def audit_dict(existing: dict[str, str]) -> tuple[dict[str, str], list[tuple[str, str, str]]]:
    """
    기존 사전을 영어 단어 사전 + 도메인 override 기준으로 재검토.
    Returns (new_dict, changes) where changes is [(token, old_value, new_value), ...].
    LLM 호출 없음. 빠르고 결정론적.
    """
    new = dict(existing)
    changes: list[tuple[str, str, str]] = []
    for token, current_value in existing.items():
        # 현재 SPELL ('X X X X' 형태) 인 경우만 재검토 대상.
        # WORD 인 entry 는 이미 단어 발음으로 정해진 거라 건드리지 않음.
        is_spell = current_value != token
        if not is_spell:
            continue
        # 영어 단어 사전 또는 도메인 override 에 해당하면 WORD 로 변환.
        should_be_word = (
            token in DOMAIN_WORD_OVERRIDES
            or token in WHITELIST_AS_WORD
            or (len(token) >= MIN_LEN_FOR_DICT_LOOKUP and token in _ENGLISH_WORDS)
        )
        # FORCE_SPELL 에 명시된 토큰은 절대 변환하지 않음 (사용자 의도 우선).
        if token in FORCE_SPELL:
            continue
        if should_be_word:
            new[token] = token
            changes.append((token, current_value, token))
    return new, changes


def query_llm(token: str, endpoint: str, model: str, timeout: float) -> str:
    """LLM 호출. 'WORD' / 'SPELL' / '' (실패) 반환."""
    payload = {
        'model': model,
        'messages': [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': token},
        ],
        'temperature': 0.0,
        'max_tokens': 2048,
        'stream': False,
        'chat_template_kwargs': {'enable_thinking': False},
    }
    body_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        endpoint,
        data=body_bytes,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
        body = json.loads(raw)
        content = (body['choices'][0]['message'].get('content') or '').strip().upper()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError,
            ValueError, KeyError, IndexError) as exc:
        print(f'  [WARN] LLM error for {token!r}: {exc}', file=sys.stderr)
        return ''
    # 응답 안에 SPELL 또는 WORD 포함 여부로 판정 (모델이 부가 텍스트 섞을 가능성 대비)
    if 'SPELL' in content:
        return 'SPELL'
    if 'WORD' in content:
        return 'WORD'
    return ''


def verdict_to_value(token: str, verdict: str) -> str:
    if verdict == 'SPELL':
        return ' '.join(token)
    return token


def save_dict(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sorted_data = dict(sorted(data.items()))
    path.write_text(
        json.dumps(sorted_data, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--vault', type=Path, default=DEFAULT_VAULT)
    p.add_argument('--dict', dest='dict_path', type=Path, default=DEFAULT_DICT)
    p.add_argument('--endpoint', default=DEFAULT_ENDPOINT)
    p.add_argument('--model', default=DEFAULT_MODEL)
    p.add_argument('--timeout', type=float, default=30.0)
    p.add_argument('--rebuild', action='store_true', help='기존 사전 무시하고 전체 재빌드')
    p.add_argument('--limit', type=int, default=None, help='빈도 상위 N개만 처리')
    p.add_argument('--min-count', type=int, default=1, help='최소 출현 빈도')
    p.add_argument(
        '--exclude', action='append', default=['*.bak', '*.broken-*', 'obsidian-tts-config.md'],
        help='파일명 glob 제외 (반복 가능)',
    )
    p.add_argument(
        '--audit', action='store_true',
        help='vault 스캔 없이 기존 사전만 영어 단어 사전 기준으로 재검토 (LLM 호출 없음)',
    )
    args = p.parse_args()

    print(f'[cfg] vault    = {args.vault}')
    print(f'[cfg] dict     = {args.dict_path}')
    print(f'[cfg] endpoint = {args.endpoint}')
    print(f'[cfg] model    = {args.model}')

    if not args.vault.is_dir():
        print(f'[ERROR] vault not found: {args.vault}', file=sys.stderr)
        return 2

    # 기존 사전 로드
    existing: dict[str, str] = {}
    if not args.rebuild and args.dict_path.exists():
        try:
            existing = json.loads(args.dict_path.read_text(encoding='utf-8'))
            print(f'[load] existing dict: {len(existing)} entries')
        except (OSError, json.JSONDecodeError) as exc:
            print(f'[WARN] cannot read existing dict ({exc}); starting fresh', file=sys.stderr)

    print(f'[load] english word dict: {len(_ENGLISH_WORDS)} entries from {ENGLISH_WORDS_PATH}')

    # --audit 모드: vault 스캔/LLM 호출 없이 기존 사전만 재검토
    if args.audit:
        if not existing:
            print('[ERROR] --audit requires existing dict', file=sys.stderr)
            return 2
        new_dict, changes = audit_dict(existing)
        print(f'[audit] candidates SPELL → WORD: {len(changes)}')
        if changes:
            for tok, old, new in changes:
                print(f'  {tok!r:12} {old!r:18} → {new!r}')
            save_dict(args.dict_path, new_dict)
            print(f'[done] saved {len(new_dict)} entries → {args.dict_path}')
            print(f'[stat] WORD={sum(1 for v in new_dict.values() if v not in [" ".join(k) for k in [v.replace(" ", "")]])}')
            words  = sum(1 for k, v in new_dict.items() if v == k)
            spells = sum(1 for k, v in new_dict.items() if v != k)
            print(f'[stat] WORD={words}, SPELL={spells}')
        else:
            print('[done] no changes')
        return 0

    # 토큰 추출
    counter = extract_unique_tokens(args.vault, args.exclude)
    candidates: list[tuple[str, int]] = sorted(
        ((tok, cnt) for tok, cnt in counter.items() if cnt >= args.min_count and tok not in existing),
        key=lambda x: -x[1],
    )
    if args.limit is not None:
        candidates = candidates[: args.limit]

    print(f'[plan] new tokens to process: {len(candidates)}')
    if not candidates:
        print('[done] dict already up-to-date')
        return 0

    # 휴리스틱으로 즉시 결정되는 토큰 + LLM 필요 토큰 분리
    new_dict = dict(existing)
    instant_count = 0
    llm_count = 0
    word_count = 0
    spell_count = 0

    for i, (tok, cnt) in enumerate(candidates, 1):
        h = heuristic_verdict(tok)
        if h:
            new_dict[tok] = verdict_to_value(tok, h)
            instant_count += 1
            if h == 'WORD':
                word_count += 1
            else:
                spell_count += 1
            print(f'  [{i}/{len(candidates)}] {tok} (×{cnt}) → {new_dict[tok]!r} (heuristic)')
            continue

        t0 = time.time()
        verdict = query_llm(tok, args.endpoint, args.model, args.timeout)
        dt = time.time() - t0
        llm_count += 1

        if not verdict:
            # LLM 실패 → 보수적으로 WORD (휴리스틱이 결정 못한 케이스는 모음 충분하니
            # 단어 발음이 자연스러울 가능성 높음)
            verdict = 'WORD'

        new_dict[tok] = verdict_to_value(tok, verdict)
        if verdict == 'WORD':
            word_count += 1
        else:
            spell_count += 1
        print(f'  [{i}/{len(candidates)}] {tok} (×{cnt}) → {new_dict[tok]!r} (LLM, {dt:.2f}s)')

        # 중간 저장 (크래시 대비, 20개마다)
        if i % 20 == 0:
            save_dict(args.dict_path, new_dict)

    save_dict(args.dict_path, new_dict)

    print()
    print(f'[done] saved {len(new_dict)} entries → {args.dict_path}')
    print(f'[stat] new processed: {len(candidates)} (instant={instant_count}, LLM={llm_count})')
    print(f'[stat] verdict distribution: WORD={word_count}, SPELL={spell_count}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
