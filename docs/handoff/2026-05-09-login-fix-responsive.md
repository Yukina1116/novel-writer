# Handoff: ログイン障害修正 + 法務 self-host + レスポンシブ対応セッション

- Session Date: 2026-05-09 〜 2026-05-10
- Owner: yasushi-honda
- Status: ✅ 再開可能（ログイン正常 / 法務 link 自社 origin / 1280+ desktop ↔ <1280 mobile 切替確立）
- Previous handoff: [2026-05-01-dev-portal-mermaid-fix.md](./2026-05-01-dev-portal-mermaid-fix.md)

## 今セッションのトリガー

ユーザーから「ログインできない」報告 (CSP / `auth/internal-error`) → 連鎖的に COOP / Firebase Authorized domain / 法務 self-host / レスポンシブ全般を修正。

## 完了 PR (合計 9 件、本セッションすべて main 反映済)

| PR | 内容 | merge commit |
|---|---|---|
| #88 | fix(csp): allow apis.google.com in scriptSrc (Firebase Auth popup gapi loader) | `8b04c13` |
| #89 | feat(diag): auth-flow 診断ログ収集 (signInWithPopup → users/init) — 暫定 | `8c875fe` |
| #90 | fix(coop): allow popups so Firebase Auth signInWithPopup can postMessage back | `954bc08` |
| #91 | feat(legal): self-host 法務文書 (GitHub blob URL → /legal/*.html) | `8dd5cf1` 領域 |
| #92 | fix(mobile): ボタンの縦書き化を防ぐ (whitespace-nowrap + flex-shrink-0) | `b94e07f` |
| #93 | chore(diag): PR #89 で追加した auth-flow 診断ログを撤去 | `f9ca975` 領域 |
| #94 | fix(layout): タブレット幅 (768〜1024) を mobile レイアウトに切替 (isMobile 1024/1100) | `1d067ee` |
| #95 | fix(layout): isMobile 閾値を 1280/1340 に引き上げ (PR #94 fixup) | `225b3ac` |
| #96 | fix(header): hide-on-small breakpoint を 1200 → 1400 に引き上げ | `74b67bf` |

## 配信外 (CLI 経由) の本番設定変更

- **Firebase Auth Authorized domains** に Cloud Run URL を 2 件追加 (`identitytoolkit.googleapis.com/admin/v2/projects/novel-writer-dev/config` PATCH):
  - `novel-writer-ramnh3ulya-an.a.run.app`
  - `novel-writer-446321146441.asia-northeast1.run.app`

## 真因チェーン (ログイン障害)

ログイン不能の表面症状が 3 段で連鎖していた。

1. **CSP scriptSrc に `apis.google.com` 不在** → gapi iframe loader (`/js/api.js`) ブロック → `auth/internal-error` (PR #88 で解消)
2. **Firebase Auth Authorized domains に Cloud Run URL 未登録** → `auth/unauthorized-domain` (CLI で解消)
3. **COOP `same-origin` (helmet default)** → popup から `window.opener` 参照不能 → Firebase が popup-closed-by-user と誤検知 (PR #90 で解消)

PR #89 (診断ログ) で 3 番目の真因を特定。fire-and-forget `postAuthDiag` で Cloud Logging に各段階を記録 → AI 側で grep して `signin:popup-reject (auth/popup-closed-by-user, durationMs=10201)` を観測。COOP `same-origin-allow-popups` への変更で popup ↔ 親通信が成立して解決。役目を終えた診断機構は PR #93 で完全 reverse。

## レスポンシブ対応 (要点)

`isMobile` 閾値を 768/800 → 1024/1100 (PR #94) → 1280/1340 (PR #95) と段階的に引き上げ。**3 panel layout (ActivityBar 56 + LeftPanel 280 + Main 400+ + RightPanel 400 ≈ 1280)** を実用最小幅とし、それ未満は AppMobile (1 panel) に倒す。1280-1400 viewport では Header の検索/表示/モード label を非表示にする `hide-on-small` の breakpoint を 1200 → 1400 に拡大 (PR #96) して AuthButton の表示 space を確保。

検証ポイント (Playwright + ユーザー実機):

| Viewport | 期待 | 結果 |
|---|---|---|
| 375 (iPhone SE) | mobile (AppMobile) | ✅ |
| 768 (iPad portrait) | mobile (AppMobile) | ✅ |
| 1180 (iPad Air landscape) | mobile (AppMobile) | ✅ |
| 1279 | mobile | ✅ |
| 1280 (MacBook Air 13-inch) | desktop 3 panel | ✅ Main editor 健全、ログイン状態でアバター + email 可視 (PR #96 後) |
| 1339 / 1340 | desktop | ✅ |
| 1440+ | desktop | ✅ |

## Firebase Auth COOP の console error 残置

`same-origin-allow-popups` でも `popup.closed` 直接 polling は遮断されるため、Firebase JS SDK が以下を console.error する (機能影響なし、postMessage 経由で auth は完了):

```
Cross-Origin-Opener-Policy policy would block the window.closed call.
```

非ブロッキングだが、本番運用での log noise として認識。完全に消すには Firebase SDK 側で `popup.closed` 経路を使わない判定 (postMessage only) が必要 → 現時点では SDK 仕様依存で対処不能。

## 法務 self-host (PR #91) の規律

- 正本: `public/legal/*.md` (Vite publicDir で配信、3 ドキュメント計 417 行)
- 履歴用: `docs/legal/*.md` 残置 (handoff / ADR からの参照を壊さない、編集時は public/legal を真正本にする運用)
- `legal.js`: `marked@13.0.3` + `DOMPurify@3.1.7` を `cdn.jsdelivr.net` から ESM ロード → `RETURN_DOM_FRAGMENT` で sanitize → `appendChild` で render (innerHTML 不使用、security_reminder hook 趣旨に沿う)
- LEGAL_REVIEW_REQUIRED 警告は md 冒頭に維持。**顧問弁護士確認後**、別 PR で警告削除 + 文言確定 + バージョン更新

## 残課題 (本セッション外)

1. **法務 md 内の `<!-- TODO -->` HTML コメントが visible text として render される** (`docs/legal/*.md` / `public/legal/*.md`、内容問題)。顧問弁護士確認後の md 文言確定 PR で削除予定
2. **Firebase Auth `popup.closed` polling の COOP console error** — 機能影響なし、SDK 仕様
3. **動的 resize ヒステリシス検証は Playwright `setViewportSize` が React resize event を発火しない仕様で未確認** — フレッシュロード時の閾値判定のみ確認済。実機ドラッグ resize での chatter 防止挙動は未検証
4. **PR #89 の Cloud Logging 残置データ** (`jsonPayload.component="diagAuth"`) は retention period 30 日で自然消滅
5. **タッチ操作 / 仮想キーボード挙動** (モバイル実機) は未検証 — `100dvh` / `viewportHeight` 動的計算は実装済だが未検証

## 次セッション開始時の状態

- ブランチ: `main` clean (`74b67bf`)
- Open Issue: 1 件 (#49 M4/M7 follow-up monitor、変化なし)
- 自動テスト: vitest **434 / 434 PASS** (PR #91 で legalDocs.test.ts 5 → 4 に統合、-1)
- 型チェック: `tsc --noEmit` 0 errors
- CI/CD: PR #96 反映の Cloud Run デプロイ完了 (run 25604841966 success)

## 次のアクション (推奨順)

1. **法務確認 (AI セッション外、MUST、保留継続)**: 顧問弁護士確認 → md 文言確定 + LEGAL_REVIEW_REQUIRED + `<!-- TODO -->` 一斉削除 PR (M7-β)
2. **モバイル実機確認 (ユーザー判断)**: iPhone / iPad / 13-inch laptop でログイン → 編集 → AI 機能 → ログアウト 1 サイクル
3. **M5 着手判断 (法務状況に依存、ユーザー判断)**: Stripe Subscription + Tier 2
4. **小規模技術改善**: Issue #49 monitor 対象、Firebase SDK COOP polling の SDK バージョンアップ追従

## 主要参照

- 関連 PR: **#88, #89, #90, #91, #92, #93, #94, #95, #96** (本セッション)
- 関連前 PR: #86 (前セッション dev-portal mermaid)
- 主要修正ファイル: `server/index.ts` (CSP/COOP), `public/legal/*` (legal self-host), `App.tsx` (isMobile threshold), `components/{BackupWarningBanner,ProjectSelectionScreen}.tsx` (button no-wrap), `index.css` (hide-on-small breakpoint), `legalDocs.ts` (URL 切替)
- CLAUDE.md 更新: 「法務文書 self-host (PR #91)」項追加

## 知見メモ (Firebase Auth + helmet + responsive)

- helmet の default `crossOriginOpenerPolicy: same-origin` は **Firebase Auth signInWithPopup を完全破壊する**。`same-origin-allow-popups` が必要。`crossOriginEmbedderPolicy: false` だけでは popup フローを救済できない
- Firebase Auth は popup フローで複数の domain を script/connect/frame に要求 — 最低限 `apis.google.com` (gapi loader, scriptSrc), `accounts.google.com` (frameSrc), `*.firebaseapp.com` (frameSrc + connectSrc), `*.googleapis.com` (connectSrc), `lh3.googleusercontent.com` (imgSrc, profile photo) が必要
- Firebase Auth Authorized domains は CLI でも更新可: `PATCH https://identitytoolkit.googleapis.com/admin/v2/projects/{project}/config?updateMask=authorizedDomains` + `Authorization: Bearer $(gcloud auth print-access-token)` + `X-Goog-User-Project` header 必須
- `isMobile` 切替閾値の決定基準は **3 panel layout の合計最小幅**。LeftPanel + Main 必要 + RightPanel をぎりぎり積算した値の手前ではなく、padding/gap 込みで余裕を持たせる
- Playwright MCP の `setViewportSize` は **React の `window.resize` event を発火しない**。動的 resize 検証は (a) フレッシュ navigate (b) `window.dispatchEvent(new Event('resize'))` で代用 — それでも一部条件で React state 反映されない場合あり

## Issue Net 変化

- Close 数: 0 件
- 起票数: 0 件
- Net: 0 件
- 備考: 本セッション全 9 PR は実害解消 (login broken / footer link が GitHub に飛ぶ / モバイル UI 崩れ) で完結。PR 直接修正で対応したため新規 Issue 化は triage 基準に該当せず (実害は PR で即時解消)。Net 進捗ゼロだが本セッション目的 (ログイン不能解消 + UI 整備) は完了。`postponed` Issue (#49) には触れていない (ユーザー明示指示なし)
