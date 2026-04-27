# Handoff: M3 マイルストーン完了 / M4 (Export/Import) 着手待機

- Session Date: 2026-04-27 (PR-D/E/F/G を同日中に逐次マージ完了)
- Owner: yasushi-honda
- Status: ✅ 再開可能（M3 完了、M4 着手待機）

## 今セッションの完了内容

| 区分 | 完了事項 | PR / 成果物 |
|---|---|---|
| 設計 | M3 全体ロードマップ整理、Stripe (M5) を最後送りにする戦略合意 | (PM/PL 判断) |
| 実装 | M3 PR-F: usage クォータ (transaction reserve + requestId 冪等 + コスト上限) | PR #45 squash → main `5749b58` |
| 実装 | M3 PR-G: FE 統合 (apiCall Bearer + requestId 自動生成 + 共通分類器) + Cloud Run public 化 + Firestore rules 本番デプロイ | PR #46 squash → main `4538f01` |
| 実装 | Issue #41 (P0): CI deploy.yml に test job 追加 (regression を CI で検知) | PR #44 squash → main `73d1d8e` |
| Issue 解消 | #40 (P1, extractMessage 優先順位 silent failure) | PR #45 同梱で解消 |
| Issue 解消 | #41 (P0, CI test job) | PR #44 で解消 |
| 持越解消 | M2 持越 #2 (FE needsUserInit retry signal) | PR #46 |
| 持越解消 | M2 持越 #3 (起動時 Firebase Auth probe) | PR-E (前セッション PR #39) |
| 持越解消 | PR-D /review-pr 持越 #3 (AuthedRequest handler narrowing) | PR #45 |
| 持越解消 | PR-E /review-pr 反映 3 件 (handleApiError context 明示化 / ErrorContext table 化 / mountAiRoutes 名前付き化) | PR #45 |
| 品質ゲート | /simplify (3 並列) + evaluator (5+ファイル発動) + /review-pr (6 並列) + /codex review (大規模 PR セカンドオピニオン) を全 PR で実行、合計 25+ 件のレビュー指摘を反映 | PR #44/#45/#46 |
| Cloud Run 公開 | `--allow-unauthenticated` 復活、curl で 401 確認 (DoD) | deploy 25021542690 + DoD 検証 |
| 本番 Firestore | usage コレクション全拒否ルールを本番デプロイ | `firebase deploy --only firestore:rules -P novel-writer-dev` |
| ドキュメント | ADR-0001 ロードマップ M3 ✅ + 振り返りセクション、CLAUDE.md AI API 層更新 | 同 PR 内 |

**M3 マイルストーン完全完了**: BE 認証 (verifyIdToken middleware) + usage クォータ (withUsageQuota 高階関数 + transaction 予約 + requestId 冪等) + FE 統合 (Bearer 自動付与 + 共通エラー分類器 + needsUserInit retry) + Cloud Run public 化が成立し、Tier 1 (free) ユーザーが Vertex AI / Imagen の課金を踏み倒さない構造を BE 側で強制する状態を達成。

## 次セッション開始時の状態

- ブランチ: `main` clean、origin/main と同期済み (HEAD `4538f01`)
- Open Issue: 0 件（#40 #41 close、新規起票なし）
- Open PR: 0 件（本セッションで作る handoff PR を除き、全 PR merge 済）
- グローバル `~/.claude/` への変更なし（プロジェクト CLAUDE.md §1 遵守）
- main 直 push なし、feature ブランチ + PR 運用維持（プロジェクト CLAUDE.md §2 遵守）
- 自動テスト: vitest 176/176 PASS + 5 skipped (integration) / firestore-rules 20/20 PASS
- 本番 Cloud Run: HTTP/2 401 確認済（無認証 access が BE で拒否される、課金保護機能）

## 次のアクション（推奨順）

### 1. 本 handoff PR をレビュー → merge
- `gh pr view <number>` で内容確認
- ユーザー明示認可後 `gh pr merge <number> --squash --delete-branch`

### 2. M4: Export/Import 強化 + バックアップ警告 UI 着手
- ADR-0001 ロードマップ M4: 「Export/Import + バックアップ警告 UI」
- Stripe (M5) を最後送りにする方針なので、M4 → M6 (E2EE は Tier 2 前提のため Stripe 後送り検討) → M7-α (公開準備、Stripe 不要範囲) → M5 (Stripe) → M7-β (公開最終) の順
- 着手時に `/impl-plan` で詳細計画を立てる

### 3. (任意) M3 完了直後の細かいクリーンアップ Issue 起票
持越事項のうち triage 基準 (rating ≥ 7 + confidence ≥ 80) を満たすものを Issue 化候補として再評価。現状は持越 5 件すべて rating 5-6 で起票見送りとした（PR コメント / TODO で扱う）。

## 申し送り事項（重要）

### M3 累積実績

| PR | 内容 | merge 日 | 行数 |
|---|---|---|---|
| #37 PR-D | テスト基盤 (vitest + supertest) + 持越 #1/#4/#5 | 2026-04-27 | (前セッション) |
| #39 PR-E | BE 認証ゲート + 起動 probe + handleApiError 共通化 + 持越 #3 | 2026-04-27 | (前セッション) |
| #43 ADR | M3 PR-E 完了をロードマップに反映 | 2026-04-27 | (前セッション) |
| #44 CI | Issue #41: deploy.yml に test job 追加 | 2026-04-27 | +22 |
| #45 PR-F | usage クォータ + Issue #40 + 持越/PR-E 反映 | 2026-04-27 | +1513/-234 |
| #46 PR-G | FE 統合 + Cloud Run public 化 + M3 完了 | 2026-04-27 | +800/-55 |

### M4 以降への申し送り (持越事項)

PR-F/G の review で発覚した rating 5-7 の改善案を以下に集約。triage 基準を満たさないため Issue 化せず、対応 PR 内で吸収する方針:

1. **残量バー UI**: usage rules 緩和 (`usage/{uid}/months/{yyyymm}` path-segment 形式推奨、Codex review #45 指摘) + FE コンポーネント追加。M4 Export/Import UI と一緒に or M5 Stripe 連携時に枠拡張動線とセットで実装検討
2. **observability 拡張 (actual metadata 精算)**: Vertex AI 応答の `usage_metadata` から token 数を取得して `commit` の actualCost を補正。PR-F は固定 estimatedCost で運用中
3. **Sen branded type**: UsageDoc の単位安全性。`Sen = number & {__brand}` で sen と yen の混同を型レベルで排除 (type-design-analyzer #46 HIGH)
4. **AiRouteKey ↔ Express path 単一レジストリ化**: drift 防止。`AI_ROUTES = { 'novel/generate': { path: '/api/ai/novel/generate', costSen: 200 } }` 形式 (type-design-analyzer #46 MEDIUM)
5. **ReservationHandle Date 露出**: 内部 docId を直接保持する branded type 化、commit/cancel の handle? 撤廃 (type-design-analyzer #46 MEDIUM)
6. **AuthedRequest assertion 関数化**: `assertAuthed(req): asserts req is AuthedRequest` で type 安全 boundary を強化 (type-design-analyzer #46)
7. **processedIds sliding window drop 警告ログ**: 200 件超過で drop した requestId の再送 → わずかに二重課金される経路の観測性 (silent-failure-hunter #45)
8. **AC F8 動的検証**: route ファイル全件 withUsageQuota ラップ確認の test (pr-test-analyzer #45)
9. **401 自動 sign-out**: PR-G では文言誘導のみ。N 回連続 401 で自動 signOut + 再ログインダイアログ (silent-failure-hunter #46)
10. **json parse 失敗時 console.error / Sentry 連携**: M5 Stripe 設定時に observability セットで導入 (silent-failure-hunter #46)

### Stripe 後送り戦略（PM/PL 合意）

Stripe (M5) を最後に回し、それ以外を作り切る方針:

| Phase | スコープ | Stripe 依存 | 推定工数 |
|---|---|---|---|
| **次**: P3 (M4) | Export/Import 強化 + バックアップ警告 UI | なし | 4〜6h |
| P4 (M7-α) | 公開準備（利用規約 Tier 0/1、特商法 stub、プライバシーポリシー、観測性、エラー報告） | なし | 4〜6h |
| P5 (M6) | E2EE バックアップ（**判断ポイント**: ADR で Tier 2 前提のため Stripe 後送り推奨） | あり | 6〜10h |
| P6 (M5) | Stripe Subscription + Webhook + 法務 Tier 2 | 本体 | 8〜12h |
| P7 (M7-β) | 公開最終チェック（Tier 2 込み） | あり | 2〜3h |

### 環境状況

- `.envrc` 設定済（GH_TOKEN 自動取得 + GCP `novel-writer-dev`）
- `cd ~/Projects/学校/yamashita/novel-writer && claude` で起動すれば direnv 経由で正しいアカウントが有効化される
- Cloud Run URL: `https://novel-writer-ramnh3ulya-an.a.run.app`
- 本番 Firebase project: `novel-writer-dev`

### 主要コマンド

```bash
npm run dev                # 開発サーバー起動（Express + Vite HMR, port 3000）
npm run dev:emu            # dev + Firebase Emulator 並列（auth:9099 / firestore:8080）
npm run lint               # 型チェック（tsc --noEmit）
npm run test               # vitest run（176 ケース、admin SDK は vi.mock、tests/integration 除外）
npm run test:integration   # firebase emulators:exec で integration test (5 ケース)
npm run test:firestore-rules  # firebase emulators:exec で rules unit test（20 ケース）
npm run build              # FE ビルド（dist/）+ サーバーコンパイル（dist-server/）

# 本番 Cloud Run の認証強制を確認 (DoD)
curl -i -X POST 'https://novel-writer-ramnh3ulya-an.a.run.app/api/ai/utility/names' \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"manual-check-...","category":"human","keywords":"test"}'
# 期待: HTTP/2 401

# 本番 Firestore rules デプロイ
firebase deploy --only firestore:rules -P novel-writer-dev
```

## Issue Net 変化

- Close 数: 2 件 (#40 P1 bug / #41 P0 enhancement)
- 起票数: 0 件
- **Net: -2 件**（進捗あり、triage 基準を満たす新規 Critical 問題は本セッションで発生せず）

進捗の質: PR-F/G で /review-pr 11 件 + /codex review 5 件 + /simplify 9 件の指摘を反映したが、いずれも本 PR 内で吸収して新規 Issue 化は不要と判断（rating 5-7 の改善提案は M4 以降の対応 PR で吸収する申し送り事項として本ファイルに記録）。

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|---|---|---|
| `docs/spec/m3/tasks.md` PR-G タスク全 [x] | ✅ | G.1〜G.6 全完了、AC G1〜G10 全 [x] |
| `docs/spec/m3/tasks.md` 状態 | ✅ "完了 (2026-04-27)" | 行 3 |
| `docs/spec/m3/tasks.md` M3 完了の定義 | ✅ | 8 項目すべて [x] |
| ADR-0001 ロードマップ表 M3 | ✅ 完了 | M3 振り返りセクション追記済 |
| ADR-0001 振り返り | ✅ M3 振り返り追加 | "うまくいった点" "課題・M4 以降への申し送り" 各 5 項目 |
| `CLAUDE.md` "AI API 層" 表 | ✅ 更新 | withUsageQuota / sen 単位 / 認証・クォータ列追加 |
| `CLAUDE.md` authSlice 行 | ✅ 更新 | needsUserInit / retryUserInit 反映 |
| `docs/spec/m3/usage-cost-config.md` | ✅ 新規 | コスト設定の根拠記録 |

## 残留プロセス

✅ 残留 Node プロセスなし
