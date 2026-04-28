# Handoff: P4 (M7-α 公開準備) PR-A/B/C/D-1 完了 / PR-D-2 (UI) 次セッション着手待機

- Session Date: 2026-04-28（夜セッション、P4 着手）
- Owner: yasushi-honda
- Status: ✅ 再開可能（PR-A/B/C/D-1 merge 済、PR-D-2 のみ持越し。法務 stub の本番公開前法務確認は MUST、AI セッション外作業）

## 今セッションの完了内容

| PR | 内容 | merge | 行数 |
|---|---|---|---|
| #60 | PR-A: docs(m7) M7-α 公開準備 spec + 法務 stub 3 文書 + ADR 更新 | ✅ | +841/-4 |
| #61 | PR-B: feat(m7) BE structured logger 導入 + console 全置換 (logger.test.ts 16 ケース、console.error 残存 0 件) | ✅ | +429/-49 |
| #62 | PR-C: feat(m7) FE AppErrorBoundary + useGlobalErrorHandlers (純粋ロジック 13 ケース、実 render は E2E manual) | ✅ | +483/-1 |
| #63 | PR-D-1: feat(m7) BE accept-terms + Firestore + authSlice fields 拡張 (TermsConsentModal/Footer は PR-D-2 持越) | ✅ | +962/-35 |
| #64 | docs(handoff): P4 (M7-α) PR-A/B/C/D-1 完了 / PR-D-2 持越記録 | ✅ | +111/-114 |
| #65 | fix(m7): useGlobalErrorHandlers.test.ts CI fragility 解消 (firebaseClient import 遮断、PR #62 由来 hotfix) | ✅ | +14/-2 |

**P4 進捗**: 4/5 PR (PR-A/B/C/D-1) merge 済。残 PR-D-2 (UI 統合) のみ。

### CI fragility 修正の経緯 (PR #65)

PR #64 (handoff) の deploy CI が `Firebase config missing required VITE_FIREBASE_*` で failure。原因は PR #62 (PR-C) で導入した `useGlobalErrorHandlers.test.ts` の import チェーンが `firebaseClient.ts` まで到達し、`.env` のない CI 環境でモジュール load 時に throw する経路。

**ローカル PASS / CI FAIL のクラシックパターン**。修正: test 冒頭に `vi.mock('../store/index', ...)` を追加して import チェーンを遮断。本テストは `buildHandlers` の引数注入版を検証する設計のため `useStore` 実体は使わない。他の FE テスト (`authSlice.test.ts` / `apiClient.test.ts` / `useLocalSync.test.ts`) はすでに同等パターンで対応済。

**教訓**: FE テストで `store/` を import する際は CI で `.env` 不在を考慮し `vi.mock` で遮断するのが必須。次セッションで PR-D-2 着手時、TermsConsentModal の test を書く際にも同様の遮断が必要。

### マルチ Reviewer 反映実績

各 PR で `general-purpose` + `evaluator` 2 並列レビューを実施。両者の指摘を Critical/High 優先で反映:

- **PR #60 (docs)**: comment-analyzer 指摘の Critical (Tier 1+Imagen 記述が `usage-cost-config.md` と矛盾) を v2 で修正
- **PR #61 (logger)**: 循環参照で logger 自体が throw する経路 + 予約キー (severity/timestamp/service) 上書きリスク + AC-3 dev curl 矛盾を v2 で修正
- **PR #62 (FE error)**: showToast 失敗時の無限ループ + componentDidCatch onError throw silent failure + buildHandlers 暗黙ストア依存を v2 で修正
- **PR #63 (BE accept-terms)**: acceptTerms race + USER_DOC_MISSING sentinel class 化 + signOut termsAccepting reset + rules termsVersion regex/半端状態防止 + post-commit re-read 失敗時 200 維持 を v2 で修正

各 PR とも 2 ループ目で APPROVE 相当に到達してから merge。

## 次セッション開始時の状態

- ブランチ: `main` clean、origin/main と同期済み（HEAD: `3d0f0bf` = PR #65 merge、PR #64 が直前）
- Open Issue: 1 件（#49 M4 follow-up umbrella、能動的作業不要・monitor 対象）
- Open PR: 0 件（本セッションで作る handoff PR を除き全 merge 済）
- グローバル `~/.claude/` への変更なし（プロジェクト CLAUDE.md §1 遵守）
- main 直 push なし、feature ブランチ + PR 運用維持（プロジェクト CLAUDE.md §2 遵守）
- 自動テスト: vitest 315/315 PASS (前 259 → +56 ケース追加)
  - logger.test.ts: 16 ケース (循環参照 / 予約キー保護 / BigInt/Symbol / write 失敗 swallow 含む)
  - AppErrorBoundary.test.ts: 8 ケース (純粋ロジック)
  - useGlobalErrorHandlers.test.ts: 11 ケース (registerGlobalErrorHandlers / buildHandlers showToast 引数注入版)
  - users.test.ts: +10 ケース (accept-terms 8 ケース + post-commit re-read fallback 1 ケース 含む)
  - authSlice.test.ts: +10 ケース (computeNeedsTermsAccept 5 ケース / acceptTerms 4 ケース / signOut reset 1 ケース)
- firestore-rules: 26/26 PASS (前 16 → +10 ケース、形式 regex / 半端状態防止 / null 拒否含む)
- 型チェック: `tsc --noEmit` 0 errors / build OK / Cloud Run deploy CI in_progress (push 由来、過去 PR の deploy は全 success)

## 次のアクション（推奨順）

### 1. 本 handoff PR をレビュー → merge（必要なら）

LATEST.md のみの更新であれば feature ブランチ + PR で commit する。

### 2. PR-D-2 (TermsConsentModal + Footer + ModalManager 統合) 着手

`docs/spec/m7/tasks.md` の D.4-D.6 に詳細記載済。要点:

- **components/modals/TermsConsentModal.tsx 新規**:
  - `needsTermsAccept` を watch、表示中は他モーダル / 主要操作をブロック (close ボタンなし、z-index 最上位)
  - 3 文書 link (`docs/legal/*`) を新タブで表示 (`target="_blank" rel="noopener"`)
  - 「同意して開始」ボタン → `acceptTerms()` action 呼出 (loading / error handling)
  - dev bypass `?skip-terms=1` (NODE_ENV !== 'production' ガード)
- **components/Footer.tsx 新規**:
  - 利用規約 / プライバシーポリシー / 特商法 への link 常時表示
  - link 先は **要決定**: `/legal/*.html` (vite-plugin-static-copy 経由) or GitHub repo md ファイル直 link
  - App.tsx + App.mobile.tsx に配置
- **components/ModalManager.tsx 拡張**: TermsConsentModal を組込み

### 3. testing 基盤の判断 (PR-D-2 着手時)

vitest は現状 `node` 環境。React Testing Library / jsdom 未導入のため、TermsConsentModal の実 render テストには testing 基盤拡張が必要。選択肢:

| 案 | 内容 | 工数 |
|---|---|---|
| A. 純粋ロジックのみ vitest node + E2E manual | PR-C と同方針、testing 基盤拡張なし | 小 |
| B. happy-dom + RTL を 1 PR で導入 | TermsConsentModal の render テストが書ける | 中 (+ 別 PR 推奨) |

PR-D-2 は P4 完了優先で **案 A** 推奨。testing 基盤拡張は別 PR (P5/P6 着手前のハイジン整理 PR) で扱う。

### 4. P4 全完了 → 本番公開前法務確認 (AI セッション外、MUST)

PR-D-2 merge 完了で P4 (M7-α 公開準備) コードベース実装は完了。**本番公開前にユーザー側で必須**:

1. `docs/legal/{terms-of-service,privacy-policy,tokushou}.md` の全文確認
2. 顧問弁護士または法務専門家による review (`<!-- LEGAL_REVIEW_REQUIRED -->` マーカー除去 + 全 TODO 埋め)
3. 連絡先 (個人情報保護担当窓口、お問い合わせメール) の確定
4. 未成年利用 / GDPR 対応方針の確定

これらは AI ではなく事業主体の判断・契約事項。

### 5. P5 (M6 E2EE) または P6 (M5 Stripe) 着手判断

P4 完了後、Stripe 後送り戦略に従い P5 (M6 E2EE) を先に処理する想定。詳細は ADR-0001 Roadmap 参照。

## 申し送り事項（重要）

### PR-D-1 で追加した API / 型 (PR-D-2 で参照)

- **server/services/termsConfig.ts**: `TERMS_VERSION = '2026-04-28'` を sole source として export。bump タイミング: 法務本確定 / 重要条項改定 (全ユーザー再同意要求)
- **POST /api/users/accept-terms**: body `{ termsVersion: string }` 必須、不一致時 409 + `code: 'TERMS_VERSION_MISMATCH'`、users doc 不在時 409 + `code: 'USER_DOC_MISSING'`
- **GET /api/users/init レスポンス拡張**: `user.termsAcceptedAt` (ISO) / `user.termsVersion` (string) / `currentTermsVersion` (string) を含む。旧形式 `{ success: true }` のみは legacy 互換として callUsersInit が null 返す
- **authSlice 新 fields**: `termsAcceptedAt` / `termsVersion` / `currentTermsVersion` / `needsTermsAccept` (派生) / `termsAccepting` (UI disabled 用)
- **acceptTerms() action**: in-flight Promise pattern (`inFlightAcceptTerms` module-scope) + `__testing.resetInFlightAcceptTerms()` test reset 用 export
- **computeNeedsTermsAccept(termsAcceptedAt, termsVersion, currentTermsVersion)**: null/null/null → false、null/null/v → true (未同意)、ts/v1/v2 → true (版不一致)、ts/v/v → false (同意済)
- **firestore.rules**: users update で termsAcceptedAt + termsVersion は「両方 null」or「両方設定 (timestamp + YYYY-MM-DD 形式 string)」のみ許可

### PR-D-2 で必要な実装メモ (詳細は tasks.md 参照)

- TermsConsentModal は `useStore(state => state.needsTermsAccept)` で表示制御
- `acceptTerms()` 失敗時の TERMS_VERSION_MISMATCH (409) は modal 内で `users/init` 再 fetch → currentTermsVersion 更新 → 自動再表示する flow を追加 (現状は throw のみ)
- footer の link 先パス確定 (vite-plugin-static-copy or GitHub repo link) → tasks.md AC-7 に反映
- dev bypass `?skip-terms=1` は `import.meta.env.PROD === false` の二重ガード必須
- `.env.example` / Vite 設定確認 (link 先決定後に publicDir / rollupOptions に追加要否判断)

### 既存 production users docs への migration 計画

既存 prod users コレクションには `termsAcceptedAt` / `termsVersion` フィールド不在。本 PR-D-1 デプロイ後の挙動:

- **users/init 経路**: 既存 doc を update する payload は `email + updatedAt` のみ。`termsAcceptedAt` / `termsVersion` は既存 doc に書かれない (rules の hasOnly は merge 後 4-6 keys ですべて allowlist 内のため通る)
- **accept-terms 経路**: 初回呼出時に `termsAcceptedAt + termsVersion + updatedAt` を update で書込み、Firestore は merge 処理で 6 keys に拡張
- **monitor 対象**: 旧 client (PR #46 / M3 PR-G 時点) が新 BE を呼んだ場合、`callUsersInit` の null 返却経路を経由する。`acceptTerms` を呼ぶ機会がないため P4 完了までは旧 client は terms 無関係のまま動作する

明示的な migration スクリプトは不要 (lazy migration)。M5 (Stripe) 着手時に「Tier 2 加入時は同意済み必須」とする場合、その時点で全ユーザー再同意要求 → 自然 backfill。

### 法務 stub 3 文書 (PR #60、`docs/legal/`)

- 全文書冒頭に `<!-- LEGAL_REVIEW_REQUIRED -->` マーカー
- TODO カテゴリ:
  - `<!-- TODO(P6/M5): ... -->`: Stripe 課金確定後埋め (Tier 2 規約節 / 特商法本文)
  - `<!-- TODO(P5/M6): ... -->`: E2EE 提供開始時追記
  - `<!-- TODO: ... -->`: 法務確認 / 連絡先確定 / GDPR 対応等
- **本番公開前 MUST**: 全 TODO 除去 + LEGAL_REVIEW_REQUIRED マーカー除去 + 弁護士 review 完了が公開条件

### Cloud Run deploy CI

PR #63 merge 直後 CI in_progress。過去の deploy は全 success のため大きな問題は想定しないが、次セッション開始時に最終結果を確認する:

```bash
gh run list --workflow="Deploy to Cloud Run" --branch main --limit 3
```

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|---|---|---|
| `docs/adr/0001-local-first-architecture.md` | ✅ M7-α/β 細分化 + Tier 1 仕様修正済 (PR #60) | M7-α PR-D-2 完了で M7-α 行を ✅ にする (次セッション) |
| `CLAUDE.md` Architecture | ⏭️ M7-α 関連の API/型 (logger / accept-terms / authSlice 新 fields) 未反映 | PR-D-2 完了時に併せて追記推奨 (PR-D-2 内に含める) |
| `CLAUDE.md` Zustand スライス表 | ⏭️ authSlice の terms* fields 未追記 | PR-D-2 で対応 |
| `docs/spec/m7/tasks.md` | ✅ PR-A/B/C/D-1 を `[x]` に更新、D-2 持越項目明示 | PR-D-2 完了時に DoD 全項目を `[x]` に |
| `docs/spec/m7/acceptance-criteria.md` | ✅ AC-1〜AC-8 確定、AC-3 dev/prod 出力 + AC-6 BE 検証 詳細記載 | UI 部分 (AC-5/7) は PR-D-2 で manual 確認 |

## Issue Net 変化

GitHub Issue 数の変化:

- Close 数（Issue）: 0 件
- 起票数（Issue）: 0 件 (rating ≥ 7 + confidence ≥ 80 を満たす実害発見なし、CI fragility は hotfix で即解消)
- **Net（Issue）: 0 件**

PR の動き (参考):

- Merge 数（PR）: 6 件 (#60/#61/#62/#63/#64/#65)
- Close 数（PR、設計やり直し）: 0 件

進捗の質: **P4 (M7-α) 80% 完了 (4/5 PR merge 済)**。法務 stub + structured logging + FE error boundary + BE accept-terms スキーマと、後続実装 (PR-D-2 UI / 法務確認) のための基盤を全て整備済み。Issue Net=0 だが、各 PR で 2 並列レビュー (general-purpose + evaluator) を実施 + Critical/High を 2 ループ目で反映してマージしており、M3/M4 と同水準のレビューフロー継続。

## 残留プロセス

✅ 残留 Node プロセスなし
