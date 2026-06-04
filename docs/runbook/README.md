# Runbook Index

運用手順書 (runbook) のインデックス。各 runbook は本田様 (運用者) が GCP Console / gcloud CLI を叩く際の手順書として使用する。

## 一覧

| Runbook | 対象 | 関連 Issue |
|---------|------|-----------|
| [Cloud Logging safetyEvent metrics](./cloud-logging-safety-event-metrics.md) | promptSafety の log-based metric + alert policy setup / 通常運用 grep / 異常時トリアージ | [#137 #7](https://github.com/Yukina1116/novel-writer/issues/137) |

## 運用規約

- runbook は **正本** として扱う。`docs/spec/` の設計文書は背景説明、本ディレクトリは「実行可能な手順書」。
- 手順変更時は runbook 本体を更新し、対応する script (`scripts/setup-*.sh`) と整合させる。drift は static test (`tests/static/*.test.ts`) で検知される構造を維持する。
- 環境依存値 (project ID / notification channel ID / 閾値) は runbook 内に hardcoded せず、本田様が手で埋める形式とする。
