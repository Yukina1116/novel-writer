# Handoff: SettingsPanel 復元ボタン削除 + 相関図/タイムラインヘルプ追加 + prod 移行方針合意

- Session Date: 2026-06-08
- Owner: yasushi-honda
- Status: ✅ **完了** — PR #162 / #163 ともにマージ + Cloud Run デプロイ + 本番 Playwright MCP 実機確認まで完走。prod 移行方針も合意済み
- Previous: [2026-06-07b-ai-menu-icons-filled.md](./2026-06-07b-ai-menu-icons-filled.md)

## セッション要旨

2 件の UX 改善 PR を完走し、最後に `novel-writer-prod` GCP プロジェクトの実態確認と移行方針の合意を行った。本セッション時点で外部公開ユーザーは存在せず、prod 構築は「bugfix 一通り完了」を trigger とした条件待ち。

## 本セッション PR

| PR | 内容 | 状態 |
|----|------|------|
| **#162** | feat(ui): SettingsPanel から「バックアップから復元」ボタンを削除 (1 file, +3/-42) | ✅ `fcd696b` |
| **#163** | feat(help): キャラクター相関図とタイムラインのヘルプコンテンツを追加 (1 file, +22/-0) | ✅ `d1308af` |

### PR #162 詳細

**背景**: 左カラム (SettingsPanel) の「バックアップ」セクションにあった「バックアップから復元」ボタンは、編集中の文脈で押すと現プロジェクトの全上書きを伴うため誤操作リスクが高い。Issue #104 evaluator MEDIUM 指摘で「編集中の安全弁」として残していたが、本田様判断で「ここにあっても意味がない、タイトル画面にあれば充分」として撤去。

**変更**:
- `components/panels/SettingsPanel.tsx`
  - `handleImportFile` / `importInputRef` / 関連 `<input type="file">` / 「バックアップから復元」`<button>` を削除
  - 未使用となった `useRef` / `readFileAsText` / `prepareImport` / `showToast` import を削除
  - Issue #104 evaluator MEDIUM コメントを削除
- 復元動線は ProjectSelectionScreen「データ管理」セクションに集約（同画面の「バックアップから復元」ボタンは不変）

### PR #163 詳細

**背景**: 相関図モーダル (`components/CharacterChart.tsx:251`) とタイムラインモーダル (`components/TimelineModal.tsx:238`) の右上「？」ボタンは `helpContent[topic]` を参照していたが、`constants.ts` に該当 topic が未定義で「ヘルプが見つかりません」フォールバックが表示されていた。

**変更**:
- `constants.ts` の `helpContent` に `characterChart` (5 sections) / `timeline` (5 sections) を追加
- 既存 `plotBoard` と同じ構造（`title` / `description` / `sections[heading, body, useCase?, example?]`）
- `characterChart` セクション: モードの切り替え / キャラクターの配置（移動モード）/ 関係性の追加（追加モード）/ 関係性の削除（削除モード）/ AIへの活用
- `timeline` セクション: 新規イベントの作成 / レーンによる並列管理 / イベントの編集・並び替え / レーンの削除 / 矛盾チェック・伏線管理

### E2E 検証

| PR | 段階 | 検証内容 | 結果 |
|----|------|---------|------|
| #162 | Cloud Run デプロイ | `run #27093995017`, 2m11s | ✅ success |
| #162 | 本番 Playwright MCP | 左カラム「バックアップから復元」非表示 / 「バックアップを作成」表示・動作 / ProjectSelectionScreen「データ管理」復元動線不変 | ✅ |
| #163 | Cloud Run デプロイ | `run #27094777773`, 3m7s | ✅ success |
| #163 | 本番 Playwright MCP | 相関図モーダル → ?ボタン → 「キャラクター相関図の使い方」表示 / タイムラインモーダル → ?ボタン → 「タイムラインの使い方」表示 / 既存ヘルプ regression なし | ✅ |

## prod 移行方針の合意（本セッション後半）

### 確認した事実

| プロジェクト | 状態 | Cloud Run | 当機の利用状況 |
|-----------|------|----------|---------------|
| **`novel-writer-dev`** | ACTIVE | ✅ 稼働中 (`novel-writer-ramnh3ulya-an.a.run.app`) | デプロイ先 / 本田様の開発・検証用 / 実質的に唯一の動作環境 |
| **`novel-writer-prod`** | ACTIVE（プロジェクトの箱のみ） | ⛔ Cloud Run Admin API 未有効化 / サービス未作成 | **空** |

### 合意した運用方針

1. **現状は外部サービス公開していない**（本田様の開発・検証のみ、エンドユーザーゼロ）
2. **bugfix を一通り `novel-writer-dev` で完了させてから prod 構築に着手する**
3. **公開はそのまま prod URL から開始する**（dev → prod の URL 切替によるユーザー混乱を回避）
4. ユーザー影響配慮（再ログイン・利用規約再同意・usage カウンタ持ち越し）は **そもそも対象ユーザーがいないため不要**

### prod 構築時の作業見積もり（合意時の整理、着手時点で再評価）

| カテゴリ | 内容 | 想定難易度 |
|---------|------|----------|
| GCP リソース | Cloud Run Admin API 有効化 / Service Account / Workload Identity / Vertex AI 有効化 / 課金クォータ申請（CLAUDE.md 記載「クォータ引き上げ待ち」が現在も継続中か要確認） | 中 |
| GitHub Actions | `.github/workflows/deploy.yml` を prod 向け or 環境別分岐に改修、WIF の prod 用 OIDC trust 追加 | 中 |
| Firebase | prod プロジェクトの `VITE_FIREBASE_*` 6 変数を GitHub Secrets に登録 | 小 |
| ドメイン | カスタムドメインを使うなら DNS 設定 / 不要なら `*.run.app` 直 URL のまま | 小〜中 |

## Issue Net 変化 (本セッション)

- **Close 数**: 0 件
- **起票数**: 0 件
- **Net**: **0 件**

UX 改善 PR 2 件は構造的問題なし、triage 基準該当事象なし。

## 残 Open Issue (前 handoff から不変、本田様判断待ち)

| Issue | 内容 | 緊急性 |
|------|------|--------|
| #137 | promptSafety umbrella (サブ #7 完了、残 #6 / #8) | LOW |
| #147 | PII path leak (codex review 由来) | LOW |
| #152 | update path paired signal | LOW |
| #155 | AC-3 backward compat test gap | LOW |
| #156 | callback register-or-forget リスク | LOW |

## 次のアクション (3 分割構造)

### 即着手タスク

なし

### 条件待ち（明示 trigger 付き）

| # | 項目 | A/B/C | trigger（充足条件） | 充足時のタスク |
|---|------|------|------------------|--------------|
| 1 | `novel-writer-prod` への構築着手 | C（起点指示済み） | 本田様が「bugfix 一通り完了」と判断したタイミング | impl-plan → GCP リソース構築 → workflow 分岐 → Firebase Secrets 登録 → smoke test |
| 2 | `./scripts/setup-safety-event-metrics.sh --project novel-writer-dev` 実行 | A（指示待ち） | 本田様からの実行指示 | metrics 初期化 |
| 3 | Cloud Logging baseline 観察 → alert enable 判断 | A（指示待ち） | 本田様からの判断結果（1〜4 週間後） | alert 設定変更 |
| 4 | Issue #137 残サブ #6 / #8 の milestone 計画 | B修正 / C（起点指示済み） | 本田様からの実装着手指示（番号単位） | impl-plan → 実装 |
| 5 | Issue #147 / #152 / #155 / #156 の優先順位決定・実装着手 | B修正 / C（起点指示済み） | 本田様からの番号単位明示指示 | impl-plan → 実装 |

### 却下候補（記録のみ）

| # | 項目 | A/B/C | 着手しない理由 |
|---|------|------|--------------|
| 1 | handoff 整理 / memory 整理 | A（指示なし） | housekeeping 越権防止（4 原則 §1）|
| 2 | 残 Issue への AI 起点実装提案 | C（起点 unclear） | 起点アイデアは decision-maker 領分 |
| 3 | 他箇所のヘルプ追加提案・UI 改善提案 | C（起点 unclear） | 同上 |
| 4 | テストカバレッジ向上・追加リファクタ | C（起点 unclear） | 同上 |
| 5 | prod 移行の前倒し着手提案 | C（起点合意済みだが trigger 未充足） | trigger は「bugfix 一通り完了」、現時点で充足していない |

## 再開可能性判定

| 項目 | 状態 |
|------|------|
| Git Status | ✅ clean（PNG 一時ファイル削除済み）|
| Open PR | ✅ ゼロ |
| Active Issue | 5 件（全て LOW + 本田様判断待ち、前 handoff から不変） |
| CI | ✅ Deploy to Cloud Run `#27094777773` success |
| 残留プロセス | ✅ なし |
| 即着手タスク | 0 件 |
| 条件待ち | 5 件（うち 1 件は本セッションで新規合意した「prod 移行」）|

## 最終結論

🛑 **executor 領分の作業ゼロ、即時セッション終了推奨**

- Open PR ゼロ / Git clean / CI success
- Active Issue 5 件は全て LOW + 本田様判断待ち（前 handoff から不変）
- 本セッションで合意した「prod 移行」は trigger（bugfix 一通り完了）未充足の条件待ち
- 包括指示「優先順にすすめて」で動ける即着手タスクは存在しない
