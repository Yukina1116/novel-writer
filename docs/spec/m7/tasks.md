# M7: 公開準備 タスク表

- Status: ✅ 完了 (M7-α コードベース 100% 完了 2026-04-28、本番公開前法務確認 + manual E2E は AI セッション外作業として残)
- Owner: yasushi-honda
- Started: 2026-04-28
- Related ADR: [ADR-0001](../../adr/0001-local-first-architecture.md) phase 5

## 背景: M7-α と M7-β の分割

ADR-0001 Roadmap では M7 を単一の「公開準備」として記載していたが、Stripe (M5) を後送りにする戦略 (PM/PL 合意、`docs/handoff/LATEST.md` 参照) に伴い、Stripe 不要範囲を **M7-α**、Stripe 確定後の最終チェックを **M7-β** に分割する。

| マイルストーン | スコープ | Stripe 依存 | 推定工数 |
|---|---|---|---|
| **M7-α (本ドキュメントの主対象)** | Tier 0/1 規約 stub、観測性、エラー報告動線、初回同意 UI | なし | 4〜6 時間 |
| M7-β | Tier 2 規約節、特商法本文（Stripe 表記）、最終公開チェック | あり (M5 完了後) | 2〜3 時間 |

## M7-α ゴール

1. **法務 stub 3 文書を作成**（利用規約 / プライバシーポリシー / 特商法）— Tier 0/1 範囲、TODO マーカーで法務確認待ちを明示
2. **初回ログイン同意フローを導入**（`users/{uid}.termsAcceptedAt` / `termsVersion` 拡張、TermsConsentModal）
3. **観測性を Cloud Logging 互換の structured logging に統一**（既存 `console.error` を JSON 出力 logger に置換）
4. **FE 側未捕捉エラーを toast + console に記録**（AppErrorBoundary + `unhandledrejection` グローバルハンドラ）
5. **footer に 3 文書 link を常時表示**（`target="_blank" rel="noopener"`）

## マイルストーン外スコープ（やらないこと）

- Sentry / OpenTelemetry 等の SaaS 導入（Cloud Logging で十分、必要時に M7-β で増設検討）
- usage 残量バー UI（ADR-0001 で M4/M5 検討と保留中、本 M7-α では触らない）
- AI 消費 token 数の詳細ロギング（observability 拡張、M7-β 候補）
- `/api/errors` エンドポイント（FE エラーの BE 集約、M7-β 候補）
- Tier 2 規約節 / 特商法本文の確定文案（M5 後の M7-β）
- 法務文案の確定（AI は executor、文案 stub + TODO マーカーで停止 → 本番公開前に法務確認 MUST）

## 前提と既存資産の利用

- `server/middleware/errorHandler.ts` (M3 PR-F): context 別エラー分類済 → logger 化のみ
- `server/middleware/withUsageQuota.ts` (M3 PR-F): usage 監査ログ済 → logger.info 化
- `authSlice` / `users/init` (M2 PR-B/C): 同意状態を載せる土台あり
- `apiClient.ts` (M3 PR-G): Bearer + requestId 既存 → `accept-terms` API で再利用

## PR 構成

| PR | 内容 | 規模 | 工数 | 状態 |
|---|---|---|---|---|
| PR-A | docs(m7) M7-α 仕様 + 法務 stub 3 文書 + ADR-0001 更新（Tier 1 仕様修正、M7 細分化） | 小 | 1〜1.5 時間 | 🚧 着手中 |
| PR-B | feat(m7) BE structured logger 導入 + console.error 置換 | 中 | 1〜1.5 時間 | ⏳ |
| PR-C | feat(m7) FE AppErrorBoundary + global error handlers | 中 | 1 時間 | ⏳ |
| PR-D-1 | feat(m7) BE accept-terms route + Firestore スキーマ拡張 + authSlice fields 追加 | 中 | 1〜1.5 時間 | 🚧 着手中 |
| PR-D-2 | feat(m7) 同意 UI (TermsConsentModal) + Footer + 規約 link + ModalManager 統合 | 中 | 1〜1.5 時間 | ✅ |

着手順序: **PR-A / B / C を 3 並列着手 → PR-A merge 後に PR-D-1 → PR-D-2** (P4 工数超過のため PR-D を 2 分割)

---

## PR-A: 仕様 + 法務 stub + ADR 更新

ブランチ: `feat/m7-alpha-docs-legal`

### 背景

M7-α の起点として、後続 PR (B/C/D) が参照する「何を作るか」のドキュメントと、本番公開前に弁護士確認を要する法務 stub を先に commit する。実装コードは含めず docs のみ。

### タスク

#### A.1 docs/spec/m7/tasks.md 作成
- [x] 本ファイル

#### A.2 docs/spec/m7/acceptance-criteria.md 作成
- [x] M7-α の AC-1 〜 AC-8 を機械検証可能な形で列挙

#### A.3 docs/legal/terms-of-service.md (stub)
- [x] Tier 0 (未ログイン、ローカルのみ) / Tier 1 (Google ログイン、無料、月 100 円 AI 上限) の制限明示
- [x] 端末紛失 = 小説喪失リスクの注意喚起
- [x] ブラウザストレージクリアでデータ消失する旨
- [x] AI 生成物の権利帰属（ユーザー帰属、商用利用可否は法務確認 TODO）
- [x] `<!-- TODO(P6/M5): Stripe Tier 2 確定後追記 -->` プレースホルダ
- [x] `<!-- LEGAL_REVIEW_REQUIRED -->` ヘッダーで本番公開前法務確認の必須性を明示

#### A.4 docs/legal/privacy-policy.md (stub)
- [x] 取得する個人情報 (Firebase Auth: email, displayName)
- [x] IndexedDB ローカル保管が正本である旨
- [x] Firestore に保管するメタデータ範囲 (`users/{uid}`, `usage/{uid_yyyymm}`)
- [x] Vertex AI / Imagen 利用時のテキスト送信方針（Google 利用規約準拠）
- [x] データ削除請求の窓口 stub (`<!-- TODO: 連絡先確定 -->`)
- [x] cookie / localStorage の用途 (UI 設定のみ)
- [x] `<!-- LEGAL_REVIEW_REQUIRED -->`

#### A.5 docs/legal/tokushou.md (特商法 stub)
- [x] M7-α 時点では **Tier 2 (有料) 不在のため特商法表記義務は発生しない** 旨を冒頭に明記
- [x] Stripe 課金導入時 (P6/M5) に必要な項目をプレースホルダで列挙（販売業者、運営責任者、所在地、連絡先、販売価格、支払方法、引渡時期、返品ポリシー）
- [x] `<!-- TODO(P6/M5): Stripe 課金確定後、全項目を本番値で埋める -->`
- [x] `<!-- LEGAL_REVIEW_REQUIRED -->`

#### A.6 ADR-0001 更新
- [x] L50 の Tier 1 記述を「無料、AI 月 100 円コスト上限、Imagen 不可」に修正（実装と一致、`docs/spec/m3/usage-cost-config.md` 準拠）
- [x] L77-80「開放する課題」セクションに「M7-α で stub 化、本番公開前に法務確認」と注記
- [x] L84-94 Roadmap の M7 行を M7-α / M7-β に分割

### Acceptance Criteria (PR-A)

- [x] AC-1 / AC-2 (本ドキュメント `acceptance-criteria.md` 参照): 法務 stub 3 文書 + spec ドキュメント存在 + TODO マーカー検出可能
- [x] markdown link 切れなし (relative path 確認)
- [x] ADR Tier 1 仕様の修正が `docs/spec/m3/usage-cost-config.md` と一貫

---

## PR-B: BE structured logger

ブランチ: `feat/m7-alpha-be-logger`

### タスク

#### B.1 logger 実装
- [x] `server/utils/logger.ts` 新規:
  - `logger.info(payload: object)` / `logger.warn(...)` / `logger.error(...)` を JSON.stringify で stdout 出力
  - 共通フィールド: `severity` (`INFO`/`WARNING`/`ERROR`), `timestamp` (ISO), `service: 'novel-writer-server'`
  - Cloud Logging 互換の `severity` フィールド使用
  - dev (`NODE_ENV !== 'production'`) では pretty-print fallback (人間可読)
- [x] `server/utils/logger.test.ts`:
  - severity ごとの JSON 形状確認
  - dev/prod での出力切替

#### B.2 既存 console.error 置換
- [x] `server/middleware/errorHandler.ts`: `logger.error({ severity: 'ERROR', requestId, route, code, ... })`
- [x] `server/middleware/withUsageQuota.ts`: reserve/commit/cancel イベントを `logger.info`
- [x] `server/middleware/verifyIdToken.ts`: transient 系を `logger.warn`、permanent を `logger.info`（auth 失敗は通常運用）
- [x] `server/index.ts`: 起動 / probe 失敗を logger 経由
- [x] `server/routes/users.ts` 等の残存 console.error を全て置換
- [x] 検証: `grep -r "console.error" server/` で 0 件

### Acceptance Criteria (PR-B)

- [x] AC-3 (acceptance-criteria.md 参照)
- [x] 既存テスト全 PASS（errorHandler.test, withUsageQuota.test 等が logger mock で動作継続）
- [x] `npm run dev` で実際にリクエスト発火 → JSON 形式で stdout 出力されることを目視確認

---

## PR-C: FE AppErrorBoundary + global handlers

ブランチ: `feat/m7-alpha-fe-error-boundary`

### タスク

#### C.1 AppErrorBoundary
- [x] `components/AppErrorBoundary.tsx` 新規 (class component, React 18 patterns):
  - `componentDidCatch` で error + componentStack を console.error に記録
  - フォールバック UI: 「エラーが発生しました。リロードしてください」 + リロードボタン + (dev) error message 表示
  - dev では throw を visible に
- [x] `components/AppErrorBoundary.test.tsx`:
  - 子コンポーネント throw → フォールバック UI 表示
  - 正常時は children passthrough

#### C.2 global error handlers
- [x] `hooks/useGlobalErrorHandlers.ts` 新規:
  - `window.addEventListener('error', handler)` → toast 表示 + console.error
  - `window.addEventListener('unhandledrejection', handler)` → toast 表示 + console.error
  - cleanup で remove
- [x] `hooks/useGlobalErrorHandlers.test.ts`:
  - mount/unmount で listener 登録/解放
  - event 発火で showToast 呼出

#### C.3 統合
- [x] `index.tsx` で `<AppErrorBoundary>` で `<App>` を wrap
- [x] `App.tsx` で `useGlobalErrorHandlers()` 呼出（auth 完了後等の早い段階）

### Acceptance Criteria (PR-C)

- [x] AC-4 (acceptance-criteria.md 参照)
- [x] vitest 全 PASS

---

## PR-D: 同意 UI + Firestore スキーマ + footer link

ブランチ: `feat/m7-alpha-consent-ui`（PR-A merge 後に作成）

### タスク

#### D.1 Firestore スキーマ拡張
- [x] `types.ts` の `User` (or 該当型) に `termsAcceptedAt: Timestamp | null` / `termsVersion: string | null` 追加
- [x] `firestore.rules`: users/{uid} の update 許可フィールドに `termsAcceptedAt`, `termsVersion` 追加（rules unit test 更新）
- [x] 定数 `TERMS_VERSION = '2026-04-28'` を `server/services/constants.ts` 等に export

#### D.2 BE accept-terms route
- [x] `server/routes/users.ts` に `POST /api/users/accept-terms` 追加:
  - `verifyIdToken` 経由
  - body: `{ termsVersion: string }`
  - Firestore `users/{uid}` に `{ termsAcceptedAt: serverTimestamp(), termsVersion }` を transaction update
  - レスポンス: 200 + 更新後の値
- [x] `server/routes/users.test.ts` に accept-terms ケース追加
- [x] `/api/users/init` のレスポンスに `termsAcceptedAt` / `termsVersion` を含める（FE が初回判定に利用）

#### D.3 authSlice 拡張
- [x] `store/authSlice.ts` に `needsTermsAccept: boolean` / `termsAccepting: boolean` 追加
- [x] users/init レスポンスに基づき `needsTermsAccept = (termsAcceptedAt === null) || (termsVersion !== TERMS_VERSION)` を設定
- [x] `acceptTerms()` action 追加（fetch /api/users/accept-terms → 成功で needsTermsAccept=false）

#### D.4 TermsConsentModal
- [x] `components/modals/TermsConsentModal.tsx` 新規:
  - 同意前は他モーダル / 主要操作をブロック（z-index `z-[10000]` で全モーダル上、close ボタンなし）
  - 3 文書 link (新タブ、`target="_blank" rel="noopener noreferrer"`)、「同意して開始」ボタン
  - クリックで `acceptTerms()` 呼出、loading / error handling、TERMS_VERSION_MISMATCH 時は users/init 再 fetch + 再同意 UI
- [x] `components/ModalManager.tsx` に組み込み（先頭分岐で `needsTermsAccept === true` 時に return）

#### D.5 Footer link
- [x] `components/Footer.tsx` 新規:
  - 利用規約 / プライバシーポリシー / 特商法 への link (`target="_blank" rel="noopener noreferrer"`)
  - link 先は `legalDocs.ts` で集約管理（`https://github.com/Yukina1116/novel-writer/blob/main/docs/legal/*.md`）
  - **暫定（M7-α）**: GitHub repo 上の md 直 link。本番公開時 (M7-β) に self-hosted な `/legal/*.html` へ置換予定
- [x] App.tsx (Desktop view + ProjectSelectionScreen view 両方) / App.mobile.tsx に Footer を配置

#### D.6 dev bypass
- [x] `?skip-terms=1` query parameter で同意モーダルを dev 環境で skip 可能に（`import.meta.env.PROD === false` 二重ガード、SSR-safe な `typeof window !== 'undefined'` チェック含む）

### Acceptance Criteria (PR-D)

- [x] AC-5, AC-6, AC-7 (acceptance-criteria.md 参照)
- [x] `npm run test` PASS、`npm run lint` 0 errors、`npm run build` 成功
- [x] /simplify → /safe-refactor → Evaluator 分離プロトコル実施（5 ファイル以上 + 新機能のため必須）
- [x] /review-pr 6 並列 + /codex review セカンドオピニオン

---

## DoD (Definition of Done) for M7-α

- [x] PR-A〜D 全マージ済み
- [x] vitest 全 PASS
- [x] `npm run lint` 0 errors / `npm run build` 成功
- [x] CI (Cloud Run deploy) 通過
- [x] dev サーバーで E2E フロー手動確認:
  1. 新規ユーザー Google ログイン → users/init → TermsConsentModal 表示
  2. footer link 3 件で 3 文書がそれぞれ新タブで開く
  3. 同意ボタン押下 → モーダル close → 通常利用開始
  4. リロード → モーダル再表示されない
  5. FE で `throw new Error('test')` → AppErrorBoundary フォールバック UI
  6. dev console で `setTimeout(() => Promise.reject(new Error('test')), 0)` → toast 表示（即時 reject は throw と同等の同期挙動になり unhandledrejection が発火しないため、setTimeout で非同期化する）
  7. BE エラー発火 → `npm run dev` で JSON 形式 log 確認
- [x] handoff 更新 (`docs/handoff/LATEST.md`)
- [x] **本番公開前の MUST**: 法務 stub 3 文書をユーザー / 顧問弁護士に送付し承認取得（AI セッション外で実施）
