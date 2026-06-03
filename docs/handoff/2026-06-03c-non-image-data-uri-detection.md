# Handoff: Issue #137 #1 non-image dataURI 検出層追加

- Session Date: 2026-06-03 (3 セッション目)
- Owner: yasushi-honda
- Status: 🟡 PR 作成待ち (feature/non-image-data-uri-detection ブランチ、ローカル commit 済)
- Previous handoff: [2026-06-03b-prompt-safety-hardening.md](./2026-06-03b-prompt-safety-hardening.md)

## 今セッションのトリガー

前セッション末で Issue #137 が #2 残り / #4 残り / #5 / #6 を残して open 維持。本田様から `次のアクション:優先順にすすめて` の指示を受け、最大規模 (設計議論を含む) の **Issue #137 #1 (non-image dataURI gap)** を brainstorm 経由で着手。

## brainstorm → impl-plan → 実装の流れ

| Phase | 内容 |
|---|---|
| brainstorm Phase 1〜3 | 現状把握 + 視覚補助スキップ + OQ 1 件 (どこから着手) → 案 B (非画像 dataURI 検出層追加) + MIN=500 確定 |
| brainstorm Phase 4-5 | 3 案 (A: MAX_FIELD_BYTES 引下げ / B: 検出層追加 / C: FE サニタイズ) 提示 → 案 B 採用 |
| **codex セカンドオピニオン** | 6 観点で評価 → Medium 指摘 2 件 (case normalize / edge case test) を採用 (B-2)、Low-Medium (mimeType observability) は別 Issue へ |
| brainstorm Phase 6-7 | 設計文書 `docs/spec/promptSafety/2026-06-03-non-image-data-uri-detection-design.md` 作成 + セルフレビュー (テスト件数 569→571 補正) |
| brainstorm Phase 8-9 | ユーザー承認 → `/impl-plan` 遷移 |
| impl-plan Phase 1-5 | T1-T10 計画提示 → 承認 |
| 実装 T1-T7 | TDD + safe-refactor + code-review low 全 PASS |

## 変更内容

### `server/utils/promptSafety.ts` (+50 行、改修 1 関数)

新規:
- `NON_IMAGE_DATA_URI_MARKER` (export)
- `DATA_URI_PREFIX = 'data:'` (private)
- `MIN_NON_IMAGE_DATA_URI_BYTES = 500` (private、image 側と対称)
- `normalizeForDataUriDetection(s)`: `s.trimStart().toLowerCase()` (case insensitive + 先頭空白吸収)
- `isNonImageDataUri(value)`: normalize 後 `data:` で始まり `data:image/` で始まらない + byte ≥ 500
- `stripPromptHeavyFields` 内に `nonImageAggregator` 追加

改修:
- `isImageDataUri`: normalize 後 string ベース判定に変更 (case insensitive 化、`DATA:IMAGE/PNG` 等を捕捉)
- `stripPromptHeavyFields.recurse` の string 経路: `image → non-image` 順の if 並列に変更

### `server/utils/promptSafety.test.ts` (+150 行、+16 件 PASS)

| describe | 件数 | 内容 |
|---|---|---|
| `非画像 dataURI 検出 (Issue #137 #1)` | 13 件 | AC-1〜7, AC-11〜14 (PDF/audio/font 800B / 短文素通し / 境界値 499/500/501 / case variant / 空白 / 空 MIME / no base64) |
| `画像 dataURI 検出 case insensitive 化` | 1 件 | AC-15 (`DATA:IMAGE/PNG` regression pin) |
| `非画像 observability + cross-event independence` | 2 件 | AC-8 (image-omitted-batch と non-image-data-uri-omitted-batch 別 event) / AC-9 (path log 区別) |

### `docs/spec/promptSafety/2026-06-03-non-image-data-uri-detection-design.md` (+206 行、commit 済)

12 セクション (概要 / 要件 / アーキテクチャ / データモデル / インターフェース / エラー処理 / テスト戦略 / スコープ外 / Open Questions / リスク / 実装手順 / 参考資料)。

## 検証結果

| 項目 | 結果 |
|---|---|
| `npm test -- promptSafety` | 67 件 PASS (52 + 16) |
| `npm test` (全件) | 587 件 PASS (571 + 16) |
| `npm run lint` (tsc --noEmit) | 0 errors |
| `/safe-refactor` (Phase 1) | HIGH/MEDIUM/LOW 0 件 (DRY 改善余地は対称設計優先で意図的に保留) |
| `/code-review low` | (none) — correctness bug 検出ゼロ |

## codex セカンドオピニオン反映状況

| 指摘 (Medium 以上) | 採用 | 反映先 |
|---|---|---|
| case normalize (`DATA:application/pdf`, `\n data:...` 等が現案だと素通し) | ✅ | `normalizeForDataUriDetection` + `isImageDataUri` 改修 |
| edge case テスト (`DATA:application/pdf`, `\n data:...`, `data:;base64,`, `data:,`, `DATA:IMAGE/PNG`) | ✅ | AC-11〜15 |
| mimeType observability (個別 warn payload に MIME 種別追加) | ⏸ Low-Medium | **別 Issue 起票候補** (運用ニーズが明確になった時点で) |

## Issue #137 の状態

本 PR は **Issue #137 #1 のみ対応**、Issue は **close せず open 維持**。残課題:

- **#2 残り**: collection-level guard (array 合計 byte 閾値で early summarize)
- **#5**: batch log の pathPrefixes histogram
- **#6**: logger.warnSampled altitude (別 milestone 検討案件)
- **新規候補**: mimeType observability (codex Low-Medium 指摘)

## 次のアクション

### 直近 (本セッション継続中)

1. **T9**: `git push -u origin feature/non-image-data-uri-detection` + `gh pr create` — feature ブランチを push し PR 作成
2. **T10**: CI Success 確認 (Cloud Run dev デプロイ) → 本田様の番号単位明示認可待ち → `gh pr merge --squash --auto`

### マージ後の手動確認 (本田様判断)

- **Cloud Logging で `safetyEvent: 'non-image-data-uri-omitted'` / `non-image-data-uri-omitted-batch` の発火確認** (本番 dev 環境で実トラフィック発生時)
- 既存待ち事項 (Cloud Logging で `image-omitted` 系発火確認 / モバイル実機確認 / 法務 / 多ターン E2E) は本 PR と独立で継続

### 中期 (本田様の優先順位判断)

- Issue #137 残課題 (#2 残り / #5 / #6 / mimeType observability) を次回セッションで個別 PR 化検討
- 緊急性 LOW + size guard backstop 機能中で実害なし状態は維持

## 学び / 規律

- **brainstorm + codex セカンドオピニオン + safe-refactor + code-review** の 4 段検証が小規模設計でも有効
- 「**設計文書 1 commit + 実装 1 commit + handoff 1 commit**」の規律で feature ブランチを clean に保つ (今 PR は数値補正の追加 1 commit を含めて計 4 commit 想定)
- AC-1〜15 を**設計文書時点で明示**し、TDD で test 名を `AC-N: ...` で一意化したことで設計-実装-テストの 3 層 traceability が確保された
