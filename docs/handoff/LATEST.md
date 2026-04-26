# Handoff: M2 Spec 確定 → PR-A 着手準備

- Session Date: 2026-04-26
- Owner: yasushi-honda
- Status: ✅ 再開可能

## 今セッションの完了内容

| 区分 | 完了事項 | コミット / PR |
|---|---|---|
| 環境設定 | `.envrc` に GH_TOKEN 自動取得行を追加（`gh auth switch --user yasushi-honda` + `export GH_TOKEN=$(gh auth token)`）、`direnv allow .` 完了 | (commit 不要、`.envrc` は .gitignore 対象想定の運用ファイル) |
| ADR 訂正 | ADR-0001 の `historyTree` を IndexedDB 列挙から外し「永続化対象外、メモリのみ、最大10ノード」と統一。M2 spec PR の Codex plan threadId 追記 | PR #22 内 |
| M2 spec 起草 | `docs/spec/m2/tasks.md` 新規作成。逐次 PR-A → PR-B → PR-C 構成。ADR-0001 ロードマップ M2 と完全整合 | PR #22 (`891b7e9`) マージ済 |
| レビュー反映 | `/review-pr` (code-reviewer) + `/codex plan` (threadId `019dc8b9-72d8-7813-94c4-fd1333be10d7`) 並列実行。Critical 5 + Medium 8 を全反映 | PR #22 内 (`697f4cb`) |
| CI 確認 | Cloud Run デプロイ成功（2m6s, run id 24951790278） | - |

## 次セッション開始時の状態

- ブランチ: `main` clean、origin/main と同期済み（PR #22 マージ済）
- M2 spec (`docs/spec/m2/tasks.md`) が確定し、PR-A から逐次着手可能
- 進行中タスクなし、未マージ PR は本ハンドオフ PR のみ（マージ判断はユーザー）
- Open Issue: 0 件

## 次のアクション（推奨順）

### 1. PR-A: IndexedDB（Dexie.js）導入 + 永続化レイヤー切替
- ブランチ: `feature/m2-indexeddb-migration`
- 規模: 大（5〜7 時間）
- 影響: `db/dexie.ts`・`db/projectRepository.ts`・`db/tutorialRepository.ts`・`db/analysisHistoryRepository.ts` 新規、`store/projectSlice.ts`・`store/syncSlice.ts`・`store/tutorialSlice.ts`・`store/analysisHistorySlice.ts`・`App.tsx` 改修、`hooks/useFirestoreSync.ts` リネーム
- **着手前の必須準備**:
  - 開発端末の手元プロジェクトを Export で JSON 退避（spec の「PR-A 切替手順」参照）
  - `grep -rn "/api/data" .` で `/api/data` 全呼出元を一覧化（PR-A スコープ確定用）
  - `grep -rn "fetch.*'/api/" .` で全 API 呼出元の網羅
- **品質ゲート**: spec の PR-A 品質ゲートに従い `npm run lint` / `/simplify` / `evaluator` agent / `/codex review` を実施
- **ROI 注意**: 規模が大きいため `/impl-plan` で PR-A 単体の詳細設計（タスク分解 + AC 詳細化）を先に行う

### 2. PR-B: Firebase Auth FE 導入
- ブランチ: `feature/m2-firebase-auth-fe`
- 規模: 中（2〜3 時間）、PR-A マージ後に着手

### 3. PR-C: サーバー退役 + Firestore メタ縮小
- ブランチ: `feature/m2-server-retirement`
- 規模: 中（2〜3 時間）、PR-B マージ後に着手

## 申し送り事項（注意点）

### M1 振り返りからの引き継ぎ
- **GitHub Actions Node 20 廃止対応**: PR-A〜C のレビュー待ち時間に公式 [GitHub blog 2025-09-19](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/) で再確認 → `actions/checkout@v5`、`google-github-actions/auth@v3`、`setup-gcloud@v3`、`deploy-cloudrun@v3` の major 追従を独立 PR で実施
- **M1 PR-C admin SDK スタブの 4 項目**（applicationDefault 失敗時 logError、prod の projectId fail-fast、test スクリプトの Anonymous プロバイダ未許可エラー化、`__resetFirebaseAdminAppForTesting()` 露出検討）→ M2 PR-C で `verifyIdToken` ミドルウェア導入時に併せて実装

### M2 spec で確定した重要設計判断
- **IndexedDB は uid に紐付けない**（ログイン/ログアウトでデータ保持・切替なし）
- **`historyTree` は永続化しない**（メモリのみ、最大10ノード、リロードでリセット）
- **`users/{uid}` 冪等 init は transaction 必須**（`merge: true` 単独不可、`createdAt` 保護）
- **Admin SDK は Firestore rules を bypass する**ため route 側でも同等の schema validation が必須
- **prod Cloud Run へのブラウザアクセスは M2 中は不能**（IAM 非公開、M3 で `--allow-unauthenticated` 復活を再検討）

### 環境状況
- `.envrc` 設定済（GH_TOKEN 自動取得 + GCP `novel-writer-dev`）
- `cd ~/Projects/学校/yamashita/novel-writer && claude` で起動すれば direnv 経由で正しいアカウントが有効化される
- 残留 Node プロセスなし

## Issue Net 変化

- Close 数: 0 件
- 起票数: 0 件
- Net: 0 件
- **進捗の質**: PR #22 マージ（M2 spec 確定）を達成。Issue 化対象（実害バグ / CI 破壊 / rating ≥ 7 提案 / ユーザー明示指示）は今セッション中に発生せず、Net 0 は規範通り（review agent の rating 5-6 提案は本 spec PR の修正で取り込み済み、起票していない）

## ドキュメント整合性

- ADR-0001 ロードマップ表: M2 ⏳ → PR #22 マージで spec 確定。完了マークは M2 全 PR 完了時に更新
- `docs/spec/m1/tasks.md` ✅ Completed と本ハンドオフが整合
- CLAUDE.md の "AI API層" 表 / "状態管理" セクションは PR-C 着手時に更新（spec C.5 で明記済）

## 残留プロセス

✅ なし
