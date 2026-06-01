"""
normalizer.py 특성/회귀 테스트.

실행:
    TTS_NORMALIZE_ENABLED=true python3 test_normalizer.py
    또는  python3 -m pytest test_normalizer.py   (env 는 아래에서 강제 설정)

회귀 가드 대상 (multi-agent review R1):
  - NORM-5: 복수형/소유격 약어(APIs, JWTs, URLs, IDs, API's)가 통째로 단어
            처리되어 정규화 누락되던 false negative.
  - NORM-6: mixed-case 엔트리(IoT/IPv4/IPv6)는 대문자 전용 토큰 패턴에
            절대 매칭되지 않는 죽은 엔트리 — 동작 변화 없음을 고정.
"""

import os

# ENABLED 는 import 시점에 읽으므로 import 전에 설정해야 한다.
os.environ['TTS_NORMALIZE_ENABLED'] = 'true'
os.environ.pop('TTS_NORMALIZE_DICT_PATH', None)  # 사전 없는 휴리스틱 단독 모드

import normalizer  # noqa: E402

n = normalizer.normalize_for_tts


# ---------- NORM-5: 복수형 / 소유격 ----------

def test_plural_force_split():
    assert n('APIs') == 'A P I s'        # API ∈ FORCE_SPLIT
    assert n('URLs') == 'U R L s'        # URL ∈ FORCE_SPLIT
    assert n('IDs') == 'I D s'           # ID ∈ FORCE_SPLIT

def test_plural_vowel_heuristic():
    assert n('JWTs') == 'J W T s'        # 모음 0 → 분리
    assert n('HTTPs') == 'H T T P s'

def test_possessive():
    assert n("API's") == "A P I's"       # 소유격은 마지막 글자에 붙임
    assert n('API’s') == 'A P I’s'       # 유니코드 곡선 따옴표도 처리

def test_plural_in_korean_sentence():
    assert n('JWT를 검증하고 APIs를 호출') == 'J W T를 검증하고 A P I s를 호출'

def test_whitelist_plural_unchanged_base():
    # 화이트리스트(단어처럼 발음) 약어는 본체 그대로, 접미 재부착
    assert n('JSONs') == 'JSONs'


# ---------- NORM-6: mixed-case 죽은 엔트리 ----------

def test_mixed_case_untouched():
    # 패턴이 대문자/숫자만 잡으므로 mixed-case 는 정규화되지 않음 (이전과 동일)
    assert n('IoT 기기') == 'IoT 기기'
    assert n('IPv6 주소') == 'IPv6 주소'
    assert n('IPv4') == 'IPv4'


# ---------- 기존 동작 회귀 가드 ----------

def test_force_split_singular():
    assert n('API') == 'A P I'

def test_vowel_zero_split():
    assert n('JWT') == 'J W T'
    assert n('HTTP') == 'H T T P'
    assert n('ICBM') == 'I C B M'        # 25% 경계

def test_whitelist_kept():
    assert n('JSON') == 'JSON'
    assert n('NATO') == 'NATO'

def test_korean_adjacent_boundary():
    assert n('SQL은') == 'S Q L은'

def test_internal_no_match():
    # 영문 단어 내부/Capitalized 일반 단어는 건드리지 않음
    assert n('Apis') == 'Apis'
    assert n('Internal') == 'Internal'

def test_uppercase_s_not_treated_as_plural():
    # 본체 끝의 대문자 S 는 약어의 일부 — 복수형 접미로 잘못 떼어내면 안 됨.
    # (NORM-5 접미 그룹이 greedy 본체를 침범하지 않는지 핵심 가드)
    assert n('HTTPS') == 'H T T P S'     # 모음0 → 전체 분리, 's' 접미 아님
    assert n('APIS') == 'APIS'           # 어느 목록에도 없음 + 모음 비율 → 그대로

def test_mixed_case_rejected_via_suffix():
    assert n('DDoS') == 'DDoS'           # 소문자 o → 매칭 안 됨

def test_punctuation_adjacent():
    assert n('(API)') == '(A P I)'
    assert n('API.') == 'A P I.'

def test_digit_ending_plural_possessive():
    assert n('EC2s') == 'E C 2 s'
    assert n("S3's") == "S 3's"

def test_two_letter_trailing_s_no_match():
    assert n('Is') == 'Is'
    assert n('As') == 'As'

def test_possessive_on_whitelist_base():
    # base==tok(화이트리스트) 경로 + 소유격: 접미 재부착, 분리 없음
    assert n("JSON's") == "JSON's"

def test_embedded_id_not_split():
    # 새로 추가한 FORCE_SPLIT 'ID' 가 단어 내부/식별자에서 오분리되지 않는지
    assert n('session_ID') == 'session_ID'
    assert n('rapID') == 'rapID'
    assert n('UUID') == 'UUID'

def test_disabled_passthrough():
    saved = normalizer.ENABLED
    try:
        normalizer.ENABLED = False
        assert normalizer.normalize_for_tts('APIs JWT') == 'APIs JWT'
    finally:
        normalizer.ENABLED = saved

def test_empty():
    assert n('') == ''


if __name__ == '__main__':
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith('test_') and callable(fn):
            try:
                fn()
                print(f'PASS {name}')
            except AssertionError as e:
                failures += 1
                print(f'FAIL {name}: {e!r}')
    print(f'\n{"OK" if failures == 0 else str(failures) + " FAILED"}')
    raise SystemExit(1 if failures else 0)
