#!/usr/bin/env bash
# scripts/setup-safety-event-metrics.sh
#
# promptSafety 用 Cloud Logging log-based metrics と Cloud Monitoring alert
# policies の idempotent setup。
#
# Issue #137 #7、docs/spec/promptSafety/2026-06-04-observability-metric-counter-design.md
# docs/runbook/cloud-logging-safety-event-metrics.md (使い方の正本)
#
# Usage:
#   ./scripts/setup-safety-event-metrics.sh --project novel-writer-dev
#   ./scripts/setup-safety-event-metrics.sh --project novel-writer-prod --dry-run
#
# Requires:
#   - gcloud CLI (logged in)
#   - Cloud Logging API + Cloud Monitoring API 有効化
#   - IAM: roles/logging.configWriter + roles/monitoring.alertPolicyEditor
#
# 規律:
#   server/utils/promptSafetyEvents.ts の SAFETY_EVENTS と本 script の
#   SAFETY_EVENTS array は手動同期。tests/static/safety-events-lockstep.test.ts
#   が集合一致を検証する。

set -euo pipefail

# --- 引数 parse ---
PROJECT=""
DRY_RUN=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        --project)
            PROJECT="${2:-}"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        -h|--help)
            sed -n '3,18p' "$0" | sed 's/^# //; s/^#$//'
            exit 0
            ;;
        *)
            echo "[error] unknown arg: $1" >&2
            echo "Usage: $0 --project <PROJECT_ID> [--dry-run]" >&2
            exit 1
            ;;
    esac
done

if [[ -z "$PROJECT" ]]; then
    echo "[error] --project <PROJECT_ID> required" >&2
    echo "Usage: $0 --project <PROJECT_ID> [--dry-run]" >&2
    exit 1
fi

# M-1 (safe-refactor): --project の値が次フラグ (`--dry-run` 等) を誤吸収していないか
# 検出。`--project --dry-run` のような誤入力で flag 値がプロジェクト ID として
# 通ってしまうのを防ぐ。
if [[ "$PROJECT" == --* ]]; then
    echo "[error] --project value looks like a flag: '$PROJECT'" >&2
    echo "  did you forget the project ID? Usage: $0 --project <PROJECT_ID> [--dry-run]" >&2
    exit 1
fi

# GCP project ID 形式バリデーション
# https://cloud.google.com/resource-manager/docs/creating-managing-projects
#   - 6-30 文字
#   - 小文字 / 数字 / hyphen
#   - 先頭は小文字、末尾 hyphen 不可
if ! [[ "$PROJECT" =~ ^[a-z][-a-z0-9]{4,28}[a-z0-9]$ ]]; then
    echo "[error] invalid GCP project ID format: '$PROJECT'" >&2
    echo "  expected: 6-30 chars, lowercase/digit/hyphen, starts with lowercase, no trailing hyphen" >&2
    exit 1
fi

# gcloud 不在チェック: --dry-run 時は副作用ゼロのため skip (CI 環境で
# gcloud が未 install でも tests/static/safety-events-bash-syntax.test.ts の
# dry-run 検証が通るようにする)。実適用 (非 dry-run) 時のみ必須。
if (( ! DRY_RUN )) && ! command -v gcloud >/dev/null 2>&1; then
    echo "[error] gcloud CLI required but not found in PATH (use --dry-run if you only want to preview)" >&2
    exit 1
fi

# --- safetyEvent 定義 (server/utils/promptSafetyEvents.ts と手動同期) ---
# 順序は ALL_SAFETY_EVENT_NAMES の declaration 順 (Object.values 順) と一致させる。
# lockstep test (tests/static/safety-events-lockstep.test.ts) が集合一致を強制する。
SAFETY_EVENTS=(
    "image-omitted"
    "non-image-data-uri-omitted"
    "oversized-truncated"
    "recursion-depth-exceeded"
    "collection-overflow"
    "histogram-overflow"
)

# --- alert policy 初期 enabled / disabled の規約 ---
# histogram-overflow: aggregator OOM 防御の paired signal (cardinality 爆発の早期兆候)
#   発火即異常で閾値が「1 回」で自明、最小驚き原則により最初から enabled。
# 他 5 件: 実 baseline 観察後に閾値決定 → 本田様判断で enable。
ALERT_ENABLED_BY_DEFAULT=("histogram-overflow")

is_enabled_by_default() {
    local event="$1"
    local e
    for e in "${ALERT_ENABLED_BY_DEFAULT[@]}"; do
        if [[ "$e" == "$event" ]]; then
            return 0
        fi
    done
    return 1
}

event_to_metric_name() {
    # image-omitted → prompt_safety_image_omitted_count
    local event="$1"
    local underscored="${event//-/_}"
    echo "prompt_safety_${underscored}_count"
}

event_to_filter() {
    # 個別 (image-omitted) と batch (image-omitted-batch) を 1 metric に合算
    local event="$1"
    echo 'resource.type="cloud_run_revision" AND jsonPayload.safetyEvent=~"^'"$event"'(-batch)?$"'
}

# --- 1. log-based metric の idempotent create/update ---
for event in "${SAFETY_EVENTS[@]}"; do
    metric_name="$(event_to_metric_name "$event")"
    filter="$(event_to_filter "$event")"
    description="promptSafety: ${event} event count (individual + batch)"

    if (( DRY_RUN )); then
        echo "[dry-run] would create/update log-based metric:"
        echo "  name:        ${metric_name}"
        echo "  description: ${description}"
        echo "  filter:      ${filter}"
        echo ""
        continue
    fi

    if gcloud logging metrics describe "$metric_name" --project="$PROJECT" >/dev/null 2>&1; then
        echo "[apply] update log-based metric: ${metric_name}"
        gcloud logging metrics update "$metric_name" \
            --project="$PROJECT" \
            --description="$description" \
            --log-filter="$filter"
    else
        echo "[apply] create log-based metric: ${metric_name}"
        gcloud logging metrics create "$metric_name" \
            --project="$PROJECT" \
            --description="$description" \
            --log-filter="$filter"
    fi
done

# --- 2. alert policy scaffold (6 件、histogram-overflow のみ enabled) ---
# 注: alert policy 作成は notification channel ID が環境依存のため、
# 本 script では policy JSON を一時ファイルに書き出すまでで止め、実 create は
# 本田様が runbook §5 の手順で channel ID を埋めて gcloud alpha monitoring policies
# create する運用とする。詳細: docs/runbook/cloud-logging-safety-event-metrics.md
for event in "${SAFETY_EVENTS[@]}"; do
    metric_name="$(event_to_metric_name "$event")"
    if is_enabled_by_default "$event"; then
        initial_state="enabled"
        threshold_note="delta count >= 1 / 60s (paired signal, fire-on-first)"
    else
        initial_state="disabled"
        threshold_note="TBD per baseline observation (see runbook §5)"
    fi

    if (( DRY_RUN )); then
        echo "[dry-run] would scaffold alert policy:"
        echo "  metric:        ${metric_name}"
        echo "  initial state: ${initial_state}"
        echo "  threshold:     ${threshold_note}"
        echo ""
        continue
    fi

    echo "[scaffold] alert policy for ${metric_name} (${initial_state}, ${threshold_note})"
    # 実 create は runbook §5 で本田様判断 (notification channel ID 埋込必要)
done

echo ""
echo "[done] setup-safety-event-metrics.sh completed for project: ${PROJECT}"
if (( DRY_RUN )); then
    echo "[done] dry-run mode: no GCP resources were modified"
else
    echo "[done] alert policy 実 create は runbook §5 を参照 (notification channel ID 必要)"
fi
