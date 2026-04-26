# ADR-0001: Local-first アーキテクチャの採用

- Status: Accepted
- Date: 2026-04-25
- Decision Drivers: プライバシー要件、運用コスト最小化、データ主権

## Context

小説らいたー ver16 は AI 駆動の小説執筆支援 Web アプリ。現状（PR #10〜#14 を経た 2026-04-25 時点）の構成と課題:

### 現状
- FE: React + TypeScript + Vite
- BE: Express on Cloud Run（asia-northeast1, novel-writer-dev）
- AI: Vertex AI（gemini-2.5-flash, Imagen）
- 永続化: Firestore がコンテンツ正本（PR #10 で localStorage→Firestore 移行済み）
- 認証: なし（`--allow-unauthenticated` で全 API 無認証公開中）
- ユーザー: ゼロ（未公開・開発段階）

### 問題
1. **コンテンツのクラウド保管に対するユーザー意向**: 創作物（小説本文・設定・プロット）をクラウドに置きたくない
2. **無認証 API による課金リスク**: 誰でも Vertex AI / Imagen を叩けて GCP 課金が爆発し得る（実コード上、Imagen は 1 リクエスト 4 画像生成）
3. **uid スコープ不在**: `server/services/projectService.ts` は全プロジェクト共有。任意のプロジェクトを誰でも読み書き削除可能
4. **将来の収益化**: 課金機能を入れる前提で設計を再構築したい

### 評価したオプション

| 案 | 概要 | 評価 |
|---|---|---|
| **A. 現状維持（Firestore 正本）** | サーバーサイド永続化、認証だけ追加 | ❌ ユーザー意向に反する。コンテンツ漏洩リスクが残る |
| **B. Local-first（IndexedDB 正本）+ メタのみクラウド** | コンテンツはブラウザ、識別/課金のみクラウド | ✅ 採用 |
| **C. 完全クライアント完結** | サーバー不要、Vertex を直叩き | ❌ Vertex AI のキー露出、課金保護不能 |

## Decision

**B 案（Local-first + 認証メタクラウド）を採用する。**

### アーキテクチャ概要
- **ブラウザ IndexedDB（Dexie.js）= コンテンツ正本**
  - projects, novelContent, chatHistory, settings, knowledgeBase, plotBoard, timeline, historyTree
- **localStorage = UI 設定のみ**（theme, panelSize 等）
- **Firestore = メタのみ**
  - `users/{uid}`: email, plan, preferences
  - `usage/{uid_yyyymm}`: AI 使用量カウンタ
  - `stripeEvents/{eventId}`: Webhook 冪等化
- **Cloud Storage = opt-in 暗号化バックアップ**（クライアント側 AES-GCM、E2EE）
- **認証**: Firebase Auth（Google プロバイダのみ、Anonymous Auth は不採用）
- **3 層プラン**:
  - Tier 0: 未ログイン（AI 不可、ローカル執筆のみ）
  - Tier 1: Google ログイン（無料、AI 月 30 回テキストのみ、Imagen 不可）
  - Tier 2: Stripe 有料（AI 増枠、Imagen 可、E2EE バックアップ opt-in 可）
- **複数端末同期は実装しない**（Export/Import で持ち歩く）

### 意思決定の経緯
1. 私（Claude）が初版アーキテクチャを提案
2. `/codex plan` でセカンドオピニオン取得（threadId: 019dc4e5-65df-7e82-a5b4-12a3eadff26c）
   - 主要修正: Anonymous Auth 不採用、Firestore project index 不採用、AI クォータは transaction 予約制 + requestId 冪等化、無料枠は回数ではなくコスト上限ベース
3. `/codex security` でセキュリティレビュー取得（threadId: 019dc4f1-1fbe-7ba1-91d9-d5c049871861）
   - 主要修正: Cloud Run の無認証公開停止が最優先、DOMPurify 必須、Stripe Webhook の raw body / 署名検証 / 冪等化、Cloud Storage 署名 URL の短命化と uid スコープ
4. 緊急対応として Cloud Run を非公開化（`allUsers` の `roles/run.invoker` 削除）+ `max-instances=2` + 月 1,000 円予算アラート設定済み

## Consequences

### 利点
- コンテンツがクラウドに残らない（プライバシー要件達成）
- Vertex AI が認証必須になり、課金保護が確実
- E2EE オプションでバックアップ希望者にも対応
- Firestore 容量・読み書き量が大幅減（個人開発のコスト最小化）
- 仕様シンプル化（複数端末同期を実装しない）

### 欠点・受容するリスク
- **端末紛失 = 小説喪失**（opt-in バックアップで緩和）
- ブラウザのストレージクリアでデータ消失（Export 警告 UI で緩和）
- 別端末で続きを書くには Export/Import 手作業が必要
- E2EE は XSS 時に鍵・平文ともに流出（DOMPurify + CSP で緩和、設計上の限界として明記）

### 開放する課題
- Stripe 課金導入時の法務作業（利用規約、特商法、プライバシーポリシー）
- 将来「複数端末同期」要望が出た場合の対応（CRDT 検討、ただし当面は Export/Import で対応）
- Firebase Auth Emulator と Cloud Run の本番認証フローの差異（M3 で対応）

## Implementation Roadmap

| マイルストーン | 内容 | 状態 |
|---|---|---|
| M0 | 緊急対応（Cloud Run 非公開化、max-instances 制限、予算アラート） | ✅ 完了（2026-04-25） |
| M1 | 基盤整備（IaC 化、防御層、Firebase 準備） | ✅ 完了（2026-04-26） |
| M2 | 認証 + IndexedDB 移行 | ⏳ |
| M3 | AI 認証ゲート + クォータ | ⏳ |
| M4 | Export/Import + バックアップ警告 UI | ⏳ |
| M5 | Stripe Subscription + Webhook + 法務 | ⏳ |
| M6 | E2EE 暗号化バックアップ（任意機能、後回し可） | ⏳ |
| M7 | 公開準備 | ⏳ |

詳細は `docs/spec/m1/tasks.md` 以降を参照。

## References

- Codex plan review: 2026-04-25, threadId 019dc4e5-65df-7e82-a5b4-12a3eadff26c
- Codex security review: 2026-04-25, threadId 019dc4f1-1fbe-7ba1-91d9-d5c049871861
- アーキテクチャ図: `docs/diagrams/architecture-target.html`
- 現状アーキテクチャ図: `docs/diagrams/architecture.html`

## M1 振り返り（2026-04-26）

3 PR (#17 PR-A, #18 PR-B, #19 PR-C) 全て計画通り逐次マージ完了。実作業時間として計画値（合計 4 〜 6 時間）に対し実績ほぼ一致（カレンダー時間ではなく純粋な作業時間ベースの主観評価）。

**うまくいった点:**

- ADR + tasks.md でスペックを先に固めたため、各 PR の AC が明確で「完了とは何か」のブレが出なかった
- PR-B でマルチエージェントレビューが silent failure を 3 件検出（H1 maskError ガード / H2 CORS reject 漏洩 / H3 Vertex AI エラー素通し）→ 同 PR 内で修正でき、後追い PR を発生させずに済んだ
- PR-C で `_setup-emulator-env.ts` を副作用 import に分離する設計を、レビュー反映の段階で取り入れた（M3 で firebaseAdmin.ts top-level に env 依存が入っても hoisting で壊れない構造）

**課題・M3 以降への申し送り:**

- 自動テスト未整備のため、AC 検証は手動 curl/手動操作中心。M3（認証ゲート本実装）から契約テスト + ルール unit テストの導入を本格検討
- PR-C の admin SDK スタブには次の 4 項目を後回しにしている。M3 で routes に組み込むタイミングで一括対応する（PR #19 コメントに引き継ぎ事項として記録済み）:
  1. prod で `applicationDefault()` 失敗時の `logError` 統合（errorIds.ts 連携）
  2. prod で `projectId` env 未設定時の fail-fast（dev fallback の段階的廃止）
  3. test スクリプトの Anonymous プロバイダ未許可エラー時の具体メッセージ化（`auth/admin-restricted-operation` 検出時）
  4. テスト用 `__resetFirebaseAdminAppForTesting()` の露出検討（NODE_ENV ガード付き）
- GitHub Actions の各 action が Node 20 ベース。**廃止予定日は暫定**（公式 [GitHub blog (2025-09-19)](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/) は "fall of 2026" と曖昧表現、PR #17 のデプロイログ由来で `2026-06-02` 強制 / `2026-09-16` 廃止と推定）。M2 着手前後で公式状況を再確認のうえ `actions/checkout@v5` 等の major 追従を一括実施する
