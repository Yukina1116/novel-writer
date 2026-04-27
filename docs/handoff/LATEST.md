# Handoff: M2 PR-B + PR-Bx merge 完了 / Issue #27 #28 自動 close / 残 PR-C のみ

- Session Date: 2026-04-27
- Owner: yasushi-honda
- Status: ✅ 再開可能（M2 マイルストーン: PR-A ✅ / PR-Bx ✅ / PR-B ✅ / PR-C ⏳）

## 今セッションの完了内容

| 区分 | 完了事項 | 成果物 |
|---|---|---|
| AC 検証 | PR #31 (PR-Bx useLocalSync hardening) を Playwright MCP で AC 検証完了 (TC-EX-IDB-001/002/003/004 PASS、005 は AC-X4 同様 UNTESTABLE 扱い) | PR #31 |
| 追加修正 | PR #31 内に commit `941e187` (`App.tsx` 早期 return path に `<Toast />` マウント、AC-X2 真の充足) | commit 941e187 |
| マージ | PR #31 squash merge → commit `c1e43a0` on main、Issue #27 / #28 自動クローズ | PR #31 → c1e43a0 |
| Firebase 設定 | `firebase apps:create WEB` で `novel-writer-dev-web` (App ID `1:446321146441:web:285a9e0bbd4146e15b1d98`) を CLI 登録、SDK config 取得、`.env.local` 作成、Google プロバイダ有効化（ユーザー操作） | Firebase Console |
| AC 検証 | PR #29 (PR-B Firebase Auth FE) を Playwright MCP + Firebase Auth Emulator で AC 検証完了（Pre-flight + B1〜B8 + B3-err1/B3-err2、合計 11 項目 PASS） | PR #29 |
| 追加修正 | PR #29 内に commit `83157f4` (server/index.ts CSP 拡張: `cdn.tailwindcss.com` `aistudiocdn.com` `fonts.googleapis.com` `fonts.gstatic.com` 追加 + `cors` の origin function を「同一ホスト自動許可」に拡張) | commit 83157f4 |
| 主要設計判断 | `authStatus = 'initializing' → unauthenticated/authenticated` の遷移が Firebase の `onAuthStateChanged` で 200ms 以内に完了することを実機確認、 `useRequiresAuth` フック経由で 7 ファイル / 17 箇所の AI ボタンが Tier 0 disable + tooltip 化、IDB レコードが uid 切替で完全保持されることを実証 (`idbCountStableAcrossAccountSwitch=true` + `idbIdsIdenticalAcrossSwitch=true`) | 同上 |
| マージ | PR #29 squash merge → commit `e68079a` on main、Cloud Run 自動デプロイ ✅ success (run 24972945015) | PR #29 → e68079a |
| ドキュメント | `docs/spec/m2/tasks.md` PR-B AC を全 [x] 化、Pre-flight + B3-err1/B3-err2 を AC セクションに追加記録、検証中の追加修正（CSP 拡張、cors 同一ホスト自動許可）を tasks.md に記録 | tasks.md |
| ドキュメント | 本 handoff PR で ADR-0001 ロードマップ表 M2 を「PR-A ✅ / PR-Bx ✅ / PR-B ✅ / PR-C ⏳」に更新、CLAUDE.md "状態管理" セクションを Firestore→IndexedDB 反映に修正 + `authSlice` 追記 | 本 PR |

## 次セッション開始時の状態

- ブランチ: `main` clean、origin/main と同期済み (commit e68079a)
- 進行中の feature ブランチ: `docs/handoff-pr-b-bx-merged` — 本ハンドオフ用
- Open Issue: 0 件
- Open PR: 1 件（本セッションで作る handoff PR）
- グローバル `~/.claude/` への変更なし (プロジェクト CLAUDE.md §1 遵守)
- main 直 push なし、feature ブランチ + PR 運用維持 (プロジェクト CLAUDE.md §2 遵守)

## 次のアクション (推奨順)

### 1. 本ハンドオフ PR をレビュー → merge
- `gh pr view <本 PR>` で内容確認
- ユーザー明示認可後 `gh pr merge <PR#> --squash --delete-branch`

### 2. PR-C 着手（M2 最終 PR、`/api/projects` `/api/data` 退役 + Firestore メタ縮小 + ID Token 検証ミドルウェア）
- `git checkout main && git fetch && git reset --hard origin/main`
- `git checkout -b feature/m2-server-retirement`
- `/impl-plan` 起動（中規模・クロスレイヤー変更のため必須）
- ベース資料: `docs/spec/m2/tasks.md` PR-C C.1〜C.5 + AC C1〜C7 + リスク R12〜R15
- 実装内容（spec 抜粋）:
  - **C.1**: `server/routes/projects.ts` / `server/routes/data.ts` / `server/services/projectService.ts` / `server/firestoreClient.ts` / `projectApi.ts` (FE) 削除、`server/index.ts` の mount 行削除、firestore を `firebase-admin/firestore` の `getFirestore(getFirebaseAdminApp())` 経由に統合
  - **C.2**: `server/middleware/verifyIdToken.ts` 新規作成（Bearer ID Token 検証）
  - **C.3**: `server/routes/users.ts` 新規（`POST /api/users/init` で Firestore `users/{uid}` 初期化、`verifyIdToken` ミドルウェア適用）
  - **C.4**: route 側 keys allowlist + enum 検証（admin SDK rules bypass の防御）
  - **C.5**: CLAUDE.md "AI API層" 表更新（`/api/projects` 削除 + `/api/users/init` 追加）
  - **firestore.rules 初版**（M3 で正式運用、本 PR では `users/{uid}` の uid 一致書込みのみ許可）
- 同 PR で更新するドキュメント:
  - `CLAUDE.md` "AI API層" 表（`/api/projects` 行削除 + `/api/users/init` 行追加）
  - ADR-0001 ロードマップ表（M2 を ✅ 完了に更新、PR-C の merge 時点で）
  - `docs/spec/m2/tasks.md` PR-C AC を順次 [x] 化、最後に M2 完了の定義 4 項目を [x] 化

### 3. M2 完了振り返り（PR-C merge 後）
- `docs/spec/m2/tasks.md` 末尾「M2 完了の定義」全 [x] 化
- ADR-0001 末尾に M2 振り返り追記（M1 と同流儀）
- ADR-0001 ロードマップ表 M2 を ✅ 完了に最終更新

### 4. (Optional) M2 振り返り後の M3 計画前段
- M3 = AI 認証ゲート + クォータ。PR-C で導入する `verifyIdToken` ミドルウェアを `/api/ai/*` に適用、FE から `Authorization: Bearer <ID Token>` 付与の仕組みを実装（spec B.5 注記参照）
- `--allow-unauthenticated` 復活の再評価も M3 の対象

## 申し送り事項 (重要)

### PR #29 / PR #31 で確定した重要設計判断

**PR #31 (PR-Bx)**:
- **`getProject` は read 側で validation を行う**: Dexie は schema 強制せず、corrupted record (id/name 欠落) は raw object として返る → `validateAndSanitizeProjectData` を read 経由でも適用
- **`ProjectValidationError` を導入**: validation 失敗と infrastructure error を `instanceof` で区別、toast 文言を branch
- **`db/dexie.ts` を lazy init に**: `let _db = null; getDb() => _db ??= createDb()` で module 評価時の同期 throw を call site に移動
- **`activeProjectId` の stale 検証**: 既存値が `allProjectsData` に存在するかチェック、空 projectList 時も stale id をクリア
- **`App.tsx` 早期 return path に `<Toast />` マウント**: AC-X2「activeProjectId null + toast」を真に充足するため。ProjectSelectionScreen 内では Toast コンポーネントが render されない構造を AC 検証中に発見、PR #31 内で追加修正

**PR #29 (PR-B)**:
- **検証中に発見した CSP / cors 修正**:
  - CSP `scriptSrc` に `https://cdn.tailwindcss.com` `https://aistudiocdn.com` 追加（pre-existing index.html 依存）
  - CSP `styleSrc` に `https://fonts.googleapis.com`、`fontSrc` に `https://fonts.gstatic.com` 追加
  - `cors` の origin function を「同一ホストなら自動許可」に拡張: `new URL(origin).host === req.headers.host` のチェックを追加して、同一オリジン静的アセット fetch（`/assets/index-*.{js,css}`）の自己 403 を回避
- **B6 caveat (記録済み)**: `signInWithPopup` の callback 自動完結は Playwright MCP の chromium 環境で popup auto-close + postMessage callback 経路が block される → 本 PR の AC 検証は `signInWithEmailAndPassword` で代替実証。本物 Chrome では問題ない
- **B7 で IDB uid 非紐付けを実証**: account A → signOut → account B 切替で IDB レコード件数 + ID 完全一致（spec の重要設計判断「IndexedDB は uid に紐付けない（uid 切替で消えない）」を E2E で確認）

### Firebase 設定の現状（PR-C / M3 で参照）

- Web App ID: `1:446321146441:web:285a9e0bbd4146e15b1d98`（`novel-writer-dev-web`、`novel-writer-dev` プロジェクト）
- SDK config 6 値は `.env.local`（gitignore）に投入済み、`.env.example` に項目テンプレート
- Auth Emulator: `firebase emulators:start --only auth` で `127.0.0.1:9099`、`firebase.json` に設定済
- `npm run dev:emu` で `VITE_USE_AUTH_EMULATOR=true` + vite + emulator 並列起動

### CLAUDE.md / ADR-0001 の更新状況（本 PR で対応）

- ✅ ADR-0001 ロードマップ表 M2 を「PR-Bx ✅ / PR-B ✅」に更新
- ✅ CLAUDE.md "状態管理" syncSlice 行を IndexedDB 経由に修正（PR-A merge 時点で嘘記載になっていたため遅延訂正）+ `authSlice` 追記（PR-B 由来）
- ⏳ CLAUDE.md "AI API層" 表 — PR-C 着手時に更新（`/api/projects` 削除 + `/api/users/init` 追加）

### Out of scope / フォローアップ候補（Issue 化は triage 基準を満たした時点で）

PR #29 / PR #31 description の "Out of scope" に詳細記載済。CLAUDE.md triage 基準（rating ≥ 7 + confidence ≥ 80 / 実害あり / 再現バグ / CI 破壊 / ユーザー明示指示）を満たさないため現時点で Issue 化せず:

- **silent-failure-hunter C-1**: `firebaseClient.ts` module-level throw は ErrorBoundary に届かず white screen（Issue #28 の Dexie 同型問題は PR #31 で `getDb()` lazy init 化により解決済、firebase 側は未対応）
- **silent-failure-hunter H-1**: Firebase 503 outage で `unauthenticated` に demote → `authStatus='error'` + sticky banner が望ましい
- **type-design-analyzer Important×3**: `createAuthSlice` の `(set, get)` パラメータ型付け / `RequiresAuthState` 判別共用体化 / `REQUIRED_KEYS` を `RequiredFirebaseEnv` 型から派生
- **pr-test-analyzer S1〜S4**: Strict Mode 二重 subscribe / cross-tab sync / 連打 race / Auth Emulator フロー差分（M3 で vitest + Firebase Auth emulator 自動テスト基盤導入後に機械化）
- **Pre-existing 課題**: `index.html` の `cdn.tailwindcss.com` runtime → 本来 PostCSS plugin 化、`aistudiocdn.com` の importmap → bundle 化推奨。Console warning が prod 起動時に出る（CSP allowlist で迂回中）
- **PR #31 Out of scope 4 件**: `setActiveProjectId` 経由の `historyTree` 初期化欠落 / `listProjects` IO 失敗時のメッセージ誤誘導 / 自動テスト基盤 / `lastModified` を欠く record 不可視

### 環境状況

- `.envrc` 設定済 (GH_TOKEN 自動取得 + GCP `novel-writer-dev`)
- `cd ~/Projects/学校/yamashita/novel-writer && claude` で起動すれば direnv 経由で正しいアカウントが有効化される
- 残留 Node プロセスなし

## Issue Net 変化

- Close 数: 2 件 (#27, #28、PR #31 マージで `Closes` 自動クローズ)
- 起票数: 0 件
- Net: -2 件 ✅
- **進捗の質**: Net = -2 で Issue 削減成功。両 issue とも PR-A の `/review-pr` で発見された未対処事項 (corrupted record swallow + Dexie module-level throw) を PR-Bx でバンドル修正、AC 検証で App.tsx Toast マウント漏れも併せて修正。本セッションの主要進捗は `[PR #31 (PR-Bx) merge + Issue #27/#28 close + PR #29 (PR-B) merge]` で M2 マイルストーン PR-A/PR-Bx/PR-B 全て完了、残 PR-C のみ。

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|---|---|---|
| `docs/spec/m2/tasks.md` PR-A セクション | AC `[x]` 全 9 項目 + 品質ゲート | PR #24 マージ前に更新済 |
| `docs/spec/m2/tasks.md` PR-B セクション | AC `[x]` 全 8 項目 + Pre-flight + B3-err1/B3-err2 + 検証中追加修正記録 | PR #29 検証完了で本セッション更新 |
| `docs/spec/m2/tasks.md` PR-C | `⏳` のまま | PR-C 着手時に進捗反映 |
| ADR-0001 ロードマップ表 | M2 「進行中 (PR-A ✅ / PR-Bx ✅ / PR-B ✅ / PR-C ⏳)」 | 本 PR で更新 |
| `CLAUDE.md` "AI API層" 表 | 未更新 | PR-C 着手時に更新（`/api/projects` 削除 + `/api/users/init` 追加） |
| `CLAUDE.md` "状態管理" セクション | 更新済 | 本 PR で IndexedDB 反映 + `authSlice` 追記 |
| `tests/例外系テスト.md` ローカル永続化セクション | TC-EX-IDB-001〜005 + AC-X4 検証制限事項 追記済 | PR #31 で追加 |

## 残留プロセス

✅ なし
