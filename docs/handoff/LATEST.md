# Handoff: P4 (M7-α 公開準備) PR-D-2 完了 / 法務確認 + P5/P6 判断待機

- Session Date: 2026-04-28（夜セッション続き、PR-D-2 完遂）
- Owner: yasushi-honda
- Status: ✅ 再開可能（M7-α コードベース 100% 完了、本番公開前法務確認のみ AI セッション外作業として残）

## 今セッションの完了内容

| PR | 内容 | 状態 | 規模 |
|---|---|---|---|
| (本 PR) | feat(m7): PR-D-2 同意 UI (TermsConsentModal + Footer + ModalManager 統合 + shared/termsCodes 共有定数 + refreshCurrentTermsVersion action) | 🚧 review 待ち | 新規 7 + 修正 10 file |

**P4 進捗**: 5/5 PR (PR-A/B/C/D-1/D-2) コードベース完了。

### Quality Gate 実施実績

CLAUDE.md CRITICAL に従い 4 段階全実施:

1. `/simplify` 3 並列 (reuse/quality/efficiency) → 9 件採用 (state 二重 → discriminated union、stringly-typed → shared 定数、不要 JSX ラッパ撤去、dev bypass を ModalManager に移動、handleAccept フラット化、useCallback 撤去、冗長コメント削除、focus 制御、truthy 判定)
2. `/safe-refactor` → HIGH-1 採用 (shared/termsCodes 双方向 pin テスト追加)
3. Evaluator 分離プロトコル (5 ファイル以上 + 新機能 → MUST) → REQUEST_CHANGES、5 件採用 (DEV_BYPASS_TERMS 関数化、refreshCurrentTermsVersion action 分離、disabled focus 改善、users/init transient 失敗時の AC 明記、TERMS_VERSION_MISMATCH 後 users/init 再失敗時の fatal UI)
4. (次) `/review-pr` 6 並列 + `/codex review` セカンドオピニオン

### 主要設計判断

- **shared/termsCodes.ts 新設**: FE→server/ のレイヤー越境を避けつつ FE/BE 共通定数 (TERMS_VERSION_MISMATCH_CODE) の単一 source of truth を確立。server/services/termsConfig.ts は `shared/` から re-export することで既存呼出元の互換性維持
- **ModalManager 先頭分岐**: `needsTermsAccept && !isTermsDevBypass()` で TermsConsentModal を最優先 mount。importConflict より先に評価することで「未同意のまま import flow に進む」経路を遮断
- **dev bypass の関数化**: module top-level 評価では vi.stubEnv に追従しない silent CI fail リスクがあったため、ModalManager から render 時に関数呼出
- **refreshCurrentTermsVersion 専用 action**: `retryUserInit` の `needsUserInit=false` 副作用と意味論を切り離し。TERMS_VERSION_MISMATCH (409) 後の規約バージョン再取得用
- **fatal kind の error state**: mismatch 後 users/init も失敗するエッジで「再送信無限ループ」を防ぐため `error.kind === 'fatal'` で button disable 維持 + ページ再読込誘導

## 次セッション開始時の状態

- ブランチ: 本 PR merge 後は `main` clean に戻る予定
- Open Issue: 1 件（#49 M4 follow-up umbrella、能動的作業不要・monitor 対象、現状維持）
- 自動テスト: vitest 333/333 PASS（前 315 → +18 ケース追加: legalDocs +5 / TermsConsentModal isTermsDevBypass +5 / shared termsCodes +1 / users.test 双方向 pin +1 assert / authSlice refreshCurrentTermsVersion +3 + isTermsVersionMismatch +4）
- 型チェック: `tsc --noEmit` 0 errors / build OK / Cloud Run deploy CI は本 PR merge で再実行

## 次のアクション（推奨順）

### 1. 本 PR レビュー → merge

`/review-pr` 6 並列レビュー + `/codex review` セカンドオピニオン (3 ファイル以上 + 200 行以上のため必須)。Critical/High 指摘あれば 2 ループ目で修正してから merge。

### 2. P4 全完了 → 本番公開前法務確認 (AI セッション外、MUST)

PR-D-2 merge 完了で P4 (M7-α 公開準備) コードベース完了。**本番公開前にユーザー側で必須**:

1. `docs/legal/{terms-of-service,privacy-policy,tokushou}.md` の全文確認
2. 顧問弁護士または法務専門家による review (`<!-- LEGAL_REVIEW_REQUIRED -->` マーカー除去 + 全 TODO 埋め)
3. 連絡先 (個人情報保護担当窓口、お問い合わせメール) の確定
4. 未成年利用 / GDPR 対応方針の確定

これらは AI ではなく事業主体の判断・契約事項。

### 3. 本番展開後の dev サーバー E2E manual 確認

- 新規 Google ログイン → users/init → TermsConsentModal 表示確認
- footer 3 link 新タブ動作確認 (Desktop / ProjectSelection / Mobile 全 view)
- 「同意して開始」押下 → モーダル close → リロードで再表示なし
- `?skip-terms=1` で dev bypass 動作確認、prod build (`npm run build && npm run start`) で query 無視確認
- a11y: タブキーで modal 内移動、画面読み上げで `role="alertdialog"` 認識確認
- z-index: TermsConsentModal 表示中に既存モーダルが裏側に隠れることを確認

### 4. P5 (M6 E2EE) または P6 (M5 Stripe) 着手判断

P4 完了後、Stripe 後送り戦略に従い P5 (M6 E2EE) を先に処理する想定。詳細は ADR-0001 Roadmap 参照。

## 申し送り事項（PR-D-2 で導入した API / 設計）

### 新規 export

- **shared/termsCodes.ts**: `TERMS_VERSION_MISMATCH_CODE = 'TERMS_VERSION_MISMATCH'` + `TermsVersionMismatchCode` 型。FE/BE 双方が直接 import
- **store/authSlice.ts**: `AcceptTermsError` 型 / `isTermsVersionMismatch(error: unknown): boolean` helper / `refreshCurrentTermsVersion()` action
- **components/modals/TermsConsentModal.tsx**: `isTermsDevBypass(): boolean` (関数 export、render 時評価)
- **legalDocs.ts**: `LEGAL_DOCS: ReadonlyArray<LegalDoc>` (3 link、本番公開時に self-hosted へ置換予定)

### authSlice 拡張 (PR-D-2 で追加)

- `refreshCurrentTermsVersion()`: TERMS_VERSION_MISMATCH 時に users/init を再 fetch して `currentTermsVersion` を更新。`needsUserInit` は touch しない (AI 呼出 retry 経路と意味論を切り離す)
- `isTermsVersionMismatch(error)`: 409 + `code === TERMS_VERSION_MISMATCH_CODE` 判定の共通 helper

### ModalManager 動作変更

- 先頭で `if (needsTermsAccept && !isTermsDevBypass()) return <TermsConsentModal />;` 評価
- importConflict / activeProjectData チェックより前に処理 (未同意ユーザーは他モーダル裏側にすら到達しない)

### Footer 配置

- App.tsx Desktop view: `mainContent` 内 (Header → NovelEditor → Footer の順)
- App.tsx ProjectSelectionScreen view: `<div className="flex flex-col min-h-screen">` で囲み、ProjectSelection を `flex-1` でラップ
- App.mobile.tsx: NovelEditor 直後 (オーバーレイパネル前)

### dev bypass の二重ガード

```ts
if (import.meta.env.PROD) return false;        // 1: prod では query 無視
if (typeof window === 'undefined') return false; // 2: SSR-safe
return new URLSearchParams(window.location.search).get('skip-terms') === '1';
```

### TERMS_VERSION_MISMATCH エラー UI フロー

1. ユーザーが `acceptTerms()` 押下
2. BE が 409 + `code: 'TERMS_VERSION_MISMATCH'` 返却
3. modal が `refreshCurrentTermsVersion()` 自動実行
4. 成功 → `authSlice.currentTermsVersion` 更新 → modal が `error.kind = 'mismatch'` UI 表示 (「規約が更新されました」) → 再送信可能
5. 失敗 → modal が `error.kind = 'fatal'` UI 固定 → button disable 維持 → ページ再読込誘導 (無限ループ防止)

### users/init transient 失敗時の同意フロー保留 (AC-9)

- `currentTermsVersion === null` のうちは TermsConsentModal を抑止 (computeNeedsTermsAccept で false)
- AI 呼出時に `retryUserInit()` で再判定 → 成功で同意モーダル発火
- permanent 失敗時は AI 呼出経路で AUTH_REQUIRED に倒れて停止するため、未同意のまま付加価値機能が使われる経路は閉じている

### 法務 stub 3 文書 (PR #60、`docs/legal/`)

- 全文書冒頭に `<!-- LEGAL_REVIEW_REQUIRED -->` マーカー
- TODO カテゴリ:
  - `<!-- TODO(P6/M5): ... -->`: Stripe 課金確定後埋め (Tier 2 規約節 / 特商法本文)
  - `<!-- TODO(P5/M6): ... -->`: E2EE 提供開始時追記
  - `<!-- TODO: ... -->`: 法務確認 / 連絡先確定 / GDPR 対応等
- **本番公開前 MUST**: 全 TODO 除去 + LEGAL_REVIEW_REQUIRED マーカー除去 + 弁護士 review 完了が公開条件

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|---|---|---|
| `docs/adr/0001-local-first-architecture.md` | ⏭️ M7-α 行を ✅ にする (PR-D-2 merge 後) | 次セッション or 本 PR 内で更新 |
| `CLAUDE.md` Architecture | ✅ M7-α 関連 API/型 (accept-terms / authSlice 新 fields) 反映済 (PR-D-2 内) | refreshCurrentTermsVersion / shared/termsCodes も追記推奨 |
| `CLAUDE.md` Zustand スライス表 | ✅ authSlice の terms* fields 反映済 (PR-D-2 内) | refreshCurrentTermsVersion は次回 sync 時に追記 |
| `docs/spec/m7/tasks.md` | ✅ PR-D-2 を `[x]` に更新済 | DoD 全項目を `[x]` にするのは次 PR (handoff) |
| `docs/spec/m7/acceptance-criteria.md` | ✅ AC-1〜AC-9 確定 (AC-9 = users/init transient 失敗時の同意保留 を本 PR で追記) | UI 部分 (AC-5/7) は manual 確認 |

## Issue Net 変化

GitHub Issue 数の変化:

- Close 数（Issue）: 0 件
- 起票数（Issue）: 0 件 (rating ≥ 7 + confidence ≥ 80 を満たす実害発見なし、Evaluator 指摘の MEDIUM/LOW は本 PR 内で全消化)
- **Net（Issue）: 0 件**

PR の動き (参考):

- 着手中（PR）: 1 件（本 PR、merge 待ち）

進捗の質: **P4 (M7-α) 100% 完了 (5/5 PR、本 PR merge で締め)**。Quality Gate 4 段階完全実施 (`/simplify` 3 並列 → `/safe-refactor` → Evaluator 分離 → 次 `/review-pr` + `/codex review`)、Issue Net=0 維持、CLAUDE.md 4 原則遵守 (main 直 push なし、AI executor 越権なし、規範 hook 改変なし)。

## 残留プロセス

✅ 残留 Node プロセスなし
