# Handoff: M2 PR-B 実装 + 全品質ゲート完了 → Firebase Console 設定 & 実機検証待ち

- Session Date: 2026-04-26 〜 2026-04-27
- Owner: yasushi-honda
- Status: ✅ 再開可能（PR #29 open、ユーザー側 Firebase Console 設定 + 手動 AC 検証待ち）

## 今セッションの完了内容

| 区分 | 完了事項 | 成果物 |
|---|---|---|
| マージ | M2 PR-A (IndexedDB Dexie 移行) を merge、main 同期 | PR #24 (a57d094) |
| マージ | ADR-0001 ロードマップを M2 「進行中」に更新 (PR-A ✅ / PR-B ⏳ / PR-C ⏳) | PR #26 (bdfe981) |
| Issue 起票 | M2 PR-A `/review-pr` deferred の rating ≥ 7 相当 2 件を triage 起票 (Option B 選択) | #27 (corrupted record swallow → activeProjectId)、#28 (Dexie module-level construction throw) |
| 実装 | M2 PR-B Firebase Auth FE + Tier 0/1 UI 全 7 タスク (B.1〜B.7) | feature ブランチ `feature/m2-firebase-auth-fe` (4 commits / 22 files / +408 / -39) |
| 新規モジュール | `firebaseClient.ts`、`store/authSlice.ts`、`components/AuthButton.tsx`、`hooks/useRequiresAuth.ts`、`store/authConstants.ts`、`vite-env.d.ts`、`.env.example` | - |
| 既存改修 | `App.tsx` initAuth 起動、`store/index.ts` AuthSlice 結合、`components/Header.tsx` + `ProjectSelectionScreen.tsx` AuthButton 配置、6 modal の AI ボタン Tier 0 disable + tooltip、`apiClient.ts` defense-in-depth ガード (AUTH_REQUIRED/AUTH_INITIALIZING タグ)、`server/index.ts` prod CSP、`package.json` `dev:emu` env 注入 | - |
| 品質ゲート | `npm run lint` PASS / `/simplify` 3エージェント / `evaluator` HIGH 2 fix / `/review-pr` 5エージェント並列 (silent-failure / type-design / code / comment / test) Important 4 fix | PR #29 |
| PR 作成 | https://github.com/Yukina1116/novel-writer/pull/29 — Test plan に B1〜B8 + B3-err1/err2 + Pre-flight (`.env.local` fail-fast 検証含む) + Out of scope deferred 7 件を明記 | - |

## 次セッション開始時の状態

- ブランチ: `main` clean、origin/main と同期済み (a57d094 → bdfe981 から進行)
- 進行中の feature ブランチ:
  - `feature/m2-firebase-auth-fe` — PR #29 open、コード変更完了 (4 commits)
  - `docs/handoff-m2-pr-b` — 本ハンドオフ用ブランチ
- Open Issue: 2 件 (#27 / #28、両方とも PR-A follow-up、本 PR スコープ外)
- グローバル `~/.claude/` への変更なし (プロジェクト CLAUDE.md §1 遵守)
- main 直 push なし、feature ブランチ + PR 運用維持 (プロジェクト CLAUDE.md §2 遵守)

## 次のアクション (推奨順)

### 1. PR #29 の状態確認 (最優先)
- `gh pr view 29` で マージ済 / レビューコメント / open のいずれかを確認

### 2A. PR #29 が未マージ + Firebase Console 設定 **未** → 設定セッション
- Firebase Console → Project (`novel-writer-dev`) → Web アプリ登録 → SDK config 取得
- `.env.local` 作成 + `VITE_FIREBASE_*` 6 値投入
- Authentication > Sign-in method で Google プロバイダ有効化
- 完了したら 2B へ

### 2B. PR #29 が未マージ + Firebase Console 設定済 → 実機 AC 検証セッション
- Pre-flight (`.env.local` fail-fast 動作確認)
- AC B1〜B8 + B3-err1 (popup blocked) + B3-err2 (popup closed by user) を順次検証
- ユーザーがブラウザ操作、Claude が結果解釈 + tasks.md 更新支援
- 検証手順詳細は PR #29 description Test plan セクション参照
- 検証 PASS 後 → `docs/spec/m2/tasks.md` PR-B AC を `[x]` に更新コミット

### 2C. PR #29 がマージ済 → main 同期 + PR-C 着手準備
- `git checkout main && git pull --rebase`
- `docs/spec/m2/tasks.md` PR-B AC を `[x]` 更新 (マージ前にやれていなければ)
- ADR-0001 ロードマップ表で M2 を「PR-B ✅」に更新
- PR-C (`/api/projects` `/api/data` 退役 + Firestore メタ縮小 + ID Token 検証ミドルウェア) 着手:
  - ブランチ `feature/m2-server-retirement`
  - `/impl-plan` 起動
  - tasks.md PR-C C.1〜C.5 + AC C1〜C7 + リスク R12〜R15 を計画ベースに

### 3. (Optional) PR #29 への `/codex review` セカンドオピニオン
- 認証は security-sensitive のため CLAUDE.md 推奨 (大規模 PR + 200 行+)
- 5-agent review でカバー済 (Critical なし、Important 4 fix 済) のため ROI は中程度

## 申し送り事項 (重要)

### 本セッションで実機検証は未実施
- ユーザーのブラウザ操作 (Firebase Console 設定 + DevTools 操作) が必要なため未実施
- AC 11 項目 (B1〜B8 + B3-err1/err2、`.env.local` fail-fast 含む) の手順は PR #29 description に詳細記載
- マージ前に必ず実機検証を完了させる (プロジェクト CLAUDE.md MUST「Test plan に記載した項目は全てマージ前に実行」)

### M2 spec で確定した重要設計判断 (PR-B 実装で具現化)
- **IndexedDB は uid に紐付けない (uid 切替で消えない)** — `signInWithGoogle` / `signOut` / `initAuth` のいずれも IDB に触らない (コメントで明示)
- **`useRequiresAuth` フック + `apiClient.ts` の二段防御** — UI ボタン disable + 万一の漏れに備えた API client defense ガード (`code: 'AUTH_REQUIRED' | 'AUTH_INITIALIZING'` タグで `initializing` を区別、誤誘導回避)
- **`authStatus = 'initializing'` 中の専用メッセージ** — 「認証確認中…」表示で「ログインしてから」誤誘導を防止 (silent-failure-hunter H-2 対応)
- **popup-closed-by-user / cancelled-popup-request は silent** — user 意図のため toast 抑制 (silent-failure-hunter M-2 対応)、popup-blocked は強化メッセージ
- **Tier 判定は派生値**として `useRequiresAuth` フックが提供 (`selectTier(state)` 関数は spec 言及だが、フック方式と機能等価で許容)

### 次 PR (PR-C) への申し送り
- BE 認証ゲート (Bearer ID Token 検証ミドルウェア) は **本 PR では入れていない** — M3 で実装予定だが PR-C で `/api/users/init` 用に先行導入する設計 (spec C.2 / C.3)
- FE 側は `Authorization: Bearer <token>` 付与の仕組みを M3 で導入 (spec B.5 注記)
- prod Cloud Run はブラウザから IAM 非公開 (M2 範囲外、M3 で `--allow-unauthenticated` 復活を再評価)

### Out of scope (PR #29 description に詳細記載、別 issue / 後続 PR 候補)
- silent-failure-hunter C-1 (`firebaseClient.ts` module-level throw) — Issue #28 (PR-A の Dexie 同型問題) と統合扱い
- silent-failure-hunter H-1 (Firebase 503 outage demote to unauthenticated) — `authStatus='error'` + 「再試行」 sticky banner の別 PR
- evaluator MED (`AuthButton` で `authError` の persistent UI 表示) — popup-blocked メッセージ強化のみで対応、別 PR 候補
- type-design-analyzer Important×3 (createAuthSlice 型付け / RequiresAuthState 判別共用体 / REQUIRED_KEYS 型派生) — 既存 slice 規約変更を伴うため大規模 refactor
- pr-test-analyzer S1〜S4 (Strict Mode 二重 subscribe / cross-tab sync / 連打 race / Auth Emulator フロー差分) — M3 自動テスト基盤導入後に vitest + Firebase Auth emulator で機械化

### 環境状況
- `.envrc` 設定済 (GH_TOKEN 自動取得 + GCP `novel-writer-dev`)
- `cd ~/Projects/学校/yamashita/novel-writer && claude` で起動すれば direnv 経由で正しいアカウントが有効化される
- 残留 Node プロセスなし

## Issue Net 変化

- Close 数: 0 件
- 起票数: 2 件 (#27 / #28、いずれも PR-A `/review-pr` deferred の rating ≥ 7 相当を triage 起票)
- Net: +2 件
- **進捗の質**: Net = +2 だが、両 issue とも CLAUDE.md triage 基準 #1 (実害あり) + #4 (rating ≥ 7) を満たし、PR-A `/review-pr` で発見された未対処事項の機械的可視化。本セッションの主要進捗は `[PR-A merge + PR-B 実装 + 全品質ゲート通過]` で M2 マイルストーンの ~67% 完了 (PR-A ✅ / PR-B ⏳実機検証待ち / PR-C ⏳)。Issue 起票 +2 は triage 後の正規化なので進捗ゼロ扱いではない

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|---|---|---|
| `docs/spec/m2/tasks.md` PR-A セクション | AC `[x]` 全 9 項目 + 品質ゲート | PR #24 マージ前に更新済 |
| `docs/spec/m2/tasks.md` PR-B セクション | AC `[ ]` のまま | 実機検証後に `[x]` 化する運用 (CLAUDE.md MUST と整合) |
| `docs/spec/m2/tasks.md` PR-C | `⏳` のまま | PR-B 後に着手 |
| ADR-0001 ロードマップ表 | M2 「進行中 (PR-A ✅ / PR-B ⏳ / PR-C ⏳)」 | PR #26 でマージ済 |
| `CLAUDE.md` "AI API層" 表 | 未更新 | PR-C 着手時に `/api/projects` 削除 + `/api/users/init` 追加 (spec C.5) |
| `CLAUDE.md` "状態管理" セクション | 未更新 | PR-C 着手時に `syncSlice` の保存先を IndexedDB に修正 (PR-A 由来)、`authSlice` 追記 (PR-B 由来) |

## 残留プロセス

✅ なし (cleanup-node.sh 確認済)
