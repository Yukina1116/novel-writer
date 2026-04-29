# Handoff: M7-α 完全完了 + Issue #49 rating ≥ 7 全消化 / 法務確認 + P5/P6 判断待機

- Session Date: 2026-04-29（昼セッション、PR #68/#69/#70/#71 連続マージ）
- Owner: yasushi-honda
- Status: ✅ 再開可能（M7-α コードベース 100% 完了、Issue #49 cleanup PR 全消化、本番公開前法務確認のみ AI セッション外作業として残）

## 今セッションの完了内容

| PR | 内容 | 状態 | 規模 |
|---|---|---|---|
| #68 | docs(m7): ADR-0001 M7-α 完了反映 + CLAUDE.md に refreshCurrentTermsVersion / shared/termsCodes 追記 | ✅ merged | 2 file +5/-3 |
| #69 | refactor(m7): hasNumericStatus helper 抽出で type guard 重複解消 (Issue #49 D2-followup-3, rating 7) | ✅ merged | 1 file +4/-5 |
| #70 | refactor(m7): LEGAL_DOCS.map ブロックを LegalLinkList component に共通化 (Issue #49 D2-followup-2, rating 7) | ✅ merged | 3 file +34/-30 |
| #71 | refactor(m7): AcceptTermsError を class 化 + discriminated union 化 (Issue #49 D2-followup-1, rating 8) | ✅ merged | 7 file +318/-37 |

**Issue #49 進捗**: rating ≥ 7 全 8 項目 (H2/H4/H5/H6/H10 + D2-followup-1/2/3) 全消化完了。Issue は rating ≤ 6 の monitor 用に open 維持。

### Quality Gate 実施実績

各 PR で CLAUDE.md MUST に従い実施:

- **PR #68 (doc-only, 2 file)**: code-reviewer + comment-analyzer 並列。「双方向 pin テスト」表現が rot risk と指摘 → literal-value pin テスト記法に修正
- **PR #69 (refactor, 1 file)**: code-reviewer + type-design-analyzer + comment-analyzer 並列。comment-analyzer が「caller 列挙 + 特定 consumer 名」の rot risk 4 行を指摘 → 全削除（CLAUDE.md "Don't reference the current task, fix, or callers" に準拠）
- **PR #70 (refactor, 3 file)**: code-reviewer + type-design-analyzer + pr-test-analyzer 並列。type-design-analyzer rating 8/5/9/6、pr-test-analyzer は "logic ゼロの pure mapping wrapper" として既存 legalDocs.test.ts でカバー判定。HTML byte-equivalent を file:line 確認
- **PR #71 (refactor, 7 file / 318+ 行、Evaluator + 大規模 PR 両発動)**:
  1. Evaluator 1 周目 → HIGH (AC-1: discriminated union が型として機能していない、`status: number` wide arm が 409 を弾けない) + MEDIUM 2 + edge 4 → 全反映（NonConflictAcceptTermsStatus 具体列挙 + ts-expect-error pin）
  2. /review-pr 6 並列 (code-reviewer/type-design-analyzer/silent-failure-hunter) → silent-failure-hunter が observability 欠落 4 箇所指摘 → console.warn 4 + console.error 1 で反映
  3. /codex review セカンドオピニオン → 二重 console.error (authSlice + TermsConsentModal) と test 欠落 (fetch reject status=0 / 200 malformed body) 指摘 → 二重化解消 + test 2 件追加

### 主要設計判断 (Issue #49 cleanup PR 系)

- **D2-followup-3 hasNumericStatus**: `isUserInitError` (semantic な 2 callers あり) は thin wrapper 残置、`isAcceptTermsError` (唯一 caller `isTermsVersionMismatch`) は inline 化。near-empty wrapper の indirection 削除のみが Issue 趣旨と判断
- **D2-followup-2 LegalLinkList**: Issue 提案 API (props: `containerClassName` / `linkClassName`) をそのまま採用。`<ul>` を component 内側に持つ form A を選択（caller の `<footer>` / modal 構造を変えない）
- **D2-followup-1 AcceptTermsError class**:
  - `interface extends Error` → `class extends Error` に置換、constructor で discriminated union を強制
  - `NonConflictAcceptTermsStatus = 0 | 400 | 401 | 500 | 502 | 503 | 504` を `as const` 配列から派生（型と Set 二重管理を排除）
  - 想定外 status (例 422) は `narrowAcceptTermsStatus` で 502 (BE 契約違反扱い) に倒す **fail-closed 方針**（PR description で明示、blocker ではない挙動変更）
  - `isTermsVersionMismatch` は plain Error with status の duck-typing 維持（既存テスト互換 + 将来 fetch ラッパー等が同形状 Error を throw した場合の互換性、rationale をコメント明記）
  - 二重 console.error 解消: `acceptTerms` 失敗は authSlice の `acceptTerms` action 内 catch (`console.error('acceptTerms failed:', error)`) で既出のため、TermsConsentModal 側の console.error は削除。`refreshCurrentTermsVersion` 失敗は authSlice 側に出力なしのため modal 側で維持

## 次セッション開始時の状態 (2026-04-29 本 PR merge 時点 snapshot、追加 PR があれば変動)

- ブランチ: 本 PR (handoff) merge 後は `main` clean
- Open Issue: 1 件（#49 M4/M7 follow-up umbrella、rating ≥ 7 全消化済、rating ≤ 6 follow-up + USER_DOC_MISSING UX 課題で open 維持・能動作業不要・monitor 対象）
- 自動テスト (snapshot): vitest **357/357 PASS**（前 339 → +18: shared/termsCodes +5 / authSlice AcceptTermsError class instance +5 / ts-expect-error pin +1 / callAcceptTerms throw paths +7）。次セッション開始時は `npm test` で実数を再確認すること
- 型チェック (snapshot): `tsc --noEmit` 0 errors / build OK / Cloud Run deploy CI は PR #71 merge で再実行済 (status は次セッションの `/catchup` で確認)

## 次のアクション（推奨順）

### 1. 本番公開前法務確認 (AI セッション外、MUST)

P4 (M7-α) コードベース 100% 完了。**本番公開前にユーザー側で必須**:

1. `docs/legal/{terms-of-service,privacy-policy,tokushou}.md` の全文確認
2. 顧問弁護士または法務専門家による review (`<!-- LEGAL_REVIEW_REQUIRED -->` マーカー除去 + 全 TODO 埋め)
3. 連絡先 (個人情報保護担当窓口、お問い合わせメール) の確定
4. 未成年利用 / GDPR 対応方針の確定

これらは AI ではなく事業主体の判断・契約事項。

### 2. 本番展開後の dev サーバー E2E manual 確認

PR #67 マージ時点と挙動同等。改めて確認推奨:

- 新規 Google ログイン → users/init → TermsConsentModal 表示確認
- footer 3 link 新タブ動作確認 (Desktop / ProjectSelection / Mobile 全 view)
- 「同意して開始」押下 → モーダル close → リロードで再表示なし
- `?skip-terms=1` で dev bypass 動作確認、prod build (`npm run build && npm run start`) で query 無視確認
- a11y: タブキーで modal 内移動、画面読み上げで `role="alertdialog"` 認識確認
- z-index: TermsConsentModal 表示中に既存モーダルが裏側に隠れることを確認
- **新規（PR #71 由来）**: BE が想定外 status (例 422) を返した場合、UI 文言は「サーバ応答が不正です」(502 文言) に倒れること。dev console に `[accept-terms] unexpected status narrowed...` warn が出ること

### 3. P5 (M6 E2EE) または P6 (M5 Stripe) 着手判断

P4 完了で M7-α (Tier 0/1 公開準備) は法務確認待ち。Stripe 後送り戦略に従い P5 (M6 E2EE) を先に処理する想定。詳細は ADR-0001 Roadmap 参照。

判断軸:
- M5 (Stripe) を先にするか M6 (E2EE) を先にするかは収益化スケジュール vs プライバシー機能優先度の trade-off
- M7-β (Tier 2 規約節 + 特商法本文確定) は M5 完了後の作業
- 法務確認結果次第で M5 着手の前提条件が変わる可能性あり

### 4. Issue #49 の monitor 継続

rating ≥ 7 全消化により Issue の能動作業は不要。`feedback_issue_postpone_pattern.md` に従い open 維持で monitor 対象。

再開条件 (機械的に判定可能):
- rating ≤ 6 follow-up のいずれかが本番障害として再現 (Sentry / ユーザー報告)
- M5 (Stripe) 着手時に同一コードパスを触る必要が生じた
- USER_DOC_MISSING UX (現状 4xx 文言で fallback 表示) を実装する判断
- review agent が rerating で rating ≥ 7 を新規発見

## 申し送り事項（Issue #49 cleanup で導入した API / 設計）

### 新規 export

- **shared/termsCodes.ts**: `USER_DOC_MISSING_CODE = 'USER_DOC_MISSING'` + `KnownAcceptTerms409Code` 型 + `isKnownAcceptTerms409Code(code)` runtime narrow helper
- **store/authSlice.ts**:
  - `class AcceptTermsError extends Error` (constructor: `(message, init: AcceptTermsErrorInit)`)
  - `AcceptTermsErrorInit` discriminated union (`{ status: 409; code: KnownAcceptTerms409Code } | { status: NonConflictAcceptTermsStatus }`)
  - `NonConflictAcceptTermsStatus` 型 (`0 | 400 | 401 | 500 | 502 | 503 | 504`)
- **components/LegalLinkList.tsx**: `LegalLinkList: React.FC<{ containerClassName: string; linkClassName: string }>` (LEGAL_DOCS 全件 closure、外部リンク target/rel pin)

### authSlice.ts 内部 helper

- `hasNumericStatus<T extends Error>(e: unknown): e is T & { status: number }` (private、UserInitError / AcceptTermsError 両用 type guard)
- `narrowAcceptTermsStatus(s: number): NonConflictAcceptTermsStatus` (private、想定外 status を 502 に倒す fail-closed narrow)

### BE 側の整理

- `server/services/termsConfig.ts` は `USER_DOC_MISSING_CODE` も `shared/` から re-export
- `server/routes/users.ts` 内で `code: 'USER_DOC_MISSING'` リテラルは USER_DOC_MISSING_CODE 定数経由

### test 規律

- `shared/termsCodes.test.ts`: FE/BE 共有定数の literal-value pin (TERMS_VERSION_MISMATCH_CODE / USER_DOC_MISSING_CODE / isKnownAcceptTerms409Code 4 ケース)
- `store/authSlice.test.ts`:
  - AcceptTermsError class instance pin 5 ケース
  - `ts-expect-error` で discriminated union を compile-time pin (status=409 code 欠落 / 不正 code / 非 409 + code / 範囲外 status)
  - callAcceptTerms throw paths 7 ケース (known/unknown code / unknown status fallback / 500 enum / fetch reject / 200 malformed)

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|---|---|---|
| `docs/adr/0001-local-first-architecture.md` | ✅ M7-α 行 ✅ 完了 反映済 (PR #68) | 次は M5/M6 着手時に M5 行を更新 |
| `CLAUDE.md` Architecture | ✅ refreshCurrentTermsVersion / shared/termsCodes / TermsConsentModal 反映済 (PR #68)。USER_DOC_MISSING_CODE の追記は次回 sync 時 (M5 着手前) に検討 | - |
| `CLAUDE.md` Zustand スライス表 | ✅ authSlice の terms* fields 反映済 | AcceptTermsError class 化は internal API のため非更新 |
| `docs/spec/m7/tasks.md` | ✅ PR-D-2 を `[x]` に更新済 (前セッション) | DoD 全項目 `[x]` 更新は本 handoff PR で完了 |
| `docs/spec/m7/acceptance-criteria.md` | ✅ AC-1〜AC-9 確定 | UI 部分 (AC-5/7) は manual 確認 |

## Issue Net 変化（本セッション全体）

GitHub Issue 数の変化:

- Close 数（Issue）: 0 件
- 起票数（Issue）: 0 件
- **Net（Issue）: 0 件**

Issue #49 の **rating ≥ 7 累積消化数**: 8/8 (100%、本セッションで D2-followup-1/2/3 を消化)

PR の動き:

- マージ数: 4 件 (#68 docs / #69 D2-followup-3 / #70 D2-followup-2 / #71 D2-followup-1)
- 着手中（PR）: 1 件（本 handoff PR）

進捗の質: **P4 (M7-α) 100% 完了 + Issue #49 rating ≥ 7 全消化 + Quality Gate 4 段階完全実施 (PR #71 は Evaluator + /review-pr 6 並列 + /codex review の 3 段階レビュー、各段階で実指摘を反映)**。Issue Net=0 維持、CLAUDE.md 4 原則遵守 (main 直 push なし、AI executor 越権なし、規範 hook 改変なし、番号単位明示認可で 4 PR マージ)。

## 残留プロセス

✅ 残留 Node プロセスなし
