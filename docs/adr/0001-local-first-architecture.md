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
  - projects, novelContent, chatHistory, settings, knowledgeBase, plotBoard, timeline
  - `historyTree` は永続化対象外（メモリのみ、最大10ノード、リロードでリセット）
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
| M2 | 認証 + IndexedDB 移行 | ✅ 完了（PR-A IndexedDB 移行 2026-04-26 PR #24 / PR-Bx useLocalSync hardening 2026-04-27 PR #31 / PR-B Auth FE 2026-04-27 PR #29 / PR-C 旧ルート退役 + verifyIdToken + users/init + firestore.rules 2026-04-27） |
| M3 | AI 認証ゲート + クォータ | ✅ 完了（PR-D テスト基盤 + 持越 #1/#4/#5 PR #37 / PR-E BE 認証ゲート + 起動 probe + handleApiError 共通化 + 持越 #3 PR #39 / PR-F usage クォータ + 持越 + Issue #40 PR #45 / PR-G FE 統合 + Cloud Run public 化 + 持越 #2 2026-04-27） |
| M4 | Export/Import + バックアップ警告 UI | ✅ 完了（PR #48 2026-04-28） |
| M5 | Stripe Subscription + Webhook + 法務 | ⏳ |
| M6 | E2EE 暗号化バックアップ（任意機能、後回し可） | ⏳ |
| M7 | 公開準備 | ⏳ |

詳細は `docs/spec/m1/tasks.md` 以降を参照。

## References

- Codex plan review (ADR initial): 2026-04-25, threadId 019dc4e5-65df-7e82-a5b4-12a3eadff26c
- Codex security review (ADR initial): 2026-04-25, threadId 019dc4f1-1fbe-7ba1-91d9-d5c049871861
- Codex plan review (M2 spec PR #22): 2026-04-26, threadId 019dc8b9-72d8-7813-94c4-fd1333be10d7
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

## M2 振り返り（2026-04-27）

4 PR（#24 PR-A IndexedDB / #29 PR-B Auth FE / #31 PR-Bx useLocalSync hardening / PR-C 旧ルート退役）でマイルストーン完了。PR-Bx は当初計画外で、`/review-pr` が PR-A merge 後に検出した堅牢性課題（Issue #27/#28）を吸収したもの。

**うまくいった点:**

- ADR-0001 の Local-first 方針と「IndexedDB は uid に紐付けない」設計を tasks.md 冒頭で明示したため、PR-B での「ログイン切替時の挙動」設計が一切ぶれなかった
- PR-C 着手前にすでに PR-A で `projectApi.ts`（FE）が削除済み、`/api/projects` 系が呼ばれない状態が成立していた → PR-C は純粋に「サーバー側削除 + 認証導入」のみで済み、影響範囲が小さく検証が高速に回せた
- `firestore.rules` ユニットテストを `@firebase/rules-unit-testing@^4.0.1`（firebase@11 互換版）+ `firebase emulators:exec` で導入。10 ケース全 PASS で C6 達成、M3 以降のテスト基盤の足掛かりにもなった
- `verifyIdToken` で transient（503）/ permanent（401）分類を最初から実装（rules/error-handling.md §3 準拠）。M3 で AI 経路に流用する際も追加実装不要
- 旧 API への curl が SPA fallback で 200 HTML を返してしまう問題を AC C1 検証中に発見 → `app.use('/api', ...)` の 404 フォールバックを追加。dev/prod とも未登録 API パスは確実に 404 になる

**課題・M3 以降への申し送り:**

- `firebase.json` に Firestore emulator を追加（port 8080）、`dev:emu` script を `auth,firestore` 両起動に拡張。`FIREBASE_AUTH_EMULATOR_HOST` / `FIRESTORE_EMULATOR_HOST` を script で export し admin SDK の自動検出に乗せた → M3 で本格テストを書く際もこの env 注入で十分動く
- PR-C で M1 申し送りの admin SDK スタブ 4 項目は「未対応のまま M3 へ持ち越し」と判断。理由: 本 PR で `verifyIdToken` 経路が実コードで走り始めたため、4 項目は M3 の AI 認証ゲート実装と同タイミングで route 全体に統合適用するのが整理しやすい
- 本番 Firestore へのルールデプロイ（`firebase deploy --only firestore:rules -P novel-writer-dev`）は手元未実行。M2 完了の定義には含めず、M3 着手前に手動デプロイ + 動作確認を行う前提とする（rules/firebase.md の手順に従う）
- 自動テスト基盤（vitest 等）は引き続き未導入。M3 着手時に rules unit test と同居しやすい構成（vitest + tsx）を本格検討
- evaluator 評価で LOW 指摘として残った「`/api/users/init` の Firestore 書込みエラー（UNAVAILABLE / deadline-exceeded 等）の transient/permanent 分類」は M2 PR-C では暫定対応に留め、汎用化は M3 持ち越し。`/review-pr` の silent-failure-hunter 指摘で users.ts に inline で `formatFirestoreError` を導入（503/500 分類）したが、AI 経路（`/api/ai/*`）でも同等に必要なため、M3 で `verifyIdToken` を AI 経路に展開するタイミングで `handleApiError` を Firestore エラーコードに対応させ共通化する
- `/review-pr` で指摘された M3 持ち越し項目:
  1. **CLAUDE.md MUST #5 route 層 Partial Update assertion gap**: `/api/users/init` route が `tx.update` payload に `createdAt`/`plan` を含めないことを route の挙動として直接 assert する自動テスト未整備（rules unit test の "update ALLOWED" は rules 許可判定であり route の payload 構築は未検証）。M3 で vitest + supertest 基盤を導入する際にこの gap を埋める
  2. **FE 側の users/init 失敗 retry signal**: ネットワーク失敗で users/init が落ちても `currentUser` は authenticated のまま。`needsUserInit` flag を保持して M3 の AI gating で再試行する仕組みを追加
  3. **`applicationDefault()` eager init**: ADC 未設定環境では `getFirebaseAdminApp()` が初回 request 時に同期 throw する。M3 で起動時 probe（`startServer()` 内で `getFirebaseAuth()` 呼出）を追加して fail-fast 化
  4. **型強化（`AuthedRequest` / `sanitizeForUpdate` undefined フリー戻り値）**: type-design-analyzer 指摘の改善案。M3 の AI 経路で `verifyIdToken` 通過後の handler が増えるタイミングで型を引き締める
  5. **`verifyIdToken` の transient エラーコード拡張**: `/codex review` セカンドオピニオン指摘。現状の `TRANSIENT_AUTH_CODES` Set は `auth/internal-error` / `auth/network-request-failed` / `auth/service-unavailable` + `ETIMEDOUT` / `ECONNRESET` / `ENOTFOUND` をカバーするが、`ECONNREFUSED` / `EAI_AGAIN` / `app/network-error` 形式が permanent (401) に落ちる余地あり。M2 では実害トースト誤分類程度なので、M3 で AI 認証ゲート適用前に広げる


## M3 振り返り（2026-04-27）

4 PR + 2 補助 PR でマイルストーン完了。同日中に PR-D/E/F/G を逐次マージし、Stripe (M5) を後回しにする戦略の通り「課金保護成立」までを完成させた。

| PR | 内容 | 状態 |
|---|---|---|
| #37 PR-D | テスト基盤 (vitest + supertest) + 持越 #1/#4/#5 | ✅ |
| #39 PR-E | BE 認証ゲート + 起動 probe + handleApiError 共通化 + 持越 #3 | ✅ |
| #44 PR-CI | Issue #41 deploy.yml に test job 追加 (PR-F 着手前の regression 検知) | ✅ |
| #45 PR-F | usage クォータ (transaction reserve + requestId 冪等) + Issue #40 + 持越/PR-E 反映 | ✅ |
| #46 PR-G | FE 統合 (apiCall Bearer + requestId + 共通分類器 + 持越 #2 needsUserInit retry) + Cloud Run public 化 | ✅ |

**うまくいった点:**

- ADR + tasks.md + handoff/LATEST.md の 3 点で「次に何をするか」を毎セッション 30 秒で再開できた。M3 のように 4 PR を逐次走らせるマイルストーンでは、handoff の更新が次セッションの起動コストを最小化した
- PR-F 着手前に Issue #41 (P0 CI test job) を別 PR で先行マージしたため、PR-F/G のような大規模 PR で merge 時 regression を CI で阻止できる構造ができた。順序判断が効いた
- PR-F で `withUsageQuota` 高階関数を導入し、AI route 6 ファイルを純粋な service ラップに簡素化。PR-G の FE 改修も `apiClient.ts` 1 ファイルで cross-cutting concern を集約できた。「BE 高階関数 + FE ラッパー」の対称構造が変更影響範囲を最小化した
- `/review-pr` 6 エージェント並列 + `/codex review` MCP セカンドオピニオンの組み合わせで PR-F の "month boundary silent failure" / "commit 失敗時 reservation 残存" / "extractMessage 連結境界 false positive" 等、self-review では見逃しがちな経路を merge 前に検出
- `ReservationHandle` で UTC 月境界跨ぎの silent failure を排除する設計は evaluator 指摘で初めて気づいた経路。第三者評価が「実装の前提知識なし」で読むことの価値を再確認

**課題・M4 以降への申し送り:**

- **後送り Issue 候補（rating 5-7、本 PR スコープ外）**: Sen branded type / AiRouteKey ↔ Express path 単一レジストリ化 / ReservationHandle 内部 docId 化 / processedIds sliding window 警告ログ / AC F8 動的検証（route ファイル全件 withUsageQuota ラップ確認）/ AuthedRequest assertion 関数化 / 401 自動 sign-out 実装。次マイルストーン着手前に triage 基準（rating ≥ 7 + confidence ≥ 80）を満たすものは Issue 化、それ以外は M4/M5 の対応 PR で吸収する判断
- **残量バー UI**: PR-G スコープ外として保留中（usage rules 緩和 + コンポーネント追加が必要）。M4 で Export/Import UI と一緒に実装するか、M5 Stripe 連携時に「枠拡張動線」とセットで実装するかは要検討
- **actual metadata 精算**: Vertex AI 応答の usage_metadata から token 数を取得して `commit` の actualCost を補正する経路。observability 拡張として M3 完了後に検討。現状は固定 estimatedCost で運用
- **本番 Firestore へのルールデプロイ**: PR-G merge 後に `firebase deploy --only firestore:rules -P novel-writer-dev` を手動実行が必要。usage コレクション全拒否を本番に反映する DoD
- **Cloud Run public 化後の curl 検証**: PR-G の DoD として「401 (Authorization なし) を本番 URL で確認」を merge 後に手動実施。401 でなければ即座に `gcloud run services update --no-allow-unauthenticated` で rollback する手順を確立


## M4 振り返り（2026-04-28）

1 PR (#48) でマイルストーン完了。同日中の 1 セッション内に impl-plan → 実装 → 品質ゲート (simplify 3 並列 + evaluator + /review-pr 6 並列 + /codex review) → 7 件 review 反映 → マージまで完走。Stripe (M5) を最後送りにする戦略の通り、ADR-0001「端末紛失 = 小説喪失」の構造的緩和を成立させた。

| PR | 内容 | 状態 |
|---|---|---|
| #48 PR | M4 全体 (Export/Import + バックアップ警告 UI) + 7 件 review fix | ✅ |

**うまくいった点:**

- M3 で導入した「AC は impl-plan の Phase 2.7 で先に定義」フローがそのまま再利用でき、AC-1〜AC-11 を vitest と実機 E2E に機械的に紐付けできた。AC ラベルを describe に刻む慣習も継続採用
- backup schema v1 を「M5 (Stripe Tier 2 backup) / M6 (E2EE) で再利用する前提」で前倒し確定。`schemaVersion: 1` リテラル + `BACKUP_SCHEMA_VERSION` 定数のペアで型と runtime check が両輪に
- 既存資産の活用が効いた: `validateAndSanitizeProjectData` (utils.ts) / `pickPersistableFields` + `stripInternalKeys` (projectRepository.ts) / `useLocalSync` の init ロジック を refresh 関数として外出し → import 経路でも同じ sanitize chain と rehydrate を再利用
- review 反映の順序判断: `/simplify` 3 並列 → 7 件吸収後に `/review-pr` 6 並列 + `/codex review` でセカンドオピニオン → 新規 P0 級 (legacy compat の旧バックアップ全 reject、in-memory state の silent overwrite) を merge 前に検出。**self-review では見逃したであろう「旧 export ファイルが import で全 reject される」を codex の diff レビューが拾った**
- TOCTOU 対策 (executeImport で existingIds 再 read + flushSave 先行) を実装段階で組み込んでおいたが、テストカバレッジが甘いことを pr-test-analyzer が rating 8 で検出。follow-up Issue #49 として umbrella 管理に振り分け

**課題・M5 以降への申し送り:**

- **Follow-up Issue #49 (5 件 umbrella)**: H2 (prepareImport flushSave 失敗 UX), H4 (setImportResolution 通しテスト), H5 (TOCTOU 再 read テスト), H6 (isBackupStale 境界値 30 日), H10 (Dexie v1→v2 BlockedError ハンドラ)。M5 着手前の cleanup PR で 1 ファイル 1 PR の小粒で進める想定
- **Cheap polish (rating 5-6)**: comment-analyzer の `readFileAsText.ts` ヘッダー削除、`sanitizeForImport` コメント整理、type-design-analyzer の TutorialFlags 型統一、ImportConflictModal の 4th resolution 対応の `Object.keys` 化。次の cleanup PR で吸収候補
- **Schema v2 への seam**: 現状 `parseBackup` は `schemaVersion === 1` を strict equality でチェック。v2 リリース時は `PARSERS: Record<number, parser>` table 形式に refactor して migrator を挿せる構造にする (M5/M6 着手時の TODO)
- **AC ドキュメント不在**: `docs/spec/m4/acceptance-criteria.md` を起こさず、AC は impl-plan + PR description + test describe ラベルのみに存在。次セッションで M5/M6/M7 の spec 起こしと一緒に M4 spec も埋める
- **legacy compat の長期方針**: parseBackup の legacy fallback (bare project / `{ project: {...} }` envelope) は M4 の延命措置。pre-M4 export を持つユーザーが居なくなった頃に削除候補。CI で legacy 形式のテストファイルを残しつつ deprecation コメント追加が次の整理対象
- **個別 export 動線の triggerDownload 5 重実装**: App.tsx / App.mobile.tsx / Header.tsx の `handleExportProject` / `handleExportTxt` が手書き blob ダウンロードを 4 重実装。`utils/download.ts` への集約は本 PR スコープ外として持越 (rating 5-6、全箇所動作上は問題なし)
- **DB v1→v2 migration の自動テスト**: fake-indexeddb 等の導入が必要、Issue #49 の H10 とまとめて対応想定
