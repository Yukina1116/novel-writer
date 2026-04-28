# M7-α Acceptance Criteria

- Related: [tasks.md](./tasks.md)
- Status: 検証待ち（PR-A〜D 着手中）

各基準は第三者が機械的に検証可能であること。曖昧な基準（「正しく動作する」等）は禁止。

## AC 一覧

### AC-1: 法務 stub 3 文書の存在と TODO マーカー

**Given**: M7-α PR-A merge 後
**When**: `docs/legal/` を確認
**Then**:
- `docs/legal/terms-of-service.md` が存在する
- `docs/legal/privacy-policy.md` が存在する
- `docs/legal/tokushou.md` が存在する
- 各文書冒頭に `<!-- LEGAL_REVIEW_REQUIRED -->` マーカーが含まれる
- `terms-of-service.md` に Tier 0 / Tier 1 の制限が明記され、Tier 2 部分には `<!-- TODO(P6/M5): -->` プレースホルダがある
- `tokushou.md` に「Tier 2 不在のため特商法表記義務なし」旨と Stripe 確定後 TODO が含まれる

**検証方法**:
```bash
test -f docs/legal/terms-of-service.md && \
test -f docs/legal/privacy-policy.md && \
test -f docs/legal/tokushou.md && \
grep -l "LEGAL_REVIEW_REQUIRED" docs/legal/*.md | wc -l   # → 3
grep -l "TODO(P6/M5)" docs/legal/*.md                       # → 該当ファイル列挙
```

---

### AC-2: M7 spec 構造

**Given**: M7-α PR-A merge 後
**When**: `docs/spec/m7/` を確認
**Then**:
- `docs/spec/m7/tasks.md` が存在し、M7-α / M7-β を分離している
- `docs/spec/m7/acceptance-criteria.md` (本ファイル) が存在する
- ADR-0001 の Tier 1 記述が「月 100 円コスト上限」に修正されている
- ADR-0001 Roadmap の M7 が M7-α / M7-β に細分化されている

**検証方法**: 目視 + grep
```bash
grep "M7-α" docs/adr/0001-local-first-architecture.md   # → 複数行ヒット
grep "月 100 円" docs/adr/0001-local-first-architecture.md   # → Tier 1 行ヒット
```

---

### AC-3: BE structured logging への移行完了

**Given**: M7-α PR-B merge 後
**When**: `npm run dev` で実際の API リクエストを発火
**Then**:
- stdout に JSON 形式のログが出力される（`severity`, `timestamp`, `service` フィールド含む）
- 既存の `console.error` がすべて `logger.error/warn/info` に置換されている
- 既存の vitest が全 PASS（logger mock で動作継続）

**検証方法**:
```bash
# tasks.md B.2 で要求するのは console.error の置換のみ（dev banner 等の console.log は対象外）
grep -r "console\.error" server/ --include="*.ts" | grep -v ".test.ts" | wc -l   # → 0
npm run test                                                                       # → all PASS
```

**目視確認 (dev mode)**: `npm run dev` 起動 → 認証なしで `/api/ai/novel/generate` を curl → `[WARNING] verifyIdToken rejected (expected) {...}` 形式の人間可読 log が stdout/stderr に出る (NODE_ENV 未設定または development の場合は pretty-print 経路)。

**目視確認 (prod mode、Cloud Logging 互換性)**: `NODE_ENV=production npm run start` で起動 → 同上 → `{"severity":"WARNING","timestamp":"...","service":"novel-writer-server","message":"verifyIdToken rejected (expected)",...}` 形式の JSON 1 行が stdout に出る。Cloud Run 本番環境はこの prod 経路で動作する。

(検証用簡易コマンド: `NODE_ENV=production npx tsx -e "import { logger } from './server/utils/logger'; logger.info({ message: 'test', extra: 1 });"` で JSON 出力を確認可能)

---

### AC-4: FE 未捕捉エラーの捕捉

**Given**: M7-α PR-C merge 後
**When**: ユーザー操作中にコンポーネントが throw もしくは Promise reject
**Then**:
- React render 中の throw → `AppErrorBoundary` がフォールバック UI を表示
- `unhandledrejection` event → toast 「予期しないエラーが発生しました」表示 + console.error
- `window.error` event → toast 表示 + console.error

**検証方法**:
- vitest:
  ```ts
  // AppErrorBoundary.test.tsx
  it('renders fallback UI when child throws', () => {
    const Throw = () => { throw new Error('boom') };
    render(<AppErrorBoundary><Throw /></AppErrorBoundary>);
    expect(screen.getByText(/エラーが発生しました/)).toBeInTheDocument();
  });
  ```
- manual: dev console で `window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.reject('test'), reason: 'test' }))` → toast 表示

---

### AC-5: 初回同意モーダルの強制表示

**Given**: M7-α PR-D merge 後、新規ユーザーが Google ログイン
**When**: users/init 完了後
**Then**:
- `TermsConsentModal` が表示される（z-index 最上位、close ボタンなし）
- 同意前は他モーダル / 主要 UI 操作がブロックされる
- 3 文書 link が含まれ、`target="_blank" rel="noopener"` で新タブ開閉

**検証方法**:
- vitest: `authSlice` の `needsTermsAccept` が `termsAcceptedAt === null` で `true` になることをテスト
- manual: dev サーバーで Google ログイン (auth emulator) → モーダル表示確認

---

### AC-6: 同意の Firestore 永続化

**Given**: AC-5 のモーダルで「同意して開始」押下
**When**: `POST /api/users/accept-terms` が成功
**Then**:
- Firestore `users/{uid}.termsAcceptedAt` がサーバ時刻 (Timestamp) で記録される
- `users/{uid}.termsVersion` が `TERMS_VERSION` 定数値で記録される
- `authSlice.needsTermsAccept = false` になりモーダルが close
- 再ログインしても `termsVersion` が変わらない限りモーダルは表示されない

**検証方法**:
- supertest + Firestore Emulator: `POST /api/users/accept-terms` → Firestore 直接読取で値確認
- rules unit test: `termsAcceptedAt` / `termsVersion` の update が許可されることを確認

---

### AC-7: footer 規約リンク

**Given**: M7-α PR-D merge 後、認証済みユーザーがアプリ画面表示
**When**: 画面下部を確認
**Then**:
- 利用規約 / プライバシーポリシー / 特商法 の 3 link が常時表示
- 各 link が `target="_blank" rel="noopener"` で新タブ開閉
- link 先 URL が解決可能（404 なし）

**検証方法**:
- manual: dev サーバーで footer 3 link クリック確認
- 暫定（M7-α）: GitHub repo の md ファイルへの直 link で OK
- 本番（M7-β 想定）: static page に置換予定

---

### AC-8: テスト・型・ビルド全通過

**Given**: M7-α 全 PR merge 後
**When**: CI 実行
**Then**:
- `npm run test` 全 PASS（既存ケース数 ≦ 実行ケース数。M7-α 追加分: PR-B logger / PR-C ErrorBoundary + globalHandlers / PR-D authSlice + accept-terms route の各テストが含まれる）
- `npm run lint` (`tsc --noEmit`) 0 errors
- `npm run build` 成功
- GitHub Actions の `Deploy to Cloud Run` workflow 通過

**検証方法**: CI の status check 確認

---

## 検証マトリクス

| AC | 単体 | 統合 | E2E |
|---|---|---|---|
| AC-1 | grep | - | - |
| AC-2 | grep + 目視 | - | - |
| AC-3 | logger.test.ts + grep | errorHandler.test.ts 等の継続 PASS | dev サーバー目視 |
| AC-4 | AppErrorBoundary.test, useGlobalErrorHandlers.test | - | dev console で event dispatch |
| AC-5 | authSlice.test | - | dev サーバー Google ログイン |
| AC-6 | accept-terms route.test (supertest) | rules unit test | dev サーバー + Firestore Emulator |
| AC-7 | - | - | dev サーバー footer 目視 |
| AC-8 | CI | CI | CI |

---

## 法務 stub に関する重要事項

**本番公開前 MUST**: AC-1 〜 AC-7 をすべて満たしても、法務 stub 3 文書はあくまで **AI が executor として作成したテンプレート** であり、本番公開前には以下を完了する必要がある:

1. ユーザー（事業主体）による全文確認
2. 顧問弁護士または法務専門家による review
3. `<!-- LEGAL_REVIEW_REQUIRED -->` マーカーと `<!-- TODO -->` プレースホルダの除去
4. M7-β（Stripe 確定後）で Tier 2 / 特商法本文を確定後の再 review

これらは AI セッション外の作業として `docs/handoff/` に明示的に申し送り、M7-α の DoD には含めない（公開準備は完了するが、公開そのものはブロック）。
