# Handoff: 開発者向け公開ページ /dev/ 追加セッション

- Session Date: 2026-04-30（夜セッション、無料機能完成後の付帯ドキュメント整備）
- Owner: yasushi-honda
- Status: ✅ 再開可能（無料範囲のアプリ機能完成 + 公開可能 + 開発者ポータル稼働）
- Previous handoff: [LATEST.md @ 2026-04-29 本番運用修正](./LATEST.md)（merge 後にこの handoff に置き換え）

## 今セッションのトリガー

ユーザーから「設計どおりに進行できているか目視チェックしたい」「Mermaid 図でアーキテクチャを俯瞰したい」「簡単なマニュアル（ヘルプ）が欲しい」「開発者ページとして公開リンクが欲しい」と要望。`/fd` (frontend-design) スキル経由でデザイン方針を確定し、単一 HTML として実装。

## 今セッションの完了内容

| PR | 内容 | 状態 | 規模 |
|---|---|---|---|
| #84 | feat(dev-portal): 開発者向け公開ページ `/dev/` を追加（目視チェック 50 項目 + Mermaid 図 8 枚 + 5 ステップマニュアル + Q&A + 開発者情報） | ✅ merged (`ea78c72`) | 2 ファイル +1601/-0 |

Quality Gate 実施実績:

- **#84 (large tier、行数換算では 200+ LOC だが実体は静的 HTML 1 ファイル)**: ローカル prod モードで `/dev/` HTTP 200 / 65,405 bytes / SPA fallback 非干渉を curl 検証、`npm run lint` 0 errors / `npm run test` 435/435 PASS、CSP レスポンスヘッダで `cdn.jsdelivr.net` 追加を確認。アプリロジック非依存のため evaluator / codex review はスキップ判定（実体は静的ドキュメント、innerHTML 不使用で XSS 経路ゼロ）

## 主要設計判断（本セッションで確定）

| 判断 | 採用 | 理由 |
|---|---|---|
| 配置先 | 同 Cloud Run の `/dev/` パス（別 hosting なし） | 既存 GitHub Actions WIF → Cloud Run の auto deploy パイプラインに乗る。`public/dev/index.html` を Vite の publicDir 経由で `dist/dev/index.html` にコピーすれば serve-static が末尾スラッシュ補完で配信、SPA fallback が起動する前に解決される |
| Mermaid のロード方式 | CDN (`cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs`) | npm bundle すると ~1MB+ 増、本番 FE の bundle サイズに悪影響。`/dev/` は開発者向けで利用頻度が低くロード時間より bundle 軽量化を優先 |
| CSP 拡張範囲 | `scriptSrc` に `https://cdn.jsdelivr.net` 1 ドメインのみ追加 | `styleSrc` / `fontSrc` には追加しない（Mermaid は CSS 不要、Google Fonts は既存許可で足りる）。最小権限 |
| アプリ本体への影響 | ゼロ（`/api/*` ・ SPA fallback 共に非干渉） | `express.static(distPath)` が `/dev/index.html` を先に解決するため fallback は発火しない |
| 認証ゲート | なし（公開、`<meta name="robots" content="noindex,nofollow">`） | 開発者ポータルというより「アプリの安心材料」をエンドユーザーにも見せたい性格。検索 index には載せない |
| innerHTML 不使用 | チェックリスト動的描画は `createElement` + `textContent` のみ | security_reminder hook 指摘を契機に、静的データ起源でも DOM API 統一。XSS 経路を構造的に閉じる |
| デザインテーマ | Architectural Blueprint（クリーム背景 + ダークインク + 朱赤アクセント、Cormorant Garamond / EB Garamond / JetBrains Mono） | generic AI ぽさ（Inter / 紫グラデ / 白背景）回避。技術ドキュメントとしての硬派さ + 美しい serif タイポグラフィ |
| 印刷対応 | `@media print` で全パネル展開・nav 非表示 | チェックリストを紙運用したい場合に対応 |

## 今セッションの公開 URL

- 開発者ポータル: `https://novel-writer-446321146441.asia-northeast1.run.app/dev/`
- 構成（タブ切替 7 セクション）:
  1. 概要（技術スタック / マイルストーン進捗カード）
  2. アーキテクチャ俯瞰（system map / state stratigraphy / type map）
  3. フロー図（auth seq / quota seq / M6 state / terms seq）
  4. マイルストーン進捗（gantt + M0〜M7-α/M5/M7-β タイムライン）
  5. **目視チェックリスト（50 項目 / 10 カテゴリ、localStorage 永続化、進捗バー、リセット、印刷展開）**
  6. かんたんマニュアル（5 ステップ + 画面の見方 + ショートカット + Q&A 6 件）
  7. 開発者情報（ENV / 主要ファイル / CI/CD 図 / 品質ゲート / 参照 docs）

### 目視チェック 10 カテゴリ
起動・認証 / プロジェクト管理 / 執筆機能 / AI 生成 / バックアップ (M4+M6) / 規約同意 (M7-α) / レスポンシブ / エラー処理 / パフォーマンス / 運用・監視

## 次セッション開始時の状態

- ブランチ: `docs/handoff-dev-portal` PR merge 後は `main` clean
- Open Issue: 1 件（#49 M4/M7 follow-up monitor、本セッションで状況変化なし）
- 自動テスト: vitest **435 / 435 PASS**（前セッション同数、HTML 追加のみで test 影響なし）
- 型チェック: `tsc --noEmit` 0 errors
- Cloud Run revision: PR #84 反映後の新 revision（`/dev/` の HTTP 200 / 65,405 bytes を curl 確認済）
- 公開 URL 動作: ✅ デプロイ完走後、`/dev/` でポータル正常配信

## 次のアクション（推奨順）

### 1. 法務確認（AI セッション外、MUST、引き続き保留）
M7-α 本番公開前法務確認は M6 完了セッションから継続して保留中。M5 / M7-β / 本番公開判断はすべて本確認の完了が前提。

### 2. M5 着手判断（法務確認状況に依存、ユーザー判断）
- **M5 着手**: Stripe Subscription + Webhook + Tier 2 法務節（M7-β 法務本文確定が前提）
- **M7-β 着手**: 公開最終チェック（Tier 2 規約節 + 特商法本文確定）
- **小規模技術改善**: Issue #49 monitor 対象の rating 5-6 follow-up を本番障害として再現したものから着手

### 3. 開発者ポータル `/dev/` のメンテナンス
マイルストーン進捗、テスト件数、Last Updated は手動更新。`public/dev/index.html` を grep で書き換える運用:
- `v0.0.0 (M7-α)` / `2026-05-01` / `Tests · 435 / 435 PASS`
- `<div class="milestone-row">` ブロックの状態（done / hold）
- gantt セクションの日付

M5 / M7-β 着手時に追記対象。

### 4. AC-11 後半「mobile Safari background throttle 後の再試行」を実機確認（ユーザー判断）
本セッションで方針変化なし。ユーザー判断で best-effort サポート扱い。

### 5. Issue #49 の monitor 継続
rating ≥ 7 全消化済の状態維持。再開条件は前 handoff と同じ（本番障害として再現した時点）。

## 主要参照

- 関連 PR: #84（dev-portal）
- 主要新規ファイル:
  - `public/dev/index.html`（単一 HTML、約 1600 行、Architectural Blueprint テーマ）
- 主要修正ファイル:
  - `server/index.ts`（CSP `scriptSrc` に `https://cdn.jsdelivr.net` 追加、コメントで /dev/ 用途明記）
- プロジェクト CLAUDE.md 追加: `### 開発者ポータル /dev/` 節（Architecture 配下）
