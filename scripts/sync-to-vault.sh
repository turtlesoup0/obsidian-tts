#!/bin/bash
# ============================================
# Projects → Obsidian vault 단방향 동기화
# ============================================
# Projects 가 git SoT, vault 는 Obsidian 런타임 복사본.
# Projects 에서 코드 수정/커밋 후 이 스크립트로 vault 로 내려보냄.
#
# Usage:
#   ./scripts/sync-to-vault.sh           # 실제 동기화
#   ./scripts/sync-to-vault.sh --dry-run # 변경 미리보기
# ============================================

set -e

SRC="$(cd "$(dirname "$0")/.." && pwd)/views/"
DST="$HOME/obsidian/turtlesoup0/3_Resource/obsidian/views/"

if [ ! -d "$SRC" ]; then
    echo "❌ SRC not found: $SRC"
    exit 1
fi
if [ ! -d "$DST" ]; then
    echo "❌ DST not found: $DST"
    exit 1
fi

DRY=""
if [ "$1" = "--dry-run" ]; then
    DRY="--dry-run"
    echo "🧪 DRY RUN — 실제 파일 변경 없음"
fi

echo "📤 $SRC"
echo "📥 $DST"
echo ""

rsync -a --delete $DRY \
    --exclude='.DS_Store' \
    --exclude='*.bak' \
    --exclude='*.broken-*' \
    --exclude='obsidian-tts-config.md' \
    -v \
    "$SRC" "$DST" | tail -30

if [ -z "$DRY" ]; then
    echo ""
    echo "✅ 동기화 완료 ($(date '+%Y-%m-%d %H:%M:%S'))"
    echo "   Obsidian 재로드 필요 (노트 Cmd+R 또는 앱 재기동)"
else
    echo ""
    echo "(dry-run 모드 — 실제 반영하려면 --dry-run 제외하고 재실행)"
fi
